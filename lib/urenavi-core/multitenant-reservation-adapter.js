'use strict';
// Preview design: backend-only adapter for a future atomic reservation RPC.
// No provider call, no retry, no environment lookup, no production wiring.
const {evaluateCapacity}=require('./multitenant-capacity-policy');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function reserve({authorize,dbRpc,request,capacity}={}){
  if(typeof authorize!=='function'||typeof dbRpc!=='function')return {reserved:false,reason:'backend_not_configured'};
  let identity;
  try{identity=await authorize(request);}catch{return {reserved:false,reason:'identity_unavailable'};}
  if(identity?.ok!==true || !UUID.test(String(identity.user?.id||'')) ||
     !['base','pro','owner'].includes(identity.plan))return {reserved:false,reason:'verified_paid_identity_required'};
  // Client-provided IDs and balances never enter the DB call.
  const decision=evaluateCapacity({...capacity,tenant:{...capacity?.tenant,id:identity.user.id},
    account:{subscriptionActive:true}});
  if(!decision.allow)return {reserved:false,reason:decision.reason};
  if(!['gemini','groq'].includes(capacity?.provider?.name))return {reserved:false,reason:'provider_not_allowed'};
  const id=request?.serverAttemptId;
  if(!UUID.test(String(id||'')))return {reserved:false,reason:'server_attempt_id_required'};
  let reply;
  try{reply=await dbRpc('urenavi_capacity_reserve_v1',{
    p_attempt_id:id,p_user_id:identity.user.id,p_provider:capacity.provider.name,
    p_estimated_tokens:decision.reservation.tokens,
    p_window_end:new Date(decision.reservation.windowEndsAt).toISOString()
  });}catch{return {reserved:false,reason:'reservation_result_unknown_no_retry'};}
  // Only the DB decides whether capacity is actually reserved.
  if(reply?.reserved!==true||reply?.attemptId!==id||reply?.userId!==identity.user.id)
    return {reserved:false,reason:'atomic_reservation_not_confirmed'};
  return {reserved:true,attemptId:id,userId:identity.user.id,
    // This is NOT a dispatch authorization until send-intent is durably written.
    dispatchAuthorized:false,providerCalls:0};
}
module.exports={reserve};
