'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('local purchase reason output avoids empty marketing cliches',()=>{
  const item={itemName:'ネックピロー 洗える',itemCaption:'洗えるネックピローです。'};
  const out=buildPurchaseReason(item,'ネックピロー',null);
  assert.ok(out);
  assert.ok(!/おすすめ|大活躍|便利なアイテム|これ一つで/.test(out.scene+' '+out.body));
});
