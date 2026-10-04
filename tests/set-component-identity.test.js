'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {setComponentScoped,repeatedLiteralIdentity,repeatedSupport,leadingStemFamily}=require('../lib/repeated-literal-identity');

test('component listed inside starter kit cannot become whole-product identity',()=>{
  const item={
    itemName:'空調服(R) スターターキット ブラック 18V バッテリー ファン セット ケーブル',
    itemCaption:'製品名 空調服(R) スターターキット ブラック セット内容 FA23112（ファン）CB23311（ケーブル）BT23211（バッテリー本体）CG23411（充電器）'
  };
  assert.equal(setComponentScoped(item.itemName,item.itemCaption,'バッテリー'),true);
  const out=repeatedLiteralIdentity(item);
  assert.ok(!out||out.canonicalIdentity!=='バッテリー');
});

test('a product whose identity itself is a set is not rejected as a mere component',()=>{
  const title='包丁セット 3本セット ステンレス 包丁セット';
  const caption='商品は包丁セットです。';
  assert.equal(setComponentScoped(title,caption,'包丁セット'),false);
});

test('independent repeated title support outranks a longer suffix supported only by a component phrase',()=>{
  const item={
    itemName:'Toffy 冷却プレート ハンディファン 折りたためる 冷たい プレート 手持ち 扇風機 ハンディ コンパクト ネックスファン 卓上 角度調整 持ち運び 小型 ファン USB充電 Type-C 風量調節',
    itemCaption:''
  };
  const tokens=item.itemName.split(/\s+/);
  assert.equal(repeatedSupport(tokens,'冷却プレート',4),2);
  assert.equal(repeatedSupport(tokens,'ハンディファン',3),3);
  const out=repeatedLiteralIdentity(item);
  assert.ok(out);
  assert.equal(out.canonicalIdentity,'ハンディファン');
  assert.equal(out.identityHypothesis?.method,'repeated_title_support');
  assert.equal(out.identityHypothesis?.supportCount,3);
});

test('three independent expressions sharing a three-character leading stem can support the leading whole-product identity',()=>{
  const item={
    itemName:'水切りラック 折りたたみ 水切りかご 水切りマット シリコン キッチン 伸縮',
    itemCaption:''
  };
  const out=repeatedLiteralIdentity(item);
  assert.ok(out);
  assert.equal(out.canonicalIdentity,'水切りラック');
  assert.equal(out.identityHypothesis?.method,'leading_stem_family');
  assert.equal(out.identityHypothesis?.sharedPrefix,'水切り');
  assert.ok(out.identityHypothesis?.supportCount>=3);
});

test('a short two-character stem needs four independent expressions before it can support the leading identity',()=>{
  const item={
    itemName:'毛玉クリーナー 毛玉取り 毛玉取り機 毛玉取り器 5段階調整',
    itemCaption:''
  };
  const out=repeatedLiteralIdentity(item);
  assert.ok(out);
  assert.equal(out.canonicalIdentity,'毛玉クリーナー');
  assert.equal(out.identityHypothesis?.method,'leading_stem_family');
  assert.equal(out.identityHypothesis?.sharedPrefix,'毛玉');
  assert.ok(out.identityHypothesis?.supportCount>=4);
});

test('generic two-character prefix with weak repetition never promotes an unknown leading product',()=>{
  const item={
    itemName:'電動鉛筆削り えんぴつシャープナー 電動 小型 学校 オフィス',
    itemCaption:''
  };
  const stem=leadingStemFamily(item,item.itemName,item.itemCaption,item.itemName.split(/\s+/),new Set());
  assert.equal(stem,null);
  const out=repeatedLiteralIdentity(item);
  assert.ok(!out||out.canonicalIdentity!=='電動鉛筆削り');
});
