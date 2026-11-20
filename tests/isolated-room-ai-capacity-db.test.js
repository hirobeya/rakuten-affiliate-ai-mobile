'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isolatedCapacityDb,ISOLATED_URL}=require('../lib/urenavi-core/isolated-room-ai-capacity-db');
const path='rpc/urenavi_capacity_reserve_v2';
const valid={
 VERCEL_ENV:'preview',
 URENAVI_COMPARISON_REMOTE_ENABLED:'isolated-operator-confirmed',
 URENAVI_COMPARISON_REMOTE_SUPABASE:ISOLATED_URL,
 URENAVI_COMPARISON_REMOTE_SERVICE_KEY:'test-service-key'
};
test('capacity db never falls back to production or unapproved endpoints',async()=>{
 for(const env of [
  {},{...valid,VERCEL_ENV:'production'},
  {...valid,URENAVI_COMPARISON_REMOTE_SUPABASE:'https://upooxcugrplfmjnqpuxs.supabase.co'},
  {...valid,URENAVI_COMPARISON_REMOTE_ENABLED:''},
  {...valid,URENAVI_COMPARISON_REMOTE_SERVICE_KEY:''}
 ]){
  let sends=0;
  await assert.rejects(isolatedCapacityDb(path,{method:'POST',body:'{}'},
   {env,fetchImpl:async()=>{sends++;return {ok:true,json:async()=>true}}}),
   /isolated_capacity_db_not_authorized/);
  assert.equal(sends,0);
 }
});
test('isolated ledger permits only capacity-v2 RPCs, never production tables',async()=>{
 let sends=0;
 for(const invalid of [
  'urenavi_entitlements_v2','rpc/urenavi_capacity_reserve_v1',
  'rpc/urenavi_capacity_confirm_window_v2'
 ]){
  await assert.rejects(isolatedCapacityDb(invalid,{method:'POST',body:'{}'},
   {env:valid,fetchImpl:async()=>{sends++;return {ok:true,json:async()=>true}}}));
 }
 assert.equal(sends,0);
});
test('isolated ledger sends service role request only to pinned host',async()=>{
 let sends=0;
 const ok=await isolatedCapacityDb(path,{method:'POST',body:'{"p_id":"example"}'},{
  env:valid,fetchImpl:async(url,opt)=>{
   sends++;
   assert.equal(url,ISOLATED_URL+'/rest/v1/'+path);
   assert.equal(opt.headers.Authorization,'Bearer test-service-key');
   assert.equal(opt.body,'{"p_id":"example"}');
   return {ok:true,json:async()=>true};
  }
 });
 assert.equal(ok,true);
 assert.equal(sends,1);
});
