'use strict';

// Shared by the isolated operator CLI and the real local Supabase test.
function createIsolatedComparisonSupabase({url='http://127.0.0.1:54321',serviceKey,ownerJwt}={}){
 const local=new URL(url);
 if(local.protocol!=='http:'||local.hostname!=='127.0.0.1'||local.username||local.password||
    local.pathname!=='/'||local.search||local.hash)throw Error('loopback_supabase_required');
 if(!serviceKey||!ownerJwt)throw Error('isolated_supabase_credentials_required');
 const request=(pathname,options)=>fetch(local.origin+pathname,{
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
