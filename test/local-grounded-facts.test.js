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
  assert.deepEqual(Array.from(facts),['コットン','10枚入り','USB-C対応']);
  for(const bad of ['商品','500ml','防水','ギフト','54枚','メンズ','ブランド名']){
    assert.ok(!facts.includes(bad),bad+' leaked '+JSON.stringify(facts));
  }
});

test('only explicit measured specs structured counts standards and materials are allowed',()=>{
  const api=load();
  const accepted=['1.45x1m','10枚入り','2個入','3セット','4本組','2個組','3枚×7袋','USB-C対応','HDMI','本革','コットン','セラミック','日本製','内容量500ml'];
  const rejected=['500ml','約196g','10000mAh','最大500ml','500ml以上','500ml相当','500mlペットボトル対応','10枚','2個','4本','防水','ワンタッチ','散歩','ドライブ','ギフト','父の日','メンズ','人気色','とらや','トヨタ','ケース','牛カレー','A4','B3','PD','レザー調','本革風','コットンタッチ','フェイクレザー','ナイロン柄'];
  for(const token of accepted) assert.equal(api.isSafeLocalFactToken(token),true,token);
  for(const token of rejected) assert.equal(api.isSafeLocalFactToken(token),false,token);
});

test('material modifiers are rejected even when separated into adjacent tokens',()=>{
  const api=load();
  for(const name of [
    '財布 フェイク レザー ブラック',
    'バッグ レザー 調 ブラウン',
    'ソファ 本革 風 ブラック',
    '生地 コットン タッチ',
    'シャツ ナイロン 柄',
    '靴 レザー ライク',
    'ポーチ レザー プリント'
  ]){
    assert.deepEqual(Array.from(api.extractFallbackTitleFacts({itemName:name})),[],name);
  }
  assert.deepEqual(Array.from(api.extractFallbackTitleFacts({itemName:'財布 本革 ブラック'})),['本革']);
});

test('ambiguous repeated units and multiple count variants are dropped',()=>{
  const api=load();
  const variants=api.extractFallbackTitleFacts({itemName:'ハーブティー 内容量20g 内容量30g 内容量50g コットン'});
  assert.deepEqual(Array.from(variants),['コットン']);
  const counts=api.extractFallbackTitleFacts({itemName:'セット 3枚入り 5枚入り 本革'});
  assert.deepEqual(Array.from(counts),['本革']);
});

test('material modifiers separated by delimiters are rejected in title context',()=>{
  const api=load();
  for(const name of [
    'バッグ フェイク レザー ブラック',
    'バッグ レザー 調 ブラック',
    '生地 コットン 風',
    'ケース ナイロン プリント'
  ]){
    const facts=api.extractFallbackTitleFacts({itemName:name});
    assert.equal(facts.length,0,name+' => '+JSON.stringify(facts));
  }
  assert.deepEqual(Array.from(api.extractFallbackTitleFacts({itemName:'バッグ 本革 ブラック'})),['本革']);
});

test('multiple dimension variants are dropped as ambiguous',()=>{
  const api=load();
  const dims=api.extractFallbackTitleFacts({itemName:'ポスター 61×49.5cm 52×42cm 42×34cm 本革'});
  assert.deepEqual(Array.from(dims),['本革']);
});

test('combined Groq and local facts are ambiguity-filtered again before posting',()=>{
  const app=fs.readFileSync('public/app.html','utf8');
  assert.match(app,/combinedFacts=\[/);
  assert.match(app,/UrenaviFactSafety\?\.filterAllowedTitleFacts\?\.\(titleTokens,combinedFacts\)/);
});

test('all client copy channels use the same grounded benefit output from safe facts',()=>{
  const api=load();
  const item={itemName:'モバイルバッテリー USB-C対応 ブラック 人気 ギフト 10枚入り',itemPrice:1980};
  const room=api.makeRoomCopy(item,'');
  const threads=api.makeThreadsCopy(item,'');
  const instagram=api.makeInstagramCopy(item,'');
  assert.equal(room,threads);
  assert.equal(room,instagram);
  assert.match(room,/必要な数をまとめて揃えたいときにチェック。|接続規格や対応規格を確認して選びたいときに。/);
  assert.match(room,/商品名には「(?:10枚入り|USB-C対応)」と明記されています。/);
  assert.match(room,/確認できる仕様👇/);
  assert.match(room,/✓ 10枚入り/);
  assert.match(room,/✓ USB-C対応/);
  assert.doesNotMatch(room,/ブラック|人気|ギフト|絶対|必ず|確実に|改善|治る|痩せる|若返/);
  assert.match(room,/価格：1,980円/);
  assert.match(room,/※アフィリエイト広告を利用しています/);
});

test('neutral builder rejects non-source and non-allowlisted facts',()=>{
  const api=load();
  const item={itemName:'本革 内容量500ml USB-C対応 商品',itemPrice:1000};
  const out=api.buildNeutralFactPost(item,['本革','内容量500ml','防水','存在しない仕様']);
  assert.match(out,/✓ 本革/);
  assert.match(out,/✓ 内容量500ml/);
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
  assert.match(html,/buildGroundedBenefitPost/);
  assert.match(quality,/function buildGroundedBenefitPost/);
  assert.match(quality,/確認できる仕様/);
});

test('public browser scripts avoid regex lookbehind for older iOS Safari',()=>{
  const names=fs.readdirSync('public').filter(x=>x.endsWith('.js')||x==='app.html');
  for(const name of names){
    const src=fs.readFileSync('public/'+name,'utf8');
    assert.ok(!src.includes('(?<'),name+' contains regex lookbehind');
  }
});


test('grounded benefit copy only expands verified fact types',()=>{
  const api=load();
  const cases=[
    {
      item:{itemName:'タオル 10枚入り ホワイト',itemPrice:1200},
      must:['10枚入り','必要な数をまとめて揃えたいときにチェック。'],
      mustNot:['洗い替え','長持ち','吸水']
    },
    {
      item:{itemName:'ケーブル HDMI USB-C対応 ブラック',itemPrice:1800},
      must:['HDMI','USB-C対応','接続規格や対応規格を確認して選びたいときに。'],
      mustNot:['高速','高画質','急速充電']
    },
    {
      item:{itemName:'財布 本革 ブラック',itemPrice:4980},
      must:['本革','素材を見て選びたいときに。'],
      mustNot:['高級','丈夫','長く使える']
    }
  ];
  for(const c of cases){
    const out=api.makeRoomCopy(c.item,'');
    for(const x of c.must) assert.ok(out.includes(x),x+' missing from '+out);
    for(const x of c.mustNot) assert.ok(!out.includes(x),x+' leaked into '+out);
  }
});

test('grounded benefit builder drops facts not present in the source title',()=>{
  const api=load();
  const item={itemName:'財布 本革 ブラック',itemPrice:4980};
  const out=api.buildGroundedBenefitPost(item,['本革','USB-C対応','10枚入り']);
  assert.match(out,/本革/);
  assert.doesNotMatch(out,/USB-C|10枚入り/);
});
