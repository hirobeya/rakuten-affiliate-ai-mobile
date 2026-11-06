'use strict';
// Offline preparation only. No transport, credentials, live grants, claim writes or reservation release.
const C=require('../../lib/urenavi-core/contracts'),W=require('../../lib/urenavi-core/chat-wire'),A=require('../../lib/urenavi-core/admission');
const {schemaAudit}=require('./json-failure-audit.cjs');
const BASE_HASH='351242d9c86b14994760b18621496db1f195f9d1f657db6317bb40f3062648b4';
function build(){
 const source=require('../../docs/rebuild-20261028/p3-first-call-gate/first-call-plan.json').selected.source;
 const base=W.compileCalibration1000(C.request('draft',source));
 if(C.hash(base.body)!==BASE_HASH)throw Error('frozen_wire_changed');
 const wire=structuredClone(base);wire.body.max_completion_tokens=3000;wire.serializedBody=JSON.stringify(wire.body);
 const changed=Object.keys(base.body).filter(k=>C.hash(base.body[k])!==C.hash(wire.body[k]));
 if(JSON.stringify(changed)!=='["max_completion_tokens"]')throw Error('comparison_not_single_variable');
 const wireHash=C.hash(wire.body),experimentId=C.hash({purpose:'output-budget-comparison-1000-to-3000-v1',baseWireHash:BASE_HASH,wireHash});
 return {kind:'offline-unsent-comparison',baseWireHash:BASE_HASH,wireHash,experimentId,changedFields:changed,sourceHash:C.hash(source),wire,schema:schemaAudit(wire.body.response_format.json_schema.schema),
 reservation:{priorObservedInput:2729,inputReservation:5000,inputSafetyMarginOverPriorObservation:2271,outputReservation:3000,total:8000,providerInputUpperCertified:false,additionalMarginOutsideReservation:0,nominalTPM:8000,nominalMinuteHeadroom:0,priorHeldReservation:6000,priorObservedConsumption:3729,combinedOldAndNewHold:14000,priorActualAlreadyCoveredByHold:true,historicalSeparateDailyHold:8000,conditionalDailyEncumbranceIncludingHistoricalHold:22000,note:'5000 is retained conservative experimental estimate, NOT a certified upper bound. 6000 covers the observed 3729: do not add both for the same request. Historical 8000 is a distinct retained conservative hold, not refreshed usage evidence.'},
 proposedClaim:{path:'urenavi-output-budget-comparison/'+experimentId+'/claimed.json',createOnly:true,independent:true,created:false,requiresOrganizationWideAdmission:true,oldPrefixUnchanged:'urenavi-first-call/'+BASE_HASH},
 approval:null,accountSnapshot:null,isolationSnapshot:null,liveApproved:false,publication:false,copyable:false,gate:'HOLD',
 blockers:['previous_unreconciled_pending_send','fresh_org_project_usage_reset_and_callers_unverified','input_reservation_not_provider_certified','comparison_live_path_not_enabled','observation_patch_not_deployed_in_inspected_preview']};
}
// Run existing gate on cloned inputs only. Never treat a new empty ledger as organization evidence.
function probe(account,ledger,now=0){const p=structuredClone(account),l=structuredClone(ledger);try{const reserved=A.single(p,l,5000,'comparison-preflight-only',now,3000,p.mode);return {allowed:true,reserved};}catch(e){return {allowed:false,reason:e.message};}}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={BASE_HASH,build,probe};
