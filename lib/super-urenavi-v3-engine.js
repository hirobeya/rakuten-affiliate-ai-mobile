'use strict';

const {validateUnderstanding}=require('./super-urenavi-v3-understanding');
const {buildVerificationRequests,applyVerification}=require('./super-urenavi-v3-verifier');
const {assessCopyReadiness}=require('./super-urenavi-v3-quality');

const V3_SCHEMA_VERSION='super_urenavi_v3_understanding_v3_quality_routed';

function isV3Row(row){return Boolean(row&&row.schema_version===V3_SCHEMA_VERSION&&row.raw_ai_json&&typeof row.raw_ai_json==='object'&&row.raw_ai_json.pass1);}
function resultFrom({source,rowRaw,validation,verifiedAppeals,pass1Calls=0,pass2Calls=0,cacheStatus='miss',qualityGate=null}){
 return {ok:validation?.valid===true,source,cacheStatus,schemaVersion:V3_SCHEMA_VERSION,validation,verifiedAppeals,qualityGate,pass2Status:pass2Calls?'verified':'not_needed',groq:{pass1Calls,pass2Calls,totalCalls:pass1Calls+pass2Calls},raw:{pass1:rowRaw?.pass1||null,pass2:rowRaw?.pass2||null}};
}
async function consumeOrThrow(consumeQuota,stage){if(typeof consumeQuota!=='function')return;const allowed=await consumeQuota(stage);if(allowed===false){const e=new Error('urenavi_ai_quota');e.status=429;e.stage=stage;e.quotaSource='urenavi';throw e;}}
async function safeSaveProduct(store,args){try{await store.saveProduct(args);return true;}catch(error){console.warn('super-urenavi-v3 cache write unavailable',error?.message||'unknown');return false;}}
function directVerification(validation){return applyVerification(validation,{results:[]});}
async function verifyOnlyWhenNeeded({validation,item,callPass2,consumeQuota,model}){
 const requests=buildVerificationRequests(validation);
 if(!requests.length)return {verifiedAppeals:directVerification(validation),pass2Raw:null,pass2Calls:0};
 if(typeof callPass2!=='function')return {verifiedAppeals:directVerification(validation),pass2Raw:null,pass2Calls:0};
 await consumeOrThrow(consumeQuota,'pass2');
 const response=await callPass2({item,validation,requests,model});
 const pass2Raw=response?.raw||response;
 return {verifiedAppeals:applyVerification(validation,pass2Raw),pass2Raw,pass2Calls:1};
}
async function analyzeProductV3({item,store,callPass1,callPass2,consumeQuota,model='',promptVersion='super-urenavi-v3-pass1-2026-09-29-quality-routed'}={}){
 if(!item?.itemName)throw new TypeError('item.itemName is required');
 if(!store?.loadProduct||!store?.saveProduct)throw new TypeError('product cache store is required');
 if(typeof callPass1!=='function')throw new TypeError('callPass1 is required');
 const keyArgs={itemCode:String(item.itemCode||''),itemName:String(item.itemName||''),itemCaption:String(item.itemCaption||'')};
 let row=null;try{row=await store.loadProduct(keyArgs);}catch{}
 if(isV3Row(row)){
   const raw=row.raw_ai_json,validation=validateUnderstanding(raw.pass1,item),qualityGate=assessCopyReadiness(validation);
   if(raw.pass2){return resultFrom({source:'cache',rowRaw:raw,validation,verifiedAppeals:applyVerification(validation,raw.pass2),cacheStatus:validation.valid?'hit':'hit_invalid',qualityGate});}
   const checked=await verifyOnlyWhenNeeded({validation,item,callPass2,consumeQuota,model});
   return resultFrom({source:'cache',rowRaw:{...raw,pass2:checked.pass2Raw},validation,verifiedAppeals:checked.verifiedAppeals,pass2Calls:checked.pass2Calls,cacheStatus:validation.valid?'hit':'hit_invalid',qualityGate});
 }
 // Unknown/stale products need Groq because the product-specific value layer does not yet exist.
 await consumeOrThrow(consumeQuota,'pass1');
 const response=await callPass1({item,model});const pass1Raw=response?.raw||response;const validation=validateUnderstanding(pass1Raw,item);const qualityGate=assessCopyReadiness(validation);
 const checked=validation.valid?await verifyOnlyWhenNeeded({validation,item,callPass2,consumeQuota,model}):{verifiedAppeals:[],pass2Raw:null,pass2Calls:0};
 const raw={pass1:pass1Raw,pass2:checked.pass2Raw};
 await safeSaveProduct(store,{...keyArgs,model:response?.model||model,promptVersion,schemaVersion:V3_SCHEMA_VERSION,rawAiJson:raw,resultStatus:validation.valid?'ok':'unknown'});
 return resultFrom({source:'pass1',rowRaw:raw,validation,verifiedAppeals:checked.verifiedAppeals,pass1Calls:1,pass2Calls:checked.pass2Calls,cacheStatus:row?'legacy_or_stale':'miss',qualityGate});
}
module.exports={V3_SCHEMA_VERSION,isV3Row,safeSaveProduct,directVerification,verifyOnlyWhenNeeded,analyzeProductV3};
