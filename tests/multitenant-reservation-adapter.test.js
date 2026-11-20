'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reserve}=require('../lib/urenavi-core/multitenant-reservation-adapter');
const uid='11111111-1111-4111-8111-111111111111',attempt='22222222-2222-4222-8222-222222222222';
const capacity=()=>({now:1000,provider:{name:'gemini',status:'verified',windowEndsAt:2000,externalUsageKnown:true,requestLimit:5,requestUsed:0,requestReserved:0,tokenLimit:10000,tokenUsed:0,tokenReserved:0},tenant:{requestLimit:2,requestUsed:0,requestReserved:0},estimate:{requests:1,tokens:1000}});
const auth=async()=>({ok:true,user:{id:uid},plan:'base'});
test('requires authenticated paid UUID and does not trust client identity',async()=>{
 let calls=0; const dbRpc=async()=>{calls++;return {};};
 for(const authorize of [async()=>({ok:true,user:{id:'fake'},plan:'base'}),async()=>({ok:true,user:{id:uid},plan:'free'}),async()=>({ok:false})]){
  const r=await reserve({authorize,dbRpc,request:{serverAttemptId:attempt,userId:'attacker'},capacity:capacity()});
  assert.equal(r.reserved,false);
 }
 assert.equal(calls,0);
});
test('RPC is authoritative, not the optimistic policy',async()=>{
 const req={serverAttemptId:attempt,userId:'attacker'};
 const input=capacity();
 const done=await reserve({authorize:auth,request:req,capacity:input,dbRpc:async(name,args)=>{
  assert.equal(name,'urenavi_capacity_reserve_v1');
  assert.equal(args.p_user_id,uid);
  assert.equal(args.p_provider,'gemini');
  return {reserved:true,attemptId:attempt,userId:uid};
 }});
 assert.equal(done.reserved,true);assert.equal(done.dispatchAuthorized,false);assert.equal(done.providerCalls,0);
});
test('unknown RPC result stops without fallback send or retry',async()=>{
 let n=0;
 const done=await reserve({authorize:auth,request:{serverAttemptId:attempt},capacity:capacity(),dbRpc:async()=>{n++;throw Error('timeout');}});
 assert.equal(n,1);assert.deepEqual(done,{reserved:false,reason:'reservation_result_unknown_no_retry'});
});
test('forged or mismatched RPC receipt cannot authorize sending',async()=>{
 const result=await reserve({authorize:auth,request:{serverAttemptId:attempt},capacity:capacity(),dbRpc:async()=>({reserved:true,attemptId:attempt,userId:'someone-else'})});
 assert.equal(result.reserved,false);
});
test('global capacity unknown prevents DB request',async()=>{
 let calls=0;const c=capacity();c.provider.externalUsageKnown=false;
 const result=await reserve({authorize:auth,request:{serverAttemptId:attempt},capacity:c,dbRpc:async()=>{calls++;}});
 assert.equal(result.reserved,false);assert.equal(calls,0);
});
