'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('purchase reason quote always exists in current source',()=>{
  const item={itemName:'水筒 600ml',itemCaption:'容量600mlの水筒です。'};
  const out=buildPurchaseReason(item,'水筒',null);
  assert.ok(out);
  const source=(item.itemName+' '+item.itemCaption).normalize('NFKC');
  assert.ok(source.includes(String(out.quote).normalize('NFKC')));
});
