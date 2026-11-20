'use strict';
// Policy-only prototype. No network calls or production integration.
// Dispatch must be protected by an ATOMIC, durable reservation in the
// eventual backend; this pure decision does not reserve capacity.
function nonNegativeInt(x){return Number.isSafeInteger(x)&&x>=0;}
function evaluateCapacity({provider,account,tenant,estimate,now=Date.now()}={}){
  const deny=(reason)=>({allow:false,reason,providerCalls:0,reservationCreated:false});
  if(!provider||!account||!tenant||!estimate) return deny('missing_context');
  if(!Number.isFinite(now)||now<0) return deny('invalid_clock');
  if(typeof tenant.id!=='string'||!tenant.id.trim())return deny('missing_tenant_identity');
  if(account.subscriptionActive!==true)return deny('subscription_inactive');
  if(provider.status!=='verified'||provider.windowEndsAt<=now||
     !Number.isFinite(provider.windowEndsAt))return deny('provider_limit_unverified');
  if(!nonNegativeInt(estimate.requests)||estimate.requests!==1||
     !nonNegativeInt(estimate.tokens)||estimate.tokens===0)return deny('invalid_estimate');
  // Never replace an unknown value with zero or infer it from an old dashboard.
  for(const v of [provider.requestLimit,provider.requestUsed,provider.requestReserved,
    provider.tokenLimit,provider.tokenUsed,provider.tokenReserved,
    tenant.requestLimit,tenant.requestUsed,tenant.requestReserved]){
    if(!nonNegativeInt(v))return deny('usage_unknown');
  }
  if(provider.externalUsageKnown!==true)return deny('external_usage_unknown');
  if(provider.requestUsed+provider.requestReserved+1>provider.requestLimit ||
     provider.tokenUsed+provider.tokenReserved+estimate.tokens>provider.tokenLimit)
     return deny('provider_capacity_exhausted');
  if(tenant.requestUsed+tenant.requestReserved+1>tenant.requestLimit)
     return deny('tenant_capacity_exhausted');
  return {allow:true,reason:'eligible_for_atomic_reservation_only',
    providerCalls:0,reservationCreated:false,
    reservation:{tenantId:tenant.id,requests:1,tokens:estimate.tokens,windowEndsAt:provider.windowEndsAt}};
}
function chooseRoute({localCopyApproved=false,capacity}={}){
  if(localCopyApproved===true)return {route:'local',providerCalls:0};
  if(capacity?.allow===true)return {route:'await_atomic_reservation',providerCalls:0};
  return {route:'held',reason:capacity?.reason||'capacity_unavailable',providerCalls:0};
}
module.exports={evaluateCapacity,chooseRoute};
