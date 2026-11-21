'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeRuntimeCapacityDb,PRODUCTION_DB_URL,ISOLATED_URL}=require('../lib/urenavi-core/runtime-capacity-db');
const path='rpc/urenavi_capacity_reserve_v2';
const payload={method:'POST',body:'{"p_id":"not-sent"}'};
test('single capacity-v2 contract uses Preview isolated DB only',async()=>{
 let isolated=0,production=0;
 const db=makeRuntimeCapacityDb({
  env:{VERCEL_ENV:'preview'},
  previewDb:async(p,opts,extra)=>{
   isolated++;
   assert.equal(p,path);assert.equal(opts.method,'POST');
   assert.equal(extra.env.VERCEL_ENV,'preview');
   return false;
  },
  productionDb:async()=>{production++;return true;}
 });
 assert.equal(await db(path,payload),false);
 assert.equal(isolated,1);
 assert.equal(production,0);
});
test('Production cannot send before explicit enablement even with valid DB client',async()=>{
 const envs=[
  {VERCEL_ENV:'production'},
  {VERCEL_ENV:'production',URENAVI_PRODUCTION_CAPACITY_ENABLED:'true'},
  {VERCEL_ENV:'production',URENAVI_PRODUCTION_CAPACITY_ENABLED:'approved_v2',SUPABASE_URL:ISOLATED_URL}
 ];
 for(const env of envs){
  let calls=0;
  const db=makeRuntimeCapacityDb({env,productionDb:async()=>{calls++;return true;}});
  await assert.rejects(db(path,payload),/production_capacity_v2_not_authorized/);
  assert.equal(calls,0);
 }
});
test('approved Production capacity adapter reaches only a v2 RPC on pinned DB',async()=>{
 let calls=0;
 const env={VERCEL_ENV:'production',URENAVI_PRODUCTION_CAPACITY_ENABLED:'approved_v2',
  SUPABASE_URL:PRODUCTION_DB_URL};
 const db=makeRuntimeCapacityDb({env,productionDb:async(p,options)=>{
  calls++;assert.equal(p,path);assert.deepEqual(options,payload);return false;
 }});
 assert.equal(await db(path,payload),false);
 assert.equal(calls,1);
 for(const bad of ['rpc/urenavi_capacity_reserve_v1','urenavi_entitlements_v2',
  'rpc/urenavi_capacity_unhalt_v2']){
  await assert.rejects(db(bad,payload),/capacity_v2_rpc_not_authorized/);
 }
 assert.equal(calls,1);
});
test('no preview or production capacity dispatch from unrecognized runtime',async()=>{
 let calls=0;
 const db=makeRuntimeCapacityDb({env:{VERCEL_ENV:'development'},
  productionDb:async()=>{calls++;return true;},
  previewDb:async()=>{calls++;return true;}});
 await assert.rejects(db(path,payload),/capacity_v2_runtime_not_authorized/);
 assert.equal(calls,0);
});
