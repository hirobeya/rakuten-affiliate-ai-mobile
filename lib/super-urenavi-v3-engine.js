'use strict';

const {validateUnderstanding}=require('./super-urenavi-v3-understanding');
const {buildVerificationInput,applyVerification}=require('./super-urenavi-v3-verifier');

const V3_SCHEMA_VERSION='super_urenavi_v3_understanding_v1';

function isV3Row(row){
  return Boolean(
    row &&
    row.schema_version===V3_SCHEMA_VERSION &&
    row.raw_ai_json &&
    typeof row.raw_ai_json==='object' &&
    row.raw_ai_json.pass1
  );
}

function resultFrom({source,rowRaw,validation,verifiedAppeals,pass1Calls=0,pass2Calls=0,cacheStatus='miss',pass2Status='not_needed'}){
  return {
    ok:validation?.valid===true,
    source,
    cacheStatus,
    schemaVersion:V3_SCHEMA_VERSION,
    validation,
    verifiedAppeals,
    pass2Status,
    groq:{pass1Calls,pass2Calls,totalCalls:pass1Calls+pass2Calls},
    raw:{pass1:rowRaw?.pass1||null,pass2:rowRaw?.pass2||null}
  };
}

function needsPass2(validation){
  return buildVerificationInput(validation).length>0;
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
  promptVersion='super-urenavi-v3-pass1-2026-09-27',
  pass2PromptVersion='super-urenavi-v3-pass2-2026-09-27'
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

  if(isV3Row(row)){
    const cachedRaw=row.raw_ai_json;
    const validation=validateUnderstanding(cachedRaw.pass1,item);
    if(!validation.valid){
      return resultFrom({source:'cache',rowRaw:cachedRaw,validation,verifiedAppeals:[],cacheStatus:'hit_invalid',pass2Status:'not_needed'});
    }

    if(!needsPass2(validation)){
      return resultFrom({source:'cache',rowRaw:cachedRaw,validation,verifiedAppeals:applyVerification(validation,{results:[]}),cacheStatus:'hit',pass2Status:'not_needed'});
    }

    if(cachedRaw.pass2){
      return resultFrom({source:'cache',rowRaw:cachedRaw,validation,verifiedAppeals:applyVerification(validation,cachedRaw.pass2),cacheStatus:'hit',pass2Status:'cached'});
    }

    await consumeOrThrow(consumeQuota,'pass2');
    const verificationInput=buildVerificationInput(validation);
    const pass2Response=await callPass2({item,validation,verificationInput,model});
    const pass2Raw=pass2Response?.raw||pass2Response;
    const combined={pass1:cachedRaw.pass1,pass2:pass2Raw};
    await safeSaveProduct(store,{...keyArgs,model:pass2Response?.model||row.model||model,promptVersion:pass2PromptVersion,schemaVersion:V3_SCHEMA_VERSION,rawAiJson:combined,resultStatus:'ok'});
    return resultFrom({source:'cache+pass2',rowRaw:combined,validation,verifiedAppeals:applyVerification(validation,pass2Raw),pass2Calls:1,cacheStatus:'hit_partial',pass2Status:'generated'});
  }

  await consumeOrThrow(consumeQuota,'pass1');
  const pass1Response=await callPass1({item,model});
  const pass1Raw=pass1Response?.raw||pass1Response;
  const validation=validateUnderstanding(pass1Raw,item);

  if(!validation.valid){
    const raw={pass1:pass1Raw,pass2:null};
    await safeSaveProduct(store,{...keyArgs,model:pass1Response?.model||model,promptVersion,schemaVersion:V3_SCHEMA_VERSION,rawAiJson:raw,resultStatus:'unknown'});
    return resultFrom({source:'pass1',rowRaw:raw,validation,verifiedAppeals:[],pass1Calls:1,cacheStatus:row?'legacy_or_stale':'miss',pass2Status:'not_needed'});
  }

  if(!needsPass2(validation)){
    const raw={pass1:pass1Raw,pass2:null};
    await safeSaveProduct(store,{...keyArgs,model:pass1Response?.model||model,promptVersion,schemaVersion:V3_SCHEMA_VERSION,rawAiJson:raw,resultStatus:'ok'});
    return resultFrom({source:'pass1',rowRaw:raw,validation,verifiedAppeals:applyVerification(validation,{results:[]}),pass1Calls:1,cacheStatus:row?'legacy_or_stale':'miss',pass2Status:'not_needed'});
  }

  // Cache pass 1 before pass 2 when possible so a temporary limit/error can resume cheaply.
  // Cache failure must never discard an otherwise usable Generate result.
  const partial={pass1:pass1Raw,pass2:null};
  await safeSaveProduct(store,{...keyArgs,model:pass1Response?.model||model,promptVersion,schemaVersion:V3_SCHEMA_VERSION,rawAiJson:partial,resultStatus:'ok'});

  await consumeOrThrow(consumeQuota,'pass2');
  const verificationInput=buildVerificationInput(validation);
  const pass2Response=await callPass2({item,validation,verificationInput,model});
  const pass2Raw=pass2Response?.raw||pass2Response;
  const combined={pass1:pass1Raw,pass2:pass2Raw};
  await safeSaveProduct(store,{...keyArgs,model:pass2Response?.model||pass1Response?.model||model,promptVersion:pass2PromptVersion,schemaVersion:V3_SCHEMA_VERSION,rawAiJson:combined,resultStatus:'ok'});

  return resultFrom({source:'pass1+pass2',rowRaw:combined,validation,verifiedAppeals:applyVerification(validation,pass2Raw),pass1Calls:1,pass2Calls:1,cacheStatus:row?'legacy_or_stale':'miss',pass2Status:'generated'});
}

module.exports={V3_SCHEMA_VERSION,isV3Row,needsPass2,safeSaveProduct,analyzeProductV3};
