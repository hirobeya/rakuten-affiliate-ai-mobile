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

const CACHE_TABLES={
 urenavi_product_understanding_cache:'cache_key',
 urenavi_product_type_knowledge_cache:'product_type_key'
};
function isolatedEnvironmentApproved(env){
 return env.VERCEL_ENV==='preview' &&
  env.URENAVI_COMPARISON_REMOTE_ENABLED==='isolated-operator-confirmed' &&
  String(env.URENAVI_COMPARISON_REMOTE_SUPABASE||'').replace(/\/$/,'')===ISOLATED_URL &&
  Boolean(env.URENAVI_COMPARISON_REMOTE_SERVICE_KEY);
}
// The same isolated service credential serves ONLY two cache tables and the
// capacity-v2 RPCs; never accepts arbitrary table paths or production URLs.
async function isolatedCacheDb(path,options={},{
 env=process.env,fetchImpl=fetch
}={}){
 if(!isolatedEnvironmentApproved(env))throw Error('isolated_cache_not_authorized');
 const method=String(options.method||'GET').toUpperCase();
 const [table,query,...extra]=String(path||'').split('?');
 if(extra.length||!Object.prototype.hasOwnProperty.call(CACHE_TABLES,table))
  throw Error('isolated_cache_route_not_allowed');
 if(method==='GET'){
  const p=new URLSearchParams(query||'');
  const key=CACHE_TABLES[table];
  if([...p.keys()].sort().join(',')!==[key,'limit'].sort().join(',') ||
   p.get('limit')!=='1' || !/^eq\.[a-f0-9]{64}$/.test(p.get(key)||''))
   throw Error('isolated_cache_query_not_allowed');
 }else if(method==='POST'){
  if(query || !String(options.headers?.Prefer||'').includes('resolution=merge-duplicates') ||
   !String(options.body||'').trim().startsWith('{'))
   throw Error('isolated_cache_write_not_allowed');
 }else throw Error('isolated_cache_method_not_allowed');
 const secret=env.URENAVI_COMPARISON_REMOTE_SERVICE_KEY;
 const response=await fetchImpl(ISOLATED_URL+'/rest/v1/'+path,{
  method,
  headers:{apikey:secret,Authorization:'Bearer '+secret,
   'Content-Type':'application/json',...(method==='POST'?{'Prefer':'resolution=merge-duplicates,return=minimal'}:{})},
  ...(method==='POST'?{body:String(options.body)}:{}),
  signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw Error('isolated_cache_db_failed');
 if(response.status===204)return null;
 return response.json();
}

module.exports={isolatedCapacityDb,isolatedCacheDb,ISOLATED_URL};
