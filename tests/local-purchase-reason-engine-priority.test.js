'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('specific usability axis should be eligible to outrank weaker material-only wording',()=>{
  const item={itemName:'包丁スタンド ステンレス 食洗機対応',itemCaption:'ステンレス製。食洗機対応の包丁スタンドです。'};
  const out=buildPurchaseReason(item,'包丁スタンド',{decisionAxes:['お手入れ','素材'],blockedInferences:[]});
  assert.ok(out);
  assert.equal(out.axis,'お手入れ');
});
