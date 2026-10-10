'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DERIVED_VERSION,getDecisionKnowledge,inferDecisionProductType}=require('../lib/product-decision-knowledge');

test('reviewed past product types become active partner knowledge',()=>{
  assert.match(DERIVED_VERSION,/partner-derived-v1$/);
  for(const type of ['キッチンスケール','カールアイロン','リュック','扇風機','電気毛布','靴下']){
    const k=getDecisionKnowledge(type);
    assert.ok(k,type+' should be active');
    assert.ok(k.actsOn);
    assert.ok(k.situations.length);
    assert.ok(k.decisionAxes.length);
    assert.ok(k.blockedInferences.length);
  }
});

test('descriptor-only past extraction is not promoted as product knowledge',()=>{
  assert.equal(getDecisionKnowledge('手帳型'),null);
  assert.equal(inferDecisionProductType('スマホケース 手帳型 全機種対応'), '');
});

test('derived exact title type can be inferred without semantic guessing',()=>{
  assert.equal(inferDecisionProductType('キッチンスケール 0.1g 3kg デジタル はかり'),'キッチンスケール');
  assert.equal(inferDecisionProductType('扇風機 リモコン 左右首振り 風量3段階'),'扇風機');
});
