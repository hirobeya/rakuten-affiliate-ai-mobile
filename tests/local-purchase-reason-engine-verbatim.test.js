'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('quote is copied verbatim from normalized current source',()=>{
  const item={itemName:'ネックピロー 洗える',itemCaption:'洗えるネックピローです。'};
  const out=buildPurchaseReason(item,'ネックピロー',null);
  assert.ok(out);
  assert.ok((item.itemName+' '+item.itemCaption).normalize('NFKC').includes(out.quote.normalize('NFKC')));
});
