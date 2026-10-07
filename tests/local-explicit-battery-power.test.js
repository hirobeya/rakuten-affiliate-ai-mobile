'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {explicitBatteryPower,composeLocalPartnerCopy}=require('../lib/local-partner-reasoner');

test('standalone battery-powered wording can support an unknown product without inventing benefits',()=>{
  const title='電動鉛筆削り えんぴつシャープナー 2削り穴 電池式 自動オフ 電動 小型 安全 小学生 色鉛筆';
  const out=explicitBatteryPower(title,'電動鉛筆削り');
  assert.ok(out);
  assert.equal(out.quote,'電池式');
  assert.equal(out.axis,'電源方式');
  assert.match(out.text,/電動鉛筆削りは、電池で動くためコンセントにつながず使うタイプです/);
  assert.doesNotMatch(out.text,/コードレス|便利|長持ち|使いやす|簡単/);
});

test('whole local partner path can publish the electric pencil sharpener from exact local evidence',()=>{
  const title='電動鉛筆削り えんぴつシャープナー 2削り穴 電池式 自動オフ 電動 小型 安全 小学生 色鉛筆 デッサン';
  const out=composeLocalPartnerCopy({itemName:title,identity:'電動鉛筆削り'});
  assert.ok(out);
  assert.equal(out.productType,'電動鉛筆削り');
  assert.equal(out.quote,'電池式');
  assert.match(out.text,/電源方式まで見て選ぶなら/);
  assert.match(out.text,/電動鉛筆削りは、電池で動くためコンセントにつながず使うタイプです/);
});

test('battery wording attached inside another noun is not treated as whole-product power mode',()=>{
  const title='テスト機器 電池式リモコン付属 ブラック';
  assert.equal(explicitBatteryPower(title,'テスト機器'),null);
});
