'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {sourceAgreementIdentity}=require('../lib/source-agreement-identity');

test('exact specific product noun shared by title and caption becomes a high-confidence hypothesis',()=>{
  const out=sourceAgreementIdentity({
    itemName:'ドリテック ラゲッジスケール LS-108 荷物 はかり 電池不要 メジャー付き 旅行',
    itemCaption:'0～50kgまで50g単位で計量できます。電池不要のラゲッジスケールです。'
  });
  assert.ok(out);
  assert.equal(out.value,'ラゲッジスケール');
  assert.equal(out.method,'source_agreement');
  assert.equal(out.confidence,'high');
});

test('specific shared selfie-stick noun can be selected without inventing smartphone compatibility',()=>{
  const out=sourceAgreementIdentity({
    itemName:'P130 スマホ三脚 自撮り棒 130cm 1/4ネジ付き 360度回転',
    itemCaption:'スマートフォン用の三脚兼自撮り棒。最大約130cmまで伸ばせます。'
  });
  assert.ok(out);
  assert.equal(out.value,'自撮り棒');
});

test('generic nouns such as bed case or mirror are never promoted by agreement alone',()=>{
  assert.equal(sourceAgreementIdentity({itemName:'猫 ベッド 室内用',itemCaption:'猫用のベッドです'}),null);
  assert.equal(sourceAgreementIdentity({itemName:'スマホ ケース 黒',itemCaption:'ケース本体'}),null);
  assert.equal(sourceAgreementIdentity({itemName:'卓上 ミラー LED',itemCaption:'ミラーは2倍です'}),null);
});

test('title-only product noun is not enough for source agreement',()=>{
  const out=sourceAgreementIdentity({itemName:'電子メモパッド 15インチ 保存機能付き',itemCaption:'本体サイズ33cm。ボタン電池を使用します。'});
  assert.equal(out,null);
});

test('near-tied competing shared identities defer instead of guessing',()=>{
  const out=sourceAgreementIdentity({
    itemName:'スマート三脚 自撮り三脚 軽量',
    itemCaption:'スマート三脚と自撮り三脚の両方の名称で案内しています。'
  });
  assert.equal(out,null);
});
