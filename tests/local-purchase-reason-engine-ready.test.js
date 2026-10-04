'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('known identity with grounded material stays factual',()=>{
  const out=buildPurchaseReason({itemName:'収納ベンチ アルミ',itemCaption:'アルミ製の収納ベンチです。'},'収納ベンチ',null);
  assert.ok(out);
  assert.ok(out.body.includes('アルミ'));
});
