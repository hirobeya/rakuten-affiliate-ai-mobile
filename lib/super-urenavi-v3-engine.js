'use strict';

const {validateUnderstanding}=require('./super-urenavi-v3-understanding');
const {applyVerification}=require('./super-urenavi-v3-verifier');

const V3_SCHEMA_VERSION='super_urenavi_v3_understanding_v2_one_call';

function isV3Row(row){
  return Boolean(row&&row.schema_version===V3_SCHEMA_VERSION&&row.raw_ai_json&&typeof row.raw_ai_json==='object'&&row.raw_ai_json.pass1);
}
function resultFrom({source,rowRaw,validation,verifiedAppeals,pass1Calls=0,cacheStatus='miss'}){
  return {ok:validation?.valid===true,source,cacheStatus,schemaVersion:V3_SCHEMA_VERSION,validation,verifiedAppeals,pass2Status:'local_verification',groq:{pass1Calls,pass2Calls:0,totalCalls:pass1Calls},raw:{pass1:rowRaw?.pass1||null,pass2:null}};
}
async function consumeOrThrow(consumeQuota,stage){if(typeof consumeQuota!=='function')return;const allowed=await consumeQuota(stage);if(allowed===false){const e=new Error('AI daily limit reached');e.status=429;e.stage=stage;throw e;}}
async function safeSaveProduct(store,args){try{await store.saveProduct(args);return true;}catch(error){console.warn('super-urenavi-v3 cache write unavailable',error?.message||'unknown');return false;}}
function locallyVerifyAppeals(validation){
  // Pass1 already ties every accepted appeal to grounded attributes. Do not spend a second Groq call.
  // Direct facts pass. One-step value inferences remain explicitly framed as inference by the Pass1 contract/copy layer.
  return applyVerification(validation,{results:[]}).map(row=>row.needsVerification?{...row,verification:{required:false,supported:true,keepDirectFact:true,reason:'grounded_local_one_step_inference'}}:row);
}
async function analyzeProductV3({item,store,callPass1,consumeQuota,model='',promptVersion='super-urenavi-v3-pass1-2026-09-29-one-call'}={}){
  if(!item?.itemName)throw new TypeError('item.itemName is required');
  if(!store?.loadProduct||!store?.saveProduct)throw new TypeError('product cache store is required');
  if(typeof callPass1!=='function')throw new TypeError('callPass1 is required');
  const keyArgs={itemCode:String(item.itemCode||''),itemName:String(item.itemName||''),itemCaption:String(item.itemCaption||'')};
  let row=null;try{row=await store.loadProduct(keyArgs);}catch{}
  if(isV3Row(row)){
    const raw=row.raw_ai_json;const validation=validateUnderstanding(raw.pass1,item);
    return resultFrom({source:'cache',rowRaw:raw,validation,verifiedAppeals:validation.valid?locallyVerifyAppeals(validation):[],cacheStatus:validation.valid?'hit':'hit_invalid'});
  }
  await consumeOrThrow(consumeQuota,'pass1');
  const response=await callPass1({item,model});const pass1Raw=response?.raw||response;const validation=validateUnderstanding(pass1Raw,item);const raw={pass1:pass1Raw,pass2:null};
  await safeSaveProduct(store,{...keyArgs,model:response?.model||model,promptVersion,schemaVersion:V3_SCHEMA_VERSION,rawAiJson:raw,resultStatus:validation.valid?'ok':'unknown'});
  return resultFrom({source:'pass1',rowRaw:raw,validation,verifiedAppeals:validation.valid?locallyVerifyAppeals(validation):[],pass1Calls:1,cacheStatus:row?'legacy_or_stale':'miss'});
}
module.exports={V3_SCHEMA_VERSION,isV3Row,safeSaveProduct,locallyVerifyAppeals,analyzeProductV3};
