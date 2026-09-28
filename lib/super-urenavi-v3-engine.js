'use strict';

const {validateUnderstanding}=require('./super-urenavi-v3-understanding');
const {buildVerificationInput,applyVerification}=require('./super-urenavi-v3-verifier');
const {assessCopyReadiness}=require('./super-urenavi-v3-quality');
// Schema versions describe the stored shape, not the prompt. Revalidate all v3 rows.
const V3_SCHEMA_VERSION='super_urenavi_v3_understanding_v6_resumable';
function isV3Row(row){return Boolean(row&&String(row.schema_version||'').startsWith('super_urenavi_v3_understanding_')&&row.raw_ai_json?.pass1);}
async function consumeOrThrow(consumeQuota,stage){if(typeof consumeQuota!=='function')return;const allowed=await consumeQuota(stage);if(allowed===false){const e=new Error('urenavi_ai_quota');e.status=429;e.stage=stage;e.quotaSource='urenavi';throw e;}}
async function safeSaveProduct(store,args){try{await store.saveProduct(args);return true;}catch(error){console.warn('super-urenavi-v3 cache write unavailable',error?.message||'unknown');return false;}}
function directVerification(validation){return applyVerification(validation,{results:[]});}
async function verifyOnlyWhenNeeded({validation,callPass2,consumeQuota,model}){const verificationInput=buildVerificationInput(validation);if(!verificationInput.length||typeof callPass2!=='function')return{verifiedAppeals:directVerification(validation),pass2Raw:null,pass2Calls:0};await consumeOrThrow(consumeQuota,'pass2');const response=await callPass2({verificationInput,model}),pass2Raw=response?.raw||response;return{verifiedAppeals:applyVerification(validation,pass2Raw),pass2Raw,pass2Calls:1};}
function shouldRetryValueLayer(validation,qualityGate){
 if(!validation?.valid||!qualityGate?.needsGroq)return false;
 const reasons=new Set(qualityGate.reasons||[]);
 if(reasons.has('identity_not_ready')||reasons.has('no_grounded_attributes'))return false;
 return reasons.has('no_grounded_customer_value')||reasons.has('no_product_specific_hook');
}
async function getQualityUnderstanding({item,callPass1,consumeQuota,model}){
 await consumeOrThrow(consumeQuota,'pass1');let response=await callPass1({item,model}),raw=response?.raw||response,validation=validateUnderstanding(raw,item),qualityGate=assessCopyReadiness(validation),calls=1;
 if(shouldRetryValueLayer(validation,qualityGate)){await consumeOrThrow(consumeQuota,'quality_retry');const retry=await callPass1({item,model,qualityRetryReasons:qualityGate.reasons});calls++;const retryRaw=retry?.raw||retry,retryValidation=validateUnderstanding(retryRaw,item),retryGate=assessCopyReadiness(retryValidation);if(retryValidation.valid&&retryGate.ready){response=retry;raw=retryRaw;validation=retryValidation;qualityGate=retryGate;}}
 return{response,raw,validation,qualityGate,calls};
}
async function analyzeProductV3({item,store,callPass1,callPass2,consumeQuota,model='',promptVersion='super-urenavi-v3-compact-resumable'}={}){
 if(!item?.itemName)throw new TypeError('item.itemName is required');if(!store?.loadProduct||!store?.saveProduct)throw new TypeError('product cache store is required');if(typeof callPass1!=='function')throw new TypeError('callPass1 is required');
 const keyArgs={itemCode:String(item.itemCode||''),itemName:String(item.itemName||''),itemCaption:String(item.itemCaption||'')};
 const groq={pass1Calls:0,pass2Calls:0,qualityRetryCalls:0,totalCalls:0};
 let row=null;try{row=await store.loadProduct(keyArgs);}catch{}
 const cached=isV3Row(row);let raw=cached?{...row.raw_ai_json}:null;
 const cacheStatus=cached?'hit':row?'legacy_or_stale':'miss';
 let stage='pass1';
 const save=()=>safeSaveProduct(store,{...keyArgs,model,promptVersion,schemaVersion:V3_SCHEMA_VERSION,rawAiJson:raw,resultStatus:'ok'});
 async function call(which,args){stage=which;await consumeOrThrow(consumeQuota,which);groq.totalCalls++;if(which==='pass2')groq.pass2Calls++;else groq.pass1Calls++;if(which==='quality_retry')groq.qualityRetryCalls++;return (which==='pass2'?callPass2:callPass1)(args);}
 try{
  if(!raw){const response=await call('pass1',{item,model});raw={pass1:response?.raw||response,pass2:null,qualityRetryCompleted:false};await save();}
  let validation=validateUnderstanding(raw.pass1,item),qualityGate=assessCopyReadiness(validation);
  // Old rows already exhausted their quality retry. Never repeat successful inference
  // just because the prompt changed. New partial rows can resume a failed retry.
  const mayRetry=raw.qualityRetryCompleted===false;
  if(mayRetry&&shouldRetryValueLayer(validation,qualityGate)){
   const response=await call('quality_retry',{item,model,qualityRetryReasons:qualityGate.reasons});
   const candidate=response?.raw||response,checked=validateUnderstanding(candidate,item),gate=assessCopyReadiness(checked);
   raw.qualityRetryCompleted=true;
   if(checked.valid&&gate.ready){raw.pass1=candidate;raw.pass2=null;validation=checked;qualityGate=gate;}
   await save();
  }
  let verifiedAppeals=[],pass2Status='not_needed';
  if(raw.pass2){verifiedAppeals=applyVerification(validation,raw.pass2);pass2Status='cached';}
  else if(validation.valid&&qualityGate.ready){
   const verificationInput=buildVerificationInput(validation);
   if(verificationInput.length&&typeof callPass2==='function'){
    const response=await call('pass2',{verificationInput,model});raw.pass2=response?.raw||response;await save();verifiedAppeals=applyVerification(validation,raw.pass2);pass2Status='verified';
   }else{verifiedAppeals=directVerification(validation);pass2Status=verificationInput.length?'unavailable':'not_needed';}
  }
  const source=cached?(groq.pass2Calls?'cache+pass2':groq.pass1Calls?'cache+quality_retry':'cache'):(groq.pass2Calls?'pass1+pass2':'pass1');
  return{ok:validation.valid,source,cacheStatus:validation.valid?cacheStatus:cached?'hit_invalid':cacheStatus,schemaVersion:V3_SCHEMA_VERSION,validation,verifiedAppeals,qualityGate,pass2Status,groq,raw};
 }catch(error){error.stage=error.stage||stage;error.groq={...groq};error.cacheStatus=cacheStatus;throw error;}
}
module.exports={V3_SCHEMA_VERSION,isV3Row,safeSaveProduct,directVerification,verifyOnlyWhenNeeded,shouldRetryValueLayer,getQualityUnderstanding,analyzeProductV3};
