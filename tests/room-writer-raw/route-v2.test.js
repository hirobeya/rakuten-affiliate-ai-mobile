'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const V2=require('../../lib/room-writer-raw/route-v2');
const V1=require('../../lib/room-writer-raw/route');
const A2=require('../../lib/room-writer-raw/audit-v2');
const Safety=require('../../lib/room-writer-raw/safety-v2');
const C=require('../../lib/room-writer-raw/contract-v2');
const {hash}=require('../../lib/room-writer-raw/source');
const item={itemCode:'unmeasured-test:12345',itemName:'洗える布製の収納ケース',itemCaption:'布製ケース。ファスナーで開閉できます。内側に2つのポケットがあります。水拭きは可能ですが洗濯機は使用しないでください。',catchcopy:'収納を整理したい方へ',itemPrice:1900};
const generateLocal=async()=>({groqCalls:0,result:{text:'必ず洗濯機で洗える収納ケース'}});
const assessLocal=p=>({version:p.version,sourceHash:p.sourceHash,outputHash:p.outputHash,localHash:p.localHash,reviewerId:'mock-independent',method:'independent_review',status:'failed',reason:'原文の洗濯機不可に反する',axes:{understanding:false,specificity:true,choice:null,audience_value:null,naturalness:true,grounded:false}});
function audit(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'raw-v2-test-'));
 return {store:A2.open({directory:path.join(root,A2.DIRECTORY_NAME),create:true,budgetTokens:8000}),dispose:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function gateArgs(prepared,state){
 const now=Date.now(),executionSha='a'.repeat(40);
 const approval={version:Safety.INITIAL_APPROVAL_VERSION,authorized:true,environment:'isolated_experiment',executionSha,sourceHash:prepared.bundle.envelope.sourceHash,requestHash:prepared.bundle.requestHash,qualityHash:hash(prepared.quality),experimentId:state.experimentId,auditId:state.auditId,maxCalls:1,maxExperimentCalls:1,automaticRetries:0,expiresAt:now+30000,unknownCapacityPolicy:'retain_null_one_call',acceptUnknownCapacity:true,maxReservedTokens:prepared.bundle.reservation};
 const limits={model:C.MODEL,rpm:30,rpd:1000,tpm:8000,tpd:200000,observedAt:now};
 const capacity={noUnknownConsumption:true,exclusive:true,observedAt:now,remainingMinuteTokens:null,remainingDailyTokens:null,remainingDailyRequests:null};
 const observedUsage={source:'independent_audit',coverage:'partial',window:'historical',periodStart:0,periodEnd:now,observedAt:now,calls:0,promptTokens:0,completionTokens:0,totalTokens:0};
 return {approval,limits,capacity,observedUsage,executionSha};
}
test('isolated v2 route rejects v1 prepared objects and old approval versions',async()=>{
 const prepared=await V2.prepareFallback({item,generateLocal,assessLocal});
 const previous=await V1.prepareFallback({item,generateLocal,assessLocal});
 assert.equal(prepared.status,'fallback_prepared_not_authorized');
 assert.equal(prepared.bundle.request.response_format.json_schema.name,'room_raw_source_fallback_v2');
 assert.equal((await V2.execute({prepared:previous})).reason,'fallback_not_prepared');
 assert.equal((await V1.execute({prepared})).reason,'fallback_not_prepared');
 const a=audit();try{
  const args=gateArgs(prepared,a.store.state());args.approval.version='raw-source-fallback-initial-v1';
  let calls=0;const result=await V2.execute({prepared,...args,audit:a.store,transport:async()=>{calls++;throw Error('unexpected');}});
  assert.equal(result.reason,'admission_rejected');assert.equal(calls,0);assert.equal(a.store.state().attemptsTotal,0);
 }finally{a.dispose();}
});
test('v2 fails closed without approval and does not touch audit',async()=>{
 const prepared=await V2.prepareFallback({item,generateLocal,assessLocal});
 const a=audit();try{
  const args=gateArgs(prepared,a.store.state());args.approval.authorized=false;
  let calls=0;const r=await V2.execute({prepared,...args,audit:a.store,transport:async()=>{calls++;throw Error('unexpected');}});
  assert.equal(r.reason,'admission_rejected');assert.equal(calls,0);assert.equal(a.store.state().attemptsTotal,0);
 }finally{a.dispose();}
});
test('simulated one-call v2 is durably consumed and cannot send again',async()=>{
 const prepared=await V2.prepareFallback({item,generateLocal,assessLocal});
 const a=audit();try{
  const args=gateArgs(prepared,a.store.state());
  let calls=0;
  const draft={product:{name:'洗える布製の収納ケース',unit:null,basis:[{field:'itemName',quote:'洗える布製の収納ケース'}]},hold:{active:false,reason:''},post:{sentences:[{text:'収納を整理したいときに、ファスナーで開閉できる布製ケース。',kind:'fact',scope:null,basis:[{field:'itemCaption',quote:'布製ケース。ファスナーで開閉できます。'}]}],notes:[],tags:[]}};
  const transport=async()=>{calls++;return {status:200,finishReason:'stop',usage:{prompt_tokens:500,completion_tokens:100,total_tokens:600},capacity:{remainingMinuteTokens:null,remainingDailyRequests:null},content:JSON.stringify(draft)};};
  const r=await V2.execute({prepared,...args,audit:a.store,transport});
  assert.equal(r.calls,1);assert.equal(calls,1);assert.equal(r.publication,false);
  const state=a.store.state();assert.equal(state.attemptsTotal,1);assert.equal(state.initialUsed,true);assert.equal(state.spentTokens,600);assert.equal(state.halt,true);
  const again=await V2.execute({prepared,...args,audit:a.store,transport});
  assert.equal(again.reason,'admission_rejected');assert.equal(calls,1);
 }finally{a.dispose();}
});
test('previously measured Wishsun product is excluded from v2 without a provider call',async()=>{
 const old={...item,itemCode:'wishsun:10000100'};
 const r=await V2.prepareFallback({item:old,generateLocal,assessLocal});
 assert.equal(r.reason,'previously_measured_product_no_resend');assert.equal(r.calls,0);
});
