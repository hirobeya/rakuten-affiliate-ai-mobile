'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const H=require('../lib/room-writer-raw/gemini-preview-route'),{history,decision}=require('../lib/room-writer-raw/gemini-history'),{hash}=require('../lib/room-writer-raw/source'),{blob}=require('./fixtures/gemini-process-worker.cjs'),{create,createIndependent}=require('../lib/room-writer-raw/gemini-attempt-store');
const SHA='e'.repeat(40),scope={itemCode:history.approval.itemCode,model:history.approval.model,requestHash:history.approval.requestHash};
function response(){return {setHeader(){},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
function req(method='POST',ids={}){return {method,headers:{origin:'https://safe.vercel.app',host:'safe.vercel.app'},body:{id:'3',confirm:'single-free-tier-call',...ids},query:{id:'3',...ids}};}
function account(){return {project:'Default Gemini Project',projectId:'gen-lang-client-0210652653',tier:'free',model:scope.model,currentQuotaEvidence:{verified:true,projectId:'gen-lang-client-0210652653',model:scope.model,tier:'free',limits:{rpm:5,tpm:250000,rpd:20},observedAtMs:Date.now()-1,validUntilMs:Date.now()+120000}};}
async function preview(fn){const keys=['VERCEL_ENV','VERCEL_GIT_COMMIT_REF','VERCEL_GIT_COMMIT_SHA','GEMINI_API_KEY'];const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));Object.assign(process.env,{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'experiment/urenavi-gemini-comparison-20261113',VERCEL_GIT_COMMIT_SHA:SHA,GEMINI_API_KEY:'mock-not-a-real-key'});try{await fn();}finally{for(const k of keys)if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}}
test('near-budget virtual delays preserve unknown usage and return below 60 seconds',async t=>preview(async()=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.parse('2026-11-13T13:00:00Z')});
 const events={};for(const n of ['auth','state','claim','provider','save']){let signal;const wait=new Promise(r=>{signal=r;});events[n]={wait,signal};}
 const delay=(name,ms)=>{events[name].signal();return new Promise(r=>setTimeout(r,ms));};let claimed=false,record;
 const store={state:async()=>{await delay('state',6999);return {};},readProbe:async()=>({version:2,passed:true,context:'runtime',executionSha:SHA}),begin:async()=>{await delay('claim',6999);claimed=true;},dispatch:async()=>{},finish:async(s,r)=>{await delay('save',6999);record=r;}};
 const handler=H.createHandler({authorizeImpl:async()=>{await delay('auth',7999);return {ok:true,plan:'owner'};},account:account(),decide:()=>({allow:true}),storeFactory:()=>store,compare:()=>{events.provider.signal();return new Promise(()=>{});}});
 const r=response(),start=Date.now(),running=handler(req(),r);
 // The provider deadline is dynamic. A hard-coded 25001ms never expires
 // when upstream work leaves >25s, and previously hung CI and Vercel builds.
 const phases=[['auth',7999],['state',6999],['claim',6999]];
 for(const [name,ms]of phases){await events[name].wait;t.mock.timers.tick(ms);}
 await events.provider.wait;
 const providerTick=H.providerBudgetForElapsed(Date.now()-start)+1;
 t.mock.timers.tick(providerTick);
 await events.save.wait;
 t.mock.timers.tick(6999);
 await running;
 assert.equal(claimed,true);
 assert.equal(record.result.tokens,null);
 assert.equal(record.result.error,'gemini_stage_timeout');
 // This is a wall-clock fake-timer test; log the measured value when it fails.
 const elapsed=Date.now()-start;
 assert(elapsed<H.FUNCTION_LIMIT_MS,`deadline exceeded: ${elapsed}ms, provider tick ${providerTick}ms`);
 assert.equal(r.statusCode,502);
}));
test('explicit separately approved mock trial has independent result GET and cannot clear original D',()=>preview(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gemini-route-'));try{
 const priorHash=hash(history),ids={approvalId:'mock-only-approval-route',executionId:'mock-only-execution-route'};
 const grant={...scope,...ids,status:'approved',approvedBy:'mock administrator',approvedAt:new Date(Date.now()-1000).toISOString(),maxCalls:1,independentTrialAcknowledged:true,priorHistory:{approvalId:history.approval.id,classification:'D',historyHash:priorHash},freeTierConfirmation:{verified:true,limits:{rpm:5,tpm:250000,rpd:20},projectId:'gen-lang-client-0210652653',tier:'free',model:scope.model,observedAtMs:Date.now()-1000,validUntilMs:Date.now()+60000,evidenceReference:'mock only'}};
 const b=blob(dir);let calls=0;
 const handler=H.createHandler({authorizeImpl:async()=>({ok:true,plan:'owner'}),account:account(),nextGrant:grant,storeFactory:(req,g,s)=>({...g?createIndependent(b,g,s):create(b),readProbe:async()=>({version:2,passed:true,context:'runtime',executionSha:SHA})}),compare:async()=>{calls++;return {model:scope.model,status:'generated_unreviewed',tokens:{input:2,output:3,total:5},draft:{product:{name:'mock',unit:null,basis:[{field:'itemName',quote:'mock'}]},hold:{active:true,reason:'mock only'},post:null}};}});
 const a=response();await handler(req('POST',ids),a);assert.equal(a.statusCode,200);
 const r=response();await handler(req('GET',ids),r);assert.equal(r.body.recovery.status,'recovered');assert.equal(r.body.receipt.result.tokens.total,5);assert.equal(r.body.nextExecution.allow,false,'used grant is never reported available');assert.equal(r.body.nextExecution.status,'already_consumed_do_not_resend');assert.equal(r.body.dispatchReady,false);assert.equal(calls,1);
 const duplicate=response();await handler(req('POST',ids),duplicate);assert.equal(duplicate.statusCode,409);assert.equal(calls,1);
 const old=response();await handler(req(),old);assert.equal(old.body.error,'target_history_unresolved');assert.equal(decision(scope,{}).allow,false);assert.equal(hash(history),priorHash);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}));

test('503 result survives slow/failed GET recovery, used grant and changed execution ID never send again',async t=>preview(async()=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.parse('2026-11-14T00:00:00Z')});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gemini-503-recovery-'));try{
 const prior=hash(history),ids={approvalId:'mock-only-503-approval',executionId:'mock-only-503-execution'};
 const grant={...scope,...ids,status:'approved',approvedBy:'mock administrator',approvedAt:new Date(Date.now()-1).toISOString(),maxCalls:1,independentTrialAcknowledged:true,priorHistory:{approvalId:history.approval.id,classification:'D',historyHash:prior},freeTierConfirmation:{verified:true,limits:{rpm:5,tpm:250000,rpd:20},projectId:'gen-lang-client-0210652653',tier:'free',model:scope.model,observedAtMs:Date.now()-1,validUntilMs:Date.now()+600000,evidenceReference:'mock only'}};
 const b=blob(dir);let calls=0,delay=0,signal;let observed=new Promise(r=>{signal=r;});
 const handler=H.createHandler({authorizeImpl:async()=>({ok:true,plan:'owner'}),nextGrant:grant,account:account(),storeFactory:(request,g,s,options)=>{const store=g?createIndependent(b,g,s):create(b);return {...store,readProbe:async()=>({version:2,passed:true,context:'runtime',executionSha:SHA}),state:async scope=>{if(request.method==='GET'&&delay){assert.equal(options.timeoutMs,H.RECOVERY_BUDGET.worker);signal();await new Promise(r=>setTimeout(r,delay));}return store.state(scope);}};},compare:async()=>{calls++;const error=Error('gemini_http_503_no_retry');error.httpStatus=503;error.providerDiagnostic={httpStatus:503,status:'UNAVAILABLE',headers:{}};throw error;}});
 const sent=response();await handler(req('POST',ids),sent);assert.equal(sent.statusCode,502);assert.equal(sent.body.httpStatus,503);assert.equal(sent.body.providerCalls,1);assert.equal(sent.body.failureStage,'provider');assert.equal(sent.body.tokens,null);const saved=(await createIndependent(b,grant,scope).state(scope)).result;assert.equal(saved.result.error,'gemini_http_503_no_retry');
 delay=8000;const slow=response(),running=handler(req('GET',ids),slow);await observed;t.mock.timers.tick(8000);await running;assert.equal(slow.statusCode,200);assert.equal(slow.body.receipt.result.error,'gemini_http_503_no_retry');assert.equal(slow.body.recovery.providerCalls,0);
 observed=new Promise(r=>{signal=r;});delay=20000;const timed=response(),waiting=handler(req('GET',ids),timed);await observed;t.mock.timers.tick(15001);await waiting;assert.equal(timed.statusCode,503);assert.equal(timed.body.error,'storage_state_unavailable');
 delay=0;const restored=response();await handler(req('GET',ids),restored);assert.equal(restored.body.recovery.status,'recovered');assert.deepEqual(restored.body.receipt,saved);assert.equal(restored.body.executionHold,'existing_independent_attempt_do_not_resend');assert.equal(restored.body.nextExecution.allow,false);assert.equal(restored.body.nextExecution.status,'already_consumed_do_not_resend');assert.equal(restored.body.dispatchReady,false);
 const repeated=response();await handler(req('POST',ids),repeated);assert.equal(repeated.statusCode,409);const switched=response();await handler(req('POST',{...ids,executionId:'mock-only-unauthorized-switch'}),switched);assert.equal(switched.body.error,'new_explicit_approval_required');assert.equal(calls,1);assert.equal(hash(history),prior);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}));

test('archived round 1 can be read without provider access but can never be dispatched as current grant',()=>preview(async()=>{
 const old=require('../lib/room-writer-raw/gemini-execution-grant').archived[0];let reads=0,calls=0;const saved={...scope,approvalId:old.approvalId,executionId:old.executionId,result:{model:scope.model,error:'gemini_http_503_no_retry',httpStatus:503,tokens:null}};
 const handler=H.createHandler({authorizeImpl:async()=>({ok:true,plan:'owner'}),storeFactory:(request,g,s)=>{assert.equal(request.method,'GET');assert.equal(g.approvalId,old.approvalId);reads++;return {state:async()=>({approvalClaim:{},claim:{},dispatch:{tokens:null},result:saved}),readProbe:async()=>null};},compare:async()=>{calls++;assert.fail('archive must never dispatch');}});
 const ids={approvalId:old.approvalId,executionId:old.executionId},get=response();await handler(req('GET',ids),get);assert.equal(get.statusCode,200);assert.equal(get.body.recovery.status,'recovered');assert.equal(get.body.receipt.result.httpStatus,503);assert.equal(get.body.nextExecution.allow,false);assert.equal(get.body.dispatchReady,false);const post=response();await handler(req('POST',ids),post);assert.equal(post.statusCode,409);assert.equal(reads,1);assert.equal(calls,0);
}));


test('accepted prior runtime proof permits one mock dispatch; incomplete or wrong proof fails closed',()=>preview(async()=>{
 const acceptedSha=require('../docs/experiments/gemini-comparison-20261113/preparation-policy.json').acceptedRuntimeStorageProofSha;
 const full={version:2,passed:true,context:'runtime',executionSha:acceptedSha,noProviderRequest:true,providerCalls:0,privateAnonymousStatus:403,claimReadbackFailureBlocksResend:true,resultSaveFailureBlocksResend:true,independentWorkerReadback:true,resultRecovered:true,duplicateRejected:true,crossDeployment:true,successfulCreates:1,competingCreates:2};
 const ids={approvalId:'mock-reused-proof-approval',executionId:'mock-reused-proof-execution'};
 const grant={...scope,...ids,status:'approved',approvedBy:'mock admin',approvedAt:new Date(Date.now()-1000).toISOString(),maxCalls:1,independentTrialAcknowledged:true,priorHistory:{approvalId:history.approval.id,classification:'D',historyHash:hash(history)},freeTierConfirmation:{...account().currentQuotaEvidence,evidenceReference:'mock only'}};
 for(const proof of [null,{...full,executionSha:'a'.repeat(40)},{...full,duplicateRejected:false},{...full,providerCalls:1},full]){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gemini-reuse-'));try{
   const b=blob(dir);let calls=0;
   const h=H.createHandler({authorizeImpl:async()=>({ok:true,plan:'owner'}),account:account(),nextGrant:grant,storeFactory:(r,g,s)=>({...createIndependent(b,g,s,{readOnly:r.method==='GET'}),readProbe:async name=>name===require('../lib/room-writer-raw/gemini-storage-probe').probeId(acceptedSha,'runtime')?proof:null}),compare:async()=>{calls++;const e=Error('gemini_http_503_no_retry');e.httpStatus=503;throw e;}});
   const r=response();await h(req('POST',ids),r);
   if(proof===full){assert.equal(calls,1);assert.equal(r.statusCode,502);const get=response();await h(req('GET',ids),get);assert.equal(get.body.recovery.status,'recovered');assert.equal(get.body.receipt.result.httpStatus,503);const again=response();await h(req('POST',ids),again);assert.equal(again.statusCode,409);assert.equal(calls,1);}
   else {assert.equal(calls,0);assert.equal(r.body.error,'runtime_storage_proof_missing');}
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
}));


test('approved fifth grant with missing current project Free proof cannot claim or send even when owner requests it',()=>preview(async()=>{
 const fifth=require('../docs/experiments/gemini-comparison-20261113/next-execution.json');
 const ids={approvalId:fifth.approvalId,executionId:fifth.executionId};
 const m={writes:0};
 const h=H.createHandler({authorizeImpl:async()=>({ok:true,plan:'owner'}),
   nextGrant:fifth,
   storeFactory:()=>({state:async()=>({}),readProbe:async()=>({version:2,passed:true,context:'runtime',executionSha:SHA}),
     begin:async()=>{m.writes++;throw Error('must never create claim');},
     dispatch:async()=>{m.writes++;throw Error('must never dispatch');},
     finish:async()=>{m.writes++;throw Error('must never write result');}}),
   compare:async()=>{throw Error('provider must never be contacted without fresh Free proof');},
   account:account()});
 const r=response();await h(req('POST',ids),r);
 assert.equal(r.statusCode,409);
 assert.equal(r.body.error,'new_explicit_approval_required');
 assert(r.body.nextExecution.reasons.includes('fresh_free_tier_confirmation_required'));
 assert.equal(m.writes,0);
 assert.equal(fifth.maxCalls,1);
 assert.equal(fifth.freeTierConfirmation.verified,false);
}));
