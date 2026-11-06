'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const O=require('../../lib/urenavi-core/error-observation'),T=require('../../lib/urenavi-core/isolated-transport'),C=require('../../lib/urenavi-core/contracts'),W=require('../../lib/urenavi-core/chat-wire'),{fixture}=require('./fixture.cjs');
const req=()=>C.request('draft',fixture().item);
test('full success journals also omit dedicated and nested reasoning while engine receives the original candidate',async t=>{
 const draft=fixture().draft;draft.reasoning='hidden-root-canary';draft.product.reasoning='hidden-nested-canary';
 const x=setup(t,async()=>({status:200,url:W.ENDPOINT,json:async()=>({model:C.MODEL,reasoning:'hidden-provider-canary',choices:[{finish_reason:'stop',message:{role:'assistant',reasoning:'hidden-message-canary',content:JSON.stringify(draft)}}],usage:{prompt_tokens:100,completion_tokens:100,total_tokens:200}})}));
 const r=await x.send(req(),{stage:'draft',attemptId:'a'});assert.deepEqual(r.raw,draft);const j=JSON.stringify(x.read());for(const c of ['hidden-root-canary','hidden-nested-canary','hidden-provider-canary','hidden-message-canary'])assert.ok(!j.includes(c));assert.equal(x.read().attempts.a.response.sanitized,true);
});
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
test('failed candidate schema diagnostics identify known paths without retaining secret unknown field names or values',()=>{const d=fixture().draft;d.product.what=123;d['gsk_private_field_name']='private-value-canary';const o=O.observe({status:400,outputLimit:3000,body:{error:{code:'json_validate_failed',failed_generation:JSON.stringify(d)},usage:{prompt_tokens:2729,completion_tokens:3000,total_tokens:5729}}});assert.equal(o.failedGeneration.schemaValid,false);assert.ok(o.failedGeneration.schemaIssues.some(x=>x.path==='$.product.what'&&x.rule==='type'));assert.ok(o.failedGeneration.schemaIssues.some(x=>x.path==='$'&&x.rule==='additionalProperties'));assert.ok(!JSON.stringify(o).includes('gsk_private_field_name'));assert.ok(!JSON.stringify(o).includes('private-value-canary'));assert.equal(o.outputLimitReached,true);assert.equal(o.finishReasonIndicatesLength,null);});
test('finish length and retry-after are observations, not inferred from token cap and not retry permission',()=>{const o=O.observe({status:429,outputLimit:3000,headers:{get:k=>k==='retry-after'?'2':null},body:{finish_reason:'length'}});assert.equal(o.finishReasonIndicatesLength,true);assert.equal(o.retryAfterSeconds,2);assert.equal(o.reportedUsage,null);assert.equal(o.publication,false);const unknown=O.observe({status:400,outputLimit:3000,body:{finish_reason:'gsk_secret'}});assert.equal(unknown.finishReason,null);assert.ok(!JSON.stringify(unknown).includes('gsk_secret'));});
test('schema diagnosis bounds metadata and handles missing, type, enum and range failures',()=>{const d=fixture().draft;delete d.product;d.sentences=[];const issues=O.schemaIssues(d,C.WRITE_SCHEMA);assert.ok(issues.some(x=>x.path==='$.product'&&x.rule==='required'));assert.ok(issues.some(x=>x.path==='$.sentences'&&x.rule==='minItems'));assert.ok(issues.length<=32);assert.deepEqual(O.schemaIssues(null,C.WRITE_SCHEMA),[{path:'$',rule:'type'}]);});
