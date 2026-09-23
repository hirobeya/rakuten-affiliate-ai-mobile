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

test('metadata drives copy for products without dedicated product rules',()=>{
  const api=load();
  const items=[
    {
      itemName:'ステンレス キッチンツール A-100',
      catchcopy:'目盛付きでそのまま計量',
      itemCaption:'料理中にすくいながら量れる便利なキッチンツール',
      itemPrice:1280
    },
    {
      itemName:'折りたたみ生活雑貨 B-200',
      catchcopy:'軽量・コンパクト',
      itemCaption:'使わない時は折りたたんで収納。旅行や外出にも便利',
      itemPrice:1980
    },
    {
      itemName:'生活雑貨 C-300',
      catchcopy:'防水仕様',
      itemCaption:'雨の日や水まわりでも使いやすい防水タイプ',
      itemPrice:2480
    }
  ];
  const copies=items.map(x=>api.makeRoomCopy(x,'便利グッズ'));
  assert.match(copies[0],/量る|計量/);
  assert.match(copies[1],/持ち運び|コンパクト|省スペース/);
  assert.match(copies[2],/濡れ|雨|水/);
});

test('caption and catchcopy are both considered',()=>{
  const api=load();
  const a=api.makeRoomCopy({itemName:'生活雑貨 D-100',catchcopy:'',itemCaption:'気になるニオイを抑える防臭タイプ',itemPrice:900},'便利グッズ');
  const b=api.makeRoomCopy({itemName:'生活雑貨 D-200',catchcopy:'急速充電対応',itemCaption:'',itemPrice:1900},'便利グッズ');
  assert.match(a,/ニオイ|防臭/);
  assert.match(b,/充電|電池/);
});

test('unknown metadata still avoids inventing a concrete use',()=>{
  const api=load();
  const copy=api.makeRoomCopy({
    itemName:'限定モデル XYZ-500',
    catchcopy:'上質な仕上がり',
    itemCaption:'素材やデザインにこだわったモデル',
    itemPrice:5000
  },'便利グッズ');
  assert.equal(copy,'');
  assert.doesNotMatch(copy,/充電|揚げ物|掃除|収納/);
});

test('different products get different openings even under same search',()=>{
  const api=load();
  const items=[
    {itemName:'軽量ポータブル用品 A',catchcopy:'軽量 コンパクト',itemCaption:'外出時に持ち運びやすい',itemPrice:1000},
    {itemName:'防水生活用品 B',catchcopy:'防水',itemCaption:'雨の日にも使いやすい',itemPrice:1000},
    {itemName:'計量生活用品 C',catchcopy:'目盛付き',itemCaption:'そのまま量れる',itemPrice:1000},
    {itemName:'防臭生活用品 D',catchcopy:'防臭',itemCaption:'気になるニオイ対策に',itemPrice:1000},
    {itemName:'充電生活用品 E',catchcopy:'急速充電',itemCaption:'充電時間を短縮',itemPrice:1000}
  ];
  const first=items.map(x=>api.makeRoomCopy(x,'便利グッズ').split('\n')[0]);
  assert.ok(new Set(first).size>=4);
});


test('sales totals and unlabeled dimensions are not misread as product features',()=>{
  const api=load();
  const copy=api.makeRoomCopy({
    itemName:'圧縮袋一体型 布団収納BOX',
    catchcopy:'収納スペースをすっきり使いやすい圧縮収納',
    itemCaption:'【40%OFF・クーポン】9/15〜9/27 累計販売数100,000枚突破。すき間1cmにも。衣替えや布団収納に便利。',
    itemPrice:5880,
    reviewAverage:4.6,
    reviewCount:1922
  },'収納');
  assert.doesNotMatch(copy,/000枚セット/);
  assert.doesNotMatch(copy,/100,?000枚セット/);
  assert.doesNotMatch(copy,/(?:^|\n)✔?\s*1cm(?:\n|$)/);
  assert.match(copy,/収納|布団/);
});

test('explicit pack sizes still appear as facts',()=>{
  const api=load();
  const copy=api.makeRoomCopy({
    itemName:'マイクロファイバークロス 8枚セット',
    catchcopy:'吸水 速乾',
    itemCaption:'洗い替えに便利な8枚セット',
    itemPrice:1200
  },'掃除');
  assert.match(copy,/8枚セット/);
});
