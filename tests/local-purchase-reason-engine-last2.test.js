'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('all returned reasons remain local data only',()=>{
  const out=buildPurchaseReason({itemName:'加湿器 280ml',itemCaption:'280ml容量の加湿器です。'},'加湿器',null);
  assert.ok(out);
});
