'use strict';
const {hash,freeze}=require('./source');
const {history}=require('./gemini-history');
const template=freeze(require('../../docs/experiments/gemini-comparison-20261113/next-execution.json'));
const PREFIX='urenavi-gemini-comparison-20261113';
function assess(grant,scope,now=Date.now()){
 const reasons=[];
 if(grant?.status!=='approved')reasons.push('new_explicit_approval_required');
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{7,100}$/.test(grant?.approvalId||'')||grant.approvalId===history.approval.id)reasons.push('new_approval_id_required');
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{7,100}$/.test(grant?.executionId||''))reasons.push('new_execution_id_required');
 if(typeof grant?.approvedBy!=='string'||!grant.approvedBy.trim()||!Number.isFinite(Date.parse(grant?.approvedAt))||Date.parse(grant.approvedAt)>now)reasons.push('approver_and_time_required');
 if(['itemCode','model','requestHash'].some(k=>grant?.[k]!==scope?.[k])||grant?.maxCalls!==1)reasons.push('exact_one_call_scope_required');
 if(grant?.priorHistory?.approvalId!==history.approval.id||grant?.priorHistory?.classification!=='D'||grant?.priorHistory?.historyHash!==hash(history)||grant?.independentTrialAcknowledged!==true)reasons.push('unresolved_prior_history_must_be_preserved');
 const f=grant?.freeTierConfirmation;
 if(f?.verified!==true||!['rpm','tpm','rpd'].every(k=>Number.isFinite(f?.limits?.[k])&&f.limits[k]>0)||f?.projectId!=='gen-lang-client-0210652653'||f?.tier!=='free'||f?.model!==scope?.model||typeof f?.evidenceReference!=='string'||!f.evidenceReference||!Number.isFinite(f?.observedAtMs)||f.observedAtMs>now||!Number.isFinite(f?.validUntilMs)||now>=f.validUntilMs)reasons.push('fresh_free_tier_confirmation_required');
 const allow=reasons.length===0;
 const namespace=allow?PREFIX+'/independent/'+hash([grant.approvalId,grant.executionId]):null;
 return {allow,reasons,approvalId:allow?grant.approvalId:null,executionId:allow?grant.executionId:null,status:allow?'approved_independent_trial':'awaiting_explicit_approval',priorClassification:'D',namespace,
  approvalPath:allow?PREFIX+'/independent-approvals/'+hash(grant.approvalId)+'.json':null,
  claimPath:allow?namespace+'/requests/'+hash([scope.itemCode,scope.model,scope.requestHash])+'/claim.json':null,
  resultPath:allow?namespace+'/requests/'+hash([scope.itemCode,scope.model,scope.requestHash])+'/result.json':null};
}
module.exports={template,assess};
