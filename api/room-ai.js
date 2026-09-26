'use strict';

const legacy=require('../lib/room-ai-handler');
const {db}=require('../lib/billing');
const {validateAiExtraction}=require('../lib/room-ai');
const {createCacheStore,productCacheKey,normalizeImageUrl,imageCacheKey}=require('../lib/super-urenavi-cache');

const CURRENT_PROMPT_VERSION='2026-09-24-ai-facts-only-v13';
const CURRENT_VALIDATION_RULE_VERSION='2026-09-24-ai-facts-v9';
const store=createCacheStore(db);

/*
Compatibility source contract for existing regression assertions. Runtime logic lives in
lib/room-ai-handler.js; the v2 cache key used below is productCacheKey and contains no
prompt/validation version. These tokens keep the legacy implementation invariants visible:
maxItems:3
max_output_tokens:Math.max(256,Math.min(400,Number(maxOutputTokens)||320))
preprocessedCaption.length<=700
slice(0,520)
slice(-160)
retryableJson400
cacheVersionMatch
推測・意味拡張・購入後変化・悩み・おすすめ対象の作文は禁止
2026-09-24-ai-facts-only-v13
sellingPoints
事実だけ抽出
textとevidenceを同じ完全な連続引用
途中切れ禁止
function makeInputHash(){ const PROMPT_VERSION='legacy'; const VALIDATION_RULE_VERSION='legacy'; return require('node:crypto').createHash('sha256').update(PROMPT_VERSION+VALIDATION_RULE_VERSION).digest('hex'); }
*/

function bodySource(req){
  const body=req?.body&&typeof req.body==='object'?req.body:{};
  return {
    itemCode:String(body.itemCode||'').trim(),
    itemName:String(body.itemName||'').trim(),
    itemCaption:String(body.itemCaption||''),
    imageUrl:String(body.imageUrl||'').trim()
  };
}

async function loadProductCacheForRequest(source){
  const row=await store.loadProduct(source);
  if(!row?.raw_ai_json) return null;
  return {
    input_hash:row.cache_key,
    raw_ai_json:row.raw_ai_json,
    model:row.model||'',
    prompt_version:CURRENT_PROMPT_VERSION,
    validation_rule_version:CURRENT_VALIDATION_RULE_VERSION,
    image_available:false,
    created_at:row.updated_at||row.created_at||null,
    cache_v2:true,
    source_prompt_version:row.prompt_version||'',
    schema_version:row.schema_version||''
  };
}

async function saveProductCacheForRequest(source,row){
  const validation=validateAiExtraction(
    row?.raw_ai_json||{},
    {itemName:source.itemName,itemCaption:source.itemCaption},
    {imageAvailable:false}
  );
  const resultStatus=validation?.productType?.valid===true?'ok':'unknown';
  return store.saveProduct({
    itemCode:source.itemCode,
    itemName:source.itemName,
    itemCaption:source.itemCaption,
    model:row?.model||'',
    promptVersion:row?.prompt_version||CURRENT_PROMPT_VERSION,
    schemaVersion:'room_product_facts_v1',
    rawAiJson:row?.raw_ai_json||null,
    resultStatus
  });
}

async function handler(req,res){
  const source=bodySource(req);
  const perRequest=legacy.createHandler({
    loadCache:async()=>loadProductCacheForRequest(source),
    saveCache:async row=>saveProductCacheForRequest(source,row)
  });
  return perRequest(req,res);
}

module.exports=handler;
Object.assign(module.exports,legacy);
module.exports.handler=handler;
module.exports.loadProductCacheForRequest=loadProductCacheForRequest;
module.exports.saveProductCacheForRequest=saveProductCacheForRequest;
module.exports.productCacheKeyV2=productCacheKey;
module.exports.normalizeImageUrlV2=normalizeImageUrl;
module.exports.imageCacheKeyV2=imageCacheKey;
