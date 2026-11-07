'use strict';
// Fixed 3000-output experiment policy only; no generation, I/O or permission inference.
const path=require('node:path'),os=require('node:os'),C=require('./contracts'),A=require('./admission'),W=require('./chat-wire'),R=require('./failed-calibration-reconciliation'),F=require('./free-calibration-profile');
const WIRE_HASH='ab9f962665d02755d3e2fc683969472466e2da2964e7ce0cb7a13aa3d872d053',BASE_HASH='351242d9c86b14994760b18621496db1f195f9d1f657db6317bb40f3062648b4';
const EXPERIMENT_ID=C.hash({purpose:'output-budget-comparison-1000-to-3000-v1',baseWireHash:BASE_HASH,wireHash:WIRE_HASH});
const PREFIX='urenavi-output-budget-comparison/'+EXPERIMENT_ID,STATE_DIRECTORY=path.join(os.tmpdir(),'urenavi-comparison-'+EXPERIMENT_ID);
const SOURCE=require('../../docs/rebuild-20261028/p3-first-call-gate/first-call-plan.json').selected.source;
const nat=x=>Number.isSafeInteger(x)&&x>=0,nonempty=x=>typeof x==='string'&&!!x.trim()&&x.length<=1024;
const E=require('./exclusive-capacity-evidence');
function fail(code){throw Object.assign(Error(code),{code});}
function wire(){const w=W.compileRequest(C.request('draft',SOURCE));if(C.hash(w.body)!==WIRE_HASH)fail('comparison_wire_mismatch');return w;}
function validate({snapshot:s,prior,receipt,now,directory=STATE_DIRECTORY,runtimeMode='live',estimateProfileEnabled=false,executionSha=null,readOnlyFacts=false}){
 if(!['live','offline'].includes(runtimeMode)||runtimeMode==='live'&&directory!==STATE_DIRECTORY)fail('comparison_runtime_configuration');
 if(!s||Object.keys(s).sort().join(',')!=='account,capacityProof,grant,inputProof,isolation')fail('comparison_snapshot_contract');
 R.verifyReceipt(receipt,prior);const receiptHash=C.hash(receipt),g=s.grant,p=s.inputProof,a=s.account,i=s.isolation;let v=s.capacityProof;
 if(!nat(now)||!g||g.mode!==(runtimeMode==='live'?'live-one-call':'offline-test-only')||g.experimentId!==EXPERIMENT_ID||g.wireHash!==WIRE_HASH||g.model!==C.MODEL||g.stage!=='draft'||g.maxRequests!==1||g.maxCompletionTokens!==3000||g.inputReservation!==5000||g.receiptHash!==receiptHash||!readOnlyFacts&&(!nonempty(g.approvalReference)||g.explicitUserApproval!==true||!nat(g.expiresAt)||now>=g.expiresAt))fail('comparison_one_call_permission_required');
 if(readOnlyFacts&&(!estimateProfileEnabled||g.profile!==F.NAME))fail('free_profile_not_enabled');
 let inputFacts;
 if(estimateProfileEnabled||g.profile===F.NAME){inputFacts=F.validate({grant:g,inputProof:p,wire:wire(),source:SOURCE,receiptHash,now,runtimeMode,executionSha,enabled:estimateProfileEnabled,readOnlyFacts});}
 else{
 if(!p||p.kind!=='provider-input-upper-bound'||p.wireHash!==WIRE_HASH||p.model!==C.MODEL||p.providerTemplateIncluded!==true||p.schemaIncluded!==true||p.providerRateAccountingIncluded!==true||!nat(p.upperTokens)||p.upperTokens<1||p.upperTokens>5000||!nonempty(p.source)||!nonempty(p.reference)||!nonempty(p.confirmedBy)||!nat(p.observedAt)||p.observedAt>now||!nat(p.validUntil)||p.validUntil<=now)fail('comparison_input_upper_unverified');
  inputFacts={profile:'provider-certified-comparison',inputReservationKind:'provider-upper-bound',providerBoundCertified:true};
 }

 if(v?.kind===E.KIND){if(inputFacts.inputReservationKind!=='estimate')fail('exclusive_ledger_requires_free_profile');v=E.compile({proof:v,isolation:i,account:a,receipt,now});}
 if(inputFacts.inputReservationKind==='estimate'&&(a?.plan!=='Free'||v?.plan!=='Free'||a.otherWindowTokens!==0||a.otherWindowRequests!==0||a.project?.otherWindowTokens!==0||a.project?.otherWindowRequests!==0))fail('free_plan_or_idle_window_unverified');
 A.validate(a,runtimeMode==='live'?'live-calibration':'offline-synthetic');
 if(!a.project||a.organization!=='Personal'||a.projectName!=='Default Project'||a.rpm!==30||a.tpm!==8000||a.dailyRequests!==1000||a.dailyTokens!==200000)fail('comparison_account_scope_unverified');
 if(!v||v.organizationName!==a.organization||v.projectName!==a.projectName||v.model!==C.MODEL||v.receiptHash!==receiptHash||v.scope!=='organization-and-project-all-callers'||v.unresolvedRequests!==0||v.unresolvedReservations!==0||v.excludedAccountedRequestId!==R.REQUEST_ID||!nonempty(v.source)||!nonempty(v.reference)||!nonempty(v.confirmedBy)||!nonempty(v.resetEvidence)||!nonempty(v.pendingCheckReference)||!nat(v.dataAsOf)||v.dataAsOf>now||now-v.dataAsOf>=60000||!nat(v.maxReportingLagMs)||v.maxReportingLagMs>=60000||!nat(v.observedAt)||v.observedAt>now||now-v.observedAt+v.maxReportingLagMs>=60000||!nat(v.validUntil)||v.validUntil<=now||v.validUntil>a.validUntil)fail('comparison_capacity_evidence_unverified');
 // Components are OTHER requests only: old actual3729 is represented once by the full retained6000.
 for(const [scope,policy]of [['organization',a],['project',a.project]]){
  const c=v[scope];if(!c||!Array.isArray(c.otherDailyComponents)||!['minuteRemainingTokens','minuteRemainingRequests','dayRemainingTokens','dayRemainingRequests'].every(k=>nat(c[k])))fail('comparison_usage_unknown');
  const ids=new Set();let tokens=0,requests=0;
  for(const x of c.otherDailyComponents){if(!x||!nonempty(x.id)||ids.has(x.id)||x.id===R.REQUEST_ID||x.id===receipt.attemptId||!nat(x.tokens)||!nat(x.requests))fail('comparison_daily_double_count_or_unknown');ids.add(x.id);tokens+=x.tokens;requests+=x.requests;}
  if(tokens!==policy.otherTokens||requests!==policy.otherRequests||c.minuteRemainingTokens>policy.tpm||c.minuteRemainingRequests>policy.rpm||c.dayRemainingTokens>policy.dailyTokens||c.dayRemainingRequests>policy.dailyRequests||c.minuteRemainingTokens<8000||c.minuteRemainingRequests<1||c.dayRemainingTokens<8000||c.dayRemainingRequests<1)fail('comparison_remaining_capacity');
 }
 if(!i||i.allCallersPaused!==true||i.holdUntilReconciled!==true||i.receiptHash!==receiptHash||!nonempty(i.confirmedBy)||!nat(i.observedAt)||i.observedAt<v.observedAt||i.observedAt>now||!nat(i.exclusiveUntil)||i.exclusiveUntil<=now||!i.callers||['production','preview','actions','local-cli','other-playground'].some(k=>i.callers[k]?.paused!==true||!nonempty(i.callers[k]?.evidence)))fail('comparison_exclusivity_unverified');
 // Age alone never resolves an unknown send. The validated terminal receipt AND fresh current evidence are both required.
 if(now<receipt.providerEvidence.observedAt+60000)fail('comparison_old_minute_hold');
 const effective=structuredClone(a);effective.validUntil=Math.min(a.validUntil,v.validUntil,...(readOnlyFacts?[]:[g.expiresAt]),p.validUntil,i.exclusiveUntil);
 effective.otherTokens+=receipt.retainedDailyEncumbrance;effective.otherRequests+=receipt.requestCharge;
 effective.project.otherTokens+=receipt.retainedDailyEncumbrance;effective.project.otherRequests+=receipt.requestCharge;
 if(effective.splitApplicability==='applicable'){if(!effective.splitTokens)fail('split_token_limits_unknown');}
 else if(effective.splitApplicability!=='not-applicable'||effective.splitTokens!=null)fail('split_token_limits_unknown');
 const ledger={spent:0,reserved:0,requests:0,events:[],lastClock:0,halt:null};A.single(effective,ledger,5000,EXPERIMENT_ID,now,3000,effective.mode);
 wire();return {...inputFacts,capacityBasis:v.basis||{kind:'external-current-capacity-proof'},effectiveAccount:effective,receiptHash,reservation:{input:5000,output:3000,total:8000},retainedDaily:6000,oldActualCountedSeparately:false,expiry:effective.validUntil};
}
module.exports={WIRE_HASH,BASE_HASH,EXPERIMENT_ID,PREFIX,STATE_DIRECTORY,SOURCE,wire,validate};
