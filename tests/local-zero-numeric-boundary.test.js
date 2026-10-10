'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {extractLiteralSpecs}=require('../api/room-ai-v3');

test('model number suffix is never published as a numeric spec',()=>{
  const facts=extractLiteralSpecs({itemName:'カシオ ウェーブセプター WVA-M630L ソーラー腕時計 メンズ'});
  assert.equal(facts.some(x=>x.quote==='630L'),false);
});

test('standalone measured capacity still remains eligible',()=>{
  const facts=extractLiteralSpecs({itemName:'ボトル 容量 630ml ステンレス'});
  assert.equal(facts.some(x=>x.quote.toLowerCase()==='630ml'),true);
});
