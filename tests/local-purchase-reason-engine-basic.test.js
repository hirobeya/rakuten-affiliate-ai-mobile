'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('returns null rather than inventing a reason when no grounded axis is available',()=>{
  assert.equal(buildPurchaseReason({itemName:'未知商品',itemCaption:'説明なし'},'未知商品',null),null);
});
