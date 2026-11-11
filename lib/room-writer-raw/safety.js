'use strict';
const {MODEL,trustedBundle}=require('./contract');
const APPROVAL_VERSION='raw-source-fallback-live-v1';
function admit({bundle,approval,limits,capacity,state,executionSha,now=Date.now()}={}){
 const holds=[],need=(ok,reason)=>{if(!ok)holds.push(reason);};
 need(trustedBundle(bundle),'trusted_raw_bundle_required');
 if(!bundle||bundle.held)return {allow:false,holds:[...holds,'source_or_request_held']};
 need(approval?.version===APPROVAL_VERSION&&approval?.environment==='isolated_experiment','new_route_specific_approval_required');
 need(typeof executionSha==='string'&&/^[a-f0-9]{40}$/.test(executionSha)&&approval?.executionSha===executionSha,'execution_sha_mismatch');
 need(approval?.sourceHash===bundle.envelope.sourceHash&&approval?.requestHash===bundle.requestHash,'approval_input_mismatch');
 need(approval?.maxCalls===1&&approval?.automaticRetries===0,'single_call_approval_required');
 need(Number.isSafeInteger(approval?.expiresAt)&&approval.expiresAt>now&&approval.expiresAt-now<=60000,'approval_expired_or_overlong');
 need(state&&state.version==='raw-source-fallback-audit-v1'&&!state.halt&&state.unresolved===false,'audit_or_consumption_unknown');
 const fresh=x=>Number.isSafeInteger(x?.observedAt)&&x.observedAt<=now&&now-x.observedAt<=60000;
 need(limits?.model===MODEL&&fresh(limits)&&['rpm','rpd','tpm','tpd'].every(k=>Number.isSafeInteger(limits[k])&&limits[k]>0),'provider_limits_unverified');
 const ceiling=Math.min(8000,limits?.tpm||0);
 need(bundle.reservation<=ceiling,'reservation_over_provider_limit');
 need(Number.isSafeInteger(state?.minuteRequests)&&state.minuteRequests>=0&&state.minuteRequests+1<=Math.min(30,limits?.rpm||0),'minute_request_budget_exceeded');
 need(Number.isSafeInteger(state?.minuteTokens)&&state.minuteTokens>=0&&state.minuteTokens+bundle.reservation<=ceiling,'minute_token_budget_exceeded');
 need(capacity?.noUnknownConsumption===true&&capacity?.exclusive===true&&fresh(capacity),'fresh_exclusive_usage_required');
 // No initial-S3 exception is accepted here. Missing balances stay unknown.
 need(['remainingMinuteTokens','remainingDailyTokens','remainingDailyRequests'].every(k=>Number.isSafeInteger(capacity?.[k])&&capacity[k]>=0),'measured_capacity_required');
 need(capacity?.remainingMinuteTokens<=limits?.tpm&&capacity?.remainingDailyTokens<=limits?.tpd&&capacity?.remainingDailyRequests<=limits?.rpd,'capacity_above_observed_limits');
 need(bundle.reservation<=capacity?.remainingMinuteTokens&&bundle.reservation<=capacity?.remainingDailyTokens&&capacity?.remainingDailyRequests>=1,'provider_capacity_insufficient');
 need(Number.isSafeInteger(state?.spentTokens)&&state.spentTokens>=0&&Number.isSafeInteger(state?.budgetTokens)&&state.budgetTokens>0&&state.budgetTokens<=150000&&state.spentTokens+bundle.reservation<=state.budgetTokens,'experiment_budget_insufficient');
 return {allow:holds.length===0,holds,reservation:bundle.reservation,remainingCapacity:capacity||null};
}
function usageValid(u){return !!u&&['prompt_tokens','completion_tokens','total_tokens'].every(k=>Number.isSafeInteger(u[k])&&u[k]>=0)&&u.total_tokens===u.prompt_tokens+u.completion_tokens;}
module.exports={APPROVAL_VERSION,admit,usageValid};
