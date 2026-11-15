'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{fork}=require('node:child_process');
const {history,decision}=require('../lib/room-writer-raw/gemini-history'),{hash}=require('../lib/room-writer-raw/source');
const {assess,template}=require('../lib/room-writer-raw/gemini-execution-grant');const {createIndependent}=require('../lib/room-writer-raw/gemini-attempt-store');const {blob}=require('./fixtures/gemini-process-worker.cjs');
const scope={itemCode:history.approval.itemCode,model:history.approval.model,requestHash:history.approval.requestHash};
function grant(){return {...scope,status:'approved',approvalId:'mock-only-approval-001',executionId:'mock-only-execution-001',approvedBy:'mock administrator',approvedAt:new Date(Date.now()-1000).toISOString(),maxCalls:1,priorHistory:{approvalId:history.approval.id,classification:'D',historyHash:hash(history)},independentTrialAcknowledged:true,freeTierConfirmation:{verified:true,limits:{rpm:5,tpm:250000,rpd:20},projectId:'gen-lang-client-0210652653',tier:'free',model:scope.model,evidenceReference:'mock-only',observedAtMs:Date.now()-1000,validUntilMs:Date.now()+60000}};}
function worker(directory,g,phase){return new Promise((resolve,reject)=>{const child=fork(path.join(__dirname,'fixtures/gemini-process-worker.cjs'),[],{stdio:['ignore','ignore','ignore','ipc']});const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('mock worker timeout'));},5000);child.once('error',reject);child.once('message',message=>{clearTimeout(timer);resolve({child,message});});child.send({directory,grant:g,scope,phase});});}
test('next execution remains unapproved and cannot create a claim',async()=>{
 const inactive={...template,status:'awaiting_explicit_approval',approvalId:null,executionId:null};assert.equal(assess(inactive,scope).allow,false);assert.throws(()=>createIndependent({put:()=>assert.fail('no write')},inactive,scope));
 const original=hash(history);assert.throws(()=>{history.records[2].classification='A';});assert.equal(hash(history),original);assert.equal(hash(history),require('../docs/experiments/gemini-comparison-20261113/history-finalization.json').historyHash);
});
test('new grant is separate, cannot erase D or reuse its original approval',()=>{
 const g=grant(),n=assess(g,scope);assert.equal(n.allow,true);assert.equal(decision(scope,{}).reason,'target_history_unresolved');assert.notEqual(n.claimPath,assess({...g,executionId:'mock-only-execution-002'},scope).claimPath);
 assert.equal(assess({...g,approvalId:history.approval.id},scope).allow,false);assert.equal(assess({...g,independentTrialAcknowledged:false},scope).allow,false);assert.equal(assess({...g,priorHistory:{...g.priorHistory,historyHash:'0'.repeat(64)}},scope).allow,false);
});
test('separate OS processes racing one approval admit only one; changing execution ID cannot replenish it',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gemini-race-'));try{const g=grant(),r=await Promise.all([worker(dir,g,'complete'),worker(dir,g,'complete')]);assert.equal(r.filter(x=>x.message.stage==='completed').length,1);assert.equal(r.filter(x=>x.message.stage==='blocked').length,1);await assert.rejects(createIndependent(blob(dir),{...g,executionId:'mock-only-execution-002'},scope).begin(scope));assert.equal(fs.readFileSync(path.join(dir,'mock-provider-count'),'utf8').trim().split('\n').length,1);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
for(const phase of ['before-send','after-send','save-failure'])test('hard termination / save failure never replenishes grant: '+phase,async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gemini-death-'));try{const g=grant(),r=await worker(dir,g,phase);
 if(phase!=='save-failure'){const ended=new Promise(resolve=>r.child.once('exit',resolve));r.child.kill('SIGKILL');await ended;}
 const store=createIndependent(blob(dir),g,scope);await assert.rejects(store.begin(scope));const state=await store.state(scope);assert(state.approvalClaim);assert.equal(state.result,null);
 if(phase==='before-send')assert.equal(state.dispatch,null);else assert.equal(state.dispatch.tokens,null);
 assert.equal(fs.existsSync(path.join(dir,'mock-provider-count')),phase!=='before-send');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('designed time budget remains within the configured Function limit',()=>{
 const b=require('../lib/room-writer-raw/gemini-preview-route').BUDGET;assert.equal(Object.values(b).reduce((a,v)=>a+v,0),57000);assert.equal(b.provider,25000);assert.equal(require('../vercel.json').functions['api/room-ai.js'].maxDuration,60);
});

test('expired Free-tier evidence blocks execution but not read-only saved-result access',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gemini-readonly-'));try{const g=grant();const write=createIndependent(blob(dir),g,scope);await write.begin(scope);await write.finish(scope,{...scope,mock:true});const expired={...g,freeTierConfirmation:{...g.freeTierConfirmation,validUntilMs:Date.now()-1}};assert.equal(assess(expired,scope).allow,false);const read=createIndependent(blob(dir),expired,scope,{readOnly:true});assert.equal((await read.state(scope)).result.mock,true);await assert.rejects(read.begin(scope));await assert.rejects(read.dispatch(scope,{}));await assert.rejects(read.finish(scope,{}));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('third independent grant is approved in scope, but cannot dispatch without new Free-tier proof',()=>{
 const {buildGeminiLowThinkingCandidate}=require('../lib/room-writer-raw/gemini-comparison');
 const item=require('../lib/room-writer-raw/gemini-preview-route').loadItem('3');
 const low=buildGeminiLowThinkingCandidate(item);
 const current={itemCode:scope.itemCode,model:scope.model,requestHash:low.requestHash};
 assert.equal(template.approvalId,'urenavi-gemini-bench-independent-20261115-03');
 assert.equal(template.executionId,'urenavi-gemini-bench-execution-20261115-03');
 assert.equal(low.requestHash,'72611580afb7b57a445c5d009169e4fb4946743fdb4bf938c018def03238dc8a');
 assert.notEqual(low.requestHash,scope.requestHash);
 assert.equal(assess(template,current).allow,false);
 assert(assess(template,current).reasons.includes('fresh_free_tier_confirmation_required'));
 assert.equal(assess(template,current,Date.now(),{readOnly:true}).allow,true);
 const proof={verified:true,limits:{rpm:5,tpm:250000,rpd:20},projectId:'gen-lang-client-0210652653',tier:'free',model:scope.model,evidenceReference:'mock fresh account read',observedAtMs:Date.now()-1000,validUntilMs:Date.now()+60000};
 const verified={...template,freeTierConfirmation:proof};
 assert.equal(assess(verified,current).allow,true);
 for(const k of ['itemCode','model','requestHash'])assert.equal(assess(verified,{...current,[k]:'mismatch'}).allow,false);
 assert.equal(decision(scope,{}).allow,false);
});

test('read-only recovery budget stays under 60s without extending the POST budget',()=>{const h=require('../lib/room-writer-raw/gemini-preview-route');assert.equal(h.RECOVERY_BUDGET.storage_state,15000);assert.equal(h.RECOVERY_BUDGET.worker,12000);assert(h.BUDGET.authorization+h.RECOVERY_BUDGET.storage_state+h.BUDGET.overhead<60000);assert.equal(Object.values(h.BUDGET).reduce((a,b)=>a+b,0),57000);});

test('consumed rounds 1 and 2 remain immutable and read-only after third approval',()=>{
 const {archived,selectForRead}=require('../lib/room-writer-raw/gemini-execution-grant');
 assert.equal(archived.length,2);
 const [first,second]=archived;
 assert.equal(first.approvalId,'urenavi-gemini-bench-independent-20261113-01');
 assert.equal(second.approvalId,'urenavi-gemini-bench-independent-20261114-02');
 assert.equal(selectForRead(first),first);
 assert.equal(selectForRead(second),second);
 assert.equal(selectForRead({approvalId:'unauthorized',executionId:'unauthorized'}),template);
 assert.equal(assess(first,scope,Date.now(),{readOnly:true}).allow,true);
 assert.equal(assess(second,scope,Date.now(),{readOnly:true}).allow,true);
 assert.equal(assess(second,scope).allow,false);
 assert.notEqual(assess(first,scope,Date.now(),{readOnly:true}).namespace,assess(second,scope,Date.now(),{readOnly:true}).namespace);
 assert.equal(require('../docs/experiments/gemini-comparison-20261113/independent-01-failure.json').providerHttpStatus,503);
 assert.equal(template.previousIndependentAttempt.tokens,null);
 assert.throws(()=>{first.maxCalls=2;});
 assert.throws(()=>{second.maxCalls=2;});
});
