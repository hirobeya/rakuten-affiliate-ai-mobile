const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function load(){
  const document={createElement(){return {textContent:''};},head:{appendChild(){}}};
  const window={document,Intl};
  const ctx=vm.createContext({window,Intl,console});
  vm.runInContext(fs.readFileSync('public/pain-copy.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('public/room-copy-quality.js','utf8'),ctx);
  return window.UrenaviPainCopy;
}

test('exact title facts recover safe facts for seven-case production smoke products',()=>{
  const api=load();
  const cases=[
    {
      name:'美顔ローラー 美顔器 リフトアップ 〖微弱電流〗〖防水仕様〗〖充電不要〗 小顔ローラー',
      expected:['微弱電流','防水仕様']
    },
    {
      name:'ウォーターピーリング 美顔器 RELX 超軽量 70g 超音波 美顔器 ems イオン',
      expected:['超軽量 70g','超音波','ems','イオン']
    },
    {
      name:'ペットウォーターボトル 犬 グッズ 散歩 外出 ドライブ 旅行 漏れ防止 ワンタッチ',
      expected:['ワンタッチ']
    },
    {
      name:'ユニ・チャーム デオシート ワイド 54枚 ペットシーツ',
      expected:['54枚']
    },
    {
      name:'犬用 猫用 ふわふわ ペットベッド 洗える 犬ベッド 猫ベッド',
      expected:['犬用','猫用','洗える']
    },
    {
      name:'バイク グローブ タッチパネル操作可能 スマホタッチ 通気',
      expected:['タッチパネル操作可能','スマホタッチ','通気']
    }
  ];
  for(const row of cases){
    const facts=api.extractFallbackTitleFacts({itemName:row.name});
    for(const fact of row.expected) assert.ok(facts.includes(fact),row.name+' missing '+fact+' from '+JSON.stringify(facts));
  }
});

test('deterministic value copy consumes exact local title facts without adding AI value fields',()=>{
  const html=fs.readFileSync('public/app.html','utf8');
  const quality=fs.readFileSync('public/room-copy-quality.js','utf8');
  assert.match(html,/const localTitleFacts=/);
  assert.match(html,/extractFallbackTitleFacts/);
  assert.match(html,/valueFromFacts/);
  assert.match(quality,/防水・撥水/);
  assert.match(quality,/ワンタッチ/);
  assert.match(quality,/搭載機能/);
  assert.doesNotMatch(html,/audienceHook/);
  assert.doesNotMatch(html,/buyerBenefits/);
});

test('one-touch fact never resolves to smartphone-touch messaging',()=>{
  const api=load();
  const values=api.valueFromFacts(['ワンタッチ']);
  assert.equal(values.length,1);
  assert.equal(values[0].label,'ワンタッチ');
  assert.match(values[0].benefit,/ワンタッチ仕様/);
  assert.doesNotMatch(values[0].benefit,/スマホ操作/);
  assert.doesNotMatch(values[0].hook,/スマホ/);
});

test('katakana boundary prevents Lion brand from fabricating ion feature',()=>{
  const api=load();
  const lion=api.extractFallbackTitleFacts({itemName:'ライオン キッチンクリーナー 詰め替え'});
  assert.ok(!lion.includes('イオン'),JSON.stringify(lion));
  const ion=api.extractFallbackTitleFacts({itemName:'美顔器 イオン 超音波'});
  assert.ok(ion.includes('イオン'),JSON.stringify(ion));
});

test('quantity extraction ignores purchase-limit and shipping-count language',()=>{
  const api=load();
  for(const name of [
    '収納袋 2個以上で送料無料',
    'タオル お一人様3個まで',
    'スポンジ 最大5個購入',
    'マスク 先着10枚限定'
  ]){
    const facts=api.extractFallbackTitleFacts({itemName:name});
    assert.ok(!facts.some(x=>/^(?:2個|3個|5個|10枚)$/.test(x)),name+' => '+JSON.stringify(facts));
  }
  assert.ok(api.extractFallbackTitleFacts({itemName:'ペットシーツ 54枚'}).includes('54枚'));
});
