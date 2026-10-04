'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('factual wording contains no superlative',()=>{
  const out=buildPurchaseReason({itemName:'水筒 600ml',itemCaption:'600ml容量の水筒です。'},'水筒',null);
  assert.ok(out);
  assert.ok(!/最高|最強|圧倒的/.test(out.scene+' '+out.body));
});
