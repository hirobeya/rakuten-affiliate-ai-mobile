'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPurchaseReason}=require('../lib/local-purchase-reason-engine');

test('unknown selfie stick turns exact length into a purchase-selection reason without inventing shooting results',()=>{
  const item={itemName:'P130 スマホ三脚 自撮り棒 130cm 折りたたみ',itemCaption:'自撮り棒です。最大130cm。折りたたみ式。'};
  const out=buildPurchaseReason(item,'自撮り棒',null);
  assert.ok(out);
  assert.ok(['サイズ','収納形態'].includes(out.axis));
  assert.ok(out.body.includes('自撮り棒'));
  assert.ok(!/集合写真|離れて撮|撮影しやす/.test(out.scene+' '+out.body));
});

test('source-grounded maintenance fact becomes purchase reason while unsupported effect is absent',()=>{
  const item={itemName:'包丁スタンド ステンレス 食洗機対応',itemCaption:'食洗機対応の包丁スタンドです。'};
  const out=buildPurchaseReason(item,'包丁スタンド',null);
  assert.ok(out);
  assert.equal(out.axis,'お手入れ');
  assert.ok(out.body.includes('食洗機対応'));
  assert.ok(!/清潔|衛生|楽になる/.test(out.scene+' '+out.body));
});

test('no grounded feature means no local purchase reason',()=>{
  const out=buildPurchaseReason({itemName:'電子メモパッド',itemCaption:'電子メモパッドです。'},'電子メモパッド',null);
  assert.equal(out,null);
});
