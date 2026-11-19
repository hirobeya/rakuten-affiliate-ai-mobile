'use strict';
// Server-only capacity backend for the Preview gate. Never takes provider,
// tenant, limits, or reservation values from browser input.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FRESH_MS=5*60*1000;
const safeInt=value=>Number.isSafeInteger(value)&&value>=0?value:null;
function createCapacityBackend(db,{now=Date.now}={}){
 if(typeof db!=='function')throw Error('capacity_db_required');
 async function getCapacity({userId,model}={}){
  if(!UUID.test(String(userId||''))||!/^openai\/gpt-oss-(120b|20b)$/.test(String(model||'')))
   throw Error('capacity_identity_or_model_invalid');
  const provider='groq';
  const p=await db('urenavi_provider_capacity_v1?'+new URLSearchParams({
   provider:'eq.'+provider,select:'provider,window_end,verified_at,external_usage_known,request_limit,request_used,request_reserved,token_limit,token_used,token_reserved',limit:'2'
  }));
  const t=await db('urenavi_tenant_capacity_v1?'+new URLSearchParams({
   user_id:'eq.'+userId,provider:'eq.'+provider,select:'user_id,provider,window_end,request_limit,request_used,request_reserved',limit:'2'
  }));
  if(!Array.isArray(p)||p.length!==1||!Array.isArray(t)||t.length!==1)throw Error('capacity_rows_missing_or_ambiguous');
  const head=p[0],tenant=t[0],current=now();
  const end=Date.parse(head.window_end),observed=Date.parse(head.verified_at);
  if(head.provider!==provider||tenant.provider!==provider||tenant.user_id!==userId||
    tenant.window_end!==head.window_end||!Number.isFinite(current)||
    !Number.isFinite(end)||!Number.isFinite(observed)||observed>current||
    observed<current-FRESH_MS||end<=current)throw Error('capacity_snapshot_invalid_or_stale');
  const required=[head.request_limit,head.request_used,head.request_reserved,
   head.token_limit,head.token_used,head.token_reserved,
   tenant.request_limit,tenant.request_used,tenant.request_reserved].map(safeInt);
  if(required.some(x=>x===null))throw Error('capacity_counters_invalid');
  const [rl,ru,rr,tl,tu,tr,ul,uu,ur]=required;
  if(ru+rr>rl||tu+tr>tl||uu+ur>ul)throw Error('capacity_oversubscribed');
  return {
   now:current,
   provider:{name:provider,status:'verified',windowEndsAt:end,
    externalUsageKnown:head.external_usage_known===true,
    requestLimit:rl,requestUsed:ru,requestReserved:rr,
    tokenLimit:tl,tokenUsed:tu,tokenReserved:tr},
   tenant:{id:userId,requestLimit:ul,requestUsed:uu,requestReserved:ur},
   account:{subscriptionActive:true}
  };
 }
 async function dbRpc(name,args){
  if(!['urenavi_capacity_reserve_v1','urenavi_capacity_send_intent_v1','urenavi_capacity_complete_v1'].includes(name))
   throw Error('unapproved_capacity_rpc');
  // db() never retries a POST. An ambiguous DB write always stops.
  return db('rpc/'+name,{method:'POST',body:JSON.stringify(args)});
 }
 return {getCapacity,dbRpc};
}
module.exports={createCapacityBackend};
