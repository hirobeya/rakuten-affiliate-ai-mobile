'use strict';

const {authorize,db}=require('./billing');
const {
  validateAiExtraction,
  preprocessCaption
}=require('./room-ai');
const legacy=require('./room-ai-handler');
const {createCacheStore}=require('./super-urenavi-cache');
const localTypeData=require('../data/local-product-types.json');

const DEFAULT_MODEL='qwen/qwen3.8-27b';
const DEFAULT_DAILY_LIMIT=200;
const PROMPT_VERSION='2026-09-24-ai-facts-only-v13';
const VALIDATION_RULE_VERSION='2026-09-24-ai-facts-v9';

function json(res,status,body){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(status).json(body);
}

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function exactSourceMatch(source,value){
  const s=normalize(source);
  const v=normalize(value);
  return Boolean(v && s.includes(v));
}

function hasAccessoryScope(title,type){
  const t=normalize(title);
  const needle=normalize(type);
  const at=t.indexOf(needle);
  if(at<0) return false;
  const before=t.slice(Math.max(0,at-10),at);
  const after=t.slice(at+needle.length,Math.min(t.length,at+needle.length+12));
  const around=before+'|'+after;
  return (localTypeData.accessoryMarkers||[]).some(marker=>{
    const m=normalize(marker);
    if(!m) return false;
    if(after.startsWith(m)) return true;
    if(before.endsWith('用') && (m==='ケース'||m==='カバー'||m==='ポーチ'||m==='ホルダー'||m==='スタンド')) return true;
    return false;
  }) || /(?:交換用|替え)\s*$/.test(before) || /^\s*(?:用|専用)\s*(?:ケース|カバー|ポーチ|ホルダー|スタンド|フィルター)/.test(after) || around.includes('用|ケース');
}

function resolveLocalUnderstanding({itemName='',itemCaption=''}){
  const title=normalize(itemName);
  const caption=normalize(itemCaption);
  if(!title) return null;
  const hits=(localTypeData.productTypes||[])
    .map(normalize)
    .filter(Boolean)
    .filter(type=>title.includes(type))
    .filter(type=>!hasAccessoryScope(title,type))
    .sort((a,b)=>b.length-a.length || a.localeCompare(b,'ja'));
  if(!hits.length) return null;

  const longest=hits[0];
  const unrelated=hits.filter(x=>x!==longest && !longest.includes(x) && !x.includes(longest));
  if(unrelated.length) return null;
  if(!exactSourceMatch(title,longest)) return null;

  const raw={
    productType:{value:longest,source:'itemName',evidence:longest},
    features:[],
    sellingPoints:[],
    confidence:'high'
  };
  const validation=validateAiExtraction(raw,{itemName:title,itemCaption:caption},{imageAvailable:false});
  if(validation?.productType?.valid!==true) return null;
  if(!['simple','simple_partial'].includes(validation.mode)) return null;
  return {raw,validation,version:localTypeData.version||'local-types'};
}

function cachedImageHint(row){
  if(!row || row.result_status==='unknown') return '';
  return normalize(row?.raw_ai_json?.imageProductTypeHint||'');
}

function promoteImageHint(textRaw,hint,{itemName='',itemCaption=''}){
  const value=normalize(hint);
  if(!value) return null;
  const title=normalize(itemName),caption=normalize(itemCaption);
  let source='';
  if(exactSourceMatch(title,value)) source='itemName';
  else if(exactSourceMatch(caption,value)) source='itemCaption';
  else return null;
  const raw={
    productType:{value,source,evidence:value},
    features:Array.isArray(textRaw?.features)?textRaw.features:[],
    sellingPoints:Array.isArray(textRaw?.sellingPoints)?textRaw.sellingPoints:[],
    confidence:'high',
    imageProductTypeHint:value
  };
  const validation=validateAiExtraction(raw,{itemName:title,itemCaption:caption},{imageAvailable:true});
  if(validation?.productType?.valid!==true) return null;
  if(!['simple','simple_partial'].includes(validation.mode)) return null;
  return {raw,validation};
}

async function defaultConsumeQuota(limit){
  const result=await db('rpc/urenavi_consume_ai_daily_limit',{
    method:'POST',
    body:JSON.stringify({p_limit:limit})
  });
  return result===true || result?.allowed===true;
}

function responseBase({model,usage=null,elapsedMs=0,rawAiJson,validation,route,stages=null,cache}){
  return {
    ok:true,
    phase:1,
    provider:route?.route==='local'?'local':'groq',
    model,
    usage,
    elapsedMs,
    validationRuleVersion:VALIDATION_RULE_VERSION,
    promptVersion:PROMPT_VERSION,
    rawAiJson,
    validation,
    route,
    ...(stages?{stages}:{}),
    cache
  };
}

function createHandler(deps={}){
  const authorizeFn=deps.authorize||authorize;
  const consumeQuota=deps.consumeQuota||defaultConsumeQuota;
  const callAI=deps.callGroq||legacy.defaultCallGroq;
  const imageLoader=deps.loadImageDataUrl||legacy.loadImageDataUrl;
  const store=deps.store||createCacheStore(db);

  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST') return json(res,405,{message:'Method not allowed'});
    const runtimeEnv=String(process.env.VERCEL_ENV||'');
    if(!['preview','production'].includes(runtimeEnv)) return json(res,404,{message:'Not found'});

    try{
      const auth=await authorizeFn(req);
      if(!auth?.ok) return json(res,403,{message:'access_required'});
      if(runtimeEnv==='preview' && auth.plan!=='owner') return json(res,403,{message:'owner_preview_only'});
      if(runtimeEnv==='production' && !['base','pro','owner'].includes(String(auth.plan||''))) return json(res,403,{message:'paid_plan_required'});

      const body=req.body&&typeof req.body==='object'?req.body:{};
      const itemCode=String(body.itemCode||'').trim().slice(0,300);
      const itemName=String(body.itemName||'').trim().slice(0,1000);
      const itemCaptionRaw=String(body.itemCaption||'');
      const processed=preprocessCaption(itemCaptionRaw);
      const itemCaption=processed.length<=700?processed:(processed.slice(0,520)+' … '+processed.slice(-160));
      const itemPrice=Number(body.itemPrice)||0;
      const imageUrl=String(body.imageUrl||'').trim();
      if(!itemName) return json(res,400,{message:'itemName is required'});

      let cacheStatus='miss';
      let productRow=null;
      try{productRow=await store.loadProduct({itemCode,itemName,itemCaption:itemCaptionRaw});}
      catch(error){cacheStatus='unavailable';console.warn('room-ai product cache unavailable',error?.message||'unknown');}

      if(productRow?.raw_ai_json){
        const validation=validateAiExtraction(productRow.raw_ai_json,{itemName,itemCaption},{imageAvailable:Boolean(productRow.raw_ai_json?.imageProductTypeHint)});
        const negative=productRow.result_status==='unknown';
        if(negative || validation?.productType?.valid===true){
          const route=legacy.logAiRoute('cache',{groqCalls:0,cacheStatus:'hit',model:productRow.model||DEFAULT_MODEL,mode:validation.mode,negative});
          return json(res,200,responseBase({
            model:productRow.model||DEFAULT_MODEL,
            rawAiJson:productRow.raw_ai_json,
            validation,
            route,
            cache:{hit:true,status:'hit',negative}
          }));
        }
        cacheStatus='revalidate_miss';
      }

      const local=resolveLocalUnderstanding({itemName,itemCaption});
      if(local){
        try{
          await store.saveProduct({itemCode,itemName,itemCaption:itemCaptionRaw,model:'local',promptVersion:PROMPT_VERSION,schemaVersion:'room_product_facts_v1',rawAiJson:local.raw,resultStatus:'ok'});
        }catch(error){console.warn('room-ai local cache write unavailable',error?.message||'unknown');}
        const route=legacy.logAiRoute('local',{groqCalls:0,cacheStatus,model:'local',mode:local.validation.mode,localVersion:local.version});
        return json(res,200,responseBase({
          model:'local',
          rawAiJson:local.raw,
          validation:local.validation,
          route,
          cache:{hit:false,status:cacheStatus,stored:true}
        }));
      }

      const apiKey=String(process.env.GROQ_API_KEY||'').trim();
      if(!apiKey) return json(res,503,{message:'GROQ_API_KEY is not configured'});
      const limitRaw=Number(process.env.GROQ_ROOM_DAILY_LIMIT||DEFAULT_DAILY_LIMIT);
      const limit=Number.isSafeInteger(limitRaw)&&limitRaw>0?limitRaw:DEFAULT_DAILY_LIMIT;
      if(!(await consumeQuota(limit))) return json(res,429,{message:'AI daily limit reached',limit});

      const model=String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL;
      const started=Date.now();
      const textAi=await callAI({apiKey,model,itemName,itemCaption,itemPrice,imageDataUrl:null});
      const textValidation=validateAiExtraction(textAi.raw,{itemName,itemCaption},{imageAvailable:false});
      const textElapsedMs=Date.now()-started;

      if(textValidation?.productType?.valid===true && ['simple','simple_partial'].includes(textValidation.mode)){
        try{await store.saveProduct({itemCode,itemName,itemCaption:itemCaptionRaw,model:textAi.model||model,promptVersion:PROMPT_VERSION,schemaVersion:'room_product_facts_v1',rawAiJson:textAi.raw,resultStatus:'ok'});}catch(error){console.warn('room-ai product cache write unavailable',error?.message||'unknown');}
        const route=legacy.logAiRoute('text',{groqCalls:1,cacheStatus,model:textAi.model||model,elapsedMs:textElapsedMs,mode:textValidation.mode,usage:textAi.usage||null,rateLimit:textAi.rateLimit||{}});
        return json(res,200,responseBase({
          model:textAi.model||model,usage:textAi.usage||null,elapsedMs:textElapsedMs,
          rawAiJson:textAi.raw,validation:textValidation,route,
          stages:{textOnly:true,imageAttempted:false,textElapsedMs,imageElapsedMs:0},
          cache:{hit:false,status:cacheStatus}
        }));
      }

      let imageRow=null;
      if(imageUrl){
        try{imageRow=await store.loadImage(imageUrl);}catch(error){console.warn('room-ai image cache unavailable',error?.message||'unknown');}
      }
      if(imageRow){
        const promoted=promoteImageHint(textAi.raw,cachedImageHint(imageRow),{itemName,itemCaption});
        if(promoted){
          try{await store.saveProduct({itemCode,itemName,itemCaption:itemCaptionRaw,model:textAi.model||model,promptVersion:PROMPT_VERSION,schemaVersion:'room_product_facts_v1',rawAiJson:promoted.raw,resultStatus:'ok'});}catch(error){console.warn('room-ai product cache write unavailable',error?.message||'unknown');}
          const elapsedMs=Date.now()-started;
          const route=legacy.logAiRoute('cache',{groqCalls:1,cacheStatus:'image_hit',model:textAi.model||model,elapsedMs,mode:promoted.validation.mode,imageCacheHit:true});
          return json(res,200,responseBase({
            model:textAi.model||model,usage:textAi.usage||null,elapsedMs,
            rawAiJson:promoted.raw,validation:promoted.validation,route,
            stages:{textOnly:false,imageAttempted:false,imageCacheHit:true,textElapsedMs,imageElapsedMs:0},
            cache:{hit:true,status:'image_hit'}
          }));
        }
        if(imageRow.result_status==='unknown'){
          try{await store.saveProduct({itemCode,itemName,itemCaption:itemCaptionRaw,model:textAi.model||model,promptVersion:PROMPT_VERSION,schemaVersion:'room_product_facts_v1',rawAiJson:textAi.raw,resultStatus:'unknown'});}catch(error){console.warn('room-ai negative cache write unavailable',error?.message||'unknown');}
          const elapsedMs=Date.now()-started;
          const route=legacy.logAiRoute('cache',{groqCalls:1,cacheStatus:'image_negative_hit',model:textAi.model||model,elapsedMs,mode:textValidation.mode,negative:true});
          return json(res,200,responseBase({
            model:textAi.model||model,usage:textAi.usage||null,elapsedMs,
            rawAiJson:textAi.raw,validation:textValidation,route,
            stages:{textOnly:true,imageAttempted:false,imageNegativeCacheHit:true,textElapsedMs,imageElapsedMs:0},
            cache:{hit:true,status:'image_negative_hit',negative:true}
          }));
        }
      }

      if(!imageUrl){
        try{await store.saveProduct({itemCode,itemName,itemCaption:itemCaptionRaw,model:textAi.model||model,promptVersion:PROMPT_VERSION,schemaVersion:'room_product_facts_v1',rawAiJson:textAi.raw,resultStatus:'unknown'});}catch(error){console.warn('room-ai negative cache write unavailable',error?.message||'unknown');}
        const route=legacy.logAiRoute('text',{groqCalls:1,cacheStatus,model:textAi.model||model,elapsedMs:textElapsedMs,mode:textValidation.mode,imageUnavailable:true});
        return json(res,200,responseBase({
          model:textAi.model||model,usage:textAi.usage||null,elapsedMs:textElapsedMs,
          rawAiJson:textAi.raw,validation:textValidation,route,
          stages:{textOnly:true,imageAttempted:false,imageUnavailable:true,textElapsedMs,imageElapsedMs:0},
          cache:{hit:false,status:cacheStatus,negativeStored:true}
        }));
      }

      const image=await imageLoader(imageUrl);
      if(!image?.available){
        try{
          await store.saveImage({imageUrl,model:textAi.model||model,promptVersion:PROMPT_VERSION,schemaVersion:'room_product_image_v1',rawAiJson:{imageProductTypeHint:null},resultStatus:'unknown'});
          await store.saveProduct({itemCode,itemName,itemCaption:itemCaptionRaw,model:textAi.model||model,promptVersion:PROMPT_VERSION,schemaVersion:'room_product_facts_v1',rawAiJson:textAi.raw,resultStatus:'unknown'});
        }catch(error){console.warn('room-ai negative cache write unavailable',error?.message||'unknown');}
        const elapsedMs=Date.now()-started;
        const route=legacy.logAiRoute('text',{groqCalls:1,cacheStatus,model:textAi.model||model,elapsedMs,mode:textValidation.mode,imageUnavailable:true});
        return json(res,200,responseBase({
          model:textAi.model||model,usage:textAi.usage||null,elapsedMs,
          rawAiJson:textAi.raw,validation:textValidation,route,
          stages:{textOnly:true,imageAttempted:false,imageUnavailable:true,textElapsedMs,imageElapsedMs:0},
          cache:{hit:false,status:cacheStatus,negativeStored:true}
        }));
      }

      const imageStarted=Date.now();
      const imageAi=await callAI({apiKey,model,itemName,itemCaption,itemPrice,imageDataUrl:image.dataUrl});
      const imageValidation=validateAiExtraction(imageAi.raw,{itemName,itemCaption},{imageAvailable:true});
      const imageElapsedMs=Date.now()-imageStarted;
      const resultStatus=imageValidation?.productType?.valid===true?'ok':'unknown';
      try{
        await store.saveImage({
          imageUrl,model:imageAi.model||model,promptVersion:PROMPT_VERSION,schemaVersion:'room_product_image_v1',
          rawAiJson:{imageProductTypeHint:normalize(imageAi.raw?.imageProductTypeHint||'')||null},resultStatus
        });
        await store.saveProduct({itemCode,itemName,itemCaption:itemCaptionRaw,model:imageAi.model||model,promptVersion:PROMPT_VERSION,schemaVersion:'room_product_facts_v1',rawAiJson:imageAi.raw,resultStatus});
      }catch(error){console.warn('room-ai cache write unavailable',error?.message||'unknown');}
      const elapsedMs=Date.now()-started;
      const route=legacy.logAiRoute('image',{groqCalls:2,cacheStatus,model:imageAi.model||model,elapsedMs,mode:imageValidation.mode,usage:imageAi.usage||null,rateLimit:imageAi.rateLimit||{}});
      return json(res,200,responseBase({
        model:imageAi.model||model,usage:imageAi.usage||null,elapsedMs,
        rawAiJson:imageAi.raw,validation:imageValidation,route,
        stages:{textOnly:false,imageAttempted:true,textElapsedMs,imageElapsedMs},
        cache:{hit:false,status:cacheStatus}
      }));
    }catch(error){
      const timeout=error?.name==='AbortError'||/timeout|aborted/i.test(String(error?.message||''));
      console.error('room-ai router failed',JSON.stringify({message:error?.message||'unknown',status:error?.status||null,error:error?.safeError||null}));
      return json(res,timeout?504:502,{
        message:timeout?'AI analysis timed out':'AI analysis failed',
        fallback:true,
        upstreamStatus:error?.status||null,
        upstreamError:error?.safeError||null,
        rateLimit:error?.rateLimit||{}
      });
    }
  };
}

module.exports={
  createHandler,
  resolveLocalUnderstanding,
  promoteImageHint,
  cachedImageHint,
  hasAccessoryScope
};
