'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../api/access'),'utf8');
function setup(paid,free){
  let paidCalls=0,freeCalls=0,proCalls=0,cookies=0;
  const ctx={module:{exports:{}},console:{error(){}},URLSearchParams,require(name){
    if(name==='node:crypto')return require(name);
    if(name!=='../lib/billing')throw Error(name);
    return {authorize:async()=>{paidCalls++;if(paid instanceof Error)throw paid;return paid;},authenticateSearchUser:async()=>{freeCalls++;return free;},authorizePro:async()=>{proCalls++;return {ok:false,status:403};},setDeviceCookie(){cookies++;}};
  }};
  vm.runInNewContext(source,ctx);
  return {async request(action){const res={code:0,body:null,setHeader(){},status(n){this.code=n;return this;},json(x){this.body=x;return this;}};await ctx.module.exports({method:'GET',query:{action},headers:{}},res);return res;},counts:()=>({paidCalls,freeCalls,proCalls,cookies})};
}
test('verified free account can enter app without changing paid status or issuing paid device cookie',async()=>{
  const x=setup({ok:false,status:403},{ok:true,plan:'free',user:{id:'u',email:'free@example.test'}});
  const app=await x.request('app-status');assert.equal(app.code,200);assert.equal(app.body.plan,'free');assert.equal(app.body.pro,false);
  assert.equal((await x.request('status')).code,403);
  assert.equal((await x.request('pro-status')).code,403);
  assert.deepEqual(x.counts(),{paidCalls:2,freeCalls:1,proCalls:1,cookies:0});
});
test('invalid session and entitlement outage never fall back to free',async()=>{
  for(const paid of [{ok:false,status:401},new Error('database unavailable')]){
    const x=setup(paid,{ok:true,plan:'free'});const r=await x.request('app-status');
    assert.equal(r.code,paid instanceof Error?503:401);assert.equal(x.counts().freeCalls,0);
  }
  const revoked=setup({ok:false,status:403},{ok:false,status:401});assert.equal((await revoked.request('app-status')).code,401);
});
test('existing paid/owner app session keeps entitlement and remembered device behavior',async()=>{
  for(const plan of ['base','pro','owner']){
    const x=setup({ok:true,plan,user:{email:'paid@example.test'}},null);const r=await x.request('app-status');
    assert.equal(r.code,200);assert.equal(r.body.plan,plan);assert.equal(r.body.pro,plan!=='base');
    assert.equal(x.counts().freeCalls,0);assert.equal(x.counts().cookies,1);
  }
});
test('free UI cannot use copy shortcuts or expose a locally generated post',()=>{
  const html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');
  const from=html.indexOf('function postReady('),to=html.indexOf('function short(',from);
  const ctx={currentAccessPlan:'free',aiPostState(){throw Error('free account must not reach generation');}};
  vm.createContext(ctx);vm.runInContext(html.slice(from,to),ctx);
  for(const platform of ['room','threads','instagram'])assert.equal(ctx.postReady({},platform),false);
  assert.match(ctx.postDisplay({}),/投稿文生成は有料機能/);
});
