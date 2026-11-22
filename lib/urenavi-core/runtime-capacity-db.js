'use strict';
// One capacity-v2 contract across Preview and Production. Only the DB
// destination changes, never the identity / reservation / intent / settlement
// semantics or the Groq transport.
const {isolatedCapacityDb,ISOLATED_URL}=require('./isolated-room-ai-capacity-db');
const PRODUCTION_DB_URL='https://upooxcugrplfmjnqpuxs.supabase.co';
const CAPACITY_RPC=/^rpc\/urenavi_capacity_(?:reserve|reserve_paid|intent|complete)_v2$/;

function makeRuntimeCapacityDb({env=process.env,previewDb=isolatedCapacityDb,productionDb}={}){
 return async function runtimeCapacityDb(path,options={}){
  if(!CAPACITY_RPC.test(String(path||'')) ||
     options.method!=='POST')throw Error('capacity_v2_rpc_not_authorized');
  if(env.VERCEL_ENV==='preview'){
   if(path==='rpc/urenavi_capacity_reserve_paid_v2')throw Error('paid_capacity_preview_not_authorized');
   // This function still checks the exact isolated host, operator flag
   // and isolated service-role credentials before making a request.
   return previewDb(path,options,{env});
  }
  if(env.VERCEL_ENV==='production'){
   if(env.URENAVI_PRODUCTION_CAPACITY_ENABLED!=='approved_v2' ||
      String(env.SUPABASE_URL||PRODUCTION_DB_URL).replace(/\/$/,'')!==PRODUCTION_DB_URL ||
      typeof productionDb!=='function')throw Error('production_capacity_v2_not_authorized');
   // Production capacity tables and official verified windows must exist.
   // Their atomic RPCs deny any absent/stale evidence or unknown spending.
   if(path==='rpc/urenavi_capacity_reserve_v2'&&env.URENAVI_GROQ_PLAN==='paid')
    throw Error('paid_capacity_requires_budget_reservation');
   if(path==='rpc/urenavi_capacity_reserve_paid_v2'&&
      (env.URENAVI_GROQ_PLAN!=='paid'||env.URENAVI_GROQ_PAID_ENABLED!=='approved_paid'))
    throw Error('paid_capacity_production_not_authorized');
   return productionDb(path,options);
  }
  throw Error('capacity_v2_runtime_not_authorized');
 };
}
module.exports={makeRuntimeCapacityDb,PRODUCTION_DB_URL,CAPACITY_RPC,ISOLATED_URL};
