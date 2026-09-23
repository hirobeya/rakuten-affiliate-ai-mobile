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
  assert.equal(copy,'');
});


test('low-confidence product never gets a fabricated sales pitch',()=>{
  const api=load();
  const item={itemName:'限定モデル QZ-999',itemPrice:3980,catchcopy:'人気',itemCaption:'こだわり仕様'};
  const copy=api.makeRoomCopy(item,'便利グッズ');
  assert.equal(copy,'');
  assert.doesNotMatch(copy,/掃除|収納|揚げ物|充電切れ|切る作業/);
});

test('cleaning glove and cloth have visibly different ROOM copy',()=>{
  const api=load();
  const glove={itemName:'6枚セット お掃除 手袋 マイクロファイバー ほこり取り',itemPrice:2480,catchcopy:'手にはめて使う掃除手袋',itemCaption:'家具や棚の細かい部分に'};
  const cloth={itemName:'お掃除 クロス マイクロファイバー ほこり吸着 水分吸水',itemPrice:544,catchcopy:'ほこり吸着 水分吸水',itemCaption:'拭き掃除用クロス'};
  const g=api.makeRoomCopy(glove,'掃除便利グッズ');
  const c=api.makeRoomCopy(cloth,'掃除便利グッズ');
  assert.match(g,/手にはめ|家具|棚|細かい/);
  assert.match(c,/ホコリ|水分|拭き取り|ちょこっと掃除/);
  assert.notEqual(g,c);
});


test('same-category products get different first lines',()=>{
  const api=load();
  const a={itemName:'お掃除 クロス マイクロファイバー ほこり吸着 水分吸水 もこもこ ミニ',itemPrice:544,catchcopy:'ほこり吸着 水分吸水',itemCaption:'もこもこミニクロス'};
  const b={itemName:'マイクロファイバー お掃除クロス 10枚セット 速乾',itemPrice:980,catchcopy:'速乾クロス',itemCaption:'10枚セット'};
  const ca=api.makeRoomCopy(a,'掃除便利グッズ');
  const cb=api.makeRoomCopy(b,'掃除便利グッズ');
  const firstA=ca.split('\n')[0];
  const firstB=cb.split('\n')[0];
  assert.notEqual(firstA,firstB);
  assert.match(firstA,/ホコリ|水分|ミニ|もこもこ|マイクロファイバー/);
  assert.match(firstB,/速乾|10点|マイクロファイバー/);
});

test('cleaning glove first line is not reused for cloth',()=>{
  const api=load();
  const glove={itemName:'6枚セット お掃除 手袋 マイクロファイバー ほこり取り',itemPrice:2480,catchcopy:'手にはめて使う掃除手袋',itemCaption:'家具や棚の細かい部分に'};
  const cloth={itemName:'お掃除 クロス マイクロファイバー ほこり吸着 水分吸水',itemPrice:544,catchcopy:'ほこり吸着 水分吸水',itemCaption:'拭き掃除用クロス'};
  const g=api.makeRoomCopy(glove,'掃除便利グッズ').split('\n')[0];
  const c=api.makeRoomCopy(cloth,'掃除便利グッズ').split('\n')[0];
  assert.notEqual(g,c);
  assert.match(g,/手袋|手にはめ/);
  assert.match(c,/クロス|ホコリ|水分/);
});


test('same-role products differ across the body, not only the first line',()=>{
  const api=load();
  const a={itemName:'お掃除 クロス マイクロファイバー ほこり吸着 水分吸水 もこもこ ミニ',itemPrice:544,catchcopy:'ほこり吸着 水分吸水',itemCaption:'もこもこミニクロス'};
  const b={itemName:'マイクロファイバー お掃除クロス 10枚セット 速乾',itemPrice:980,catchcopy:'速乾クロス',itemCaption:'10枚セット'};
  const ca=api.makeRoomCopy(a,'掃除便利グッズ');
  const cb=api.makeRoomCopy(b,'掃除便利グッズ');
  const la=ca.split('\n').map(x=>x.trim()).filter(Boolean);
  const lb=cb.split('\n').map(x=>x.trim()).filter(Boolean);
  const ignored=new Set(['商品の特徴👇','向いている人👇','✔ マイクロファイバー素材']);
  const common=la.filter(x=>lb.includes(x) && !ignored.has(x));
  assert.ok(common.length<=1, 'too many shared content lines: '+common.join(' | '));
  assert.match(ca,/水分|吸水|ミニ|もこもこ/);
  assert.match(cb,/10枚|速乾/);
});

test('glove and cloth have different use, facts and audience sections',()=>{
  const api=load();
  const glove={itemName:'6枚セット お掃除 手袋 マイクロファイバー ほこり取り',itemPrice:2480,catchcopy:'手にはめて使う掃除手袋',itemCaption:'家具や棚の細かい部分に'};
  const cloth={itemName:'お掃除 クロス マイクロファイバー ほこり吸着 水分吸水',itemPrice:544,catchcopy:'ほこり吸着 水分吸水',itemCaption:'拭き掃除用クロス'};
  const g=api.makeRoomCopy(glove,'掃除便利グッズ');
  const c=api.makeRoomCopy(cloth,'掃除便利グッズ');
  assert.match(g,/手にはめ|家具や棚|細かい部分/);
  assert.match(c,/水分|拭き取り|1枚で/);
  assert.notEqual(g.split('向いている人👇')[1],c.split('向いている人👇')[1]);
});


test('first line includes the actual product identity and differs across products',()=>{
  const api=load();
  const products=[
    {itemName:'6枚セット お掃除 手袋 マイクロファイバー ほこり取り ピンク 3組6枚',itemPrice:2480,catchcopy:'手にはめて使う掃除手袋',itemCaption:'家具や棚の細かい部分に'},
    {itemName:'丸辰 Marutatsu お掃除 クロス マイクロファイバー ほこり吸着 水分吸水 もこもこ ミニ グレー',itemPrice:544,catchcopy:'ほこり吸着 水分吸水',itemCaption:'もこもこミニクロス'},
    {itemName:'マイクロファイバー お掃除クロス 10枚セット 速乾 ブルー',itemPrice:980,catchcopy:'速乾クロス',itemCaption:'10枚セット'}
  ];
  const first=products.map(p=>api.makeRoomCopy(p,'掃除便利グッズ').split('\n')[0]);
  assert.equal(new Set(first).size,first.length,'first lines must all differ');
  assert.match(first[0],/手袋|6枚/);
  assert.match(first[1],/丸辰|Marutatsu|もこもこ|ミニ/);
  assert.match(first[2],/10枚|速乾/);
});

test('same category and same generic features still cannot collapse to the same first line',()=>{
  const api=load();
  const a={itemName:'ブランドA マイクロファイバー お掃除クロス 吸水',itemPrice:700,catchcopy:'吸水クロス'};
  const b={itemName:'ブランドB マイクロファイバー お掃除クロス 吸水',itemPrice:800,catchcopy:'吸水クロス'};
  const fa=api.makeRoomCopy(a,'掃除便利グッズ').split('\n')[0];
  const fb=api.makeRoomCopy(b,'掃除便利グッズ').split('\n')[0];
  assert.notEqual(fa,fb);
  assert.match(fa,/ブランドA/);
  assert.match(fb,/ブランドB/);
});
