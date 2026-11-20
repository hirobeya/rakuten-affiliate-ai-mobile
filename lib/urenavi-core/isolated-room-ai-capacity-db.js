'use strict';
// Explicitly isolated capacity ledger; never fall back to the production
// SUPABASE_URL or its service-role token when preparing a Groq send.
const ISOLATED_URL='https://vyzpklomggsazwigxkfh.supabase.co';
const RPC=/^rpc\/urenavi_capacity_(?:reserve|intent|complete)_v2$/;
async function isolatedCapacityDb(path,options={},{
 env=process.env,fetchImpl=fetch
}={}){
 if(env.VERCEL_ENV!=='preview' ||
  env.URENAVI_COMPARISON_REMOTE_ENABLED!=='isolated-operator-confirmed' ||
  String(env.URENAVI_COMPARISON_REMOTE_SUPABASE||'').replace(/\/$/,'')!==ISOLATED_URL ||
  !env.URENAVI_COMPARISON_REMOTE_SERVICE_KEY || !RPC.test(String(path||'')) ||
  options.method!=='POST')throw Error('isolated_capacity_db_not_authorized');
 const key=env.URENAVI_COMPARISON_REMOTE_SERVICE_KEY;
 const response=await fetchImpl(ISOLATED_URL+'/rest/v1/'+path,{
  method:'POST',
  headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body:String(options.body||'{}'),
  signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw Error('isolated_capacity_rpc_failed');
 const body=await response.json();
 if(body!==true)return false;
 return true;
}
module.exports={isolatedCapacityDb,ISOLATED_URL};
