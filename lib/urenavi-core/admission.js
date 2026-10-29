'use strict';
// Pure admission rules. Persistence and exclusive locking belong to local-engine.
const C=require('./contracts');
const stages=['draft','review','rewrite','rereview'];
const nat=x=>Number.isSafeInteger(x)&&x>=0;
function fail(code){throw Error(code);}
function validate(p,mode='offline-synthetic'){
 if(!p||!['offline-synthetic','live-calibration'].includes(mode)||p.mode!==mode)fail('capacity_unverified');
 for(const k of ['context','input','output','perRequest','rpm','tpm','dailyTokens','dailyRequests','otherTokens','otherRequests','otherWindowTokens','otherWindowRequests','validUntil'])if(!nat(p[k]))fail('admission_unknown:'+k);
 if(!p.id||!p.day||!p.stageInputs||stages.some(s=>!nat(p.stageInputs[s])))fail('admission_unknown');
 if(p.output<C.MAX_OUTPUT)fail('model_output_limit');
 if(p.splitTokens)for(const k of ['itpm','otpm','otherInput','otherOutput'])if(!nat(p.splitTokens[k]))fail('split_token_limits_unknown');
 if(p.project)for(const k of ['rpm','tpm','dailyTokens','dailyRequests','otherTokens','otherRequests','otherWindowTokens','otherWindowRequests'])if(!nat(p.project[k]))fail('project_limits_unknown');
}
function plan(p){validate(p);return stages.map(stage=>({stage,input:p.stageInputs[stage],output:C.MAX_OUTPUT,total:p.stageInputs[stage]+C.MAX_OUTPUT,method:'enforced stage budget, NOT predicted future payload size'}));}
function preflight(p,l,now){
 validate(p);if(!nat(now)||now>=p.validUntil)fail('account_snapshot_expired');
 const rows=plan(p),total=rows.reduce((a,r)=>a+r.total,0);
 if(rows.some(r=>r.input>p.input||r.total>p.context))fail('model_capacity');
 if(rows.some(r=>r.total>p.perRequest))fail('request_capacity');
 // Full workflow money/day budget; minute windows are checked only immediately before each send.
 if(l.spent+l.reserved+total+p.otherTokens>p.dailyTokens)fail('account_token_budget');
 if(l.requests+4+p.otherRequests>p.dailyRequests)fail('account_request_budget');
 if(p.project){
  if(l.spent+l.reserved+total+p.project.otherTokens>p.project.dailyTokens)fail('project_token_budget');
  if(l.requests+4+p.project.otherRequests>p.project.dailyRequests)fail('project_request_budget');
 }
 return rows;
}
function validateEvents(l){
 if(!Array.isArray(l.events)||l.events.length!==l.requests||!nat(l.lastClock))fail('rate_ledger_corrupt');
 const ids=new Set();let spent=0;
 for(const e of l.events){
  if(!e||typeof e.id!=='string'||ids.has(e.id)||!nat(e.at)||e.at>l.lastClock||!nat(e.tokens)||!nat(e.input)||!nat(e.output)||e.input+e.output!==e.tokens||!['pending','settled'].includes(e.status))fail('rate_ledger_corrupt');
  ids.add(e.id);
  if(e.status==='settled'){if(!nat(e.finished)||e.finished<e.at||e.finished>l.lastClock||!nat(e.actual)||e.actual>e.tokens)fail('rate_ledger_corrupt');spent+=e.actual;}
 }
 if(spent!==l.spent)fail('rate_ledger_corrupt');
}
function reserve(p,l,n,stage,id,now,outputLimit=C.MAX_OUTPUT,mode='offline-synthetic'){
 validate(p,mode);validateEvents(l);if(!nat(now)||now<l.lastClock)fail('clock_regressed');
 if(now>=p.validUntil)fail('account_snapshot_expired');
 if(l.events.some(e=>e.status==='pending'))fail('unreconciled_send');
 if(l.events.some(e=>e.id===id))fail('duplicate_suppressed');
 if(!n||!nat(n.input)||n.output!==outputLimit||n.total!==n.input+n.output)fail('reservation_unknown');
 if(n.input>p.input||n.total>p.context)fail('model_capacity');
 if(n.total>p.perRequest)fail('request_capacity');
 if(n.input>p.stageInputs[stage])fail('stage_capacity');
 // Keep full reservations for settled calls until 60s AFTER receipt: conservative local policy.
 // Pending sends never expire. Provider reset semantics are not asserted by this local window.
 const active=l.events.filter(e=>e.status==='pending'||now-e.finished<60000);
 if(active.length+p.otherWindowRequests+1>p.rpm)fail('rpm_capacity');
 if(active.reduce((a,e)=>a+e.tokens,0)+p.otherWindowTokens+n.total>p.tpm)fail('tpm_capacity');
 if(p.splitTokens){
  if(active.reduce((n,e)=>n+e.input,0)+p.splitTokens.otherInput+n.input>p.splitTokens.itpm)fail('itpm_capacity');
  if(active.reduce((n,e)=>n+e.output,0)+p.splitTokens.otherOutput+n.output>p.splitTokens.otpm)fail('otpm_capacity');
 }
 if(p.project){
  if(active.length+p.project.otherWindowRequests+1>p.project.rpm)fail('project_rpm_capacity');
  if(active.reduce((n,e)=>n+e.tokens,0)+p.project.otherWindowTokens+n.total>p.project.tpm)fail('project_tpm_capacity');
 }
 l.lastClock=now;l.events.push({id,at:now,input:n.input,output:n.output,tokens:n.total,status:'pending'});
 return n;
}
function settle(l,id,usage,now){
 const e=l.events.find(e=>e.id===id);
 if(!e||e.status!=='pending'||!nat(now)||now<l.lastClock||!nat(usage.total_tokens)||usage.total_tokens>e.tokens)fail('rate_usage_inconsistent');
 e.status='settled';e.actual=usage.total_tokens;e.finished=now;l.lastClock=now;
}
function before(p,l,req,stage,id,now){return reserve(p,l,C.estimate(req),stage,id,now);}
// One-step calibration reservation: never reserves the other three workflow stages.
// Live mode is opt-in for the one-step runner only; supplied reservations are not provider bounds.
function single(p,l,input,id,now,outputLimit=C.MAX_OUTPUT,mode='offline-synthetic'){
 if(![1000,C.MAX_OUTPUT].includes(outputLimit))fail('output_limit_unknown');
 validate(p,mode);validateEvents(l);
 if(l.halt)fail('calibration_ledger_halted');
 if(l.requests>=1)fail('one_call_limit');
 if(!nat(input))fail('input_bound_unknown');
 const n={input,output:outputLimit,total:input+outputLimit};
 if(l.spent+l.reserved+n.total+p.otherTokens>p.dailyTokens)fail('account_token_budget');
 if(l.requests+1+p.otherRequests>p.dailyRequests)fail('account_request_budget');
 if(p.project){
  if(l.spent+l.reserved+n.total+p.project.otherTokens>p.project.dailyTokens)fail('project_token_budget');
  if(l.requests+1+p.project.otherRequests>p.project.dailyRequests)fail('project_request_budget');
 }
 reserve(p,l,n,'draft',id,now,outputLimit,mode);l.requests++;l.reserved+=n.total;return n;
}
module.exports={validate,plan,preflight,validateEvents,before,settle,single};
