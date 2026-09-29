'use strict';

const {validateUnderstanding}=require('./super-urenavi-v3-understanding');
const {assessCopyReadiness}=require('./super-urenavi-v3-quality');
const {structuralAppealStrength}=require('./super-urenavi-v3-expression');
const {repairPass1SourceText}=require('./super-urenavi-v3-source-repair');

const V3_SCHEMA_VERSION='super_urenavi_v3_understanding_v9_exact_source_repair';
function isV3Row(row){return Boolean(row&&String(row.schema_version||'').startsWith('super_urenavi_v3_understanding_')&&row.raw_ai_json?.pass1);}
async function consumeOrThrow(consumeQuota,stage){if(typeof consumeQuota!=='function')return;const allowed=await consumeQuota(stage);if(allowed===false){const e=new Error('urenavi_ai_quota');e.status=429;e.stage=stage;e.quotaSource='urenavi';throw e;}}
async function safeSaveProduct(store,args){try{await store.saveProduct(args);return true;}catch(error){console.warn('super-urenavi-v3 cache write unavailable',error?.message||'unknown');return false;}}
function refsGrounded(appeal,attributes=[]){const refs=Array.isArray(appeal?.attributeRefs)?appeal.attributeRefs:[];return refs.length>0&&refs.every(i=>Number.isInteger(i)&&attributes[i]?.quote);}
function directVerification(validation={}){
 const attributes=Array.isArray(validation.attributes)?validation.attributes:[];
 const appeals=Array.isArray(validation.appeals)?validation.appeals:[];
 return appeals.map(appeal=>{
  const supported=validation.valid===true&&!appeal?.unsafe&&refsGrounded(appeal,attributes)&&structuralAppealStrength(appeal,attributes);
  return {...appeal,verification:{required:false,supported,keepDirectFact:true,reason:supported?'single_pass_grounded':'structural_guard_rejected'}};
 });
}
function shouldRetryValueLayer(){return false;}
async function getQualityUnderstanding({item,callPass1,consumeQuota,model}){
 await consumeOrThrow(consumeQuota,'pass1');
 const response=await callPass1({item,model}),raw=response?.raw||response,repaired=repairPass1SourceText(raw,item),validation=validateUnderstanding(repaired,item),qualityGate=assessCopyReadiness(validation);
 return{response,raw:repaired,validation,qualityGate,calls:1};
}
async function analyzeProductV3({item,store,callPass1,consumeQuota,model='',promptVersion='super-urenavi-v3-single-pass'}={}){
 if(!item?.itemName)throw new TypeError('item.itemName is required');
 if(!store?.loadProduct||!store?.saveProduct)throw new TypeError('product cache store is required');
 if(typeof callPass1!=='function')throw new TypeError('callPass1 is required');
 const keyArgs={itemCode:String(item.itemCode||''),itemName:String(item.itemName||''),itemCaption:String(item.itemCaption||'')};
 const groq={pass1Calls:0,pass2Calls:0,qualityRetryCalls:0,totalCalls:0};
 let row=null;try{row=await store.loadProduct(keyArgs);}catch{}
 const cached=isV3Row(row);let raw=cached?{...row.raw_ai_json}:null;
 const cacheStatus=cached?'hit':row?'legacy_or_stale':'miss';
 let stage='pass1';
 const save=()=>safeSaveProduct(store,{...keyArgs,model,promptVersion,schemaVersion:V3_SCHEMA_VERSION,rawAiJson:raw,resultStatus:'ok'});
 async function callPass1Once(args){stage='pass1';await consumeOrThrow(consumeQuota,'pass1');groq.totalCalls++;groq.pass1Calls++;return callPass1(args);}
 try{
  if(!raw){const response=await callPass1Once({item,model});raw={pass1:repairPass1SourceText(response?.raw||response,item)};await save();}
  else raw={...raw,pass1:repairPass1SourceText(raw.pass1,item)};
  const validation=validateUnderstanding(raw.pass1,item),qualityGate=assessCopyReadiness(validation);
  const verifiedAppeals=directVerification(validation);
  const source=cached?'cache':'text_first';
  return{ok:validation.valid,source,cacheStatus:validation.valid?cacheStatus:cached?'hit_invalid':cacheStatus,schemaVersion:V3_SCHEMA_VERSION,validation,verifiedAppeals,qualityGate,pass2Status:'removed',groq,raw};
 }catch(error){error.stage=error.stage||stage;error.groq={...groq};error.cacheStatus=cacheStatus;throw error;}
}
module.exports={V3_SCHEMA_VERSION,isV3Row,safeSaveProduct,refsGrounded,directVerification,shouldRetryValueLayer,getQualityUnderstanding,analyzeProductV3};
