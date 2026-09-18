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

test('three cooking utensils do not all start from the same generic template',()=>{
  const api=load();
  const items=[
    {itemName:'【公式】料理のいろは 目盛付き横口おたま YJ2775',itemPrice:1045,reviewCount:4,reviewAverage:4.8},
    {itemName:'【公式】料理のいろは 手巻き柄すくいアミ YJ2811',itemPrice:1000,reviewCount:1,reviewAverage:5},
    {itemName:'【公式】料理のいろは パンチングメッシュのかす揚げ YJ2785',itemPrice:880,reviewCount:1,reviewAverage:5}
  ];
  const first=items.map(x=>api.makeRoomCopy(x,'料理 便利グッズ').split('\n')[0]);
  assert.equal(new Set(first).size,3);
  assert.doesNotMatch(first.join('\n'),/気になる商品、価格だけで決めずに内容も確かめたい/);
});

test('ladle copy speaks to measuring while scooping',()=>{
  const api=load();
  const copy=api.makeRoomCopy({itemName:'目盛付き横口おたま',itemPrice:1045},'おたま');
  assert.match(copy,/すくう|量る|計量/);
});

test('skimmer copy speaks to removing frying crumbs',()=>{
  const api=load();
  const copy=api.makeRoomCopy({itemName:'パンチングメッシュのかす揚げ',itemPrice:880},'かす揚げ');
  assert.match(copy,/揚げカス|油/);
});
