'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {QTY_RE,verifyPost}=require('../lib/room-post-verifier-v1');

test('blade count is not treated as pack quantity',()=>{
  assert.equal(QTY_RE.test('回転式6枚刃'),false);
  assert.equal(QTY_RE.test('200枚入り'),true);
});

test('unsupported suitability wording is removed from temperature copy',async()=>{
  const source='電気ケトル 0.8L 50〜100℃ 1℃単位 温度設定 保温\n容量0.8L。50〜100℃の範囲を1℃単位で温度設定できます。';
  const post='50〜100℃を1℃単位で温度設定できる電気ケトルです。\nお湯の温度を自分で細かく調整したい人に適しています。\n1℃単位なので、毎回同じ温度に合わせたい場面で使えます。';
  const result=await verifyPost({sourceText:source,postText:post,productSummary:'電気ケトル',factsUsed:['0.8L','1℃単位','温度設定']});
  assert.doesNotMatch(result.postText,/適しています/);
  assert.match(result.postText,/1℃単位|毎回同じ設定|細かく自分で設定/);
});
