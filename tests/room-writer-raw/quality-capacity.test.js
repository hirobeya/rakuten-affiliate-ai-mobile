'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const R=require('../../lib/room-writer-raw/route'),A=require('../../lib/room-writer-raw/audit'),Q=require('../../lib/room-writer-raw/local-quality'),S=require('../../lib/room-writer-raw/safety');
const {hash}=require('../../lib/room-writer-raw/source');
const {item,draft,localFailure,passedQuality,failedQuality,admission,initialAdmission,response}=require('./helpers.cjs');
function audit(t,budgetTokens=100000){const parent=fs.mkdtempSync(path.join(os.tmpdir(),'raw-final-fixes-'));t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));const directory=path.join(parent,A.DIRECTORY_NAME);return {directory,store:A.open({directory,create:true,budgetTokens})};}
const prepared=()=>R.prepareFallback({item:item(),generateLocal:localFailure,assessLocal:failedQuality});
test('presence, absence and self-declared certification are all unverified without bound assessment',async()=>{
 for(const mode of ['normal','batch'])for(const result of [null,{text:'existing draft'}])for(const qualityCertified of [false,true]){
  let providerCalls=0;const local={result,qualityCertified,groqCalls:0,localStatus:'incomplete',diagnostic:{cause:'F',reason:'automatic'}};
  const p=await R.prepareFallback({item:item(),mode,generateLocal:async()=>local});assert.equal(p.qualityState,'unverified');assert.equal(p.status,'local_quality_unverified');assert.deepEqual(p.local,local);assert.ok(p.qualityPacket);
  await R.execute({prepared:p,transport:async()=>{providerCalls++;}});assert.equal(providerCalls,0);
 }
});
test('bound pass reuses output, bound failure with an existing output alone prepares fallback',async()=>{
 const local={result:{text:'existing draft'},groqCalls:0};
 const pass=await R.prepareFallback({item:item(),generateLocal:async()=>local,assessLocal:passedQuality});assert.equal(pass.status,'reuse_quality_passed_local');assert.equal(pass.qualityState,'passed');assert.equal(pass.result,local);
 const fail=await R.prepareFallback({item:item(),generateLocal:async()=>local,assessLocal:failedQuality});assert.equal(fail.status,'fallback_prepared_not_authorized');assert.equal(fail.qualityState,'failed');assert.equal(fail.calls,0);assert.deepEqual(fail.local,local);
});
test('quality evidence must bind raw source and exact local output and distinguish unknown axes',async()=>{
 const local={result:{text:'existing draft'},groqCalls:0};
 for(const change of [{sourceHash:'wrong'},{outputHash:'wrong'},{localHash:'wrong'},{axes:{understanding:true}},{status:'passed',axes:Object.fromEntries(Q.AXES.map(k=>[k,k==='grounded'?null:true]))},{status:'failed',axes:Object.fromEntries(Q.AXES.map(k=>[k,true]))}]){
  const p=await R.prepareFallback({item:item(),generateLocal:async()=>local,assessLocal:async packet=>({...await passedQuality(packet),...change})});assert.equal(p.status,'local_quality_unverified');
 }
 const p=await R.prepareFallback({item:item(),generateLocal:async()=>local,assessLocal:async()=>{throw Error('review unavailable');}});assert.equal(p.qualityState,'unverified');
});
test('unreviewed cache boolean is not a quality pass and cannot authorize Groq',async()=>{
 const raw=require('../../lib/room-writer-raw/source').prepare(item());const p=await R.prepareFallback({item:item(),generateLocal:localFailure,assessLocal:failedQuality,verifiedCache:async()=>({sourceHash:raw.sourceHash,independentlyReviewed:true,text:'unverified cache'})});assert.equal(p.reason,'cache_quality_unverified');assert.equal(p.calls,0);
});
test('general system instructions are identical across categories and keep concrete failures only in regressions',()=>{
 const C=require('../../lib/room-writer-raw/contract'),raw=require('../../lib/room-writer-raw/source');
 assert.equal(/バイク|グローブ|親指|人差し指|レビュー700|5,000/.test(C.SYSTEM),false);
 const a=C.build(raw.prepare(item('synthetic:charger','充電器'))),b=C.build(raw.prepare(item('synthetic:lamp','デスクライト')));assert.equal(a.request.messages[0].content,b.request.messages[0].content);assert.notEqual(a.requestHash,b.requestHash);
});
test('initial one-call grant retains unknown balances and separates observed usage, limits and own spend',async t=>{
 const p=await prepared(),{store,directory}=audit(t),args=initialAdmission(p,store);let calls=0;
 const r=await R.execute({...args,prepared:p,transport:async()=>{calls++;assert.ok(fs.existsSync(path.join(directory,'initial.once.json')));const attempt=fs.readdirSync(directory).find(n=>n.endsWith('.attempt.json'));const before=JSON.parse(fs.readFileSync(path.join(directory,attempt),'utf8'));assert.equal(before.capacityEvidence.remainingDailyTokens,null);assert.equal(before.reservation,p.bundle.reservation);return response();}});
 assert.equal(calls,1);assert.equal(r.executionStopped,true);assert.equal(r.stopReason,'initial_probe_complete_review_required');assert.equal(store.state().spentTokens,20);assert.equal(store.state().initialUsed,true);assert.equal(store.state().halt,true);
 const result=fs.readdirSync(directory).find(n=>n.endsWith('.result.json')),saved=JSON.parse(fs.readFileSync(path.join(directory,result),'utf8'));
 assert.equal(saved.capacityBefore.remainingMinuteTokens,null);assert.equal(saved.capacityBefore.remainingDailyTokens,null);assert.equal(saved.capacityBefore.remainingDailyRequests,null);assert.equal(saved.observedUsage.totalTokens,150);assert.equal(saved.observedUsage.coverage,'partial');assert.equal(saved.officialLimits.tpd,200000);assert.equal(saved.tokens,20);
 const other=await R.prepareFallback({item:item('synthetic:next'),generateLocal:localFailure,assessLocal:failedQuality});
 for(const next of [initialAdmission(other,store),admission(other,store)]){const again=await R.execute({...next,prepared:other,transport:async()=>{calls++;return response();}});assert.equal(again.calls,0);}assert.equal(calls,1);
});
test('initial trial with known usage and missing capacity headers still saves draft and stops after one',async t=>{
 const p=await prepared(),{store,directory}=audit(t);const r=await R.execute({...initialAdmission(p,store),prepared:p,transport:async()=>({...response(),capacity:{remainingMinuteTokens:null,remainingDailyRequests:null,remainingDailyTokens:null}})});
 assert.equal(r.calls,1);assert.equal(r.executionStopped,true);assert.deepEqual(r.draft,draft());assert.equal(store.state().halt,true);const result=fs.readdirSync(directory).find(n=>n.endsWith('.result.json'));assert.equal(JSON.parse(fs.readFileSync(path.join(directory,result),'utf8')).providerCapacity.remainingDailyTokens,null);
});
test('initial approval cannot bypass known insufficiency, budget or prior unresolved consumption',async t=>{
 const p=await prepared(),{store,directory}=audit(t),base=initialAdmission(p,store);let calls=0;
 const variants=[
  {approval:{...base.approval,authorized:false}},
  {approval:{...base.approval,acceptUnknownCapacity:false}},
  {approval:{...base.approval,unknownCapacityPolicy:'assume_full'}},
  {approval:{...base.approval,maxExperimentCalls:2}},
  {approval:{...base.approval,maxReservedTokens:p.bundle.reservation-1}},
  {approval:{...base.approval,maxReservedTokens:8001}},
  {approval:{...base.approval,experimentId:'other'}},
  {approval:{...base.approval,auditId:'other'}},
  {approval:{...base.approval,qualityHash:'other'}},
  {approval:{...base.approval,version:'room_writer_e1_v1'}},
  {approval:{...base.approval,version:'raw-source-fallback-live-v1'}},
  {approval:{...base.approval,version:'raw-source-fallback-live-v2'}},
  {capacity:{...base.capacity,remainingMinuteTokens:0}},
  {capacity:{...base.capacity,remainingDailyTokens:0}},
  {capacity:{...base.capacity,remainingDailyRequests:0}},
  {capacity:{...base.capacity,remainingDailyTokens:undefined}},
  {capacity:{...base.capacity,noUnknownConsumption:false}},
  {capacity:{...base.capacity,exclusive:false}},
  {limits:{...base.limits,observedAt:0}},
  {limits:{...base.limits,tpm:1000}},
  {observedUsage:{...base.observedUsage,source:'estimate'}},
  {observedUsage:{...base.observedUsage,totalTokens:999}},
  {observedUsage:{...base.observedUsage,observedAt:0}},
  {observedUsage:{...base.observedUsage,totalTokens:200000,promptTokens:200000,completionTokens:0}},
  {observedUsage:{...base.observedUsage,calls:1000}},
  {observedUsage:{...base.observedUsage,window:'minute',calls:30}},
  {observedUsage:{...base.observedUsage,window:'minute',promptTokens:8000,completionTokens:0,totalTokens:8000}},
  {audit:{state:()=>({...store.state(),unresolved:true})}},
  {audit:{state:()=>({...store.state(),initialUsed:true})}},
  {audit:{state:()=>({...store.state(),attemptsTotal:1})}},
  {audit:{state:()=>({...store.state(),budgetTokens:1})}}
 ];for(const change of variants){const r=await R.execute({...base,...change,prepared:p,transport:async()=>{calls++;return response();}});assert.equal(r.calls,0,JSON.stringify(change));}assert.equal(calls,0);assert.deepEqual(fs.readdirSync(directory),['manifest.json']);
});
for(const [label,provider,reason]of [['429',async()=>({status:429}),'provider_429'],['unknown usage',async()=>({...response(),usage:null}),'usage_unknown'],['unknown response',async()=>{throw Error('unknown');},'transport_or_http_unknown']])test('initial '+label+' retains consumed marker, halt and no retry',async t=>{
 const p=await prepared(),{store,directory}=audit(t);let calls=0;const r=await R.execute({...initialAdmission(p,store),prepared:p,transport:async()=>{calls++;return provider();}});assert.equal(r.reason,reason);assert.equal(calls,1);assert.equal(store.state().initialUsed,true);assert.equal(store.state().halt,true);assert.ok(fs.existsSync(path.join(directory,'initial.once.json')));
 const again=await R.execute({...initialAdmission(p,store),prepared:p,transport:async()=>{calls++;}});assert.equal(again.calls,0);assert.equal(calls,1);
});
test('pre-send failure after one-use record does not make initial permission reusable',async t=>{
 const p=await prepared(),{store}=audit(t),broken={state:store.state,begin:(...args)=>{store.begin(...args);throw Error('crash after durable record');}};let calls=0;
 const r=await R.execute({...initialAdmission(p,broken),prepared:p,transport:async()=>{calls++;}});assert.equal(r.calls,0);assert.equal(calls,0);assert.equal(store.state().initialUsed,true);assert.equal(store.state().unresolved,true);
});
test('a new independent directory cannot reuse another experiment grant',async t=>{
 const p=await prepared(),a=audit(t),b=audit(t),permission=initialAdmission(p,a.store);let calls=0;
 const r=await R.execute({...permission,audit:b.store,prepared:p,transport:async()=>{calls++;}});assert.equal(r.calls,0);assert.equal(calls,0);
});
test('approval target describes exact scope but is not a live authorization',async t=>{
 const p=await prepared(),{store}=audit(t),target=S.initialApprovalTarget({prepared:p,state:store.state(),executionSha:'a'.repeat(40)});
 assert.equal(target.eligible,true);assert.equal(target.template.authorized,false);assert.equal(target.template.acceptUnknownCapacity,false);assert.equal(target.template.expiresAt,null);assert.equal(target.template.requestHash,p.bundle.requestHash);assert.equal(target.template.qualityHash,hash(p.quality));
 let calls=0;const r=await R.execute({...initialAdmission(p,store),approval:target.template,prepared:p,transport:async()=>{calls++;}});assert.equal(r.calls,0);assert.equal(calls,0);
 const pending=await R.prepareFallback({item:item(),generateLocal:localFailure});assert.equal(S.initialApprovalTarget({prepared:pending,state:store.state(),executionSha:'a'.repeat(40)}).eligible,false);
 assert.equal(S.initialApprovalTarget({prepared:p,state:{...store.state(),budgetTokens:1},executionSha:'a'.repeat(40)}).eligible,false);
});
test('observation windows are explicit and historical usage is not a present balance',async t=>{
 const p=await prepared(),{store,directory}=audit(t),args=initialAdmission(p,store,100000000);args.observedUsage={...args.observedUsage,window:'historical',periodStart:1,periodEnd:2,promptTokens:250000,completionTokens:0,totalTokens:250000};
 const gate=S.admit({...args,bundle:p.bundle,quality:p.quality,state:store.state(),now:100000000});assert.equal(gate.allow,true,JSON.stringify(gate.holds));assert.equal(gate.evidence.capacity.remainingDailyTokens,null);assert.equal(gate.evidence.observedUsage.totalTokens,250000);assert.equal(gate.evidence.observedUsage.window,'historical');assert.deepEqual(fs.readdirSync(directory),['manifest.json']);
 const mislabeled={...args.observedUsage,periodStart:99999000,periodEnd:100000000};const refused=S.admit({...args,observedUsage:mislabeled,bundle:p.bundle,quality:p.quality,state:store.state(),now:100000000});assert.equal(refused.allow,false);assert.ok(refused.holds.includes('observed_daily_tokens_exhausted'));
});
test('approval expiring during durable preparation sends zero and leaves one-use marker consumed',async t=>{
 const p=await prepared(),{store,directory}=audit(t),args=initialAdmission(p,store);let ticks=0,calls=0;
 const r=await R.execute({...args,clock:()=>ticks++===0?100000:102000,prepared:p,transport:async()=>{calls++;}});assert.equal(r.reason,'dispatch_evidence_expired_before_send');assert.equal(r.calls,0);assert.equal(calls,0);assert.equal(store.state().initialUsed,true);assert.equal(store.state().halt,true);
 const result=fs.readdirSync(directory).find(n=>n.endsWith('.result.json')),saved=JSON.parse(fs.readFileSync(path.join(directory,result),'utf8'));assert.equal(saved.noProviderRequest,true);assert.equal(saved.usageSource,'not_sent');
});
