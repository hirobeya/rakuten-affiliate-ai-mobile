'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const R=require('../../lib/room-writer-raw/route'),A=require('../../lib/room-writer-raw/audit');
const {item,draft,claim,localFailure,admission,response,prepare,passedQuality,failedQuality}=require('./helpers.cjs');
function audit(t,budgetTokens=100000){const parent=fs.mkdtempSync(path.join(os.tmpdir(),'raw-fallback-test-'));t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));const directory=path.join(parent,A.DIRECTORY_NAME);return {directory,store:A.open({directory,create:true,budgetTokens})};}
test('normal and batch local successes and verified cache use zero provider calls',async()=>{
 for(const mode of ['normal','batch']){let localCalls=0,providerCalls=0;const local={result:{text:'existing unmodified local result'},groqCalls:0,qualityCertified:false};
  const p=await R.prepareFallback({item:item(),mode,generateLocal:async()=>{localCalls++;return local;},assessLocal:passedQuality});
  assert.equal(p.status,'reuse_quality_passed_local');assert.equal(p.result,local);assert.equal(localCalls,1);
  await R.execute({prepared:p,transport:async()=>{providerCalls++;}});assert.equal(providerCalls,0);
 }
 const s=prepare(item());let called=false;const p=await R.prepareFallback({item:item(),verifiedCache:async()=>({sourceHash:s.sourceHash,text:'cached result',quality:{version:'raw-local-quality-v1',status:'passed',sourceHash:s.sourceHash,outputHash:require('../../lib/room-writer-raw/source').hash('cached result'),method:'independent_review',reviewerId:'test',reason:'Synthetic cache approval',axes:Object.fromEntries(require('../../lib/room-writer-raw/local-quality').AXES.map(k=>[k,true]))}}),generateLocal:async()=>{called=true;}});assert.equal(p.status,'reuse_verified_cache');assert.equal(called,false);
});
test('unverified cache does not skip local, and a failed local check does not imply send permission',async()=>{
 let providerCalls=0;const p=await R.prepareFallback({item:item(),verifiedCache:async()=>({text:'unverified'}),generateLocal:localFailure,assessLocal:failedQuality});assert.equal(p.reason,'cache_quality_unverified');
 const r=await R.execute({prepared:p,transport:async()=>{providerCalls++;}});assert.equal(r.status,'held');assert.equal(providerCalls,0);
});
test('raw fallback requirements cannot suppress an already successful existing local result',async()=>{
 const local={result:{text:'existing engine output'},groqCalls:0};const p=await R.prepareFallback({item:{...item(),catchcopy:undefined},generateLocal:async()=>local,assessLocal:passedQuality});assert.equal(p.result,local);assert.equal(p.calls,0);
 const held=await R.prepareFallback({item:{...item(),catchcopy:undefined},generateLocal:localFailure,assessLocal:failedQuality});assert.equal(held.reason,'raw_source_invalid_after_local_failure');
});
test('errors, unknown local status and nonzero local Groq calls cannot trigger fallback',async()=>{
 for(const generateLocal of [async()=>{throw Error('unknown');},async()=>null,async()=>({result:null,groqCalls:1,localStatus:'incomplete',diagnostic:{}}),async()=>({result:null,groqCalls:0,localStatus:'unknown',diagnostic:{}})])assert.notEqual((await R.prepareFallback({item:item(),generateLocal})).status,'fallback_prepared_not_authorized');
});
test('past measured item is suppressed under the new route, not given a product-specific prompt',async()=>{
 const source=require('../../docs/measurements/s3-20261111/initial-probe.json').sourceItem;
 const p=await R.prepareFallback({item:source,generateLocal:localFailure,assessLocal:failedQuality});assert.equal(p.reason,'previously_measured_product_no_resend');assert.equal(p.calls,0);
});
test('old S3 approval, wrong SHA/input, stale proof, absent capacity and budget excess send zero requests',async t=>{
 const p=await R.prepareFallback({item:item(),generateLocal:localFailure,assessLocal:failedQuality}),{store,directory}=audit(t);let calls=0;
 const base=admission(p,store),bad=[
  {approval:{...base.approval,version:'room_writer_e1_v1'}},
  {approval:{...base.approval,executionSha:'b'.repeat(40)}},
  {approval:{...base.approval,requestHash:'wrong'}},
  {approval:{...base.approval,maxCalls:5}},
  {approval:{...base.approval,automaticRetries:1}},
  {approval:{...base.approval,expiresAt:99999}},
  {capacity:{...base.capacity,remainingMinuteTokens:null}},
  {capacity:{...base.capacity,remainingDailyTokens:null}},
  {capacity:{...base.capacity,noUnknownConsumption:false}},
  {capacity:{...base.capacity,exclusive:false}},
  {capacity:{...base.capacity,observedAt:0}},
  {limits:{...base.limits,tpm:1}},
  {capacity:{...base.capacity,remainingMinuteTokens:999999}},
  {audit:{state:()=>({...store.state(),minuteRequests:30})}},
  {audit:{state:()=>({...store.state(),minuteTokens:8000})}},
  {audit:{state:()=>({...store.state(),budgetTokens:1})}}
 ];
 for(const change of bad){const r=await R.execute({...base,...change,prepared:p,transport:async()=>{calls++;return response();}});assert.equal(r.calls,0,JSON.stringify(change));}
 assert.equal(calls,0);assert.deepEqual(fs.readdirSync(directory),['manifest.json']);
});
test('forged preparation does not bypass local-first control',async t=>{
 const p=await R.prepareFallback({item:item(),generateLocal:localFailure,assessLocal:failedQuality}),{store}=audit(t);let calls=0;
 const r=await R.execute({...admission(p,store),prepared:{...p},transport:async()=>{calls++;}});assert.equal(r.reason,'fallback_not_prepared');assert.equal(calls,0);
});
test('one mock response is recorded before review; same item with changed inputs cannot be resent',async t=>{
 const p=await R.prepareFallback({item:item(),generateLocal:localFailure,assessLocal:failedQuality}),{store,directory}=audit(t);let calls=0;
 const transport=async()=>{calls++;assert.equal(fs.readdirSync(directory).filter(n=>n.endsWith('.attempt.json')).length,1);return response();};
 const r=await R.execute({...admission(p,store),prepared:p,transport});assert.equal(calls,1);assert.equal(r.verdict.semanticApproved,false);assert.equal(r.publication,false);assert.equal(r.copyable,false);assert.equal(store.state().spentTokens,20);
 const changed=await R.prepareFallback({item:{...item(),catchcopy:'別の表記'},generateLocal:localFailure,assessLocal:failedQuality});const second=await R.execute({...admission(changed,store),prepared:changed,transport});assert.equal(second.calls,0);assert.equal(calls,1);
 const file=fs.readdirSync(directory).find(n=>n.endsWith('.result.json')),saved=JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'));assert.deepEqual(saved.source,p.bundle.envelope.source);assert.equal(saved.inputHash,p.bundle.inputHash);assert.equal(saved.usage.total_tokens,20);assert.equal(saved.latencyMs,0);
 const review=JSON.parse(fs.readFileSync(path.join(directory,file.replace('.result.json','.review.json')),'utf8'));assert.equal(review.verdict.semanticApproved,false);assert.equal(review.sourceHash,saved.sourceHash);
});
for(const [name,provider,reason]of [
 ['429',async()=>({status:429}), 'provider_429'],
 ['transport failure',async()=>{throw Error('sensitive provider exception must not be logged');},'transport_or_http_unknown'],
 ['unknown usage',async()=>({...response(),usage:null}),'usage_unknown'],
 ['inconsistent usage',async()=>({...response(),usage:{prompt_tokens:10,completion_tokens:10,total_tokens:999}}),'usage_unknown'],
 ['reservation overrun',async()=>({...response(),usage:{prompt_tokens:9000,completion_tokens:10,total_tokens:9010}}),'reservation_exceeded'],
 ['invalid JSON',async()=>({...response(),content:'not-json'}),'json_invalid'],
 ['truncated output',async()=>({...response(),finishReason:'length'}),'incomplete_output'],
 ['missing capacity headers',async()=>({...response(),capacity:null}),'provider_capacity_unknown']
])test(name+' leaves terminal evidence and never retries',async t=>{
 const {store,directory}=audit(t),p=await R.prepareFallback({item:item(),generateLocal:localFailure,assessLocal:failedQuality});let calls=0;const transport=async()=>{calls++;return provider();};
 const r=await R.execute({...admission(p,store),prepared:p,transport});assert.equal(r.reason,reason);assert.equal(calls,1);assert.equal(store.state().halt,true);assert.ok(fs.existsSync(path.join(directory,'run.lock')));
 const other=await R.prepareFallback({item:item('synthetic:different'),generateLocal:localFailure,assessLocal:failedQuality});const again=await R.execute({...admission(other,store),prepared:other,transport});assert.equal(again.calls,0);assert.equal(calls,1);
});
test('pre-send storage failure sends zero; post-send storage failure cannot trigger resend',async t=>{
 const p=await R.prepareFallback({item:item(),generateLocal:localFailure,assessLocal:failedQuality}),{store}=audit(t);let calls=0;
 const state=store.state.bind(store),transport=async()=>{calls++;return response();};
 const before=await R.execute({...admission(p,{state,begin:()=>{throw Error('disk full');}}),prepared:p,transport});assert.equal(before.calls,0);assert.equal(calls,0);
 const after=await R.execute({...admission(p,{state,begin:store.begin,finish:()=>{throw Error('disk full after HTTP');}}),prepared:p,transport});assert.equal(after.status,'storage_failed_do_not_retry');assert.equal(calls,1);assert.equal(store.state().halt,true);assert.equal(store.state().unresolved,true);
});
test('audit refuses pre-existing directories, unrelated stores and corrupt records',t=>{
 const {store,directory}=audit(t);assert.throws(()=>A.open({directory,create:true,budgetTokens:1000}));assert.throws(()=>A.open({directory:path.dirname(directory)}),/new_raw_audit_directory_required/);
 fs.writeFileSync(path.join(directory,'foreign.txt'),'not our record');assert.throws(()=>store.state(),/raw_audit_unrecognized_entry/);
});
test('known bad note is durably rejected even when body is mechanically acceptable',async t=>{
 const p=await R.prepareFallback({item:item(),generateLocal:localFailure,assessLocal:failedQuality}),{store}=audit(t),d=draft();d.post.notes=[claim('信頼の証です。','本体は木製です。')];
 const r=await R.execute({...admission(p,store),prepared:p,transport:async()=>response(d)});assert.equal(r.status,'rejected');assert.ok(r.verdict.failures.some(f=>f.id==='post.notes.0'));assert.equal(r.publication,false);
});
test('transport adapter calls only fixed Groq endpoint once with redirects forbidden (mock only)',async()=>{
 let calls=0;const transport=R.createTransport({apiKey:'nonsecret-test-placeholder',fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(options.redirect,'error');assert.equal(options.method,'POST');return {status:429,json:async()=>({}),headers:new Map()};}});
 const r=await transport({model:'openai/gpt-oss-120b',reasoning_effort:'low',max_completion_tokens:2000});assert.equal(calls,1);assert.equal(r.status,429);assert.equal(r.capacity.remainingDailyTokens,null);
});
test('actual existing local engine output is preserved but remains unverified in both modes',async()=>{
 const engine=require('../../lib/urenavi-core/last-resort'),set=require('../room-writer/eval-set.json');let reused=0;
 for(const row of set.historical.entries.slice(0,10))for(const mode of ['normal','batch']){
  const i={catchcopy:'',...row.item},baseline=engine.generate(i,{mode}),r=await R.prepareFallback({item:i,mode});
  assert.equal(r.status,'local_quality_unverified');assert.deepEqual(r.local,baseline);if(baseline.result)reused++;
  assert.equal(r.calls,0);
 }
 assert.ok(reused>0,'exercise at least one actual successful local path');
});
test('cache read failure preserves successful local output and blocks a fallback spend',async()=>{
 const cache=async()=>{throw Error('cache read unknown');};
 const local={result:{text:'existing local'},groqCalls:0};assert.equal((await R.prepareFallback({item:item(),generateLocal:async()=>local,assessLocal:passedQuality,verifiedCache:cache})).result,local);
 const held=await R.prepareFallback({item:item(),generateLocal:localFailure,assessLocal:failedQuality,verifiedCache:cache});assert.equal(held.reason,'verified_cache_unavailable');assert.equal(held.calls,0);
});
test('review storage failure retains the lock and suppresses further spend',async t=>{
 const p=await R.prepareFallback({item:item(),generateLocal:localFailure,assessLocal:failedQuality}),{store}=audit(t);let calls=0;
 const broken={state:store.state,begin:store.begin,finish:store.finish,recordReview:()=>{throw Error('review disk failure');}};
 const r=await R.execute({...admission(p,broken),prepared:p,transport:async()=>{calls++;return response();}});assert.equal(r.status,'review_storage_failed_do_not_retry');assert.equal(calls,1);assert.equal(store.state().halt,true);
});
