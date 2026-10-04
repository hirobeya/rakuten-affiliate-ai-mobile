'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('scene is purchase-selection context rather than unsupported product performance',()=>{
  const out=buildPurchaseReason({itemName:'ホースリール 壁掛け',itemCaption:'壁掛けタイプのホースリールです。'},'ホースリール',null);
  assert.ok(out);
  assert.ok(!/便利|楽|快適/.test(out.scene+' '+out.body));
});
