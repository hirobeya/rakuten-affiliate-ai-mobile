const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function load(){
  const document={createElement(){return {textContent:''};},head:{appendChild(){}}};
  const window={document,Intl};
  const ctx=vm.createContext({window,Intl,console});
  vm.runInContext(fs.readFileSync('public/fact-safety.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('public/pain-copy.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('public/room-copy-quality.js','utf8'),ctx);
  return window.UrenaviPainCopy;
}

test('local facts use a strict allowlist instead of exclusion-only tokens',()=>{
  const api=load();
  const item={itemName:'商品 コットン 500ml 10枚入り USB-C対応 防水 ギフト 54枚 メンズ ブランド名'};
  const facts=api.extractFallbackTitleFacts(item);
  assert.deepEqual(Array.from(facts),['コットン','500ml','10枚入り','USB-C対応']);
  for(const bad of ['商品','防水','ギフト','54枚','メンズ','ブランド名']){
    assert.ok(!facts.includes(bad),bad+' leaked '+JSON.stringify(facts));
  }
});

test('only explicit measured specs structured counts standards and materials are allowed',()=>{
  const api=load();
  const accepted=['500ml','約196g','10000mAh','1.45x1m','10枚入り','2個入','3セット','4本組','2個組','3枚×7袋','USB-C対応','HDMI','本革','コットン','セラミック','日本製'];
  const rejected=['10枚','2個','4本','防水','ワンタッチ','散歩','ドライブ','ギフト','父の日','メンズ','人気色','とらや','トヨタ','ケース','牛カレー'];
  for(const token of accepted) assert.equal(api.isSafeLocalFactToken(token),true,token);
  for(const token of rejected) assert.equal(api.isSafeLocalFactToken(token),false,token);
});

test('all client copy channels use the same neutral safe-fact output',()=>{
  const api=load();
  const item={itemName:'モバイルバッテリー 10000mAh USB-C対応 ブラック 人気 ギフト',itemPrice:1980};
  const room=api.makeRoomCopy(item,'');
  const threads=api.makeThreadsCopy(item,'');
  const instagram=api.makeInstagramCopy(item,'');
  assert.equal(room,threads);
  assert.equal(room,instagram);
  assert.match(room,/^商品名に記載されている仕様です。/);
  assert.match(room,/✓ 10000mAh/);
  assert.match(room,/✓ USB-C対応/);
  assert.doesNotMatch(room,/ブラック|人気|ギフト|おすすめ|向いて|悩み|使いやす|しやすい|こんな人/);
  assert.match(room,/価格：1,980円/);
  assert.match(room,/※アフィリエイト広告を利用しています/);
});

test('neutral builder rejects non-source and non-allowlisted facts',()=>{
  const api=load();
  const item={itemName:'本革 500ml USB-C対応 商品',itemPrice:1000};
  const out=api.buildNeutralFactPost(item,['本革','500ml','防水','存在しない仕様']);
  assert.match(out,/✓ 本革/);
  assert.match(out,/✓ 500ml/);
  assert.doesNotMatch(out,/防水|存在しない仕様/);
});

test('client and server share one fact safety module',()=>{
  const quality=fs.readFileSync('public/room-copy-quality.js','utf8');
  const lib=fs.readFileSync('lib/room-ai.js','utf8');
  const app=fs.readFileSync('public/app.html','utf8');
  assert.match(app,/fact-safety\.js/);
  assert.match(quality,/UrenaviFactSafety/);
  assert.doesNotMatch(quality,/const SERVER_PROMO_RE=/);
  assert.doesNotMatch(quality,/const SERVER_CLAIM_RE=/);
  assert.match(lib,/require\('\.\.\/public\/fact-safety\.js'\)/);
  assert.doesNotMatch(lib,/const PROMO_RE=\//);
  assert.doesNotMatch(lib,/const CLAIM_RE=\//);
});

test('client post path no longer uses VALUE_RULES or valueFromFacts',()=>{
  const html=fs.readFileSync('public/app.html','utf8');
  const quality=fs.readFileSync('public/room-copy-quality.js','utf8');
  assert.doesNotMatch(html,/valueFromFacts/);
  assert.doesNotMatch(quality,/VALUE_RULES/);
  assert.doesNotMatch(quality,/function valueFromFacts\(/);
  assert.match(html,/buildNeutralFactPost/);
  assert.match(quality,/商品名に記載されている仕様です/);
});

test('public browser scripts avoid regex lookbehind for older iOS Safari',()=>{
  const names=fs.readdirSync('public').filter(x=>x.endsWith('.js')||x==='app.html');
  for(const name of names){
    const src=fs.readFileSync('public/'+name,'utf8');
    assert.ok(!src.includes('(?<'),name+' contains regex lookbehind');
  }
});
