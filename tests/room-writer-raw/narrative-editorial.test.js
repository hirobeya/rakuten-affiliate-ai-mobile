'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {generate}=require('../../lib/urenavi-core/last-resort');
const {propose}=require('../../lib/urenavi-core/narrative-editorial');
const base=path.resolve(__dirname,'../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products/');
const products=[3,4,5,6].map(i=>require(path.join(base,String(i).padStart(2,'0')+'.json')));
test('unchanged normal results and previous optional experiments for real products',()=>{
 for(const fixture of products){
  assert.deepEqual(generate(fixture.source),fixture.local);
  const prior=generate(fixture.source,{experimentalGroundedRecovery:true});
  assert.equal(prior.groqCalls,0);
  assert.equal(prior.narrativeDraft,undefined);
 }
});
test('new optional narrative drafts use exact source-evidence with no publication',()=>{
 for(const fixture of products){
  const got=generate(fixture.source,{experimentalNarrativeDraft:true});
  assert.equal(got.groqCalls,0);
  assert.equal(got.result,null);
  assert.equal(got.localStatus,'incomplete');
  const draft=got.narrativeDraft;
  assert.equal(draft.status,'preview_for_owner_review');
  assert.equal(draft.publication,false);
  assert.equal(draft.copyable,false);
  assert.equal(draft.semanticApproved,false);
  assert(draft.draft.length>=55&&draft.draft.length<=400);
  assert(draft.evidence.length>=2);
  for(const e of draft.evidence){
   assert.equal(fixture.source[e.source].slice(e.at,e.at+e.quote.length),e.quote);
  }
  assert(!/商品説明には|選ぶポイント|仕様です|記載されています/.test(draft.draft));
 }
});
test('a different category reuses same sourced action grammar, not a known item code',()=>{
 const f={itemCode:'fixture:unseen',itemName:'軽量収納バッグ',itemCaption:'取手が取り外せる。重ねて収納できます。',catchcopy:''};
 const r=propose(f,{identity:'収納バッグ'});
 assert.equal(r.status,'preview_for_owner_review');
 assert.match(r.draft,/収納バッグ/);
 assert.doesNotMatch(r.draft,/フライパン/);
 assert.equal(r.copyable,false);
});
test('unattributed related-item claims and missing selling identity are held',()=>{
 const f={itemCode:'fixture:scoped',itemName:'収納バッグ',itemCaption:'関連商品：取手が取り外せる。重ねて収納できます。',catchcopy:''};
 const r=propose(f,{identity:'収納バッグ'});
 assert.equal(r.status,'held');
 assert.equal(r.copyable,false);
 assert.equal(propose({...f,itemCaption:'取手が取り外せる。重ねて収納できます。'},{identity:'別商品'}).status,'held');
});
