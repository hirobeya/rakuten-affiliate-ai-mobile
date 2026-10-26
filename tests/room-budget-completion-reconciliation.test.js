'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reconcileCompletedLease}=require('../lib/room-provider-budget');
function setup(){let row={revision:'old',models:{model:{tokenLimit:8000,remainingTokens:5000}},lease:{token:'same-sent-lease',sent:true,until:121000}};return {store:{load:async()=>structuredClone(row),swap:async(rev,next)=>{assert.equal(rev,row.revision);row=structuredClone(next);return true;}},row:()=>row};}
const proof={recordedAt:6000,model:'model',response:{usage:{prompt_tokens:3024,completion_tokens:1776},rateLimit:{'x-ratelimit-limit-tokens':'8000','x-ratelimit-remaining-tokens':'4613','x-ratelimit-remaining-requests':'999','x-ratelimit-reset-tokens':'25.402s','x-ratelimit-reset-requests':'1m26.4s'}}};
test('only a persisted known completion inside the exact sent lease reconciles budget without calls or quota refunds',async()=>{
 const x=setup(),out=await reconcileCompletedLease({store:x.store,records:[proof],now:()=>200000});assert.equal(x.row().lease,null);assert.equal(out.recordedInputTokens,3024);assert.equal(out.recordedOutputTokens,1776);assert.equal(x.row().models.model.remainingTokens,4613);assert.ok(x.row().models.model.tokenResetAt>200000,'re-observe conservatively, do not pretend tokens are replenished');
});
test('elapsed time, missing usage, wrong time, multiple completions and uncertain consumption never clear a sent lease',async()=>{
 const invalid=[[],[{...proof,recordedAt:999}],[{...proof,recordedAt:121001}],[{...proof,response:{...proof.response,usage:null}}],[{...proof,response:{...proof.response,rateLimit:{'x-ratelimit-remaining-tokens':'4613','x-ratelimit-remaining-requests':'999'}}}],[proof,proof]];
 for(const records of invalid){const x=setup();await assert.rejects(reconcileCompletedLease({store:x.store,records,now:()=>999999}),e=>e.status===503);assert.equal(x.row().lease.sent,true);}
 const x=setup(),old=x.store.load;x.store.load=async()=>({...await old(),uncertain:{reason:'usage_unknown'}});await assert.rejects(reconcileCompletedLease({store:x.store,records:[proof]}));assert.equal(x.row().lease.sent,true);
});
