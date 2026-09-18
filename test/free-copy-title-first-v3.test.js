const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function load(){
  const document={createElement(){return {textContent:''};},head:{appendChild(){}}};
  const window={document,Intl};
  const ctx=vm.createContext({window,Intl,console});
  vm.runInContext(fs.readFileSync('public/pain-copy.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('public/pain-copy-refine.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('public/pain-copy-context-fix.js','utf8'),ctx);
  return window.UrenaviPainCopy;
}

test('oil-pot replacement filter cannot become lunch-storage copy',()=>{
  const api=load();
  const item={
    itemName:'オイルポット コスロン フィルター 交換用 フィルター 8個入り 油処理 油こし器 キッチン用品',
    catchcopy:'揚げ油をきれいにろ過',
    itemCaption:'保存や持ち運びにも便利という関連説明が混在していても、これはオイルポット用の交換フィルターです',
    itemPrice:660,
    reviewCount:225,
    reviewAverage:4.7
  };
  const ctx=api.painContext(item.itemName,'キッチン便利グッズ',[item.catchcopy,item.itemCaption].join(' '));
  const copy=api.makeRoomCopy(item,'キッチン便利グッズ');
  assert.match(ctx.audience,/揚げ物|油/);
  assert.match(copy,/揚げ|油|オイルポット/);
  assert.doesNotMatch(copy,/お弁当|作り置き|持ち運びまでスムーズ/);
});

test('generic replacement parts stay replacement parts even with noisy descriptions',()=>{
  const api=load();
  const ctx=api.painContext(
    '掃除機 交換用フィルター 2枚入り',
    '便利グッズ',
    '収納しやすく持ち運びにも便利。お弁当や旅行など幅広い検索語が説明文に含まれる'
  );
  assert.match(ctx.audience,/交換|本体/);
  assert.doesNotMatch(ctx.audience,/弁当|作り置き/);
});

test('title role outranks incidental description keywords',()=>{
  const api=load();
  const ctx=api.painContext(
    '防水スマホポーチ',
    '便利グッズ',
    '収納、掃除、計量、充電など関連キーワードを含む長い説明'
  );
  assert.match(ctx.audience,/雨|水|持ち運び|スマホ|濡/);
  assert.doesNotMatch(ctx.audience,/計量|掃除/);
});
