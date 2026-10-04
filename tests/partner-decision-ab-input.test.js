'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {payload,partnerContext,WRITER_PROMPT}=require('../lib/room-semantic-provider');

const item={
  itemName:'電気ケトル 温度調節 0.8L 1200W 50-100度 保温機能 1°C単位 細口',
  itemCaption:'容量 0.8L。50〜100°Cで温度設定できます。1°C単位で設定可能。保温機能付き。消費電力1200W。細口ノズル。'
};

test('A/B writer payload differs only by partner decision guidance',()=>{
  const a=payload('generate',item,{partnerKnowledge:false,partnerProductType:'電気ケトル'});
  const b=payload('generate',item,{partnerKnowledge:true,partnerProductType:'電気ケトル'});
  assert.equal(a.decisionKnowledge,undefined);
  assert.equal(b.decisionKnowledge.productType,'電気ケトル');
  assert.equal(b.decisionKnowledge.actsOn,'水');
  assert.ok(b.decisionKnowledge.decisionAxes.includes('温度設定'));
  assert.ok(b.decisionKnowledge.blockedInferences.some(x=>x.includes('沸騰速度')));
  assert.equal(a.itemName,b.itemName);
  assert.equal(a.itemCaption,b.itemCaption);
});

test('partner knowledge is guidance, never product evidence',()=>{
  const k=partnerContext({partnerKnowledge:true,partnerProductType:'電気ケトル'});
  assert.match(k.instruction,/Never treat this knowledge as evidence/);
  assert.match(WRITER_PROMPT,/decisionKnowledge自体は商品の事実でも根拠でもない/);
  assert.match(WRITER_PROMPT,/今回のitemName\/itemCaptionの連続引用/);
});

test('final verifier never receives partner knowledge as evidence',()=>{
  const verify=payload('verify',item,{partnerKnowledge:true,partnerProductType:'電気ケトル',draft:{product:{},sentences:[]},machine:{flags:[]}});
  assert.equal(verify.decisionKnowledge,undefined);
  assert.deepEqual(Object.keys(verify).sort(),['draft','flags','itemCaption','itemName'].sort());
});
