'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const base='../../docs/experiments/raw-source-fallback-20261111/final-preflight-20261111/';
const target=require(base+'approval-target.BLOCKED.json'),source=require(base+'source-provenance.json'),history=require(base+'provider-history.json'),sandbox=require(base+'sandbox.json');
const old=require('../../docs/experiments/raw-source-fallback-20261111/quality-review-20261111/candidate.json');
const R=require('../../lib/room-writer-raw/route'),Safety=require('../../lib/room-writer-raw/safety');
test('incomplete source and unknown history cannot silently inherit old live bindings',()=>{
 assert.equal(source.caption.fixtureCharacters,1200);assert.equal(source.caption.complete,false);
 assert.equal(source.catchcopy.originalFixtureHasField,false);assert.equal(source.catchcopy.originalEmptyConfirmed,false);
 assert.equal(source.oldSourceHashMayBeReusedForLive,false);assert.equal(history.candidatePastCommunication,'unknown');
 assert.equal(target.eligible,false);assert.equal(target.authorized,false);assert.equal(target.acceptUnknownCapacity,false);assert.equal(target.expiresAt,null);
 for(const k of ['sourceHash','inputHash','requestHash','qualityHash']){assert.equal(target[k],null);assert.equal(target.historicalReference[k],old[k]);}
 assert.equal(target.executionSha,'d55b9bba7ff8bd356cfaf1b49000bac3d3b35f90');
 assert.notEqual(target.experimentId,old.newAudit.state.experimentId);assert.notEqual(target.auditId,old.newAudit.state.auditId);
 assert.equal(target.newAudit.state.attemptsTotal,0);assert.equal(target.newAudit.state.spentTokens,0);
});
test('blocked target produces no durable attempt and zero transport calls',async()=>{
 const prepared=await R.prepareFallback({item:old.source,assessLocal:()=>old.independentAssessment});
 let attempts=0,calls=0;
 const result=await R.execute({prepared,approval:target,executionSha:target.executionSha,audit:{state:()=>target.newAudit.state,begin:()=>{attempts++;throw Error('must not begin');}},transport:async()=>{calls++;throw Error('must not send');}});
 assert.equal(result.reason,'admission_rejected');assert.equal(result.calls,0);assert.equal(attempts,0);assert.equal(calls,0);
 assert(result.holds.includes('approval_input_mismatch'));assert(result.holds.includes('explicit_quality_failure_binding_required'));
 // Flipping permission booleans cannot resurrect the incomplete historical source.
 const gate=Safety.admit({bundle:prepared.bundle,quality:prepared.quality,approval:{...target,authorized:true,acceptUnknownCapacity:true,expiresAt:Date.now()+1000},state:target.newAudit.state,executionSha:target.executionSha,now:Date.now()});
 assert.equal(gate.allow,false);assert(gate.holds.includes('approval_input_mismatch'));
});
test('stopped nonpersistent Sandbox and Console counts remain evidence, never remaining balance',()=>{
 assert.equal(sandbox.sandbox.status,'stopped');assert.equal(sandbox.sandbox.persistent,false);
 assert.equal(sandbox.sandbox.networkPolicy.mode,'deny-all');assert.equal(sandbox.resumed,false);
 assert.equal(sandbox.activeSecretIntakeVerified,false);assert.equal(history.visibleLogRows,13);
 for(const k of ['remainingMinuteTokens','remainingDailyTokens','remainingDailyRequests'])assert.equal(history.usageUI[k],null);
 assert.equal(history.usageUI.doNotDeriveBalancesBySubtraction,true);assert.equal(history.realGenerationCallsThisTask,0);
});
