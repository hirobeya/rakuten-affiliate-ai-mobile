'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {preview}=require('../../lib/urenavi-core/grounded-local-recovery');

function item(itemCaption) {
 return {itemCode:'fixture:carousel-scope',itemName:'フライパン',itemCaption,catchcopy:''};
}
test('claims exclusively in a related-product catalogue cannot support the selling item',()=>{
 const result=preview(item('関連商品はこちら 取っ手が取り外せる。重ねて収納できます。'),{identity:'フライパン'});
 assert.equal(result.status,'held');
 assert.equal(result.reason,'no_source_bound_use_feature');
 assert.equal(result.publication,false);
 assert.equal(result.copyable,false);
});
test('claims before a trailing related-product catalogue retain their exact source offsets',()=>{
 const caption='取っ手が取り外せる。重ねて収納できます。 関連商品はこちら 交換用パーツは別売りです。';
 const result=preview(item(caption),{identity:'フライパン'});
 assert.equal(result.status,'proposed_requires_independent_review');
 assert.deepEqual(result.evidence.map(e=>e.axis),['removable','stackable']);
 for(const e of result.evidence) assert.equal(caption.slice(e.at,e.at+e.quote.length),e.quote);
 assert.equal(result.publication,false);
 assert.equal(result.copyable,false);
});
test('own product details after size carousel remain eligible, related-product details do not',()=>{
 const caption='その他のサイズはこちら 【幅90cm】 取っ手が取り外せる。重ねて収納できます。 関連商品はこちら 取っ手が取り外せる。重ねて収納できます。';
 const result=preview(item(caption),{identity:'フライパン'});
 assert.equal(result.status,'proposed_requires_independent_review');
 assert.equal(result.evidence.length,2);
 for(const e of result.evidence) {
  assert.ok(e.at<caption.indexOf('関連商品はこちら'));
  assert.equal(caption.slice(e.at,e.at+e.quote.length),e.quote);
 }
 assert.equal(result.semanticApproved,false);
});
