'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('grounded capacity does not imply use duration',()=>{
  const out=buildPurchaseReason({itemName:'モバイルバッテリー 10000mAh',itemCaption:'10000mAh容量のモバイルバッテリーです。'},'モバイルバッテリー',null);
  assert.ok(out);
  assert.ok(!/長時間|一日|何回/.test(out.scene+' '+out.body));
});
