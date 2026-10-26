'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspect,assessReview}=require('../lib/room-semantic-contract');
const before=require('../docs/measurements/room-copy-20261026-ipow.json').records[0];
const after=require('../docs/measurements/room-copy-20261026-ipow-review-scope.json').records[0];
test('recorded live review mistakes never become implicit approval or a claimed improvement',()=>{
 assert.equal(before.source_hash,after.source_hash);
 assert.equal(before.model,after.model);
 assert.ok(before.item_name.includes('ブラジャー'));
 assert.match(before.state.review.sentences[0].reason,/bras not in source/);
 for(const record of [before,after]){
  const item={itemName:record.item_name,itemCaption:record.item_caption_normalized,catchcopy:'8枚入れ 型崩れ防止'};
  assert.equal(inspect(item,record.state.draft).ok,true);
  assert.equal(assessReview(item,record.state.draft,record.state.review).ok,false);
  assert.equal(record.state.quality.status,'blocked');
  assert.equal(record.state.quality.text,'');
  assert.ok(record.state.calls.length<=4);
 }
});
