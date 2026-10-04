'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('no reason is returned for identity-only source',()=>{
  assert.equal(buildPurchaseReason({itemName:'ラゲッジスケール',itemCaption:'ラゲッジスケールです。'},'ラゲッジスケール',null),null);
});
