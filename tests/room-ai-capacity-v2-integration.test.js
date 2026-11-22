'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {guardedRoomAiCall,MODEL}=require('../lib/urenavi-core/room-ai-capacity-gate');
const {createHandler}=require('../lib/super-urenavi-router');
const item={itemCode:'test:01',itemName:'架空の用品',itemCaption:'構造を確認できる用品です。',itemPrice:1000};
const user={id:'11111111-1111-4111-8111-111111111111',email:'test@example.invalid'};
const authorization={ok:true,plan:'owner',user};
const usage={prompt_tokens:250,completion_tokens:100,total_tokens:350};
const response={raw:{productType:{value:'架空の用品',source:'itemName',evidence:'架空の用品'},
 features:[],sellingPoints:[],confidence:'high'},usage,model:MODEL};
function fakeDb({reservation=true,intent=true,settlement=true}={}){
 const paths=[],args=[];
 return {paths,args,async db(path,{body}={}){
  paths.push(path);args.push(JSON.parse(body||'{}'));
  if(path.endsWith('_reserve_v2'))return reservation;
  if(path.endsWith('_intent_v2'))return intent;
  if(path.endsWith('_complete_v2'))return settlement;
  throw Error('unexpected database call');
 }};
}
const request={method:'POST',body:item};
function run({db,authorization:auth=authorization,callAI=async()=>response,item:input=item}={}){
 return guardedRoomAiCall({req:request,authorization:auth,apiKey:'mock',
  model:MODEL,item:input,db,callAI});
}
test('no verified identity or DB approval can send a provider request',async()=>{
 for(const auth of [
  {ok:true,plan:'owner',user:{email:user.email}},
  {...authorization,plan:'free'},
  {...authorization,user:{...user,id:'from-client'}},
  {ok:false,plan:'owner',user}
 ]){
  let sends=0;
  const d=fakeDb();
  await assert.rejects(run({db:d.db,authorization:auth,callAI:async()=>{sends++;return response}}),/room_ai_capacity_reservation_unconfirmed/);
  assert.equal(sends,0);
  assert.equal(d.paths.length,0);
 }
});
test('db refusal, absent intent and backend exception always block before transport',async()=>{
 for(const config of [{reservation:false},{intent:false}]){
  const d=fakeDb(config);let sends=0;
  await assert.rejects(run({db:d.db,callAI:async()=>{sends++;return response}}),err=>
    config.intent===false ? err.capacityPreDispatch===false : err.capacityPreDispatch===true);
  assert.equal(sends,0);
 }
 let sends=0;
 await assert.rejects(run({db:async()=>{throw Error('unavailable')},callAI:async()=>{sends++;return response}}));
 assert.equal(sends,0);
});
test('successful simulated send reserves, saves intent and settles once with exact known usage',async()=>{
 const d=fakeDb();let sends=0;
 const result=await run({db:d.db,callAI:async opts=>{
  sends++;
  assert.equal(opts.model,MODEL);
  assert.equal(opts.maxRetries,0);
  assert.equal(opts.imageDataUrl,null);
  return response;
 }});
 assert.equal(result,response);
 assert.equal(sends,1);
 assert.deepEqual(d.paths,[
  'rpc/urenavi_capacity_reserve_v2',
  'rpc/urenavi_capacity_intent_v2',
  'rpc/urenavi_capacity_complete_v2'
 ]);
 assert.equal(d.args[2].p_actual,350);
 assert.equal(d.args[2].p_outcome,'spent');
 assert.equal(d.args[0].p_id,d.args[1].p_id);
 assert.equal(d.args[1].p_id,d.args[2].p_id);
});
test('429 or timeout settles halted/unknown without retry',async()=>{
 for(const status of [429,504]){
  const d=fakeDb();let sends=0;
  await assert.rejects(run({db:d.db,callAI:async()=>{
   sends++;const e=Error('provider failure');e.status=status;throw e;
  }}),/provider failure/);
  assert.equal(sends,1);
  assert.equal(d.paths.length,3);
  assert.equal(d.args[2].p_outcome,status===429?'rate_limited':'unknown');
  assert.equal(d.args[2].p_actual,null);
 }
});
test('missing provider usage or unconfirmed settlement halts without re-dispatch',async()=>{
 for(const opts of [{result:{...response,usage:null},settlement:true},
  {result:response,settlement:false}]){
  const d=fakeDb({settlement:opts.settlement});let sends=0;
  await assert.rejects(run({db:d.db,callAI:async()=>{sends++;return opts.result}}),err=>
   /room_ai_(provider_usage_unknown|settlement_unconfirmed)_no_retry/.test(err.message)&&
   err.capacityPreDispatch===false);
  assert.equal(sends,1);
 }
});
test('no real Groq request from main router when capacity RPC rejects',async()=>{
 let sends=0;
 const previous={env:process.env.VERCEL_ENV,key:process.env.GROQ_API_KEY};
 process.env.VERCEL_ENV='preview';process.env.GROQ_API_KEY='fake';
 try{
  const handler=createHandler({
   authorize:async()=>authorization,
   capacityDb:async()=>false,
   callGroq:async()=>{sends++;return response;},
   store:{loadProduct:async()=>null,saveProduct:async()=>{}}
  });
  const res={code:200,body:null,headers:{},
   setHeader(k,v){this.headers[k]=v;},
   status(c){this.code=c;return this;},json(v){this.body=v;return this;}};
  await handler({method:'POST',body:{...item,itemName:'架空の用品',itemCaption:'構造を確認できる用品です。'}},res);
  assert.equal(res.code,503);
  assert.match(res.body.message,/利用枠を確認できない/);
  assert.equal(res.body.retryAllowed,false);
  assert.equal(sends,0);
 }finally{
  if(previous.env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous.env;
  if(previous.key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=previous.key;
 }
});

test('provider 429 is reported as stop with no replay or leaked identifiers',async()=>{
 const oldEnv=process.env.VERCEL_ENV,oldKey=process.env.GROQ_API_KEY;
 process.env.VERCEL_ENV='preview';process.env.GROQ_API_KEY='mock';
 try{
  let sends=0;
  const handler=createHandler({
   authorize:async()=>authorization,
   capacityGate:async()=>{sends++;const e=new Error('provider-secret-internal');e.status=429;throw e;},
   store:{loadProduct:async()=>null,saveProduct:async()=>{}}
  });
  const res={code:200,body:null,headers:{},
   setHeader(k,v){this.headers[k]=v;},
   status(v){this.code=v;return this;},
   json(v){this.body=v;return this;}
  };
  await handler({method:'POST',body:item},res);
  assert.equal(sends,1);
  assert.equal(res.code,429);
  assert.equal(res.body.retryAllowed,false);
  assert.doesNotMatch(JSON.stringify(res.body),/provider-secret-internal/);
 }finally{
  if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;
  if(oldKey===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=oldKey;
 }
});

test('paid requests reserve both spending ceilings in v2 before the single send',async()=>{
 const paths=[],payloads=[];
 let sends=0;
 const paidPolicy={organizationDailyTokens:1000000,tenantDailyTokens:50000,
  inputNanoUsdPerToken:150,outputNanoUsdPerToken:600};
 const result=await guardedRoomAiCall({req:request,authorization,apiKey:'offline',item,paidPolicy,
  db:async(path,{body})=>{paths.push(path);payloads.push(JSON.parse(body));return true;},
  callAI:async options=>{sends++;assert.equal(options.maxRetries,0);return response;}});
 assert.equal(sends,1);
 assert.deepEqual(paths,['rpc/urenavi_capacity_reserve_paid_v2','rpc/urenavi_capacity_intent_v2','rpc/urenavi_capacity_complete_v2']);
 assert.equal(payloads[0].p_org_token_ceiling,1000000);
 assert.equal(payloads[0].p_tenant_token_ceiling,50000);
 assert.equal(payloads[0].p_tenant,user.id);
 assert.equal(result.estimatedCostNanoUsd,97500);
 await assert.rejects(guardedRoomAiCall({req:request,authorization,apiKey:'offline',item,paidPolicy,
  db:async()=>false,callAI:async()=>assert.fail('no send after budget refusal')}),/reservation_unconfirmed/);
});

test('paid configuration requires current evidence for this exact key and production approval',()=>{
 const {createHash}=require('node:crypto');
 const {paidCapacityPolicy,groqPlan}=require('../lib/urenavi-core/groq-plan');
 const now=Date.now(),key='offline';
 const evidence={approved:true,plan:'paid',evidenceHash:'a'.repeat(64),
  keyHash:createHash('sha256').update(key).digest('hex'),
  verifiedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+1000).toISOString(),
  inputNanoUsdPerToken:150,outputNanoUsdPerToken:600,
  organizationDailyBudgetNanoUsd:600000000,tenantDailyBudgetNanoUsd:60000000};
 const env={URENAVI_GROQ_PLAN:'paid',VERCEL_ENV:'production',URENAVI_GROQ_PAID_ENABLED:'approved_paid',
  URENAVI_GROQ_PAID_EVIDENCE:JSON.stringify(evidence)};
 assert.equal(groqPlan({}),'free');
 assert.equal(groqPlan({URENAVI_GROQ_PLAN:'invalid'}),null);
 assert.equal(paidCapacityPolicy({key,env,now}).tenantDailyTokens,100000);
 assert.equal(paidCapacityPolicy({key,env:{...env,VERCEL_ENV:'preview'},now}),null);
 assert.equal(paidCapacityPolicy({key,env:{...env,URENAVI_GROQ_PAID_ENABLED:''},now}),null);
 assert.equal(paidCapacityPolicy({key:'other',env,now}),null);
 assert.equal(paidCapacityPolicy({key,env,now:now+1000}),null);
});

test('unexpected provider overrun is settled and withheld with no retry',async()=>{
 const d=fakeDb();
 let calls=0;
 await assert.rejects(guardedRoomAiCall({req:request,authorization,apiKey:'offline',item,
  estimate:300,db:d.db,callAI:async()=>{calls++;return response;}}),
  error=>error.message==='room_ai_provider_usage_exceeded_no_retry'&&error.capacityPreDispatch===false);
 assert.equal(calls,1);
 assert.equal(d.args.at(-1).p_actual,350);
});
