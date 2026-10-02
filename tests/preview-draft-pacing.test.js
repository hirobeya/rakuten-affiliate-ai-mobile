'use strict';
const assert=require('node:assert/strict');
const {run}=require('../public/room-preview-request');
const {analyzeProductV3}=require('../lib/super-urenavi-v3-engine');
const {normalizePass1Raw}=require('../lib/super-urenavi-v3-groq');
const {buildVerificationInput,validateUnderstanding}=(()=>({...require('../lib/super-urenavi-v3-verifier'),...require('../lib/super-urenavi-v3-understanding')}))();
(async()=>{
 const item={itemName:'収納ボックス',itemCaption:'折りたたみ可能'};
 const raw=normalizePass1Raw({productType:{specific:'収納ボックス',general:'収納',quote:'収納ボックス'},appeals:[{scene:'使わないときはたたんで片付けたいなら。',text:'折りたためる収納ボックス。',evidenceQuotes:['折りたたみ可能'],strength:3}]},item);
 const input=buildVerificationInput(validateUnderstanding(raw,item));
 const verified={results:input.map(x=>({verificationIndex:x.verificationIndex,supported:true,keepDirectFact:true,reason:'mocked',checks:x.sentences.map(sentence=>({sentence,supported:true,evidenceQuotes:['折りたたみ可能'],reason:'mocked'}))}))};
 let row=null,clock=0,p1=0,p2=0;const quotas=[];
 const options={item,model:'mock',deferPass2:true,now:()=>clock,store:{loadProduct:async()=>row,saveProduct:async x=>{row={schema_version:x.schemaVersion,raw_ai_json:x.rawAiJson,model:x.model,result_status:x.resultStatus};}},consumeQuota:async stage=>{quotas.push(stage);return true;},callPass1:async()=>{p1++;return {raw,model:'mock'};},callPass2:async()=>{p2++;return {raw:verified,model:'mock'};}};
 const first=await analyzeProductV3(options);assert.equal(first.pending,true);assert.equal(first.ok,false);assert.equal(first.retryAfterMs,65000);assert.equal(p2,0);
 const early=await analyzeProductV3(options);assert.equal(early.pending,true);assert.deepEqual(quotas,['pass1']);assert.equal(p1,1);
 clock=65000;const final=await analyzeProductV3(options);assert.equal(final.ok,true);assert.equal(final.groq.pass1Calls,0);assert.equal(final.groq.pass2Calls,1);assert.equal(p1,1);assert.equal(p2,1);
 // Cached partial verification rejection must finish blocked without a new writer call.
 row.raw_ai_json.pass2=null;row.result_status='ok';options.callPass2=async()=>{p2++;return {raw:{results:[]},model:'mock'};};
 const rejected=await analyzeProductV3(options);assert.equal(rejected.ok,false);assert.equal(rejected.pending,undefined);assert.equal(p1,1);
 let calls=0,waited=0;
 const client=await run(item,{fetchImpl:async()=>{calls++;return {status:calls===1?202:200,json:async()=>calls===1?{pending:true,retryAfterMs:65000}:{ok:true}};},waitImpl:async ms=>{waited=ms;}});
 assert.equal(client.status,200);assert.equal(calls,2);assert.equal(waited,66000);
 calls=0;await run(item,{fetchImpl:async()=>{calls++;return {status:429,json:async()=>({})};},waitImpl:async()=>{throw Error('must not retry');}});assert.equal(calls,1);
 calls=0;await assert.rejects(()=>run(item,{isCurrent:()=>false,fetchImpl:async()=>{calls++;}}),e=>e.name==='AbortError');assert.equal(calls,0);
 console.log('preview-draft-pacing: PASS (deferred verification, no duplicate writer, cancellation, no 429 retry)');
})().catch(e=>{console.error(e);process.exitCode=1;});
