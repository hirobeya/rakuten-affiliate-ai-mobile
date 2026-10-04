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
});

test('motorcycle glove uses parked smartphone intent and never driving operation',()=>{
  const title='バイクグローブ 夏用 メッシュ ライディンググローブ スマホ対応 バイク 手袋';
  const out=composeLocalPartnerCopy({itemName:title,identity:'バイクグローブ'});
  assert.ok(out);
  assert.equal(out.quote,'スマホ対応');
  assert.match(out.text,/停車中/);
  assert.doesNotMatch(out.text,/走行中|運転中/);
});

test('component weight such as 5g propeller is not promoted into a product benefit',()=>{
  const title='自動給餌器 スマホ操作 カメラ付き 5gプロペラ付き 猫 犬';
  assert.equal(chooseAngle(title,'自動給餌器'),null);
});

test('generic glove has no active partner knowledge and cannot guess the use',()=>{
  const title='グローブ 手袋 ブラック 男女兼用';
  assert.equal(composeLocalPartnerCopy({itemName:title,identity:'グローブ'}),null);
});
