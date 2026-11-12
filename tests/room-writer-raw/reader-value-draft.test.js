'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const {generate}=require('../../lib/urenavi-core/last-resort');
const {propose}=require('../../lib/urenavi-core/reader-value-draft');
const base=path.resolve(__dirname,'../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products/');
const fixtures=[3,4,5,6].map(i=>require(path.join(base,'0'+i+'.json')));
test('reader-value offline drafts have exact seller source evidence and cannot publish',()=>{
 for(const {source} of fixtures){
  const normal=generate(source);
  const old=generate(source,{experimentalNarrativeDraft:true});
  assert.equal(normal.groqCalls,0);
  assert.equal(old.groqCalls,0);
  const candidate=propose(source,{identity:old.narrativeDraft.identity});
  assert.equal(candidate.status,'owner_preview_only',source.itemCode);
  assert.equal(candidate.publication,false);
  assert.equal(candidate.copyable,false);
  assert.equal(candidate.semanticApproved,false);
  assert(candidate.draft.length>=50&&candidate.draft.length<500);
  assert(candidate.evidence.length>=2);
  for(const e of candidate.evidence){
   assert.equal(source[e.source].slice(e.at,e.at+e.quote.length),e.quote);
  }
  assert.equal(generate(source).localStatus,normal.localStatus);
  assert.equal(normal.narrativeDraft,undefined);
 }
});
test('holds ungrounded, unrelated or unknown product claims',()=>{
 const f={itemCode:'fake:1',itemName:'収納バッグ',itemCaption:'関連商品：取手が取り外せる。重ねて収納できます。',catchcopy:''};
 assert.equal(propose(f,{identity:'収納バッグ'}).status,'held');
 assert.equal(propose({...f,itemCaption:'取手が取り外せる。重ねて収納できます。'},{identity:'別商品'}).status,'held');
});
test('unseen source with the same grounded actions is not a hardcoded known product',()=>{
 const source={itemCode:'unseen:1',itemName:'収納バッグ',itemCaption:'取手が取り外せる。重ねて収納できます。',catchcopy:''};
 const c=propose(source,{identity:'収納バッグ'});
 assert.equal(c.status,'owner_preview_only');
 assert.match(c.draft,/収納バッグ/);
 assert.doesNotMatch(c.draft,/フライパン/);
});
