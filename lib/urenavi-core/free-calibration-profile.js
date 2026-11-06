'use strict';
// Comparison-only estimated-input policy. Merely preparing this module never authorizes inference.
const C=require('./contracts');
const NAME='free-limited-calibration-v1',WIRE_HASH='ab9f962665d02755d3e2fc683969472466e2da2964e7ce0cb7a13aa3d872d053';
const SOURCE_HASH='1b142873671ba6906329a4217cc8c5a2811feba46c3fa27fdefcbd8ac2854c91';
const MANIFEST=Object.freeze({profile:NAME,wireHash:WIRE_HASH,sourceHash:SOURCE_HASH,serializedUtf8Bytes:9791,inputSizeCapBytes:9791,localVisibleComponents:2527,localWholeHttpTokens:2579,tokenizer:'gpt-tokenizer-4.1.0/o200k_harmony',priorRequestId:'req_01m6qahsqme3yr5bqtzjq8skmz',priorMeasuredInput:2729,inputReservation:5000,outputLimit:3000,totalReservation:8000,providerBoundCertified:false});
const MANIFEST_HASH=C.hash(MANIFEST),nat=x=>Number.isSafeInteger(x)&&x>=0;
function fail(code){throw Object.assign(Error(code),{code});}
function validate({grant:g,inputProof:p,wire,source,receiptHash,now,runtimeMode,executionSha,enabled=false}){
 if(enabled!==true||g?.profile!==NAME)fail('free_profile_not_enabled');
 if(!wire||C.hash(wire.body)!==WIRE_HASH||wire.serializedBody!==JSON.stringify(wire.body)||Buffer.byteLength(wire.serializedBody)!==MANIFEST.serializedUtf8Bytes||C.hash(source)!==SOURCE_HASH)fail('free_input_envelope_mismatch');
 if(g.estimatedInputAccepted!==true||g.providerCountMayExceedReservationAccepted!==true||g.noMinuteHeadroomAccepted!==true||typeof g.residualRiskApprovalReference!=='string'||!g.residualRiskApprovalReference.trim()||g.residualRiskApprovalReference.length>1024)fail('free_residual_risk_approval_required');
 if(!p||p.kind!=='fixed-wire-input-estimate'||p.profile!==NAME||p.wireHash!==WIRE_HASH||p.receiptHash!==receiptHash||p.manifestHash!==MANIFEST_HASH||p.inputReservation!==5000||p.providerBoundCertified!==false||p.upperTokens!==null||!nat(p.observedAt)||p.observedAt>now||!nat(p.validUntil)||p.validUntil<=now)fail('free_estimate_evidence_invalid');
 if(runtimeMode==='live'&&(!/^[a-f0-9]{40}$/.test(executionSha||'')||g.approvedExecutionSha!==executionSha))fail('free_execution_sha_not_approved');
 return {profile:NAME,inputReservationKind:'estimate',providerBoundCertified:false,manifestHash:MANIFEST_HASH,manifest:MANIFEST};
}
module.exports={NAME,MANIFEST,MANIFEST_HASH,validate};
