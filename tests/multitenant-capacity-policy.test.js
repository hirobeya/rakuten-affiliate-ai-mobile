'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluateCapacity,chooseRoute}=require('../lib/urenavi-core/multitenant-capacity-policy');
const base=()=>({now:1000,account:{subscriptionActive:true},
 provider:{status:'verified',windowEndsAt:2000,externalUsageKnown:true,requestLimit:10,requestUsed:4,requestReserved:1,tokenLimit:10000,tokenUsed:3000,tokenReserved:1000},
 tenant:{id:'user-a',requestLimit:3,requestUsed:1,requestReserved:1},estimate:{requests:1,tokens:2000}});
test('eligible result is only a request for a durable atomic reservation',()=>{
 const result=evaluateCapacity(base());
 assert.equal(result.allow,true);assert.equal(result.reservationCreated,false);assert.equal(result.providerCalls,0);
 assert.equal(chooseRoute({capacity:result}).route,'await_atomic_reservation');
});
test('tenant exhaustion does not disable verified local copy',()=>{
 const input=base();input.tenant.requestUsed=2;
 const result=evaluateCapacity(input);assert.equal(result.reason,'tenant_capacity_exhausted');
 assert.equal(chooseRoute({localCopyApproved:true,capacity:result}).route,'local');
});
test('unknown external use, limits and historical observations never imply free capacity',()=>{
 for(const mutator of [
  x=>{x.provider.externalUsageKnown=false;},
  x=>{x.provider.requestUsed=null;},
  x=>{x.provider.status='historical';},
  x=>{x.provider.windowEndsAt=999;},
  x=>{x.provider.tokenReserved=null;},
  x=>{x.tenant.requestUsed=null;}
 ]){const input=base();mutator(input);assert.equal(evaluateCapacity(input).allow,false);}
});
test('shared provider limits and reserved tokens block other users',()=>{
 const a=base();a.provider.requestReserved=6;assert.equal(evaluateCapacity(a).reason,'provider_capacity_exhausted');
 const b=base();b.provider.tokenReserved=6000;assert.equal(evaluateCapacity(b).reason,'provider_capacity_exhausted');
});
test('inactive subscription, identity, estimates and negative balances rejected',()=>{
 const a=base();a.account.subscriptionActive=false;assert.equal(evaluateCapacity(a).reason,'subscription_inactive');
 const b=base();b.tenant.id=' ';assert.equal(evaluateCapacity(b).reason,'missing_tenant_identity');
 const c=base();c.estimate.tokens=-1;assert.equal(evaluateCapacity(c).reason,'invalid_estimate');
 const d=base();d.tenant.requestReserved=-1;assert.equal(evaluateCapacity(d).reason,'usage_unknown');
});
