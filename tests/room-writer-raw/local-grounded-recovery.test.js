'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {generate}=require('../../lib/urenavi-core/last-resort');
const {preview}=require('../../lib/urenavi-core/grounded-local-recovery');
const base=path.resolve(__dirname,'../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products');
const products=[3,4,5,6].map(n=>JSON.parse(fs.readFileSync(path.join(base,String(n).padStart(2,'0')+'.json'),'utf8')));
test('legacy generation is byte-equivalent on four real acquired source products',()=>{
 for(const p of products){
  const unchanged=generate(structuredClone(p.source));
  assert.deepEqual(unchanged,p.local);
  assert.equal(unchanged.groqCalls,0);
  assert.equal(Object.hasOwn(unchanged,'groundedRecovery'),false);
 }
});
test('experimental local recovery extracts actual grounded candidates, never certified publication',()=>{
 for(const p of products){
  const actual=generate(structuredClone(p.source),{experimentalGroundedRecovery:true});
  const rec=actual.groundedRecovery;
  assert.equal(actual.groqCalls,0);
  assert.equal(actual.qualityCertified,false);
  assert.equal(actual.localStatus,'incomplete');
  assert.equal(rec.status,'proposed_requires_independent_review');
  assert.equal(rec.publication,false);
  assert.equal(rec.copyable,false);
  assert.equal(rec.semanticApproved,false);
  assert(rec.proposal.length>30);
  assert(rec.evidence.length>=1&&rec.evidence.length<=2);
  for(const entry of rec.evidence){
   assert(p.source[entry.source].includes(entry.quote));
   assert(entry.quote.length>=4);
  }
 }
});
test('candidate cannot be created without verified selling identity or usable source',()=>{
 const baseItem={itemCode:'generic:1',itemName:'収納ケース',itemCaption:'ご使用いただけます。',catchcopy:''};
 assert.equal(preview(baseItem,{identity:'別商品'}).status,'held');
 assert.equal(preview({...baseItem,itemCaption:'価格はこちら'},{identity:'収納ケース'}).status,'held');
 assert.equal(preview({...baseItem,itemCaption:''},{identity:'収納ケース'}).status,'held');
});
test('risk-related and marketing-only excerpts never qualify as evidence',()=>{
 const item={itemCode:'generic:2',itemName:'手袋',itemCaption:'安心してご使用いただけます。安全に使用できます。',catchcopy:''};
 const r=preview(item,{identity:'手袋'});
 assert.equal(r.status,'held');
 assert.equal(r.publication,false);
});
