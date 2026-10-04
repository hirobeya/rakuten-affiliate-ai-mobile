'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('engine never requires Groq or network state',()=>{
  const out=buildPurchaseReason({itemName:'水筒 600ml',itemCaption:'600ml容量の水筒です。'},'水筒',null);
  assert.ok(out);
});
