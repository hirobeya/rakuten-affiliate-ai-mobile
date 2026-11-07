'use strict';
// One fixed pre-send incident only. Not a retry policy. Contexts are minted from
// verified evidence and fresh storage reads, never from a posted JSON token.
const C=require('./contracts'),R=require('./failed-calibration-reconciliation'),Caps=require('./connection-probe-capability');
const MANIFEST=require('../../docs/rebuild-20261028/p3-presend-resume-20261108/evidence.json'),KIND='comparison-presend-resume-v1',contexts=new WeakMap();
function fail(){throw Object.assign(Error('resume_evidence_unverified'),{code:'resume_evidence_unverified'});}
function unused(a){return a&&['attempt','handoff','terminal'].every(k=>a[k]?.exists===false);}
function assess({namespace,audit,prior,receipt,proof=MANIFEST,probe=null}){
 const synthetic=probe&&Caps.valid(probe,probe.directory,probe.http);
 if(!synthetic&&C.hash(proof)!==C.hash(MANIFEST))fail();
 R.verifyReceipt(receipt,prior);
 const claim=namespace?.claim?.value;
 if(!namespace?.claim?.exists||namespace.calibration?.exists!==false||namespace.transport?.exists!==false||!unused(audit)||!claim||C.hash(claim)!==proof.claimHash||claim.experimentId!==MANIFEST.experimentId||claim.wireHash!==MANIFEST.wireHash||claim.state!=='claimed_hold'||claim.reservation!==8000||claim.reservationInput!==5000||claim.reservationOutput!==3000||claim.receiptHash!==C.hash(receipt)||C.hash(prior)!==MANIFEST.oldRecordsHash||C.hash(receipt)!==MANIFEST.oldReceiptHash)fail();
 if(proof.apiEvidence?.apiStatus!==409||proof.codeEvidence?.stopPhase!=='claim_readback'||proof.codeEvidence?.noDeletionPath!==true||proof.providerEvidence?.newerRequestDisplayed!==false||proof.liveExecutionApproval!==false)fail();
 const context=Object.freeze({kind:KIND,phase:'evidence_ready',claimHash:C.hash(claim),evidenceHash:C.hash(proof),namespaceHash:C.hash(namespace),receiptHash:C.hash(receipt),proof:structuredClone(proof),nonInference:!!synthetic,maxResumes:1,retainedReservation:8000,additionalReservation:0});
 contexts.set(context,C.hash(context));return context;
}
function valid(c,n){return !!c&&contexts.get(c)===C.hash(c)&&c.kind===KIND&&c.namespaceHash===C.hash(n);}
function requireValid(c,n){if(!valid(c,n))fail();}
function activate(c,attempt,handoff){if(!c||contexts.get(c)!==C.hash(c)||c.phase!=='evidence_ready'||attempt.claimHash!==c.claimHash||attempt.evidenceHash!==c.evidenceHash||attempt.resumeCount!==1||handoff.attemptHash!==C.hash(attempt)||handoff.state!=='runner_handoff')fail();const active=Object.freeze({...c,phase:'acquired',attemptHash:C.hash(attempt),handoffHash:C.hash(handoff)});contexts.set(active,C.hash(active));return active;}
function requireAcquired(c,n){requireValid(c,n);if(c.phase!=='acquired')fail();}
module.exports={activate,requireAcquired,KIND,MANIFEST,assess,valid,requireValid,unused};
