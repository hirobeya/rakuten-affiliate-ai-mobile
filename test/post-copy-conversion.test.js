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

test('quail egg copy leads with a concrete pain, not vague comparison language',()=>{
  const api=load();
  const item={itemName:'【公式】【日本製】うずら卵割り器 プッチ オレンジ 関市製 卵カッター',itemPrice:1000,reviewCount:2,reviewAverage:5,affiliateRate:3};
  const copy=api.makeRoomCopy(item,'便利グッズ');
  assert.match(copy,/うずら卵/);
  assert.match(copy,/割りにくい|何個も使う料理やお弁当づくり/);
  assert.match(copy,/下ごしらえ/);
  assert.doesNotMatch(copy,/商品情報やレビュー、ショップごとの条件を比べて/);
});

test('storage copy targets the real frustration before product facts',()=>{
  const api=load();
  const item={itemName:'スリム 収納ボックス ふた付き 隙間収納',itemPrice:1980,reviewCount:88,reviewAverage:4.6};
  const copy=api.makeRoomCopy(item,'収納');
  assert.match(copy,/散らか|定位置|戻す/);
  assert.match(copy,/収納|片付け/);
});

test('mobile battery copy focuses on battery anxiety',()=>{
  const api=load();
  const item={itemName:'モバイルバッテリー 急速充電 10000mAh',itemPrice:2980,reviewCount:500,reviewAverage:4.5};
  const copy=api.makeThreadsCopy(item,'モバイルバッテリー');
  assert.match(copy,/充電|電池/);
  assert.match(copy,/外出先|残量|充電切れ/);
});

test('unknown item stays safe instead of inventing a product use',()=>{
  const api=load();
  const item={itemName:'限定モデル ABC-123',itemPrice:5000,reviewCount:1,reviewAverage:5};
  const copy=api.makeRoomCopy(item,'便利グッズ');
  assert.match(copy,/商品情報やレビュー/);
});
