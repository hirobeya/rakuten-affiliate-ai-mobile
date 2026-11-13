'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const {prepareSemanticComparison}=require('../../lib/urenavi-core/semantic-editorial-bridge');
const {generate}=require('../../lib/urenavi-core/last-resort');
const {prepare,hash}=require('../../lib/room-writer-raw/source');
const raw=require('../../lib/room-writer-raw/contract-v2');
const base=path.resolve(__dirname,'../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products/');
const fixtures=[3,4,5,6].map(i=>require(path.join(base,'0'+i+'.json')));
test('existing old generated outputs are completely unchanged',()=>{
 for(const f of fixtures)assert.deepEqual(generate(f.source),f.local);
});
test('existing raw contract remains byte-consistent; semantic aid is a separate field',()=>{
 for(const f of fixtures){
  const original=structuredClone(f.source),originalEnvelope=prepare(f.source),old=raw.build(originalEnvelope);
  const identity=generate(f.source,{experimentalNarrativeDraft:true}).narrativeDraft.identity;
  const r=prepareSemanticComparison(f.source,{identity});
  assert.equal(r.publication,false);
  assert.equal(r.copyable,false);
  assert.equal(r.sendEnabled,false);
  assert.equal(r.automaticRetries,0);
  if(r.status==='held'){
   assert(['comparison_request_over_free_tpm','comparison_request_insufficient_estimated_headroom','buyer_decision_insufficient_for_comparison'].includes(r.reason),f.source.itemCode+': '+r.reason);
   continue;
  }
  assert.equal(r.status,'offline_comparison_prepared_not_authorized');
  assert.equal(r.oldRawRequestHash,old.requestHash);
  assert.equal(r.request.model,old.request.model);
  assert.equal(r.request.max_completion_tokens,old.request.max_completion_tokens);
  assert.deepEqual(r.request.response_format,old.request.response_format);
  assert(r.reservation<=7500);
  assert.equal(r.request.messages[1].role,'user');
  assert.deepEqual(JSON.parse(r.request.messages[1].content).productData,originalEnvelope.source);
  const aid=JSON.parse(r.request.messages[1].content).editorialDecisionAid;
  assert.equal(aid.sellingUnitVerified,false);
  assert.equal(aid.sceneIsProductFact,false);
  assert(aid.evidence.length>=2);
  for(const e of aid.evidence)assert(original[e.field].includes(e.quote));
  assert.deepEqual(f.source,original);
  assert.equal(originalEnvelope.sourceHash,hash(prepare(f.source).source));
 }
});
test('single benefit plus caution is held, not exaggerated',()=>{
 const f=fixtures[1],identity='お掃除手袋';
 const r=prepareSemanticComparison(f.source,{identity});
 assert.equal(r.status,'held');
 assert.equal(r.reason,'buyer_decision_insufficient_for_comparison');
});
test('no data outside the source can change selling identity or grant authority',()=>{
 const f=fixtures[3],identity='フライパン';
 const wrong=prepareSemanticComparison(f.source,{identity:'掃除道具'});
 assert.equal(wrong.status,'held');
 const mutated=structuredClone(f.source);
 mutated.itemCaption='関連商品：取手が取り外せる。重ねて収納できます。';
 assert.equal(prepareSemanticComparison(mutated,{identity}).status,'held');
});
test('full original caption is preserved even for variant-heavy source; never truncate',()=>{
 const f=fixtures[3],r=prepareSemanticComparison(f.source,{identity:'フライパン'});
 if(r.status==='offline_comparison_prepared_not_authorized')
  assert.equal(JSON.parse(r.request.messages[1].content).productData.itemCaption,f.source.itemCaption);
 else assert(['comparison_request_over_free_tpm','comparison_request_insufficient_estimated_headroom'].includes(r.reason));
});
