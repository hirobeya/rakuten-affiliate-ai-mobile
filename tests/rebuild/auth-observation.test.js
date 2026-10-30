'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../../scripts/rebuild/real-search-preview/auth-observation');
test('Preview Auth observation delegates once and publishes only fixed states, including rejected verification',async()=>{
 const published=[],o=create(x=>published.push(x)),session={access_token:'synthetic-secret',user:{id:'synthetic-owner'}};
 let calls=0,callback;const result={data:{session},error:null};
 const auth={verifyOtp:async args=>{calls++;assert.equal(args.token_hash,'synthetic-input');return result;},getSession:async()=>({data:{session:null},error:null}),onAuthStateChange(fn){callback=fn;}};
 o.watch(auth);assert.equal(await auth.verifyOtp({token_hash:'synthetic-input'}),result);assert.equal(calls,1);
 assert.equal(o.snapshot().verification,'present');await auth.getSession();assert.equal(o.snapshot().session,'absent');
 callback('SIGNED_IN',session);assert.equal(o.snapshot().session,'present');callback('SIGNED_OUT',null);assert.equal(o.snapshot().session,'absent');
 o.access(403);assert.equal(o.snapshot().access,'forbidden');
 assert.ok(!JSON.stringify(published).includes('synthetic-'));assert.ok(!JSON.stringify(published).includes('access_token'));
 const failure=Error('synthetic-secret');const a={verifyOtp:async()=>{throw failure;},getSession:async()=>({error:{message:'synthetic-secret'}}),onAuthStateChange(){}};
 o.watch(a);await assert.rejects(a.verifyOtp(),e=>e===failure);await a.getSession();assert.equal(o.snapshot().verification,'failed');assert.equal(o.snapshot().session,'rejected');
 assert.ok(!JSON.stringify(published).includes('synthetic-secret'));
});
test('separate browser/origin stores remain separate; provider sign-in cannot prove another store has a session',()=>{
 const store=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
 const iphone=create(),chrome=create(),a=iphone.storage(store()),b=chrome.storage(store());
 a.setItem('synthetic-session-key','synthetic-credential');assert.equal(a.getItem('synthetic-session-key'),'synthetic-credential');
 assert.equal(b.getItem('synthetic-session-key'),null);assert.equal(iphone.snapshot().storageWrite,'saved');assert.equal(chrome.snapshot().storageRead,'absent');
 assert.ok(!JSON.stringify(iphone.snapshot()).includes('synthetic'));
});
test('storage failure is rethrown unchanged and diagnostic render failure cannot change Auth behavior',async()=>{
 const o=create(()=>{throw Error('render failed');}),failure=Error('storage denied');
 const s=o.storage({getItem(){throw failure;},setItem(){throw failure;},removeItem(){throw failure;}});
 for(const call of [()=>s.getItem('key'),()=>s.setItem('key','value'),()=>s.removeItem('key')])assert.throws(call,e=>e===failure);
 const result={data:{session:null},error:null},auth={getSession:async()=>result,verifyOtp:async()=>result,onAuthStateChange(){}};o.watch(auth);
 assert.equal(await auth.getSession(),result);
});
