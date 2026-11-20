'use strict';

// Shared by the isolated operator CLI and the real local Supabase test.
// The only authorized hosted destination is the separately created,
// zero-cost comparison project. Never accept a caller-provided production URL.
const ISOLATED_PROJECT_ID='vyzpklomggsazwigxkfh';
function createIsolatedComparisonSupabase({url='http://127.0.0.1:54321',serviceKey,ownerJwt,
 allowRemote=false,fetchImpl=fetch}={}){
 const local=new URL(url);
 const loopback=local.protocol==='http:'&&local.hostname==='127.0.0.1';
 const hosted=allowRemote===true&&local.protocol==='https:'&&
  local.hostname===ISOLATED_PROJECT_ID+'.supabase.co'&&local.port==='';
 if((!loopback&&!hosted)||local.username||local.password||
    local.pathname!=='/'||local.search||local.hash)throw Error('isolated_supabase_destination_required');
 if(!serviceKey||!ownerJwt)throw Error('isolated_supabase_credentials_required');
 const request=(pathname,options)=>fetchImpl(local.origin+pathname,{
  ...options,redirect:'error',signal:AbortSignal.timeout(4000)
 });
 const db=async(path,options)=>{
  const response=await request('/rest/v1/'+path,{...options,headers:{
   apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'
  }});
  if(!response.ok)throw Error('isolated_capacity_db_unavailable');
  return response.json();
 };
 const authorize=async()=>{
  const response=await request('/auth/v1/user',{headers:{apikey:serviceKey,Authorization:'Bearer '+ownerJwt}});
  if(!response.ok)return {ok:false};
  const user=await response.json();
  return {ok:user.app_metadata?.urenavi_role==='owner',plan:'owner',user:{id:user.id,email:user.email}};
 };
 return {db,authorize};
}
module.exports={createIsolatedComparisonSupabase};
