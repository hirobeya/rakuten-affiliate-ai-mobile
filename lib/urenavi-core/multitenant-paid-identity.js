'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const paid=new Set(['owner','standard','base','pro']);
const normalize=value=>String(value||'').trim().toLowerCase();
async function resolveCapacityIdentity(req,authorized,{authenticateSearchUser}={}){
 // The existing paid entitlement decision is authoritative. A search/free
 // identity alone is never sufficient to enable paid AI.
 if(authorized?.ok!==true||!paid.has(authorized.plan))
  return {ok:false,reason:'paid_entitlement_unverified'};
 const existing=authorized.user;
 if(UUID.test(String(existing?.id||''))&&normalize(existing.email))
  return {ok:true,user:{id:existing.id,email:normalize(existing.email)},plan:authorized.plan};
 if(typeof authenticateSearchUser!=='function')
  return {ok:false,reason:'trusted_identity_resolver_unavailable'};
 // The pre-existing server-side device flow verifies signed cookie, paid
 // entitlement, unique verified Supabase Auth user, and disabled/deleted users.
 let found;try{found=await authenticateSearchUser(req);}catch{
  return {ok:false,reason:'trusted_identity_lookup_unavailable'};
 }
 if(found?.ok!==true||!UUID.test(String(found.user?.id||''))||
   normalize(found.user?.email)!==normalize(existing?.email)||
   !normalize(existing?.email)||found.plan!==authorized.plan)
   return {ok:false,reason:'paid_identity_mismatch'};
 return {ok:true,user:{id:found.user.id,email:normalize(found.user.email)},plan:authorized.plan};
}
module.exports={resolveCapacityIdentity};
