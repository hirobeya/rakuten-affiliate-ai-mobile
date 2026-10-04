'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('size fact remains size selection, not usability claim',()=>{
  const out=buildPurchaseReason({itemName:'踏み台 60cm',itemCaption:'高さ60cmの踏み台です。'},'踏み台',null);
  assert.ok(out);
  assert.equal(out.axis,'サイズ');
});
