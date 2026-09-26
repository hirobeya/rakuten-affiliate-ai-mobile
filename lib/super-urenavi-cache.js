'use strict';

const crypto=require('node:crypto');

const PRODUCT_TTL_MS=90*24*60*60*1000;
const IMAGE_TTL_MS=180*24*60*60*1000;
const TYPE_KNOWLEDGE_TTL_MS=180*24*60*60*1000;
const UNKNOWN_TTL_MS=6*60*60*1000;

function sha256(value){
  return crypto.createHash('sha256').update(String(value||'')).digest('hex');
}

function normalizeText(value=''){
  return String(value||'')
    .normalize('NFKC')
    .replace(/\r\n?/g,'\n')
    .replace(/\s+/g,' ')
    .trim();
}

function normalizeProductType(value=''){
  return normalizeText(value).toLocaleLowerCase('ja-JP');
}

function productSourceHash(itemName='',itemCaption=''){
  return sha256(normalizeText(itemName)+'\n'+normalizeText(itemCaption));
}

function productCacheKey(itemCode='',itemName='',itemCaption=''){
  const sourceHash=productSourceHash(itemName,itemCaption);
  return sha256(String(itemCode||'').trim()+'\n'+sourceHash);
}

const IMAGE_PRESENTATION_PARAMS=new Set([
  '_ex','ex','w','h','width','height','resize','fit','fitin','crop','quality','q','format','fm'
]);

function normalizeImageUrl(value=''){
  let u;
  try{u=new URL(String(value||'').trim());}catch{return '';}
  if(!/^https?:$/i.test(u.protocol)) return '';
  u.hash='';
  for(const key of [...u.searchParams.keys()]){
    if(IMAGE_PRESENTATION_PARAMS.has(String(key).toLowerCase())) u.searchParams.delete(key);
  }
  const sorted=[...u.searchParams.entries()].sort(([a,av],[b,bv])=>a.localeCompare(b)||av.localeCompare(bv));
  u.search='';
  for(const [key,val] of sorted) u.searchParams.append(key,val);
  return u.href;
}

function imageCacheKey(imageUrl=''){
  const normalized=normalizeImageUrl(imageUrl);
  return normalized?sha256(normalized):'';
}

function productTypeKnowledgeKey(productType=''){
  const normalized=normalizeProductType(productType);
  return normalized?sha256(normalized):'';
}

function expiresAt(status='ok',kind='product',now=Date.now()){
  if(status==='unknown') return new Date(now+UNKNOWN_TTL_MS).toISOString();
  const ttl=kind==='image'?IMAGE_TTL_MS:kind==='type'?TYPE_KNOWLEDGE_TTL_MS:PRODUCT_TTL_MS;
  return new Date(now+ttl).toISOString();
}

function isUsableRow(row,now=Date.now()){
  if(!row) return false;
  if(!row.expires_at) return true;
  const t=Date.parse(row.expires_at);
  return Number.isFinite(t)&&t>now;
}

function createCacheStore(db){
  if(typeof db!=='function') throw new TypeError('db function is required');

  async function selectOne(table,keyColumn,key){
    if(!key) return null;
    const q=new URLSearchParams({[keyColumn]:'eq.'+key,limit:'1'});
    const rows=await db(table+'?'+q.toString());
    const row=Array.isArray(rows)&&rows[0]?rows[0]:null;
    return isUsableRow(row)?row:null;
  }

  async function upsert(table,row){
    return db(table,{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(row)
    });
  }

  return {
    async loadProduct({itemCode='',itemName='',itemCaption=''}){
      const cacheKey=productCacheKey(itemCode,itemName,itemCaption);
      return selectOne('urenavi_product_understanding_cache','cache_key',cacheKey);
    },
    async saveProduct({itemCode='',itemName='',itemCaption='',model='',promptVersion='',schemaVersion='room_product_facts_v1',rawAiJson=null,resultStatus='ok'}){
      const sourceHash=productSourceHash(itemName,itemCaption);
      const cacheKey=productCacheKey(itemCode,itemName,itemCaption);
      return upsert('urenavi_product_understanding_cache',{
        cache_key:cacheKey,
        item_code:String(itemCode||'').trim(),
        source_hash:sourceHash,
        item_name:normalizeText(itemName),
        item_caption_normalized:normalizeText(itemCaption),
        model:String(model||''),
        prompt_version:String(promptVersion||''),
        schema_version:String(schemaVersion||'room_product_facts_v1'),
        raw_ai_json:rawAiJson,
        result_status:resultStatus==='unknown'?'unknown':'ok',
        expires_at:expiresAt(resultStatus,'product'),
        updated_at:new Date().toISOString()
      });
    },
    async loadImage(imageUrl=''){
      return selectOne('urenavi_image_understanding_cache','image_key',imageCacheKey(imageUrl));
    },
    async saveImage({imageUrl='',model='',promptVersion='',schemaVersion='room_product_image_v1',rawAiJson=null,resultStatus='ok'}){
      const normalizedImageUrl=normalizeImageUrl(imageUrl);
      const imageKey=imageCacheKey(normalizedImageUrl);
      if(!imageKey) return null;
      return upsert('urenavi_image_understanding_cache',{
        image_key:imageKey,
        normalized_image_url:normalizedImageUrl,
        model:String(model||''),
        prompt_version:String(promptVersion||''),
        schema_version:String(schemaVersion||'room_product_image_v1'),
        raw_ai_json:rawAiJson,
        result_status:resultStatus==='unknown'?'unknown':'ok',
        expires_at:expiresAt(resultStatus,'image'),
        updated_at:new Date().toISOString()
      });
    },
    async loadTypeKnowledge(productType=''){
      return selectOne('urenavi_product_type_knowledge_cache','product_type_key',productTypeKnowledgeKey(productType));
    },
    async saveTypeKnowledge({productType='',model='',promptVersion='',schemaVersion='product_type_knowledge_v1',rawAiJson=null,validationStatus='pending'}){
      const normalized=normalizeProductType(productType);
      const key=productTypeKnowledgeKey(normalized);
      if(!key) return null;
      const allowed=new Set(['pending','valid','invalid']);
      const status=allowed.has(validationStatus)?validationStatus:'pending';
      return upsert('urenavi_product_type_knowledge_cache',{
        product_type_key:key,
        product_type:normalized,
        model:String(model||''),
        prompt_version:String(promptVersion||''),
        schema_version:String(schemaVersion||'product_type_knowledge_v1'),
        raw_ai_json:rawAiJson,
        validation_status:status,
        expires_at:expiresAt(status==='invalid'?'unknown':'ok','type'),
        updated_at:new Date().toISOString()
      });
    }
  };
}

module.exports={
  normalizeText,
  normalizeProductType,
  productSourceHash,
  productCacheKey,
  normalizeImageUrl,
  imageCacheKey,
  productTypeKnowledgeKey,
  expiresAt,
  isUsableRow,
  createCacheStore,
  PRODUCT_TTL_MS,
  IMAGE_TTL_MS,
  TYPE_KNOWLEDGE_TTL_MS,
  UNKNOWN_TTL_MS
};
