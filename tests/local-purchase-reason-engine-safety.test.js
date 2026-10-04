'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('purchase reason engine stays evidence-bound',()=>{
  const item={itemName:'折りたたみ踏み台 2段',itemCaption:'折りたたみ式の踏み台です。'};
  const out=buildPurchaseReason(item,'踏み台',null);
  assert.ok(out);
  assert.ok(out.body.includes('折りたたみ'));
  assert.ok(!/省スペース|持ち運びやすい|便利/.test(out.scene+' '+out.body));
});
