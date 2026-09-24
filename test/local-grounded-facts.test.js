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

test('local fact extraction only returns whole delimited title tokens',()=>{
  const api=load();
  const item={itemName:'ライオン 【防水】 非防水 ワンタッチ 2個目半額 54枚 ペットシーツ'};
  const tokens=api.titleFactTokens(item);
  assert.ok(tokens.includes('ライオン'));
  assert.ok(tokens.includes('防水'));
  assert.ok(tokens.includes('非防水'));
  const facts=api.extractFallbackTitleFacts(item);
  assert.ok(facts.includes('ライオン'));
  assert.ok(facts.includes('防水'));
  assert.ok(facts.includes('ワンタッチ'));
  assert.ok(facts.includes('ペットシーツ'));
  assert.ok(!facts.includes('イオン'));
  assert.ok(!facts.includes('非防水'));
  assert.ok(!facts.includes('2個目半額'));
  assert.ok(!facts.includes('54枚'));
});

test('negative, condition, claim and promo tokens are rejected structurally',()=>{
  const api=load();
  const rejected=[
    '非防水','防水なし','使用不可','2個目','3個以上','5個まで','数量限定',
    '半額','10%OFF','送料無料','購入特典','注文限定','プレゼント','おまけ',
    '小顔','リフトアップ','抗菌','除菌','ランキング','受賞','クーポン','SALE'
  ];
  for(const token of rejected){
    assert.equal(api.isSafeLocalFactToken(token),false,token);
  }
});

test('only structured quantity tokens are accepted, naked quantities are rejected',()=>{
  const api=load();
  const accepted=['10枚入り','2個入','3セット','4本組','2個組','内容量500ml'];
  const rejected=['10枚','2個','4本','500ml','2個目半額'];
  for(const token of accepted) assert.equal(api.isSafeLocalFactToken(token),true,token);
  for(const token of rejected) assert.equal(api.isSafeLocalFactToken(token),false,token);
});

test('neutral post contains no hook benefit audience or inferred use language',()=>{
  const api=load();
  const item={itemName:'ペットシーツ 54枚 10枚入り ワンタッチ',itemPrice:1980};
  const facts=api.extractFallbackTitleFacts(item);
  const out=api.buildNeutralFactPost(item,facts);
  assert.match(out,/商品名・説明に記載されている仕様です。/);
  assert.match(out,/✓ 10枚入り/);
  assert.match(out,/✓ ワンタッチ/);
  assert.doesNotMatch(out,/54枚/);
  assert.doesNotMatch(out,/悩み|使いやす|おすすめ|向いて|しやすい|重視して|スマホを見る|お手入れ|省スペース/);
  assert.match(out,/価格：1,980円/);
  assert.match(out,/※アフィリエイト広告を利用しています/);
});

test('neutral builder refuses facts that are not exact source tokens',()=>{
  const api=load();
  const item={itemName:'防水仕様 ワンタッチ ペットボトル',itemPrice:1000};
  const out=api.buildNeutralFactPost(item,['防水','ワンタッチ','存在しない仕様']);
  assert.doesNotMatch(out,/✓ 防水\n/);
  assert.match(out,/✓ ワンタッチ/);
  assert.doesNotMatch(out,/存在しない仕様/);
});

test('client post path no longer uses VALUE_RULES or valueFromFacts',()=>{
  const html=fs.readFileSync('public/app.html','utf8');
  const quality=fs.readFileSync('public/room-copy-quality.js','utf8');
  assert.doesNotMatch(html,/valueFromFacts/);
  assert.doesNotMatch(quality,/VALUE_RULES/);
  assert.doesNotMatch(quality,/function valueFromFacts\(/);
  assert.match(html,/buildNeutralFactPost/);
  assert.match(quality,/商品名・説明に記載されている仕様です/);
});

test('public browser scripts avoid regex lookbehind for older iOS Safari',()=>{
  const names=fs.readdirSync('public').filter(x=>x.endsWith('.js')||x==='app.html');
  for(const name of names){
    const src=fs.readFileSync('public/'+name,'utf8');
    assert.ok(!src.includes('(?<'),name+' contains regex lookbehind');
  }
});
