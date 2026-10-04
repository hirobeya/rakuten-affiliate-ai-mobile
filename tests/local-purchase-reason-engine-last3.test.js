'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('engine can express purchase intent without effect claims',()=>{
  const out=buildPurchaseReason({itemName:'フライパン 26cm',itemCaption:'26cmのフライパンです。'},'フライパン',null);
  assert.ok(out);
  assert.ok(/選びたいとき/.test(out.scene));
});
