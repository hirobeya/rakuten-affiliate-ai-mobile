'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('negated feature is not treated as a positive purchase reason',()=>{
  const item={itemName:'バッグ 非防水',itemCaption:'非防水のバッグです。'};
  const out=buildPurchaseReason(item,'バッグ',null);
  assert.ok(!out || !/防水/.test((out.quote||'').replace(/^非/,'')) || out.quote==='非防水');
});
