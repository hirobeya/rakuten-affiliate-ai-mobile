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
  assert.match(html,/const localTitleFacts=/);
  assert.match(html,/extractFallbackTitleFacts/);
  assert.match(html,/防水・撥水/);
  assert.match(html,/ワンタッチ/);
  assert.match(html,/搭載機能/);
  assert.doesNotMatch(html,/audienceHook/);
  assert.doesNotMatch(html,/buyerBenefits/);
});
