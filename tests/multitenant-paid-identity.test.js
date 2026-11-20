'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resolveCapacityIdentity}=require('../lib/urenavi-core/multitenant-paid-identity');
const id='11111111-1111-4111-8111-111111111111';
const email='paid@example.test';
const req={headers:{cookie:'not-sent-to-test'}};
test('existing fully verified paid Auth identity is reused without lookup',async()=>{
 let calls=0;const r=await resolveCapacityIdentity(req,
  {ok:true,plan:'base',user:{id,email:' Paid@example.test '}},{
   authenticateSearchUser:async()=>{calls++;throw Error('must not look up');}
  });
 assert.equal(r.ok,true);assert.equal(r.user.id,id);assert.equal(r.user.email,email);assert.equal(calls,0);
});
test('server-verified signed device cookie lookup binds stable real user ID',async()=>{
 const r=await resolveCapacityIdentity(req,{ok:true,plan:'base',user:{email}},{
  authenticateSearchUser:async()=>({ok:true,plan:'base',user:{id,email}})
 });
 assert.deepEqual(r,{ok:true,user:{id,email},plan:'base'});
});
test('no user ID, mismatched email, plan or free-only identity denies',async()=>{
 for(const found of [
  {ok:true,plan:'base',user:{id,email:'attacker@example.test'}},
  {ok:true,plan:'free',user:{id,email}},
  {ok:true,plan:'base',user:{id:'fake',email}},
  {ok:false}
 ]){
  const r=await resolveCapacityIdentity(req,{ok:true,plan:'base',user:{email}},{
   authenticateSearchUser:async()=>found});
  assert.equal(r.ok,false);
 }
 const free=await resolveCapacityIdentity(req,{ok:true,plan:'free',user:{id,email}},
  {authenticateSearchUser:async()=>assert.fail('free must not lookup')});
 assert.equal(free.ok,false);
});
test('ambiguous device identity failure is fail-closed',async()=>{
 const r=await resolveCapacityIdentity(req,{ok:true,plan:'base',user:{email}},{
  authenticateSearchUser:async()=>{throw Error('provider unavailable');}});
 assert.equal(r.ok,false);
});
