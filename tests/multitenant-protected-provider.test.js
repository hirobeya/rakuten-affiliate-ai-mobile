'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {protectProvider,attemptId,actualUsage}=require('../lib/urenavi-core/multitenant-protected-provider');
const id='11111111-1111-4111-8111-111111111111';
const item={itemCode:'shop:1',itemName:'収納ボックス',itemCaption:'ふたつき収納箱。'};
const identity={ok:true,user:{id},plan:'owner'};
const capacity=()=>({now:1000,account:{subscriptionActive:true},
 provider:{name:'groq',status:'verified',windowEndsAt:2000,externalUsageKnown:true,
 requestLimit:5,requestUsed:0,requestReserved:0,tokenLimit:2000,tokenUsed:0,tokenReserved:0},
 tenant:{requestLimit:3,requestUsed:0,requestReserved:0}});
const model='openai/gpt-oss-120b';
function setup({throwProvider=false,missingUsage=false,denyIntent=false,unknownCompletion=false,identityValue=identity}={}){
 const log=[];let calls=0;
 const provider={model,requiredTokens:()=>100,
  call:async()=>{calls++;if(throwProvider)throw Error('503');return {usage:missingUsage?null:{prompt_tokens:45,completion_tokens:25},raw:{}};}};
 const gate=protectProvider(provider,{identity:identityValue,item,
   capacityForStage:async()=>capacity(),
   dbRpc:async(name,args)=>{
    log.push({name,args});
    if(name==='urenavi_capacity_reserve_v1')return {reserved:true,attemptId:args.p_attempt_id,userId:id};
    if(name==='urenavi_capacity_send_intent_v1')return {accepted:!denyIntent,attemptId:args.p_attempt_id,userId:id};
    if(name==='urenavi_capacity_complete_v1'){
     if(unknownCompletion)throw Error('DB timeout');
     return {accepted:true,attemptId:args.p_attempt_id,status:args.p_outcome};
    }
    throw Error('unexpected RPC');
   }
 });
 return {gate,log,calls:()=>calls};
}
test('stable per user product stage attempt identity never uses client attempt UUID',()=>{
 const a=attemptId({userId:id,model,item,stage:'generate',state:{attempt:0}});
 assert.match(a,/^[a-f0-9-]{36}$/);
 assert.equal(a,attemptId({userId:id,model,item,stage:'generate',state:{attempt:0}}));
 assert.notEqual(a,attemptId({userId:id,model,item,stage:'verify',state:{attempt:0}}));
 assert.notEqual(a,attemptId({userId:id,model,item,stage:'generate',state:{attempt:1}}));
 assert.equal(attemptId({userId:'email-only',model,item,stage:'generate',state:{attempt:0}}),null);
});
test('valid durable reserve->send_intent->completion settles exactly once',async()=>{
 const x=setup();const r=await x.gate.call('generate',item,{attempt:0});
 assert.equal(r.usage.completion_tokens,25);assert.equal(x.calls(),1);
 assert.deepEqual(x.log.map(y=>y.name),[
 'urenavi_capacity_reserve_v1','urenavi_capacity_send_intent_v1','urenavi_capacity_complete_v1']);
 assert.equal(x.log[2].args.p_outcome,'spent');assert.equal(x.log[2].args.p_actual_tokens,70);
});
test('no send when intent was refused, even if reserve succeeded',async()=>{
 const x=setup({denyIntent:true});await assert.rejects(x.gate.call('generate',item,{attempt:0}),/send_intent_not_confirmed/);
 assert.equal(x.calls(),0);assert.equal(x.log.length,2);
});
test('provider HTTP failure becomes retained unknown with no resend',async()=>{
 const x=setup({throwProvider:true});await assert.rejects(x.gate.call('generate',item,{attempt:0}),/503/);
 assert.equal(x.calls(),1);assert.equal(x.log.at(-1).args.p_outcome,'outcome_unknown');
 assert.equal(x.log.at(-1).args.p_actual_tokens,null);
});
test('successful provider with missing usage is NOT settled as zero',async()=>{
 const x=setup({missingUsage:true});await assert.rejects(x.gate.call('generate',item,{attempt:0}),/provider_usage_unknown/);
 assert.equal(x.calls(),1);assert.equal(x.log.at(-1).args.p_outcome,'outcome_unknown');
});
test('lost completion receipt halts, never silently returns publishable AI response',async()=>{
 const x=setup({unknownCompletion:true});await assert.rejects(x.gate.call('generate',item,{attempt:0}),/persistence_unconfirmed/);
 assert.equal(x.calls(),1);
});
test('missing verified identity must halt BEFORE any database or provider call',async()=>{
 const x=setup({identityValue:{ok:true,user:{email:'owner@example.com'},plan:'owner'}});
 await assert.rejects(x.gate.call('generate',item,{attempt:0}),/capacity_identity_or_backend_unavailable/);
 assert.equal(x.calls(),0);assert.equal(x.log.length,0);
});
test('unknown provider usage never authorizes send',async()=>{
 let calls=0;
 const gate=protectProvider({model,requiredTokens:()=>100,call:async()=>{calls++;}},
  {identity,item,capacityForStage:async()=>({...capacity(),provider:{...capacity().provider,externalUsageKnown:false}}),
   dbRpc:async()=>assert.fail('must not write')});
 await assert.rejects(gate.call('generate',item,{attempt:0}),/external_usage_unknown/);
 assert.equal(calls,0);
});
test('token unknown cannot be treated as settled usage',()=>{
 assert.equal(actualUsage({prompt_tokens:10,completion_tokens:0}),10);
 assert.equal(actualUsage({prompt_tokens:10}),null);
 assert.equal(actualUsage(null),null);
});
test('real mobile Preview handler with opt-in but missing backend halts without provider or quota',async()=>{
 const oldEnv=process.env.VERCEL_ENV,oldFlag=process.env.URENAVI_CAPACITY_PREVIEW_GATE;
 process.env.VERCEL_ENV='preview';process.env.URENAVI_CAPACITY_PREVIEW_GATE='true';
 try{
  let calls=0,quota=0;
  const {createHandler}=require('../lib/room-copy-handler');
  const handler=createHandler({authorize:async()=>identity,localZeroCall:()=>null,
    provider:{model,requiredTokens:()=>100,call:async()=>{calls++;}},
    consumeQuota:async()=>{quota++;return true;},logCost:()=>{}});
  const res={setHeader(){},status(n){this.statusCode=n;return this;},json(x){this.body=x;return x;}};
  await handler({method:'POST',body:item},res);
  assert.equal(res.statusCode,503);assert.equal(res.body.message,'capacity_backend_unavailable');
  assert.equal(calls,0);assert.equal(quota,0);
 }finally{
  if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;
  if(oldFlag===undefined)delete process.env.URENAVI_CAPACITY_PREVIEW_GATE;else process.env.URENAVI_CAPACITY_PREVIEW_GATE=oldFlag;
 }
});

test('Groq semantic writer rejects a Gemini quota snapshot before any reservation or send',async()=>{
 let writes=0,calls=0;
 const gate=protectProvider({model,requiredTokens:()=>100,call:async()=>{calls++;}},
  {identity,item,capacityForStage:async()=>({...capacity(),provider:{...capacity().provider,name:'gemini'}}),
   dbRpc:async()=>{writes++;throw Error('must not be called');}});
 await assert.rejects(gate.call('generate',item,{attempt:0}),/provider_identity_mismatch/);
 assert.equal(writes,0);assert.equal(calls,0);
});

test('Preview capacity denial does not decrement legacy daily quota or call provider',async()=>{
 const oldEnv=process.env.VERCEL_ENV,oldFlag=process.env.URENAVI_CAPACITY_PREVIEW_GATE;
 process.env.VERCEL_ENV='preview';process.env.URENAVI_CAPACITY_PREVIEW_GATE='true';
 try{
  let calls=0,legacyClaims=0,atomicWrites=0;
  const {createHandler}=require('../lib/room-copy-handler');
  const backend={getCapacity:async()=>({...capacity(),provider:{...capacity().provider,externalUsageKnown:false}}),
    dbRpc:async()=>{atomicWrites++;throw Error('must not reserve unknown capacity');}};
  const handler=createHandler({
   authorize:async()=>identity,localZeroCall:()=>null,
   store:{loadProduct:async()=>null,saveProduct:async()=>{}},
   provider:{model,requiredTokens:()=>100,call:async()=>{calls++;throw Error('must not send');}},
   consumeQuota:async()=>{legacyClaims++;return true;},
   capacityBackend:backend,logCost:()=>{}
  });
  const res={setHeader(){},status(n){this.statusCode=n;return this;},json(x){this.body=x;return x;}};
  await handler({method:'POST',body:item},res);
  assert.equal(res.statusCode,503);
  assert.equal(calls,0);assert.equal(legacyClaims,0);assert.equal(atomicWrites,0);
 }finally{
  if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;
  if(oldFlag===undefined)delete process.env.URENAVI_CAPACITY_PREVIEW_GATE;else process.env.URENAVI_CAPACITY_PREVIEW_GATE=oldFlag;
 }
});
