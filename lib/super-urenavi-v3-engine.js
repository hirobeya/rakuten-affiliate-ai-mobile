'use strict';

const {validateUnderstanding}=require('./super-urenavi-v3-understanding');
const {applyVerification}=require('./super-urenavi-v3-verifier');
const {assessCopyReadiness}=require('./super-urenavi-v3-quality');
// Schema versions describe the stored shape, not the prompt. Revalidate all v3 rows.
const V3_SCHEMA_VERSION='super_urenavi_v3_understanding_v7_text_first';
function isV3Row(row){return Boolean(row&&String(row.schema_version||'').startsWith('super_urenavi_v3_understanding_')&&row.raw_ai_json?.pass1);}
async function consumeOrThrow(consumeQuota,stage){if(typeof consumeQuota!=='function')return;const allowed=await consumeQuota(stage);if(allowed===false){const e=new Error('urenavi_ai_quota');e.status=429;e.stage=stage;e.quotaSource='urenavi';throw e;}}
async function safeSaveProduct(store,args){try{await store.saveProduct(args);return true;}catch(error){console.warn('super-urenavi-v3 cache write unavailable',error?.message||'unknown');return false;}}
function directVerification(validation){return applyVerification(validation,{results:[]});}
async function verifyOnlyWhenNeeded({validation}){return{verifiedAppeals:directVerification(validation),pass2Raw:null,pass2Calls:0};}
// v3 no longer retries just because the copy/value layer dislikes a valid product.
// If the product identity is understood from the supplied text, write from grounded facts.
// Escalation to image understanding is handled outside this engine only when identity is unclear.
function shouldRetryValueLayer(){return false;}
async function getQualityUnderstanding({item,callPass1,consumeQuota,model}){
 await consumeOrThrow(consumeQuota,'pass1');const response=await callPass1({item,model}),raw=response?.raw||response,validation=validateUnderstanding(raw,item),qualityGate=assessCopyReadiness(validation);
 return{response,raw,validation,qualityGate,calls:1};
}
async function analyzeProductV3({item,store,callPass1,consumeQuota,model='',promptVersion='super-urenavi-v3-text-first'}={}){
 if(!item?.itemName)throw new TypeError('item.itemName is required');if(!store?.loadProduct||!store?.saveProduct)throw new TypeError('product cache store is required');if(typeof callPass1!=='function')throw new TypeError('callPass1 is required');
 const keyArgs={itemCode:String(item.itemCode||''),itemName:String(item.itemName||''),itemCaption:String(item.itemCaption||'')};
 const groq={pass1Calls:0,pass2Calls:0,qualityRetryCalls:0,totalCalls:0};
 let row=null;try{row=await store.loadProduct(keyArgs);}catch{}
 const cached=isV3Row(row);let raw=cached?{...row.raw_ai_json}:null;
 const cacheStatus=cached?'hit':row?'legacy_or_stale':'miss';
 let stage='pass1';
 const save=()=>safeSaveProduct(store,{...keyArgs,model,promptVersion,schemaVersion:V3_SCHEMA_VERSION,rawAiJson:raw,resultStatus:'ok'});
 async function callPass1Once(args){stage='pass1';await consumeOrThrow(consumeQuota,'pass1');groq.totalCalls++;groq.pass1Calls++;return callPass1(args);}
 try{
  if(!raw){const response=await callPass1Once({item,model});raw={pass1:response?.raw||response,pass2:null,qualityRetryCompleted:true};await save();}
  const validation=validateUnderstanding(raw.pass1,item),qualityGate=assessCopyReadiness(validation);
  // Text-first path: one understanding call only. Do not spend more calls trying to
  // persuade the value layer. Deterministic grounded copy handles valid text evidence.
  const verifiedAppeals=directVerification(validation);
  const pass2Status='not_needed_text_first';
  const source=cached?'cache':'text_first';
  return{ok:validation.valid,source,cacheStatus:validation.valid?cacheStatus:cached?'hit_invalid':cacheStatus,schemaVersion:V3_SCHEMA_VERSION,validation,verifiedAppeals,qualityGate,pass2Status,groq,raw};
 }catch(error){error.stage=error.stage||stage;error.groq={...groq};error.cacheStatus=cacheStatus;throw error;}
}
module.exports={V3_SCHEMA_VERSION,isV3Row,safeSaveProduct,directVerification,verifyOnlyWhenNeeded,shouldRetryValueLayer,getQualityUnderstanding,analyzeProductV3};
