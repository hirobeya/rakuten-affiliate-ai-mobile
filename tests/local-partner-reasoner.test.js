'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {chooseAngle,composeLocalPartnerCopy}=require('../lib/local-partner-reasoner');

test('electric kettle turns exact capacity into a purchase-intent angle without inventing speed',()=>{
  const title='T-fal ティファール ジャスティンロック 1.2L KO5901JP 電気ケトル 転倒湯こぼれ防止 1200ml';
  const out=composeLocalPartnerCopy({itemName:title,identity:'電気ケトル',itemPrice:3759});
  assert.ok(out);
  assert.equal(out.quote,'1.2L');
  assert.match(out.text,/使う量や容量を見て選びたいとき/);
  assert.match(out.text,/1\.2L容量の電気ケトル/);
  assert.doesNotMatch(out.text,/速|スピード|すぐ沸/);
  assert.equal(out.generic,false);
});

test('motorcycle glove uses parked smartphone intent and never driving operation',()=>{
  const title='バイクグローブ 夏用 メッシュ ライディンググローブ スマホ対応 バイク 手袋';
  const out=composeLocalPartnerCopy({itemName:title,identity:'バイクグローブ'});
  assert.ok(out);
  assert.equal(out.quote,'スマホ対応');
  assert.match(out.text,/停車中/);
  assert.doesNotMatch(out.text,/走行中|運転中/);
  assert.equal(out.generic,false);
});

test('component weight such as 5g propeller is not promoted into a product benefit',()=>{
  const title='自動給餌器 スマホ操作 カメラ付き 5gプロペラ付き 猫 犬';
  assert.equal(chooseAngle(title,'自動給餌器'),null);
  assert.equal(composeLocalPartnerCopy({itemName:title,identity:'自動給餌器'}),null);
});

test('generic glove has no active partner knowledge and cannot guess the use',()=>{
  const title='グローブ 手袋 ブラック 男女兼用';
  assert.equal(composeLocalPartnerCopy({itemName:title,identity:'グローブ'}),null);
});

test('resolved storage bench cannot borrow storage-box knowledge but can use a literal generic axis',()=>{
  const title='鍵穴付き コンテナボックス アルミベンチ 屋外 収納 ベンチ 90cm 収納ボックス 工具箱';
  const out=composeLocalPartnerCopy({itemName:title,identity:'収納ベンチ'});
  assert.ok(out);
  assert.equal(out.generic,true);
  assert.equal(out.productType,'収納ベンチ');
  assert.match(out.text,/収納ベンチ/);
  assert.doesNotMatch(out.text,/収納ボックスです/);
  assert.doesNotMatch(out.text,/座る場所と収納を一緒/);
});

test('unknown exact identity can turn a literal structural fact into a safe purchase axis',()=>{
  const title='包丁スタンド ステンレス 食洗機対応 日本製';
  const out=composeLocalPartnerCopy({itemName:title,identity:'包丁スタンド'});
  assert.ok(out);
  assert.equal(out.generic,true);
  assert.equal(out.quote,'食洗機対応');
  assert.match(out.text,/お手入れ方法も確認/);
  assert.match(out.text,/食洗機対応の包丁スタンド/);
});

test('bare gram value defers when its semantic role is not proven',()=>{
  const title='キッチンスケール 0.1g デジタル 計量器';
  const out=composeLocalPartnerCopy({itemName:title,identity:'キッチンスケール'});
  assert.equal(out,null);
});

test('unknown exact identity converts explicit extendable structure into a purchase reason',()=>{
  const title='自撮り棒 伸縮式 三脚一体型 最大130cm ブラック';
  const out=composeLocalPartnerCopy({itemName:title,identity:'自撮り棒'});
  assert.ok(out);
  assert.equal(out.generic,true);
  assert.equal(out.quote,'伸縮式');
  assert.match(out.text,/長さを変えて使いたいとき/);
  assert.match(out.text,/伸縮式仕様の自撮り棒/);
  assert.doesNotMatch(out.text,/集合写真|遠くから|映える|撮影が楽/);
});

test('explicit height adjustment becomes a generic decision axis without inventing comfort',()=>{
  const title='ノートPCスタンド 高さ調整 アルミ 折りたたみ';
  const out=composeLocalPartnerCopy({itemName:title,identity:'ノートPCスタンド'});
  assert.ok(out);
  assert.equal(out.quote,'高さ調整');
  assert.match(out.text,/高さを変えて使いたいとき/);
  assert.doesNotMatch(out.text,/姿勢|疲れ|快適|肩こり/);
});

test('remote feature produces only a choice axis, not an invented usage outcome',()=>{
  const title='LEDライト リモコン付き 角度調整 USB-C';
  const out=composeLocalPartnerCopy({itemName:title,identity:'LEDライト'});
  assert.ok(out);
  assert.match(out.text,/角度を変えて使いたいとき|リモコンの有無も確認して選びたいとき/);
  assert.doesNotMatch(out.text,/離れた場所から簡単|手元で楽々|便利/);
});

test('negated or excluded purchase feature is never promoted',()=>{
  const title='タブレットスタンド 高さ調整非対応 リモコン別売 アルミ';
  const out=composeLocalPartnerCopy({itemName:title,identity:'タブレットスタンド'});
  assert.ok(out);
  assert.notEqual(out.quote,'高さ調整');
  assert.notEqual(out.quote,'リモコン');
  assert.doesNotMatch(out.text,/高さを変えて使いたい|リモコンの有無/);
});
