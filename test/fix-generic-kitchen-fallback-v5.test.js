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

test('corn peeler gets corn-specific copy',()=>{
  const api=load();
  const item={itemName:'とうもろこしピーラー トウモロコシ ピーラー コーンピーラー キッチン用品 調理器具 便利グッズ corn-p',itemPrice:650,reviewCount:13,reviewAverage:4.4};
  const copy=api.makeRoomCopy(item,'便利グッズ');
  assert.match(copy,/とうもろこし|コーン/);
  assert.match(copy,/芯|実/);
  assert.doesNotMatch(copy,/毎日の作業を時短したい|日常のちょっとした面倒/);
});

test('bottle opener gets opening-specific copy',()=>{
  const api=load();
  const item={itemName:'瓶オープナー 缶オープナー 蓋開け 栓抜き 省時 省力 調理器具 便利グッズ',itemPrice:1000,reviewCount:53,reviewAverage:4.0};
  const copy=api.makeRoomCopy(item,'便利グッズ');
  assert.match(copy,/フタ|栓|瓶|缶/);
  assert.match(copy,/開け/);
  assert.doesNotMatch(copy,/毎日の作業を時短したい|日常のちょっとした面倒/);
});

test('generic kitchen/category words alone never define product role',()=>{
  const api=load();
  const ctx=api.painContext('ABC123 キッチン用品 調理器具 便利グッズ','便利グッズ','簡単 時短 便利');
  assert.doesNotMatch(ctx.audience,/料理や後片付け|日常のちょっとした面倒/);
});


test('screen-mesh cleaning mop is never classified as a cooking strainer',()=>{
  const api=load();
  const item={
    itemName:'取替式あみ戸びっクリーン ハンディ ハンディモップ 取替式 網戸 掃除 ネット 掃除 便利グッズ',
    itemPrice:1490,
    reviewCount:9,
    reviewAverage:4.7,
    catchcopy:'網戸の汚れを手軽に掃除',
    itemCaption:'網戸掃除用の取替式ハンディモップ。細かい網目の汚れを落としやすい。'
  };
  const ctx=api.painContext(item.itemName,'便利グッズ',item.catchcopy+' '+item.itemCaption);
  const copy=api.makeRoomCopy(item,'便利グッズ');
  assert.match(ctx.audience,/網戸.*掃除/);
  assert.match(copy,/網戸/);
  assert.doesNotMatch(ctx.audience,/鍋|揚げ物|すくう/);
  assert.doesNotMatch(copy,/鍋や揚げ物|汁や油を切り|細かいものだけすく/);
});


test('microfiber cleaning cloth gets cleaning copy, not storage copy',()=>{
  const api=load();
  const item={
    itemName:'丸辰(Marutatsu) 掃除便利グッズ お掃除 クロス マイクロファイバー ほこり吸着 水分吸水 もこもこ ミニ グレー/ブラック',
    itemPrice:544,
    reviewCount:0,
    reviewAverage:0,
    catchcopy:'ほこり吸着 水分吸水',
    itemCaption:'マイクロファイバーのお掃除クロス'
  };
  const ctx=api.painContext(item.itemName,'掃除便利グッズ',item.catchcopy+' '+item.itemCaption);
  const copy=api.makeRoomCopy(item,'掃除便利グッズ');
  assert.match(ctx.audience,/ホコリ|水分|拭き/);
  assert.match(copy,/ホコリ|拭き|掃除/);
  assert.doesNotMatch(ctx.audience,/片付け|収納|定位置/);
  assert.doesNotMatch(copy,/散らか|定位置|出し入れ/);
});


test('cleaning evidence beats incidental storage language',()=>{
  const api=load();
  const item={itemName:'お掃除 クロス マイクロファイバー ほこり吸着 水分吸水 収納にも便利',itemPrice:544,reviewCount:0,reviewAverage:0,itemCaption:'小物と一緒に収納しやすい掃除クロス'};
  const ctx=api.painContext(item.itemName,'掃除便利グッズ',item.itemCaption);
  assert.match(ctx.audience,/掃除|ホコリ|拭/);
  assert.doesNotMatch(ctx.audience,/散らか|定位置/);
});

test('cleaning-tool storage is classified as storage when storage is the actual job',()=>{
  const api=load();
  const name='掃除道具 収納スタンド フロアワイパー モップ ホルダー 置き場';
  const ctx=api.painContext(name,'掃除用品','掃除用具をまとめて収納するスタンド');
  assert.match(ctx.audience,/収納|まとめ|掃除道具/);
});

test('plain mesh word never creates a cooking-strainer role',()=>{
  const api=load();
  const name='網戸 掃除 モップ ハンディ ほこり取り';
  const ctx=api.painContext(name,'掃除用品','網目のほこりを掃除する');
  assert.doesNotMatch(ctx.audience,/鍋|揚げ物|すくう/);
});

test('actual skimmer still gets cooking-strainer intent',()=>{
  const api=load();
  const name='ステンレス かす揚げ すくい網 揚げ物 あく取り';
  const ctx=api.painContext(name,'調理器具','揚げ物のカスやアクをすくう');
  assert.match(ctx.audience,/揚げ物|鍋|すく/);
});

test('ambiguous weak marketing words do not invent a product role',()=>{
  const api=load();
  const ctx=api.painContext('限定モデル ABC-123 手軽 簡単','便利グッズ','人気商品です');
  assert.doesNotMatch(ctx.audience,/掃除|収納|鍋|充電|切る/);
});


test('Rakuten genre path resolves ambiguous cleaning product identity',()=>{
  const api=load();
  const name='生活便利グッズ クロス 収納にも便利';
  const ctx=api.painContext(
    name,
    '便利グッズ',
    '吸水性のあるクロス。使わない時は収納しやすい。',
    '日用品雑貨・文房具・手芸 > 掃除用品 > 雑巾・テーブルダスター'
  );
  assert.match(ctx.audience,/掃除|ホコリ|拭/);
  assert.doesNotMatch(ctx.audience,/散らか|定位置/);
});

test('Rakuten genre path can identify storage when title has cleaning noise',()=>{
  const api=load();
  const name='掃除まわり 便利 スタンド';
  const ctx=api.painContext(
    name,
    '便利グッズ',
    'ワイパーなどを置けるスタンド',
    'インテリア・寝具・収納 > 収納家具 > ラック・棚'
  );
  assert.match(ctx.audience,/片付け|収納|散らか/);
});

test('genre evidence does not override an explicit product role in the title',()=>{
  const api=load();
  const name='マイクロファイバー お掃除クロス ほこり吸着';
  const ctx=api.painContext(
    name,
    '掃除用品',
    '水分吸水にも使える',
    '日用品雑貨・文房具・手芸 > 収納用品'
  );
  assert.match(ctx.audience,/ホコリ|水分|拭|掃除/);
  assert.doesNotMatch(ctx.audience,/散らか|定位置/);
});


test('cleaning glove and cleaning cloth generate different product-specific copy',()=>{
  const api=load();
  const glove={
    itemName:'6枚セット お掃除 手袋 マイクロファイバー クロス 掃除グッズ 大掃除便利グッズ ほこり取り ピンク 3組6枚',
    itemPrice:2480,reviewCount:0,reviewAverage:0,
    catchcopy:'手にはめて使うマイクロファイバー掃除手袋',
    itemCaption:'家具や棚などのほこり取りに'
  };
  const cloth={
    itemName:'丸辰(Marutatsu) 掃除便利グッズ お掃除 クロス マイクロファイバー ほこり吸着 水分吸水 もこもこ ミニ',
    itemPrice:544,reviewCount:0,reviewAverage:0,
    catchcopy:'ほこり吸着 水分吸水',
    itemCaption:'マイクロファイバーのお掃除クロス'
  };
  const gctx=api.painContext(glove.itemName,'掃除便利グッズ',glove.catchcopy+' '+glove.itemCaption,'掃除用品');
  const cctx=api.painContext(cloth.itemName,'掃除便利グッズ',cloth.catchcopy+' '+cloth.itemCaption,'掃除用品');
  const gcopy=api.makeRoomCopy(glove,'掃除便利グッズ');
  const ccopy=api.makeRoomCopy(cloth,'掃除便利グッズ');
  assert.match(gctx.audience,/家具|棚|細かい/);
  assert.match(gcopy,/手にはめ|グローブ|手袋|細かい/);
  assert.match(cctx.audience,/ホコリ|水分|拭/);
  assert.match(ccopy,/ホコリ|水分|拭/);
  assert.notEqual(gcopy,ccopy);
});

test('cleaning mop and brush keep distinct roles',()=>{
  const api=load();
  const mop=api.painContext('ハンディモップ お掃除 ワイパー ほこり取り','掃除用品','','掃除用品');
  const brush=api.painContext('掃除ブラシ すき間 清掃ブラシ','掃除用品','','掃除用品');
  assert.match(mop.audience,/床|広い面/);
  assert.match(brush.audience,/すき間|溝/);
  assert.notEqual(mop.audience,brush.audience);
});
