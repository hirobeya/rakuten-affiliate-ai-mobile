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
 const b=browser(async()=>response({...payload,receipt}));await b.handlers.get('check:click')();assert(b.nodes.get('result').textContent.includes('保存された原文'));assert.equal(b.calls.length,1);assert.equal(b.calls[0].o.method,undefined);assert.equal(b.nodes.get('run').disabled,true);assert(b.nodes.get('diagnostics').textContent.includes('saved_result_recovered'));
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
