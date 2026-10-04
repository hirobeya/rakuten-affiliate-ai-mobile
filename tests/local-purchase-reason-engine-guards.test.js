'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('purchase reason engine does not invent benefit language from exact facts',()=>{
  const item={itemName:'電気ケトル 0.8L 温度調節',itemCaption:'0.8Lの電気ケトル。温度調節対応。'};
  const out=buildPurchaseReason(item,'電気ケトル',null);
  assert.ok(out);
  const text=out.scene+' '+out.body;
  assert.ok(!/早く沸|時短|便利|快適/.test(text));
});
