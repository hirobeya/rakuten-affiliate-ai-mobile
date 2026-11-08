'use strict';
// Append-only accounting evidence, not a replacement for runtime journals or
// an authenticated provider receipt. Never releases or subtracts a reservation.
const C=require('./contracts');
function record({observation,previousEvidenceHashes}){
 if(!observation||observation.source!=='user_formal_instruction_20261108'||observation.httpStatus!==400||observation.reportedTotalTokens!==5729||observation.outputLimit!==3000||observation.schemaMode!=='strict'||!Array.isArray(previousEvidenceHashes)||!previousEvidenceHashes.length||previousEvidenceHashes.some(h=>!/[a-f0-9]{64}/.test(h)))throw Error('second_failure_observation_invalid');
 return {version:1,kind:'second_failed_call_user_observation_pending_provider_reconciliation',observation:structuredClone(observation),previousEvidenceHashes:[...previousEvidenceHashes],observationHash:C.hash(observation),reportedTotalTokens:5729,providerRequestId:null,usageBreakdown:null,verifiedProviderReceipt:false,originalJournalsChanged:false,originalClaimsChanged:false,retainedHolds:{firstCall:6000,historicalSeparate:8000,comparison:8000},holdReleased:0,currentCapacityVerified:false,sendPermission:false,publication:false,requiredForVerifiedSettlement:['authenticated provider request ID and complete usage','matching immutable comparison claim, calibration and transport journal hashes','create-only receipt with confirmed noncached readback'],note:'User-reported usage is recorded once as evidence. It is not added to a held reservation a second time and does not imply currently available quota. No runtime ledger is settled by this document.'};
}
module.exports={record};
