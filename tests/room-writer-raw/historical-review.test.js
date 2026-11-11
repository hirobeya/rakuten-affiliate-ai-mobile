'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../../lib/room-writer-raw/source'),C=require('../../lib/room-writer-raw/contract'),Q=require('../../lib/room-writer-raw/local-quality'),R=require('../../lib/room-writer-raw/route');
const E=require('../../lib/urenavi-core/last-resort'),Safety=require('../../lib/room-writer-raw/safety');
const dir=path.resolve(__dirname,'../../docs/experiments/raw-source-fallback-20261111/quality-review-20261111');
const index=require(path.join(dir,'index.json')),candidate=require(path.join(dir,'candidate.json'));
const target=require(path.join(dir,'approval-target.NOT-AUTHORIZED.json'));
const details=index.rows.map(r=>require(path.join(dir,r.evidencePath)));
test('all twenty saved sources and outputs reproduce exactly, with honest absence',()=>{
 assert.equal(details.length,20);
 for(const d of details){
  const source=S.prepare(d.source),local=E.generate(d.source),p=Q.packet({source:source.source,sourceHash:source.sourceHash,local,mode:'normal'});
  assert.equal(source.sourceHash,d.sourceHash);assert.deepEqual(source.fieldHashes,d.fieldHashes);
  assert.equal(local.result?.quality?.text??null,d.generationText);assert.equal(d.storedEngineResult.after??null,d.generationText);
  assert.equal(S.hash(local),d.qualityPacket.localHash);assert.deepEqual(p,d.qualityPacket);
  assert.equal(Q.classify(d.independentAssessment,p).status,d.qualityStatus);
  if(d.generationText===null)assert(Object.values(d.independentAssessment.axes).every(x=>x===null));
  else assert.equal(Array.from(d.generationText).length,d.characterCount);
  for(const observation of d.independentAssessment.observations)for(const e of observation.evidence)assert(d.source[e.field].includes(e.quote));
 }
});
test('saved assistant review routes pass, fail and unknown without dispatch',async()=>{
 for(const d of details){
  const actual=await R.prepareFallback({item:d.source,assessLocal:()=>d.independentAssessment});
  assert.equal(actual.status,d.route.status);assert.equal(actual.calls,0);assert.equal(actual.qualityState,d.qualityStatus);
 }
 // Stored failure receipts cannot be rebound to another source/output.
 const d=details[11],actual=await R.prepareFallback({item:{...d.source,itemCaption:d.source.itemCaption+' changed'},assessLocal:()=>d.independentAssessment});
 assert.equal(actual.status,'local_quality_unverified');assert.equal(actual.calls,0);
});
test('candidate request preserves every source field and reservation without granting execution',async()=>{
 const request=require(path.join(dir,'candidate-request.json')),b=C.build(S.prepare(candidate.source));
 assert.deepEqual(request,b.request);assert.deepEqual(JSON.parse(request.messages[1].content).productData,candidate.source);
 assert.equal(candidate.sourceHash,b.envelope.sourceHash);assert.equal(candidate.requestHash,b.requestHash);assert.equal(candidate.inputHash,b.inputHash);
 const prepared=await R.prepareFallback({item:candidate.source,assessLocal:()=>candidate.independentAssessment});
 assert.equal(prepared.status,'fallback_prepared_not_authorized');assert.equal(candidate.qualityHash,S.hash(prepared.quality));
 assert.equal(candidate.inputEstimatedReservation,b.inputEstimate);assert.equal(candidate.totalTokenReservation,b.reservation);
 assert.equal(candidate.totalTokenReservation,candidate.inputEstimatedReservation+candidate.outputTokenCap);
 assert.equal(candidate.totalTokenReservation,6120);assert.equal(request.model,'openai/gpt-oss-120b');assert.equal(request.reasoning_effort,'low');
 assert.equal(candidate.realGroqCalls,0);assert.equal(candidate.actualTokens,null);
 assert(Object.values(candidate.observedCurrentRemaining).every(x=>x===null));
 const recreated=Safety.initialApprovalTarget({prepared,state:candidate.newAudit.state,executionSha:candidate.executionSha});
 assert.deepEqual(recreated,target);assert.equal(target.notAnAuthorization,true);assert.equal(target.template.authorized,false);
 assert.equal(target.template.acceptUnknownCapacity,false);assert.equal(target.template.expiresAt,null);
 assert.equal(candidate.newAudit.state.attemptsTotal,0);assert.equal(candidate.newAudit.state.spentTokens,0);assert.equal(candidate.newAudit.state.initialUsed,false);
 const files=fs.readdirSync(path.join(dir,'raw-source-fallback-v2'));assert.deepEqual(files,['manifest.json']);
 const manifest=require(path.join(dir,'raw-source-fallback-v2/manifest.json'));
 assert.equal(manifest.auditId,S.hash(candidate.newAudit.directory));assert.equal(manifest.experimentId,target.template.experimentId);
 const admission=Safety.admit({bundle:b,quality:prepared.quality,approval:target.template,state:candidate.newAudit.state,executionSha:candidate.executionSha,now:Date.now()});
 assert.equal(admission.allow,false);
});
test('scope failure is preserved as new evidence, without overwriting older review',()=>{
 const d=details[11],old=require('../../docs/rebuild-20261028/p3-local-first-20261108/editorial-review.json').rows.find(x=>x.itemCode===d.itemCode);
 assert.equal(old.axes.grounded,'pass');assert.equal(d.independentAssessment.axes.grounded,false);
 assert(d.source.itemCaption.includes('＜プレミアム＞'));assert(d.source.itemCaption.includes('プロファイルウレタン'));
 assert(!d.generationText.includes('プレミアム'));assert(d.independentAssessment.failedPassages.length>0);
 assert.equal(d.independentAssessment.humanApproval,false);
});
