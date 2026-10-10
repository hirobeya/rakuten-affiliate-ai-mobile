'use strict';

const {validateUnderstanding}=require('./super-urenavi-v3-understanding');
const {buildVerificationInput,applyVerification}=require('./super-urenavi-v3-verifier');
const {composePurchaseCopy}=require('./grounded-purchase-copy');
const {DIRECT_PROOF_VERSION,canSkipPass2WithExactProof,applyExactProof}=require('./super-urenavi-v3-direct-proof');

const {createHash}=require('node:crypto');
const {MODEL_PASS1_SCHEMA,SEMANTIC_WRITER_PROMPT,mergeUsage}=require('./super-urenavi-v3-groq');
const {PASS2_SCHEMA,PASS2_SYSTEM_PROMPT}=require('./super-urenavi-v3-verifier');
// Cache identity follows the actual generation, verification and deterministic
// direct-proof contract so older partial rows cannot silently change meaning.
const V3_SCHEMA_VERSION='room_semantic_'+createHash('sha256').update(JSON.stringify([MODEL_PASS1_SCHEMA,SEMANTIC_WRITER_PROMPT,PASS2_SCHEMA,PASS2_SYSTEM_PROMPT,DIRECT_PROOF_VERSION])).digest('hex').slice(0,16);

function isV3Row(row){
  return Boolean(
    row &&
    row.schema_version===V3_SCHEMA_VERSION &&
    row.result_status==='ok' &&
    row.raw_ai_json &&
    typeof row.raw_ai_json==='object' &&
    row.raw_ai_json.pass1
  );
}

function hasPurchaseReasonCandidate(validation){
  return Boolean(
    validation?.valid===true &&
    Array.isArray(validation.attributes) && validation.attributes.length>0 &&
    Array.isArray(validation.appeals) && validation.appeals.length>0
  );
}

function withPurchaseReasonFailure(validation){
  if(hasPurchaseReasonCandidate(validation)) return validation;
  return {
    ...(validation||{}),
    reasons:[...new Set([...(validation?.reasons||[]),'no_purchase_reason_candidate'])]
  };
}

function isReadyPurchaseCopy(item,validation,verifiedAppeals){
  if(!hasPurchaseReasonCandidate(validation)) return false;
  const copy=composePurchaseCopy({item,analysis:{validation,verifiedAppeals}});
  return copy?.status==='ready';
}

function resultFrom({item,source,rowRaw,validation,verifiedAppeals,pass1Calls=0,pass2Calls=0,cacheStatus='miss',pass2Status='not_needed',rateLimit={},usage={}}){
  return {
    ok:isReadyPurchaseCopy(item,validation,verifiedAppeals),
    source,
    cacheStatus,
    schemaVersion:V3_SCHEMA_VERSION,
    validation,
    verifiedAppeals,
    pass2Status,
    groq:{pass1Calls,pass2Calls,totalCalls:pass1Calls+pass2Calls},
    rateLimit:rateLimit&&typeof rateLimit==='object'?rateLimit:{},
    usage:usage&&typeof usage==='object'?usage:{},
    raw:{pass1:rowRaw?.pass1||null,pass2:rowRaw?.pass2||null}
  };
}

function needsPass2(validation,item){
  if(canSkipPass2WithExactProof(validation,item)) return false;
  return buildVerificationInput(validation).length>0;
}

function verifiedWithoutPass2(validation,item){
  return applyExactProof(validation,item)||applyVerification(validation,{results:[]});
}

async function consumeOrThrow(consumeQuota,stage){
  if(typeof consumeQuota!=='function') return;
  const allowed=await consumeQuota(stage);
  if(allowed===false){
    const error=new Error('AI daily limit reached');
    error.status=429;
    error.stage=stage;
    throw error;
  }
}

async function callStage(call,args,stage){
  try{return await call(args);}catch(error){error.stage=error.stage||stage;throw error;}
}

async function safeSaveProduct(store,args){
  try{
    await store.saveProduct(args);
    return true;
  }catch(error){
    console.warn('super-urenavi-v3 cache write unavailable',error?.message||'unknown');
    return false;
  }
}

async function analyzeProductV3({
  item,
  store,
  callPass1,
  callPass2,
  consumeQuota,
  model='',
  deferPass2=false,
  now=Date.now,
  promptVersion='room-semantic-writer-20261003',
  pass2PromptVersion='room-final-safety-20261003'
}={}){
  if(!item?.itemName) throw new TypeError('item.itemName is required');
  if(!store?.loadProduct || !store?.saveProduct) throw new TypeError('product cache store is required');
  if(typeof callPass1!=='function') throw new TypeError('callPass1 is required');
  if(typeof callPass2!=='function') throw new TypeError('callPass2 is required');

  const keyArgs={
    itemCode:String(item.itemCode||''),
    itemName:String(item.itemName||''),
    itemCaption:String(item.itemCaption||'')
  };

  let row=null;
  try{row=await store.loadProduct(keyArgs);}catch{}

  if(isV3Row(row) && (!model || row.model===model)){
    const cachedRaw=row.raw_ai_json;
    const validation=validateUnderstanding(cachedRaw.pass1,item);

    if(hasPurchaseReasonCandidate(validation)){
      if(!needsPass2(validation,item)){
        const verifiedAppeals=verifiedWithoutPass2(validation,item);
        if(isReadyPurchaseCopy(item,validation,verifiedAppeals)){
          return resultFrom({item,source:'cache',rowRaw:cachedRaw,validation,verifiedAppeals,cacheStatus:'hit',pass2Status:'not_needed'});
        }
      }else if(cachedRaw.pass2){
        const verifiedAppeals=applyVerification(validation,cachedRaw.pass2);
        if(isReadyPurchaseCopy(item,validation,verifiedAppeals)){
          return resultFrom({item,source:'cache',rowRaw:cachedRaw,validation,verifiedAppeals,cacheStatus:'hit',pass2Status:'cached'});
        }
      }else{
        const remaining=Number(cachedRaw.verifyAfter||0)-now();
        if(remaining>0) return {...resultFrom({item,source:'cache_pending',rowRaw:cachedRaw,validation,verifiedAppeals:[],cacheStatus:'hit_partial',pass2Status:'pending'}),pending:true,retryAfterMs:remaining};
        await consumeOrThrow(consumeQuota,'pass2');
        const verificationInput=buildVerificationInput(validation);
        const pass2Response=await callStage(callPass2,{item,validation,verificationInput,model},'pass2');
        const pass2Raw=pass2Response?.raw||pass2Response;
        const combined={pass1:cachedRaw.pass1,pass2:pass2Raw};
        const verifiedAppeals=applyVerification(validation,pass2Raw);
        const ready=isReadyPurchaseCopy(item,validation,verifiedAppeals);
        await safeSaveProduct(store,{...keyArgs,model:pass2Response?.model||row.model||model,promptVersion:pass2PromptVersion,schemaVersion:V3_SCHEMA_VERSION,rawAiJson:combined,resultStatus:ready?'ok':'unknown'});
        return resultFrom({item,source:'cache+pass2',rowRaw:combined,validation,verifiedAppeals,pass2Calls:1,cacheStatus:'hit_partial',pass2Status:'generated',rateLimit:pass2Response?.rateLimit||{},usage:mergeUsage(pass2Response?.usage)});
      }
    }
  }

  await consumeOrThrow(consumeQuota,'pass1');
  const pass1Response=await callStage(callPass1,{item,model},'pass1');
  const pass1Raw=pass1Response?.raw||pass1Response;
  const validation=validateUnderstanding(pass1Raw,item);

  if(!hasPurchaseReasonCandidate(validation)){
    const raw={pass1:pass1Raw,pass2:null};
    const failedValidation=withPurchaseReasonFailure(validation);
    await safeSaveProduct(store,{...keyArgs,model:pass1Response?.model||model,promptVersion,schemaVersion:V3_SCHEMA_VERSION,rawAiJson:raw,resultStatus:'unknown'});
    return resultFrom({item,source:'pass1',rowRaw:raw,validation:failedValidation,verifiedAppeals:[],pass1Calls:1,cacheStatus:row?'weak_or_stale':'miss',pass2Status:'not_needed',rateLimit:pass1Response?.rateLimit||{},usage:mergeUsage(pass1Response?.usage)});
  }

  if(!needsPass2(validation,item)){
    const raw={pass1:pass1Raw,pass2:null};
    const verifiedAppeals=verifiedWithoutPass2(validation,item);
    const ready=isReadyPurchaseCopy(item,validation,verifiedAppeals);
    await safeSaveProduct(store,{...keyArgs,model:pass1Response?.model||model,promptVersion,schemaVersion:V3_SCHEMA_VERSION,rawAiJson:raw,resultStatus:ready?'ok':'unknown'});
    return resultFrom({item,source:'pass1',rowRaw:raw,validation,verifiedAppeals,pass1Calls:1,cacheStatus:row?'legacy_or_stale':'miss',pass2Status:'not_needed',rateLimit:pass1Response?.rateLimit||{},usage:mergeUsage(pass1Response?.usage)});
  }

  const partial={pass1:pass1Raw,pass2:null,...(deferPass2?{verifyAfter:now()+65000}:{})};
  const saved=await safeSaveProduct(store,{...keyArgs,model:pass1Response?.model||model,promptVersion,schemaVersion:V3_SCHEMA_VERSION,rawAiJson:partial,resultStatus:'ok'});
  if(deferPass2){
    if(!saved){const error=new Error('Preview cache unavailable');error.failureReason='preview_cache_unavailable';error.stage='pass1';throw error;}
    return {...resultFrom({item,source:'pass1_pending',rowRaw:partial,validation,verifiedAppeals:[],pass1Calls:1,cacheStatus:row?'legacy_or_stale':'miss',pass2Status:'pending',rateLimit:pass1Response?.rateLimit||{},usage:mergeUsage(pass1Response?.usage)}),pending:true,retryAfterMs:65000};
  }

  await consumeOrThrow(consumeQuota,'pass2');
  const verificationInput=buildVerificationInput(validation);
  const pass2Response=await callStage(callPass2,{item,validation,verificationInput,model},'pass2');
  const pass2Raw=pass2Response?.raw||pass2Response;
  const combined={pass1:pass1Raw,pass2:pass2Raw};
  const verifiedAppeals=applyVerification(validation,pass2Raw);
  const ready=isReadyPurchaseCopy(item,validation,verifiedAppeals);
  await safeSaveProduct(store,{...keyArgs,model:pass2Response?.model||pass1Response?.model||model,promptVersion:pass2PromptVersion,schemaVersion:V3_SCHEMA_VERSION,rawAiJson:combined,resultStatus:ready?'ok':'unknown'});

  return resultFrom({item,source:'pass1+pass2',rowRaw:combined,validation,verifiedAppeals,pass1Calls:1,pass2Calls:1,cacheStatus:row?'legacy_or_stale':'miss',pass2Status:'generated',rateLimit:pass2Response?.rateLimit||pass1Response?.rateLimit||{},usage:mergeUsage(pass1Response?.usage,pass2Response?.usage)});
}

module.exports={V3_SCHEMA_VERSION,isV3Row,hasPurchaseReasonCandidate,isReadyPurchaseCopy,needsPass2,verifiedWithoutPass2,safeSaveProduct,analyzeProductV3};
