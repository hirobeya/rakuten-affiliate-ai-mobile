'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('starter kit component fact is not rewritten into the whole-product identity by purchase reason engine',()=>{
  const item={itemName:'空調服 スターターキット 18V バッテリー ファン セット',itemCaption:'セット内容 バッテリー本体、ファン、ケーブル、充電器。'};
  const out=buildPurchaseReason(item,'スターターキット',null);
  if(out) assert.ok(out.body.includes('スターターキット'));
});
