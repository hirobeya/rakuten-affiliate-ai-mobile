'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {preview}=require('../../lib/urenavi-core/grounded-local-recovery');

function item(itemCaption) {
 return {itemCode:'fixture:carousel-scope',itemName:'フライパン',itemCaption,catchcopy:''};
}
test('claims exclusively in related-size carousel are not evidence for selling item',()=>{
 const result=preview(item('その他のサイズはこちら 取っ手が取り外せる。重ねて収納できます。'),{identity:'フライパン'});
 assert.equal(result.status,'held');
 assert.equal(result.reason,'no_source_bound_use_feature');
 assert.equal(result.publication,false);
 assert.equal(result.copyable,false);
});
test('claims preceding related-size carousel remain sourced to original offsets',()=>{
 const result=preview(item('取っ手が取り外せる。重ねて収納できます。 その他のサイズはこちら 付属品は別売です。'),{identity:'フライパン'});
 assert.equal(result.status,'proposed_requires_independent_review');
 assert.deepEqual(result.evidence.map(e=>e.axis),['removable','stackable']);
 for(const e of result.evidence) assert.equal(item('取っ手が取り外せる。重ねて収納できます。 その他のサイズはこちら 付属品は別売です。')[e.source].slice(e.at,e.at+e.quote.length),e.quote);
 assert.equal(result.publication,false);
 assert.equal(result.copyable,false);
});
test('unmarked original caption remains eligible for guarded preview',()=>{
 const result=preview(item('取っ手が取り外せる。重ねて収納できます。'),{identity:'フライパン'});
 assert.equal(result.status,'proposed_requires_independent_review');
 assert.equal(result.semanticApproved,false);
});
