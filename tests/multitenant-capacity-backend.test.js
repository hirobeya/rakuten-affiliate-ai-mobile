'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCapacityBackend}=require('../lib/urenavi-core/multitenant-capacity-backend');
const user='11111111-1111-4111-8111-111111111111';
const now=Date.parse('2026-11-19T08:00:00.000Z');
const end='2026-11-19T09:00:00.000Z';
function data(){
 return {
 p:{provider:'groq',window_end:end,verified_at:'2026-11-19T07:59:00.000Z',
  external_usage_known:true,request_limit:10,request_used:1,request_reserved:2,
  token_limit:10000,token_used:2000,token_reserved:3000},
 t:{user_id:user,provider:'groq',window_end:end,request_limit:3,
  request_used:1,request_reserved:1}
 };
}
function mock(rows=data()){
 const log=[];
 const db=async(path,options)=>{
  log.push({path,options});
  if(path.startsWith('urenavi_provider_capacity_v1?'))return rows.p?[rows.p]:[];
  if(path.startsWith('urenavi_tenant_capacity_v1?'))return rows.t?[rows.t]:[];
  if(path.startsWith('rpc/'))return {reserved:false};
  throw Error('bad path');
 };
 return {db,log};
}
test('loads trusted matching provider + tenant rows from server only',async()=>{
 const {db,log}=mock();
 const out=await createCapacityBackend(db,{now:()=>now}).getCapacity({userId:user,model:'openai/gpt-oss-120b'});
 assert.equal(out.provider.name,'groq');assert.equal(out.provider.externalUsageKnown,true);
 assert.equal(out.tenant.id,user);assert.equal(out.provider.tokenReserved,3000);
 assert.ok(log[0].path.includes('provider=eq.groq'));
 assert.ok(log[1].path.includes('user_id=eq.'+user));
});
test('unsupported model or identity is rejected without even querying DB',async()=>{
 const {db,log}=mock();const backend=createCapacityBackend(db,{now:()=>now});
 await assert.rejects(backend.getCapacity({userId:'email@x',model:'openai/gpt-oss-120b'}));
 await assert.rejects(backend.getCapacity({userId:user,model:'gemini-3.8-flash'}));
 assert.equal(log.length,0);
});
test('unknown, missing, expired, oversubscribed or stale rows reject',async()=>{
 for(const change of [
  r=>{r.p=null;},r=>{r.t=null;},r=>{r.p.window_end='2026-11-19T07:00:00.000Z';r.t.window_end=r.p.window_end;},
  r=>{r.p.verified_at='2026-11-19T07:50:00.000Z';},
  r=>{r.p.request_used=null;},
  r=>{r.p.token_reserved=9999;},
  r=>{r.t.user_id='22222222-2222-4222-8222-222222222222';},
  r=>{r.t.window_end='2026-11-19T09:15:00.000Z';}
 ]){
  const rows=data();change(rows);
  await assert.rejects(createCapacityBackend(mock(rows).db,{now:()=>now})
   .getCapacity({userId:user,model:'openai/gpt-oss-120b'}));
 }
});
test('unknown external use remains unknown and denies admission',async()=>{
 const rows=data();rows.p.external_usage_known=false;
 const snapshot=await createCapacityBackend(mock(rows).db,{now:()=>now})
  .getCapacity({userId:user,model:'openai/gpt-oss-120b'});
 assert.equal(snapshot.provider.externalUsageKnown,false);
 const {evaluateCapacity}=require('../lib/urenavi-core/multitenant-capacity-policy');
 const admission=evaluateCapacity({...snapshot,estimate:{requests:1,tokens:100}});
 assert.equal(admission.allow,false);assert.equal(admission.reason,'external_usage_unknown');
});
test('only allowlisted POST RPC endpoints and never retry a DB write',async()=>{
 let writes=0;const db=async(path,options)=>{writes++;assert.equal(options.method,'POST');throw Error('timeout');};
 const backend=createCapacityBackend(db);
 await assert.rejects(backend.dbRpc('unenrolled_rpc',{}),/unapproved_capacity_rpc/);
 assert.equal(writes,0);
 await assert.rejects(backend.dbRpc('urenavi_capacity_send_intent_v1',{p_attempt_id:user}));
 assert.equal(writes,1);
});
