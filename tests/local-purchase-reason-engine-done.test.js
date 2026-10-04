'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('does not fabricate unsupported user outcomes',()=>{
  const out=buildPurchaseReason({itemName:'モバイルバッテリー 10000mAh',itemCaption:'10000mAh容量のモバイルバッテリーです。'},'モバイルバッテリー',null);
  assert.ok(out);
  assert.ok(!/何回充電|急速充電|安心/.test(out.scene+' '+out.body));
});
