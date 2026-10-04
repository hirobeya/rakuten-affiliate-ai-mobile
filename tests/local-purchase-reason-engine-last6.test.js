'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('safe reason includes grounded identity',()=>{
  const out=buildPurchaseReason({itemName:'包丁スタンド 食洗機対応',itemCaption:'食洗機対応の包丁スタンドです。'},'包丁スタンド',null);
  assert.ok(out.body.includes('包丁スタンド'));
});
