'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isolatedCapacityDb,isolatedCacheDb,ISOLATED_URL}=require('../lib/urenavi-core/isolated-room-ai-capacity-db');
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

test('Preview cache reads exactly one hashed product on the pinned isolated host',async()=>{
 const key='f'.repeat(64);
 const result=await isolatedCacheDb('urenavi_product_understanding_cache?cache_key=eq.'+key+'&limit=1',{},{
  env:valid,fetchImpl:async(url,opts)=>{
   assert.equal(url,ISOLATED_URL+'/rest/v1/urenavi_product_understanding_cache?cache_key=eq.'+key+'&limit=1');
   assert.equal(opts.method,'GET');
   assert.equal(opts.headers.apikey,'test-service-key');
   return {ok:true,status:200,json:async()=>[{cache_key:key}]};
  }
 });
 assert.equal(result[0].cache_key,key);
});
test('Preview cache supports isolated upsert only, never arbitrary paths',async()=>{
 let sends=0;
 const path='urenavi_product_understanding_cache';
 const saved=await isolatedCacheDb(path,{method:'POST',
  headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
  body:'{"cache_key":"'+ 'f'.repeat(64) +'"}'},{
  env:valid,fetchImpl:async(url,options)=>{
   sends++;
   assert.equal(url,ISOLATED_URL+'/rest/v1/'+path);
   assert.equal(options.method,'POST');
   assert.match(options.headers.Prefer,/resolution=merge-duplicates/);
   return {ok:true,status:204};
  }});
 assert.equal(saved,null);
 assert.equal(sends,1);
 for(const bad of ['urenavi_entitlements_v2',
  'rpc/urenavi_sync_entitlement','urenavi_product_understanding_cache?select=*',
  'urenavi_product_understanding_cache?cache_key=eq.abc&limit=1']){
  await assert.rejects(isolatedCacheDb(bad,{},{
   env:valid,fetchImpl:async()=>{sends++;return {ok:true,json:async()=>[]}}}));
 }
 assert.equal(sends,1);
});
test('production and missing credential cannot use Preview isolated cache',async()=>{
 for(const env of [{},{...valid,VERCEL_ENV:'production'},{
  ...valid,URENAVI_COMPARISON_REMOTE_SUPABASE:'https://upooxcugrplfmjnqpuxs.supabase.co'}]){
  let sends=0;
  await assert.rejects(isolatedCacheDb('urenavi_product_understanding_cache?cache_key=eq.'+'f'.repeat(64)+'&limit=1',{},{
   env,fetchImpl:async()=>{sends++;return {ok:true,json:async()=>[]} }
  }),/isolated_cache_not_authorized/);
  assert.equal(sends,0);
 }
});
