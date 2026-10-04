'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('unknown product can still use safe generic purchase axes when identity is already grounded',()=>{
  const item={itemName:'ラゲッジスケール 50kg',itemCaption:'ラゲッジスケールです。最大50kg。'};
  const out=buildPurchaseReason(item,'ラゲッジスケール',null);
  assert.ok(out);
  assert.ok(out.body.includes('ラゲッジスケール'));
});
