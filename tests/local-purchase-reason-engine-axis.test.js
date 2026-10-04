'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('axis labels stay decision-oriented and do not become factual claims',()=>{
  const out=buildPurchaseReason({itemName:'電気ケトル 温度調節',itemCaption:'温度調節対応の電気ケトルです。'},'電気ケトル',null);
  assert.ok(out);
  assert.equal(out.axis,'温度設定');
});
