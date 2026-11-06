'use strict';
// Append-only external-evidence reconciliation. Never changes old journals, releases holds or authorizes a send.
const C=require('./contracts'),A=require('./admission'),L=require('./live-calibration');
const REQUEST_ID='req_01m6qahsqme3yr5bqtzjq8skmz';
function fail(){throw Error('reconciliation_evidence_unverified');}
function createReceipt(j,e){
 if(!j||!['claim','calibration','transport'].every(k=>j[k]?.exists===true))fail();
 const claim=j.claim.value,l=j.calibration.value,t=j.transport.value;
 if(claim.wireHash!==L.WIRE_HASH||claim.state!=='claimed_hold'||claim.publication!==false||l.wireHash!==L.WIRE_HASH||l.status!=='unreconciled'||l.halt!=='calibration_stopped_hold'||l.publication!==false||l.requests!==1||l.reserved!==6000||l.spent!==0)fail();
 try{A.validateEvents(l);}catch{fail();}
 if(l.events.length!==1||l.events[0].id!==l.attemptId||l.events[0].status!=='pending'||l.events[0].input!==5000||l.events[0].output!==1000||l.events[0].tokens!==6000||t.halt!=='provider_http_error'||Object.keys(t.attempts||{}).length!==1)fail();
 const a=t.attempts[l.attemptId];if(!a||a.stage!=='draft'||a.requestHash!==L.WIRE_HASH||a.status!=='sent_unknown'||a.httpStatus!==400)fail();
 // Evidence is an authenticated operator attestation, not inferred from elapsed resets or posted usage alone.
 const keys=['requestId','model','httpStatus','errorCode','usage','requestedAt','observedAt','source','confirmedBy','terminalResponseConfirmed'];
 if(!e||Object.keys(e).some(k=>!keys.includes(k))||e.requestId!==REQUEST_ID||e.model!==C.MODEL||e.httpStatus!==400||e.errorCode!=='json_validate_failed'||e.terminalResponseConfirmed!==true||e.source!=='Groq Console Logs'||typeof e.confirmedBy!=='string'||!e.confirmedBy.trim()||e.confirmedBy.length>160||!Number.isSafeInteger(e.requestedAt)||Math.abs(e.requestedAt-l.events[0].at)>5000||!Number.isSafeInteger(e.observedAt)||e.observedAt<e.requestedAt)fail();
 if(!e.usage||Object.keys(e.usage).sort().join(',')!=='completion_tokens,prompt_tokens,total_tokens'||e.usage.prompt_tokens!==2729||e.usage.completion_tokens!==1000||e.usage.total_tokens!==3729)fail();
 return {version:1,kind:'terminal_failed_calibration_external_reconciliation',requestId:REQUEST_ID,wireHash:L.WIRE_HASH,attemptId:l.attemptId,originalHashes:{claim:C.hash(claim),calibration:C.hash(l),transport:C.hash(t)},providerEvidence:structuredClone(e),terminalHttpResponse:true,status:'accounted_failure_originals_preserved',reportedUsage:structuredClone(e.usage),originalReservation:6000,retainedDailyEncumbrance:6000,unusedConservativeHold:2271,holdReleased:0,requestCharge:1,publication:false,sendPermission:false,currentMinuteUsage:null,currentInFlightRequests:null,currentCapacityVerified:false,note:'Receipt closes only this known terminal failure for accounting. Original pending/unreconciled evidence and permanent claim remain immutable; all 6000 stays encumbered. A fresh organization-wide no-inflight/usage/exclusivity check is required before any minute charge treatment or independent send.'};
}
function verifyReceipt(receipt,journals){
 if(!receipt?.providerEvidence)fail();const expected=createReceipt(journals,receipt.providerEvidence);if(C.hash(receipt)!==C.hash(expected))fail();return expected;
}
module.exports={REQUEST_ID,createReceipt,verifyReceipt};
