'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {groundedHashtags}=require('../api/room-ai');

test('customer hashtags must be grounded in the current product source or product summary',()=>{
  const input={sourceText:'電気シェーバー メンズ 回転式 6枚刃 IPX4 約92g USB充電'};
  const tags=groundedHashtags(['#電気シェーバー','#カミソリ','#洗濯用品','#メンズ','#USB充電'],input,'電気シェーバー');
  assert.deepEqual(tags,['#電気シェーバー','#メンズ','#USB充電']);
});

test('grounded kettle tags survive while unrelated tags are removed',()=>{
  const input={sourceText:'電気ケトル 0.8L 50-100℃ 1℃単位 温度設定 保温'};
  const tags=groundedHashtags(['#電気ケトル','#温度設定','#保温','#マグマ'],input,'電気ケトル');
  assert.deepEqual(tags,['#電気ケトル','#温度設定','#保温']);
});
