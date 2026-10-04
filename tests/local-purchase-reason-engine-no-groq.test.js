'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('engine is deterministic for the same grounded source',()=>{
  const item={itemName:'電気ケトル 0.8L',itemCaption:'0.8L容量の電気ケトルです。'};
  assert.deepEqual(buildPurchaseReason(item,'電気ケトル',null),buildPurchaseReason(item,'電気ケトル',null));
});
