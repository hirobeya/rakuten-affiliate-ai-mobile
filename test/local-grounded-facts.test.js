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


test('quantity extraction ignores more purchase and shipping conditions',()=>{
  const api=load();
  const blocked=[
    ['収納袋 2個ご購入で送料無料','2個'],
    ['スポンジ 3個で送料無料','3個'],
    ['タオル 2個で1000円','2個'],
    ['マスク 2個から注文可','2個'],
    ['洗剤 3個注文で割引','3個'],
    ['電池 1個あたり500円','1個'],
    ['ティッシュ おひとり様2個まで','2個'],
    ['タオル お1人様3個まで','3個']
  ];
  for(const [name,bad] of blocked){
    const facts=api.extractFallbackTitleFacts({itemName:name});
    assert.ok(!facts.includes(bad),name+' => '+JSON.stringify(facts));
  }
});

test('EMS extraction requires ASCII word boundaries',()=>{
  const api=load();
  for(const name of ['ABC SYSTEMS ケーブル','items ケース']){
    const facts=api.extractFallbackTitleFacts({itemName:name});
    assert.ok(!facts.some(x=>/^ems$/i.test(x)),name+' => '+JSON.stringify(facts));
    const values=api.valueFromFacts(facts);
    assert.ok(!values.some(x=>x.label==='搭載機能'),name+' => '+JSON.stringify(values));
  }
  const facts=api.extractFallbackTitleFacts({itemName:'美顔器 EMS 超音波'});
  assert.ok(facts.some(x=>/^EMS$/i.test(x)),JSON.stringify(facts));
});

test('通気性 suppresses duplicate 通気 fact',()=>{
  const api=load();
  const facts=api.extractFallbackTitleFacts({itemName:'バイクグローブ 通気性 スマホ対応'});
  assert.ok(facts.includes('通気性'),JSON.stringify(facts));
  assert.ok(!facts.includes('通気'),JSON.stringify(facts));
});


test('public browser scripts avoid regex lookbehind for older iOS Safari',()=>{
  const names=fs.readdirSync('public').filter(x=>x.endsWith('.js')||x==='app.html');
  for(const name of names){
    const src=fs.readFileSync('public/'+name,'utf8');
    assert.ok(!src.includes('(?<'),name+' contains regex lookbehind');
  }
});

test('generic smartphone compatibility and ONE TOUCH never become glove smartphone messaging',()=>{
  const api=load();
  for(const name of ['スマホスタンド スマホ対応 卓上','ワンタッチ ONE TOUCH テント']){
    const facts=api.extractFallbackTitleFacts({itemName:name});
    const values=api.valueFromFacts(facts);
    assert.ok(!values.some(x=>x.label==='スマホ操作'),name+' => '+JSON.stringify({facts,values}));
  }
  assert.ok(!api.valueFromFacts(['スマホ対応']).some(x=>x.label==='スマホ操作'));
  assert.ok(!api.valueFromFacts(['ONE TOUCH']).some(x=>x.label==='スマホ操作'));
  assert.equal(api.valueFromFacts(['スマホタッチ'])[0]?.label,'スマホ操作');
});

test('promotional quantity patterns are excluded while attached-count specs remain',()=>{
  const api=load();
  const blocked=[
    ['【限定100個】収納袋','100個'],
    ['数量限定30個 マスク','30個'],
    ['2個目半額 スポンジ','2個'],
    ['2点で10%OFF タオル','2点'],
    ['3個で10％オフ 洗剤','3個'],
    ['1個プレゼント ボトル','1個'],
    ['1個おまけ ケース','1個'],
    ['1個無料 サンプル','1個'],
    ['残り3個 バッグ','3個'],
    ['在庫5個 ケース','5個'],
    ['2個で¥1000 セット','2個']
  ];
  for(const [name,bad] of blocked){
    const facts=api.extractFallbackTitleFacts({itemName:name});
    assert.ok(!facts.includes(bad),name+' => '+JSON.stringify(facts));
  }
  const attached=api.extractFallbackTitleFacts({itemName:'替え刃2個付き シェーバー'});
  assert.ok(attached.includes('2個'),JSON.stringify(attached));
});
