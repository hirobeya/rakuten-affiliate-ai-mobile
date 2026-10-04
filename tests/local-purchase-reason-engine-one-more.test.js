'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('falls back cleanly when identity is empty',()=>{
  assert.equal(buildPurchaseReason({itemName:'何か 600ml',itemCaption:'600ml'},'',null),null);
});
