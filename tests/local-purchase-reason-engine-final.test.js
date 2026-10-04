'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('local reason output is concise enough for ROOM hook composition',()=>{
  const out=buildPurchaseReason({itemName:'ネックピロー 洗える',itemCaption:'洗えるネックピローです。'},'ネックピロー',null);
  assert.ok(out);
  assert.ok(out.scene.length<40);
  assert.ok(out.body.length<60);
});
