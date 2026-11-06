'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const O=require('../../lib/urenavi-core/error-observation'),T=require('../../lib/urenavi-core/isolated-transport'),C=require('../../lib/urenavi-core/contracts'),W=require('../../lib/urenavi-core/chat-wire'),{fixture}=require('./fixture.cjs');
const req=()=>C.request('draft',fixture().item);
function setup(t,http,extra={}){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'urenavi-diagnostic-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return {directory,send:T.create({directory,http,...extra}),read:()=>JSON.parse(fs.readFileSync(path.join(directory,'transport.json')))};}
test('400 records safe error body, request ID and usage before halt, never retries or releases',async t=>{
 let calls=0;const draft=fixture().draft;const x=setup(t,async()=>{calls++;return {status:400,url:W.ENDPOINT,headers:{get:k=>k==='x-request-id'?'req_test':null},json:async()=>({error:{code:'json_validate_failed',type:'invalid_request_error',message:'Failed to validate JSON.',param:'response_format',failed_generation:JSON.stringify(draft)},usage:{prompt_tokens:2729,completion_tokens:1000,total_tokens:3729}})};},{journalMode:'usage-only'});
 await assert.rejects(x.send(req(),{stage:'draft',attemptId:'a'}),/provider_http_error/);
 const j=x.read(),a=j.attempts.a;assert.equal(j.halt,'provider_http_error');assert.equal(a.status,'sent_unknown');assert.equal(a.errorObservation.classification,'json_schema_validation_failed');assert.equal(a.errorObservation.requestId,'req_test');assert.equal(a.reportedUsage.total_tokens,3729);assert.deepEqual(a.errorObservation.failedGeneration.value,draft);assert.equal(a.errorObservation.publication,false);assert.equal(a.response,undefined);
 await assert.rejects(x.send(req(),{stage:'draft',attemptId:'b'}),/transport_halted/);assert.equal(calls,1);
});
test('secrets and explicit reasoning are omitted recursively, including failed_generation',()=>{
 const d=fixture().draft;d.reasoning='reasoning-canary';d.product.reasoning='reasoning-canary';d.product.what='private-auth-canary';
 const o=O.observe({status:400,outputLimit:1000,secrets:['private-auth-canary'],body:{secret:'provider-secret-canary',reasoning:'reasoning-canary',error:{code:'json_validate_failed',message:'Bearer private-auth-canary gsk_example_key',failed_generation:JSON.stringify(d)}}});
 const s=JSON.stringify(o);for(const canary of ['private-auth-canary','gsk_example_key','reasoning-canary','provider-secret-canary'])assert.ok(!s.includes(canary));assert.equal(o.failedGeneration.value.product.what,'[redacted]');
});
test('partial failed JSON and reasoning-marked content are never published or archived verbatim',()=>{
 const raw='{"plan": {"reasoning": "partial-reasoning-canary';
 const o=O.observe({status:400,outputLimit:1000,body:{error:{code:'json_validate_failed',message:'<think>private-thought-canary</think>',failed_generation:raw}}});
 assert.equal(o.failedGeneration.provided,true);assert.equal(o.failedGeneration.retained,false);assert.equal(o.failedGeneration.reason,'unparseable_or_non_candidate');assert.ok(!JSON.stringify(o).includes('private-thought-canary'));assert.ok(!JSON.stringify(o).includes('partial-reasoning-canary'));
});
test('unknown usage is absent, not zero; invalid totals and oversized failure text are rejected',()=>{
 const o=O.observe({status:400,outputLimit:1000,body:{error:{failed_generation:'a'.repeat(262145)},usage:{prompt_tokens:10,completion_tokens:10,total_tokens:19}}});assert.equal(o.reportedUsage,null);assert.equal(o.outputLimitReached,null);assert.equal(o.failedGeneration.reason,'size_limit');
});
test('429 stops without awaiting body and records header request ID',async t=>{
 let reads=0,calls=0;const x=setup(t,async()=>{calls++;return {status:429,headers:{get:k=>k==='x-request-id'?'req_rate':null},json:()=>{reads++;return new Promise(()=>{});}};});await assert.rejects(x.send(req(),{stage:'draft',attemptId:'a'}),/provider_429/);assert.equal(reads,0);assert.equal(x.read().attempts.a.errorObservation.classification,'rate_limit');await assert.rejects(x.send(req(),{stage:'draft',attemptId:'b'}),/transport_halted/);assert.equal(calls,1);
});
test('400 observation storage failure holds transport lock and cannot resend',async t=>{
 let calls=0,writes=0;const directory=fs.mkdtempSync(path.join(os.tmpdir(),'urenavi-diagnostic-save-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const send=T.create({directory,http:async()=>{calls++;return {status:400,json:async()=>({error:{code:'json_validate_failed'}})};},save:(file,value)=>{if(++writes>=3)throw Error('disk');fs.writeFileSync(file,JSON.stringify(value));}});
 await assert.rejects(send(req(),{stage:'draft',attemptId:'a'}));assert.ok(fs.existsSync(path.join(directory,'transport.lock')));await assert.rejects(send(req(),{stage:'draft',attemptId:'b'}),/transport_locked/);assert.equal(calls,1);
});
test('late 400 body after timeout cannot replace halted journal with diagnostics',async t=>{
 let release;const x=setup(t,async()=>({status:400,json:()=>new Promise(r=>{release=r;})}),{timeoutMs:5});await assert.rejects(x.send(req(),{stage:'draft',attemptId:'a'}),/transport_timeout_unknown/);const before=JSON.stringify(x.read());release({error:{code:'json_validate_failed'}});await new Promise(r=>setImmediate(r));assert.equal(JSON.stringify(x.read()),before);
});
