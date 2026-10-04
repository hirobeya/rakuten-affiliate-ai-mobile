'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('unknown grounded identity plus grounded feature can produce a local reason',()=>{
  const out=buildPurchaseReason({itemName:'自撮り棒 130cm',itemCaption:'自撮り棒です。130cm。'},'自撮り棒',null);
  assert.ok(out);
});
