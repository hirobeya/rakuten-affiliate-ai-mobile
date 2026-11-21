'use strict';

const {authorize,db}=require('./billing');
const {
  validateAiExtraction,
  preprocessCaption
}=require('./room-ai');
const legacy=require('./room-ai-handler');
const {createRuntimeCacheStore}=require('./super-urenavi-cache');
const {guardedRoomAiCall}=require('./urenavi-core/room-ai-capacity-gate');
const {makeRuntimeCapacityDb}=require('./urenavi-core/runtime-capacity-db');
const {extractEvidence}=require('./urenavi-core/source-evidence-ledger');
const {composeSourceCopy}=require('./urenavi-core/source-purchase-relations');
const localTypeData=require('../data/local-product-types.json');

const DEFAULT_MODEL='openai/gpt-oss-120b';
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

function responseBase({model,usage=null,elapsedMs=0,rawAiJson,validation,route,stages=null,cache,sourceCopy=null,sourceEvidenceStatus}){
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
    ...(sourceCopy?{sourceCopy}:{}),
    ...(sourceEvidenceStatus?{sourceEvidenceStatus}:{}),
    cache
  };
}

function createHandler(deps={}){
  const authorizeFn=deps.authorize||authorize;
  // The single v2 gate, not the old daily counter, authorizes transport.
  const capacityGate=deps.capacityGate||guardedRoomAiCall;
  const callAI=deps.callGroq||((args)=>legacy.defaultCallGroq({...args,maxRetries:0}));
  const store=deps.store||createRuntimeCacheStore(db);

  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST') return json(res,405,{message:'Method not allowed'});
    const runtimeEnv=String(process.env.VERCEL_ENV||'');
    if(!['preview','production'].includes(runtimeEnv)) return json(res,404,{message:'Not found'});

    try{
      const auth=await authorizeFn(req);
      if(!auth?.ok) return json(res,403,{message:'access_required'});
      if(runtimeEnv==='preview' && auth.plan!=='owner') return json(res,403,{message:'owner_preview_only'});
      if(runtimeEnv==='production' && !['standard','base','pro','owner'].includes(String(auth.plan||''))) return json(res,403,{message:'paid_plan_required'});

      const body=req.body&&typeof req.body==='object'?req.body:{};
      const itemCode=String(body.itemCode||'').trim().slice(0,300);
      const itemName=String(body.itemName||'').trim().slice(0,1000);
      const itemCaptionRaw=String(body.itemCaption||'');
      const processed=preprocessCaption(itemCaptionRaw);
      // Preserve the entire source for validation and persistence. Only the
      // bounded provider payload is condensed to stay within Free limits.
      const itemCaption=processed;
      const modelCaption=processed.length<=3000?processed:
        (processed.slice(0,2200)+' … '+processed.slice(-750));
      const itemPrice=Number(body.itemPrice)||0;
      if(!itemName) return json(res,400,{message:'itemName is required'});

      const item={itemName,itemCaption:itemCaptionRaw,itemPrice};
      const local=resolveLocalUnderstanding({itemName,itemCaption});
      const sourceCopy=local&&composeSourceCopy(item,local.validation.productType.value);

      if(body.localOnly===true&&!sourceCopy){
        return json(res,200,{ok:true,sourceCopy:null});
      }

      let cacheStatus='miss';
      let productRow=null;
      try{productRow=await store.loadProduct({itemCode,itemName,itemCaption:itemCaptionRaw});}
      catch(error){cacheStatus='unavailable';console.warn('room-ai product cache unavailable',error?.message||'unknown');}

      if(!sourceCopy&&productRow?.raw_ai_json){
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

      if(local){
        let stored=false;
        try{
          await store.saveProduct({itemCode,itemName,itemCaption:itemCaptionRaw,model:'local',promptVersion:PROMPT_VERSION,schemaVersion:'room_product_facts_v1',rawAiJson:local.raw,resultStatus:'ok'});
          stored=true;
        }catch(error){console.warn('room-ai local cache write unavailable',error?.message||'unknown');}
        const route=legacy.logAiRoute('local',{groqCalls:0,cacheStatus,model:'local',mode:local.validation.mode,localVersion:local.version});
        return json(res,200,responseBase({
          model:'local',
          rawAiJson:local.raw,
          validation:local.validation,
          route,
          cache:{hit:false,status:cacheStatus,stored},
          sourceCopy,
          sourceEvidenceStatus:extractEvidence({...item,identity:local.validation.productType.value}).status
        }));
      }

      const apiKey=String(process.env.GROQ_API_KEY||'').trim();
      if(!apiKey) return json(res,503,{message:'GROQ_API_KEY is not configured'});
      const model=DEFAULT_MODEL;
      const started=Date.now();
      const textAi=await capacityGate({
        req,authorization:auth,apiKey,model,
        db:deps.capacityDb||makeRuntimeCapacityDb({productionDb:db}),
        authenticateSearchUser:deps.authenticateSearchUser,
        item:{itemCode,itemName,itemCaption:itemCaptionRaw,modelCaption,itemPrice,catchcopy:String(body.catchcopy||'')},
        callAI
      });
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

      // An inconclusive text evaluation is terminal for this request:
      // no image-model escalation, no second Groq call, no hidden retry.
      try{
        await store.saveProduct({itemCode,itemName,itemCaption:itemCaptionRaw,
          model:textAi.model||model,promptVersion:PROMPT_VERSION,
          schemaVersion:'room_product_facts_v1',rawAiJson:textAi.raw,
          resultStatus:'unknown'});
      }catch(error){
        console.warn('room-ai negative cache write unavailable',error?.message||'unknown');
      }
      const route=legacy.logAiRoute('text',{
        groqCalls:1,cacheStatus,model:textAi.model||model,
        elapsedMs:textElapsedMs,mode:textValidation.mode,
        inconclusive:true,imageAttempted:false
      });
      return json(res,200,responseBase({
        model:textAi.model||model,usage:textAi.usage||null,
        elapsedMs:textElapsedMs,rawAiJson:textAi.raw,
        validation:textValidation,route,
        stages:{textOnly:true,imageAttempted:false,secondProviderAttempt:false,
          textElapsedMs,imageElapsedMs:0},
        cache:{hit:false,status:cacheStatus,negativeStored:true}
      }));
    }catch(error){
      const timeout=error?.name==='AbortError'||/timeout|aborted/i.test(String(error?.message||''));
      const capacityBlocked=error?.capacityPreDispatch===true;
      const usageUnconfirmed=String(error?.message||'').includes('_no_retry');
      const rateLimited=error?.status===429;
      // No capacity error is a generic AI failure. Tell the UI to stop,
      // without exposing DB identifiers, tokens, secrets or provider payloads.
      const status=capacityBlocked||usageUnconfirmed?503:rateLimited?429:timeout?504:502;
      console.error('room-ai router failed',JSON.stringify({
        category:capacityBlocked?'capacity_denied':usageUnconfirmed?'capacity_halted':
          rateLimited?'rate_limited':timeout?'timeout':'provider_error',
        status
      }));
      return json(res,status,{
        message:capacityBlocked?'安全なAI利用枠を確認できないため生成を停止しました。':
          usageUnconfirmed?'AIの利用量を確定できないため再送せず停止しました。':
          rateLimited?'AIの利用上限に達したため生成を停止しました。':
          timeout?'AI分析が時間内に完了しませんでした。':'AI分析に失敗しました。',
        fallback:true,
        retryAllowed:false
      });
    }
  };
}

module.exports={
  createHandler,
  resolveLocalUnderstanding,
  hasAccessoryScope
};
