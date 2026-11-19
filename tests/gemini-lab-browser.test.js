'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const script=fs.readFileSync('public/gemini-lab.js','utf8');
function browser(fetchImpl,saved=new Map()){
 const nodes=new Map(),handlers=new Map();let calls=[];
 const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'3',disabled:id==='run',textContent:'',addEventListener(type,fn){handlers.set(id+':'+type,fn);}});return nodes.get(id);};
 vm.runInNewContext(script,{document:{getElementById:element},fetch:async(u,o)=>{calls.push({u,o});return fetchImpl(u,o);},localStorage:{setItem:(k,v)=>saved.set(k,v),getItem:k=>saved.get(k)||null},navigator:{clipboard:{writeText:async()=>{}}},Date,JSON,Error,encodeURIComponent});
 return {nodes,handlers,calls,saved};
}
const payload={name:'テスト商品',requestHash:'a'.repeat(64),executionSha:'b'.repeat(40),holds:[],held:false,executionHold:null,attempt:{}};
const response=data=>({ok:true,status:200,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(data)});
test('GET restores exact saved output and usage without a generation POST',async()=>{
 const receipt={result:{generatedCopy:'保存された原文',tokens:{input:10,output:5,total:17},quality:'unverified'}};
 const b=browser(async()=>response({...payload,receipt}));await b.handlers.get('check:click')();assert(b.nodes.get('result').textContent.includes('保存された原文'));assert.equal(b.calls.length,2);assert.equal(b.calls[0].o.method,undefined);assert.match(b.calls[1].u,/mode=quota-observation/);assert.equal(b.nodes.get('run').disabled,true);assert(b.nodes.get('diagnostics').textContent.includes('saved_result_recovered'));
});
test('unknown fetch outcome survives reload and cannot trigger a second POST',async()=>{
 const saved=new Map();const b=browser(async(u,o)=>{if(o.method==='POST')throw new TypeError('The string did not match the expected pattern.');return response(payload);},saved);
 await b.handlers.get('check:click')();await b.handlers.get('run:click')();assert.equal(b.calls.filter(x=>x.o.method==='POST').length,1);assert(b.nodes.get('diagnostics').textContent.includes('browser_fetch_failed'));assert(b.nodes.get('diagnostics').textContent.includes('"patternError": true'));
 const next=browser(async()=>response(payload),saved);await next.handlers.get('check:click')();await next.handlers.get('run:click')();assert.equal(next.calls.filter(x=>x.o.method==='POST').length,0);assert.equal(next.nodes.get('run').disabled,true);
});
test('HTML/sign-in response is identified at JSON parsing, never as Gemini failure',async()=>{
 const b=browser(async()=>({ok:true,status:200,headers:{get:()=> 'text/html'},text:async()=>'<html>Sign in</html>'}));await b.handlers.get('check:click')();assert(b.nodes.get('diagnostics').textContent.includes('browser_json_parse_failed'));assert.equal(b.nodes.get('run').disabled,true);
});
test('response read failure is distinct from fetch and parser failures',async()=>{
 const b=browser(async()=>({ok:true,status:200,headers:{get:()=> 'application/json'},text:async()=>{throw Error('read failed');}}));await b.handlers.get('check:click')();assert(b.nodes.get('diagnostics').textContent.includes('browser_response_read_failed'));assert(!b.nodes.get('diagnostics').textContent.includes('browser_json_parse_failed'));
});


test('restored failed receipt displays provider error and cannot enable generation',async()=>{
 const failed={...payload,nextExecution:{allow:false,status:'already_consumed_do_not_resend',approvalId:'mock-approval-0001',executionId:'mock-execution-0001',readOnlyAvailable:true},receipt:{result:{error:'gemini_http_503_no_retry',httpStatus:503,providerDiagnostic:{httpStatus:503,status:'UNAVAILABLE',headers:{}},tokens:null}},attempt:{claim:true,dispatch:true,approvalClaim:true},executionHold:'existing_independent_attempt_do_not_resend',holds:['existing_independent_attempt_do_not_resend']};
 const b=browser(async(url)=>url.includes('mode=local-evaluation')?response({proposalStatus:'preview_for_owner_review',proposedText:'収納に使えるベンチの候補です。',evidence:[{source:'itemCaption',quote:'収納'}],providerCalls:0}):response(failed));
 await b.handlers.get('check:click')();assert(b.nodes.get('result').textContent.includes('gemini_http_503_no_retry'));assert(b.nodes.get('result').textContent.includes('再送禁止'));assert(b.nodes.get('result').textContent.includes('429'));assert(b.nodes.get('localResult').textContent.includes('収納に使えるベンチの候補です。'));assert(b.nodes.get('localResult').textContent.includes('品質：未評価'));assert.equal(b.nodes.get('run').disabled,true);assert.match(b.nodes.get('nextStatus').textContent,/使用済み/);assert.match(b.nodes.get('nextStatus').textContent,/再送禁止/);assert.equal(b.nodes.get('nextLink').hidden,false,'read-only link remains visible');assert.equal(b.calls.length,3);assert(b.calls.every(x=>x.o.method===undefined));
});


test('automatic owner preflight shows checked model but never invents Free quota remaining',async()=>{
 const result={...payload,nextExecution:{status:'approved_waiting_prerequisites',allow:false,reasons:['fresh_free_tier_confirmation_required']}};
 const b=browser(async url=>response(url.includes('mode=quota-observation')
  ?{mode:'quota-observation',model:'gemini-3.8-flash',modelCheck:{status:'model_available',available:true},usage:{trackedAttemptsTotal:4},exactRemaining:null,canAuthorizeGeneration:false,providerGenerationCalls:0}
  :result));
 await b.handlers.get('check:click')();
 assert.match(b.nodes.get('quotaStatus').textContent,/model_available/);
 assert.match(b.nodes.get('quotaStatus').textContent,/4回/);
 assert.match(b.nodes.get('quotaStatus').textContent,/取得不可/);
 assert.equal(b.nodes.get('run').disabled,true);
 assert.equal(b.calls.filter(x=>x.o.method==='POST').length,0);
});
