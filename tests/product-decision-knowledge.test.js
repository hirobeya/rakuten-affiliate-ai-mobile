'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {VERSION,validateEntry,getDecisionKnowledge,getCandidateKnowledge,inferDecisionProductType,buildReasoningContext}=require('../lib/product-decision-knowledge');

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

test('exact title product type selects partner knowledge automatically',()=>{
  assert.equal(inferDecisionProductType('山善 電気ケトル 0.8L 温度調節 1℃単位'),'電気ケトル');
  assert.equal(inferDecisionProductType('完全ワイヤレスイヤホン Bluetooth 5.3'),'完全ワイヤレスイヤホン');
  assert.equal(inferDecisionProductType('万能グローブ 手袋'),'');
});

test('reasoning context creates wording but never evidence or unsupported outcomes',()=>{
  const context=buildReasoningContext('モバイルバッテリー');
  assert.match(context.instruction,/fresh, persuasive Japanese wording/);
  assert.match(context.instruction,/must not create any new fact/);
  assert.match(context.instruction,/Never treat this knowledge as evidence/);
  assert.ok(context.blockedInferences.some(x=>x.includes('充電回数')));
});

test('active knowledge must include target scenes axes and blocked inference guards',()=>{
  const invalid=validateEntry({productType:'テスト商品',status:'active',actsOn:'対象',situations:['場面'],decisionAxes:['軸'],blockedInferences:[]});
  assert.equal(invalid.valid,false);
  assert.equal(invalid.reason,'incomplete_active_knowledge');
});
