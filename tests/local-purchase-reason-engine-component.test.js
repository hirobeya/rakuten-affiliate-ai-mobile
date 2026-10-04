'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('component-only measurements should not be promoted as whole-product reasons by this engine',()=>{
  const item={itemName:'自動給餌器 5gプロペラ',itemCaption:'交換用5gプロペラについての記載あり。'};
  const out=buildPurchaseReason(item,'自動給餌器',null);
  assert.ok(!out || out.quote!=='5g');
});
