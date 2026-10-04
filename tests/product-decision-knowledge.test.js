'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {VERSION,validateEntry,getDecisionKnowledge,getCandidateKnowledge,buildReasoningContext}=require('../lib/product-decision-knowledge');

test('decision knowledge v1 loads active product reasoning context',()=>{
  assert.match(VERSION,/partner-decision-v1$/);
  const k=getDecisionKnowledge('電気ケトル');
  assert.equal(k.productType,'電気ケトル');
  assert.equal(k.actsOn,'水');
  assert.ok(k.decisionAxes.includes('容量'));
  assert.ok(k.blockedInferences.some(x=>x.includes('沸騰速度')));
});

test('generic glove knowledge never becomes active reasoning context',()=>{
  assert.equal(getDecisionKnowledge('グローブ'),null);
  const candidate=getCandidateKnowledge('グローブ');
  assert.equal(candidate.status,'needs_specific_type');
});

test('reasoning context is guidance only and explicitly not evidence',()=>{
  const context=buildReasoningContext('モバイルバッテリー');
  assert.match(context.instruction,/Never treat this knowledge as evidence/);
  assert.ok(context.blockedInferences.some(x=>x.includes('充電回数')));
});

test('active knowledge must include target scenes axes and blocked inference guards',()=>{
  const invalid=validateEntry({productType:'テスト商品',status:'active',actsOn:'対象',situations:['場面'],decisionAxes:['軸'],blockedInferences:[]});
  assert.equal(invalid.valid,false);
  assert.equal(invalid.reason,'incomplete_active_knowledge');
});
