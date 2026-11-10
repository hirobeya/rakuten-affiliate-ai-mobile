'use strict';
/**
 * Offline, reproducible per-product admission plan. No Groq calls, no key
 * access, no provider side effects and no accidental quality certification.
 * Review of a generated result is separately budgeted at runtime.
 */
const fs=require('node:fs'),path=require('node:path');
const {createProvider,stageRequest,REVIEW_PROMPT,WRITER_SCHEMA}=require('../../lib/room-semantic-provider');
const SOURCE=path.resolve(__dirname,'../../docs/evaluations/20261027-fixed/inputs.json');
const modes=['standard','editorial','guided'];
const threshold=8000; // historical Free TPM: an absolute theoretical limit, NOT current available balance
function corpus(){
 const frozen=JSON.parse(fs.readFileSync(SOURCE,'utf8'));
 return frozen.entries.filter(e=>/room-products|room-unseen|live-local-analysis/.test(e.name))
  .flatMap(e=>(Array.isArray(e.data)?e.data:e.data.items).map(v=>({item:v.item,origin:e.name})));
}
function audit(){
 const entries=corpus(),providers=Object.fromEntries(modes.map(writerMode=>[writerMode,createProvider({apiKey:'offline-do-not-send',writerMode})]));
 const rows=entries.map(({item,origin})=>{
  const estimate=Object.fromEntries(modes.map(m=>[m,providers[m].requiredTokens('generate',item,{})]));
  const eligible=modes.filter(m=>estimate[m]<=threshold);
  const best=eligible.reduce((picked,m)=>!picked||estimate[m]<estimate[picked]?m:picked,null);
  // Full product sources and output cap stay equal. Editorial now uses exact
  // source IDs on the wire and restores the same canonical public contract.
  const requests=modes.map(m=>stageRequest('generate',item,{},REVIEW_PROMPT,m));
  for(const [index,request]of requests.entries()){
   if(request.userPayload.itemName!==item.itemName||request.userPayload.itemCaption!==item.itemCaption||request.userPayload.catchcopy!==(item.catchcopy||''))throw Error('source_truncated');
   const ledger=require('../../lib/urenavi-core/editorial-source-ledger');
   const expected=modes[index]==='editorial'?ledger.schema(WRITER_SCHEMA,ledger.build(item)):WRITER_SCHEMA;
   if(JSON.stringify(request.schema)!==JSON.stringify(expected)||request.maxOutputTokens!==requests[0].maxOutputTokens)throw Error('non_comparable_schema');
  }
  return {itemCode:item.itemCode,origin,estimate,eligible,best,hasAnyEligible:eligible.length>0};
 });
 const summary={items:rows.length,sourcePreserved:true,wireSchemasIdentical:false,canonicalOutputContractPreserved:true,modelCalls:0,notLiveRemainingBalance:true,notQualityEvidence:true,limitTpmHistorical:threshold,
  feasibleByMode:Object.fromEntries(modes.map(m=>[m,rows.filter(r=>r.eligible.includes(m)).length])),
  overLimitByMode:Object.fromEntries(modes.map(m=>[m,rows.filter(r=>!r.eligible.includes(m)).length])),
  allModesOverLimit:rows.filter(r=>!r.hasAnyEligible).map(r=>({itemCode:r.itemCode,estimate:r.estimate})),
  recommendedFirstCandidate:'editorial (not automatically sent; actual model and six-axis quality unknown)'};
 return {summary,rows};
}
if(require.main===module)console.log('WRITER_BUDGET_ADMISSION_AUDIT '+JSON.stringify(audit()));
module.exports={audit,corpus,threshold};
