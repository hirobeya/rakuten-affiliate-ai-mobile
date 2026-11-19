'use strict';
const {freeze}=require('./source');
const history=freeze(require('../../docs/experiments/gemini-comparison-20261113/history.json'));
function verifiedPreDispatch(record){
 const p=record.verifiedPreDispatchProof,start=Date.parse(record.executionWindow?.from||record.at),end=Date.parse(record.executionWindow?.to||record.at);
 return !!p&&/^[a-f0-9]{64}$/.test(record.requestHash||'')&&Number.isFinite(start)&&Number.isFinite(end)&&start<=end&&p.itemCode===record.itemCode&&p.model===record.model&&p.requestHash===record.requestHash&&p.providerDispatch===false
  &&typeof p.reviewedBy==='string'&&p.reviewedBy.trim().length>0&&Number.isFinite(Date.parse(p.reviewedAt))
  &&Number.isFinite(Date.parse(p.periodStart))&&Number.isFinite(Date.parse(p.periodEnd))&&Date.parse(p.periodEnd)>=Date.parse(p.periodStart)&&start>=Date.parse(p.periodStart)&&end<=Date.parse(p.periodEnd)
  &&Array.isArray(p.evidence)&&p.evidence.length>0&&p.evidence.every(e=>typeof e.reference==='string'&&e.reference.trim()&&/^[a-f0-9]{64}$/.test(e.sha256||''));
}
function decision(scope,ledger,record=history){
 const approval=record.approval;
 if(!approval||['itemCode','model','requestHash'].some(k=>approval[k]!==scope[k])||approval.maxCalls!==1)
  return {allow:false,reason:'outside_one_call_approval',history:[]};
 // Existing v1 claim is conservatively retained, never reset during migration.
 if(ledger?.approvalClaim||ledger?.legacy?.claim||ledger?.legacy?.result||ledger?.claim||ledger?.result)
  return {allow:false,reason:'existing_attempt_do_not_resend',history:[]};
 const matching=record.records.filter(r=>r.itemCode===scope.itemCode&&r.model===scope.model&&(!r.requestHash||r.requestHash===scope.requestHash));
 const unresolved=matching.filter(r=>r.classification!=='A'||r.providerSent!==false||!verifiedPreDispatch(r));
 if(unresolved.length)return {allow:false,reason:'target_history_unresolved',history:unresolved};
 // Absence of a matching historical record is not evidence of an unused grant.
 if(!matching.length)return {allow:false,reason:'target_history_evidence_missing',history:[]};
 return {allow:true,reason:null,history:matching};
}
module.exports={decision,history};
