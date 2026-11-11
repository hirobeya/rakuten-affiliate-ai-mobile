'use strict';
const {MODEL,trustedBundle}=require('./contract-v2');
const {hash,freeze}=require('./source');
const APPROVAL_VERSION='raw-source-fallback-live-v3';
const INITIAL_APPROVAL_VERSION='raw-source-fallback-initial-v2';
function usageValid(u){return !!u&&['prompt_tokens','completion_tokens','total_tokens'].every(k=>Number.isSafeInteger(u[k])&&u[k]>=0)&&u.total_tokens===u.prompt_tokens+u.completion_tokens;}
function usageObservationValid(u,now){return !!u&&['provider_logs','provider_response','independent_audit'].includes(u.source)&&['partial','complete'].includes(u.coverage)&&['minute','rolling_24h','historical'].includes(u.window)
 &&['calls','promptTokens','completionTokens','totalTokens'].every(k=>Number.isSafeInteger(u[k])&&u[k]>=0)&&u.totalTokens===u.promptTokens+u.completionTokens
 &&Number.isSafeInteger(u.periodStart)&&u.periodStart>=0&&Number.isSafeInteger(u.periodEnd)&&u.periodStart<=u.periodEnd&&u.periodEnd<=u.observedAt
 &&Number.isSafeInteger(u.observedAt)&&u.observedAt<=now&&now-u.observedAt<=60000
 &&(u.window==='historical'||u.periodEnd>=now-60000&&u.periodStart>=now-(u.window==='minute'?60000:86400000));}
const pick=(o,keys)=>Object.fromEntries(keys.map(k=>[k,o?.[k]]));
function admit({bundle,quality,approval,limits,capacity,observedUsage,state,executionSha,now=Date.now()}={}){
 const holds=[],need=(ok,reason)=>{if(!ok)holds.push(reason);};
 need(trustedBundle(bundle),'trusted_raw_bundle_required');
 if(!bundle||bundle.held)return {allow:false,holds:[...holds,'source_or_request_held']};
 const initial=approval?.version===INITIAL_APPROVAL_VERSION,mode=initial?'initial_unknown':'observed';
 need(approval?.authorized===true&&(initial||approval?.version===APPROVAL_VERSION)&&approval?.environment==='isolated_experiment','new_route_specific_approval_required');
 need(typeof executionSha==='string'&&/^[a-f0-9]{40}$/.test(executionSha)&&approval?.executionSha===executionSha,'execution_sha_mismatch');
 need(approval?.sourceHash===bundle.envelope.sourceHash&&approval?.requestHash===bundle.requestHash,'approval_input_mismatch');
 need(quality?.status==='failed'&&approval?.qualityHash===hash(quality),'explicit_quality_failure_binding_required');
 need(approval?.maxCalls===1&&approval?.automaticRetries===0,'single_call_approval_required');
 need(Number.isSafeInteger(approval?.expiresAt)&&approval.expiresAt>now&&approval.expiresAt-now<=60000,'approval_expired_or_overlong');
 need(state&&state.version==='raw-source-fallback-audit-v3'&&!state.halt&&state.unresolved===false,'audit_or_consumption_unknown');
 need(typeof state?.experimentId==='string'&&state.experimentId.length>0&&approval?.experimentId===state.experimentId&&approval?.auditId===state.auditId,'independent_experiment_binding_required');
 const fresh=x=>Number.isSafeInteger(x?.observedAt)&&x.observedAt<=now&&now-x.observedAt<=60000;
 need(limits?.model===MODEL&&fresh(limits)&&['rpm','rpd','tpm','tpd'].every(k=>Number.isSafeInteger(limits[k])&&limits[k]>0),'provider_limits_unverified');
 const ceiling=Math.min(8000,limits?.tpm||0);
 need(bundle.reservation<=ceiling,'reservation_over_provider_limit');
 need(Number.isSafeInteger(state?.minuteRequests)&&state.minuteRequests>=0&&state.minuteRequests+1<=Math.min(30,limits?.rpm||0),'minute_request_budget_exceeded');
 need(Number.isSafeInteger(state?.minuteTokens)&&state.minuteTokens>=0&&state.minuteTokens+bundle.reservation<=ceiling,'minute_token_budget_exceeded');
 need(Number.isSafeInteger(state?.attemptsTotal)&&state.attemptsTotal+1<=Math.min(1000,limits?.rpd||0),'experiment_request_budget_exceeded');
 need(capacity?.noUnknownConsumption===true&&capacity?.exclusive===true&&fresh(capacity),'fresh_exclusive_usage_required');
 need(usageObservationValid(observedUsage,now),'observed_usage_evidence_required');
 // A usage observation is never a balance. Known lower-bound consumption may
 // veto a new request, but partial/historical data cannot authorize more headroom.
 const inMinute=Number.isSafeInteger(observedUsage?.periodStart)&&observedUsage.periodStart>=now-60000&&observedUsage.periodEnd<=now;
 const inDay=Number.isSafeInteger(observedUsage?.periodStart)&&observedUsage.periodStart>=now-86400000&&observedUsage.periodEnd<=now;
 if(observedUsage?.window==='minute'||inMinute){need(observedUsage.calls+1<=Math.min(30,limits?.rpm||0),'observed_minute_requests_exhausted');need(observedUsage.totalTokens+bundle.reservation<=ceiling,'observed_minute_tokens_exhausted');}
 if(observedUsage?.window==='rolling_24h'||inDay){need(observedUsage.calls+1<=Math.min(1000,limits?.rpd||0),'observed_daily_requests_exhausted');need(observedUsage.totalTokens+bundle.reservation<=(limits?.tpd||0),'observed_daily_tokens_exhausted');}
 const balanceKeys=['remainingMinuteTokens','remainingDailyTokens','remainingDailyRequests'];
 need(balanceKeys.every(k=>capacity?.[k]===null||Number.isSafeInteger(capacity?.[k])&&capacity[k]>=0),'invalid_capacity_observation');
 for(const [k,limit,min]of [['remainingMinuteTokens','tpm',bundle.reservation],['remainingDailyTokens','tpd',bundle.reservation],['remainingDailyRequests','rpd',1]]){
  if(Number.isSafeInteger(capacity?.[k])){need(capacity[k]<=limits?.[limit],'capacity_above_observed_limits');need(capacity[k]>=min,'provider_capacity_insufficient');}
 }
 if(initial){
  need(balanceKeys.some(k=>capacity?.[k]===null),'initial_unknown_balance_required');
  need(approval?.unknownCapacityPolicy==='retain_null_one_call'&&approval?.acceptUnknownCapacity===true,'explicit_unknown_capacity_risk_acceptance_required');
  need(approval?.maxExperimentCalls===1&&state?.attemptsTotal===0&&state?.initialUsed===false,'initial_one_call_already_used');
  need(Number.isSafeInteger(approval?.maxReservedTokens)&&bundle.reservation<=approval.maxReservedTokens&&approval.maxReservedTokens<=ceiling,'initial_reservation_not_approved');
 }else need(balanceKeys.every(k=>Number.isSafeInteger(capacity?.[k])&&capacity[k]>=0),'measured_capacity_required');
 need(Number.isSafeInteger(state?.spentTokens)&&state.spentTokens>=0&&Number.isSafeInteger(state?.budgetTokens)&&state.budgetTokens>0&&state.budgetTokens<=150000&&state.spentTokens+bundle.reservation<=Math.min(state.budgetTokens,limits?.tpd||0),'experiment_budget_insufficient');
 return {allow:holds.length===0,holds,mode,reservation:bundle.reservation,evidence:freeze({
  limits:pick(limits,['model','rpm','rpd','tpm','tpd','observedAt']),
  capacity:pick(capacity,[...balanceKeys,'observedAt','noUnknownConsumption','exclusive']),
  observedUsage:pick(observedUsage,['source','coverage','window','periodStart','periodEnd','observedAt','calls','promptTokens','completionTokens','totalTokens'])})};
}
function initialApprovalTarget({prepared,state,executionSha}={}){
 const b=prepared?.bundle;
 if(!trustedBundle(b)||prepared?.quality?.status!=='failed'||state?.version!=='raw-source-fallback-audit-v2'||state.attemptsTotal!==0||state.initialUsed||state.halt||state.unresolved||!Number.isSafeInteger(state.budgetTokens)||state.budgetTokens<b.reservation||!/^[a-f0-9]{40}$/.test(executionSha||''))return {eligible:false,reason:'verified_quality_failure_and_fresh_independent_audit_required'};
 return {eligible:true,notAnAuthorization:true,template:{version:INITIAL_APPROVAL_VERSION,authorized:false,environment:'isolated_experiment',executionSha,experimentId:state.experimentId,auditId:state.auditId,
  sourceHash:b.envelope.sourceHash,requestHash:b.requestHash,qualityHash:hash(prepared.quality),maxCalls:1,maxExperimentCalls:1,automaticRetries:0,expiresAt:null,
  unknownCapacityPolicy:'retain_null_one_call',acceptUnknownCapacity:false,maxReservedTokens:b.reservation},
  unknownBalancesRemainNull:true,requiresNewExplicitApproval:true};
}
module.exports={APPROVAL_VERSION,INITIAL_APPROVAL_VERSION,admit,usageValid,usageObservationValid,initialApprovalTarget};
