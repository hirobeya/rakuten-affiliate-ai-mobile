'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('vm');
const path=require('path');

function load(){
  const ctx={window:{},console,Intl,URL,URLSearchParams,setTimeout,clearTimeout};
  vm.createContext(ctx);
  for(const file of ['fact-safety.js','pain-copy.js','product-shadow-v2.js','room-copy-quality.js']){
    const code=fs.readFileSync(path.join(__dirname,'..','public',file),'utf8');
    vm.runInContext(code,ctx,{filename:file});
  }
  return ctx.window.UrenaviPainCopy;
}

const api=load();

test('local facts use a strict allowlist instead of exclusion-only tokens',()=>{
  const item={itemName:'収納ボックス 大容量 ふた付き キャスター付き 完成品 おしゃれ 日本製 幅40cm 2個セット',itemPrice:5000};
  const facts=api.extractFallbackTitleFacts(item);
  assert.ok(facts.includes('日本製'));
  assert.ok(facts.some(x=>/40cm/.test(x)));
  assert.ok(facts.some(x=>/2個セット/.test(x)));
  assert.ok(!facts.some(x=>/大容量|ふた付き|キャスター付き|完成品|おしゃれ/.test(x)));
});

test('only explicit measured specs structured counts standards and materials are allowed',()=>{
  for(const x of ['10cm','2個セット','日本製','綿100%','USB-C']) assert.equal(api.isSafeLocalFactToken(x),true,x);
  for(const x of ['大容量','防水','急速充電','スマホ対応','使いやすい']) assert.equal(api.isSafeLocalFactToken(x),false,x);
});

test('material modifiers are rejected even when separated into adjacent tokens',()=>{
  const item={itemName:'収納ケース 本革 風 PUレザー 調 木製 風 日本製',itemPrice:1000};
  const facts=api.extractFallbackTitleFacts(item);
  assert.ok(!facts.includes('本革'));
  assert.ok(!facts.includes('PUレザー'));
  assert.ok(!facts.includes('木製'));
  assert.ok(facts.includes('日本製'));
});

test('ambiguous repeated units and multiple count variants are dropped',()=>{
  const item={itemName:'収納ボックス 幅30cm 幅40cm 2個 3個 セット',itemPrice:1000};
  const facts=api.extractFallbackTitleFacts(item);
  assert.ok(!facts.some(x=>/30cm|40cm/.test(x)));
});

test('material modifiers separated by delimiters are rejected in title context',()=>{
  const item={itemName:'収納 本革・風 木製/調 PUレザー（風） 日本製',itemPrice:1000};
  const facts=api.extractFallbackTitleFacts(item);
  assert.ok(!facts.includes('本革'));
  assert.ok(!facts.includes('木製'));
  assert.ok(!facts.includes('PUレザー'));
  assert.ok(facts.includes('日本製'));
});

test('multiple dimension variants are dropped as ambiguous',()=>{
  const item={itemName:'収納ケース 幅30cm 幅40cm 高さ20cm 高さ25cm 日本製',itemPrice:1000};
  const facts=api.extractFallbackTitleFacts(item);
  assert.ok(!facts.some(x=>/30cm|40cm|20cm|25cm/.test(x)));
  assert.ok(facts.includes('日本製'));
});

test('combined Groq and local facts are ambiguity-filtered again before posting',()=>{
  const item={itemName:'収納ボックス 幅30cm 幅40cm 日本製',itemPrice:1000};
  const out=api.buildGroundedBenefitPost(item,['幅30cm','幅40cm','日本製']);
  assert.doesNotMatch(out,/幅30cm|幅40cm/);
});

test('all client copy channels use the same grounded benefit output from safe facts',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','public','app.html'),'utf8');
  assert.match(src,/buildGroundedBenefitPost/);
  assert.doesNotMatch(src,/VALUE_RULES\s*=/);
});

test('neutral builder rejects non-source and non-allowlisted facts',()=>{
  const item={itemName:'収納ケース 日本製',itemPrice:1000};
  const out=api.buildNeutralFactPost(item,['日本製','急速充電','999cm']);
  assert.match(out,/日本製/);
  assert.doesNotMatch(out,/急速充電|999cm/);
});

test('client and server share one fact safety module',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.html'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'..','lib','room-ai.js'),'utf8');
  assert.match(app,/fact-safety\.js/);
  assert.match(server,/fact-safety\.js/);
});

test('client post path no longer uses VALUE_RULES or valueFromFacts',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','public','app.html'),'utf8');
  assert.doesNotMatch(src,/VALUE_RULES\s*=/);
  assert.doesNotMatch(src,/valueFromFacts\s*\(/);
});

test('public browser scripts avoid regex lookbehind for older iOS Safari',()=>{
  for(const file of ['fact-safety.js','room-copy-quality.js']){
    const src=fs.readFileSync(path.join(__dirname,'..','public',file),'utf8');
    assert.doesNotMatch(src,/\(\?<=[^)]/);
    assert.doesNotMatch(src,/\(\?<![^)]/);
  }
});

test('grounded benefit copy only expands verified fact types',()=>{
  const item={itemName:'収納ボックス 日本製 幅40cm 2個セット',itemPrice:2000};
  const out=api.buildGroundedBenefitPost(item,['日本製','幅40cm','2個セット','防水']);
  assert.match(out,/日本製|幅40cm|2個セット/);
  assert.doesNotMatch(out,/防水/);
});

test('grounded benefit builder drops facts not present in the source title',()=>{
  const item={itemName:'収納ボックス 日本製',itemPrice:2000};
  const out=api.buildGroundedBenefitPost(item,['日本製','幅40cm']);
  assert.match(out,/日本製/);
  assert.doesNotMatch(out,/幅40cm/);
});

test('contextual product copy uses explicit product noun from title',()=>{
  const item={itemName:'収納ボックス 日本製 2個セット',itemPrice:2000};
  const out=api.buildGroundedBenefitPost(item,['日本製','2個セット']);
  assert.match(out,/収納ボックス/);
});

test('contextual product noun must exist verbatim in title',()=>{
  const item={itemName:'商品 本革 日本製',itemPrice:1000};
  const out=api.makeRoomCopy(item,'');
  assert.doesNotMatch(out,/財布|バッグ|IDカードケース|パジャマ|プール/);
});

test('validated AI copy supports previously unknown product types from grounded source evidence',()=>{
  const item={itemName:'髭剃り シェーバー 電気 カミソリ メンズ ポータブル 回転式 6枚刃 防水',itemCaption:'電気シェーバーとして掲載。回転式6枚刃を採用。',itemPrice:3319};
  const out=api.buildValidatedProductPost(item,'電気シェーバー',['回転式6枚刃']);
  assert.match(out,/電気シェーバー/);
  assert.match(out,/回転式6枚刃/);
  assert.match(out,/価格：3,319円/);
  assert.doesNotMatch(out,/商品説明では「/);
});

test('validated AI copy rejects identity or evidence absent from source',()=>{
  const item={itemName:'シェーバー メンズ',itemCaption:'電気シェーバーとして掲載。',itemPrice:1000};
  assert.equal(api.buildValidatedProductPost(item,'掃除機',['急速充電']), '');
  const out=api.buildValidatedProductPost(item,'電気シェーバー',['急速充電']);
  assert.doesNotMatch(out,/急速充電/);
});

test('client AI path uses validated copy evidence instead of spec-only evidence',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','public','app.html'),'utf8');
  assert.match(src,/eligibleForCopyEvidence/);
  assert.match(src,/buildValidatedProductPost/);
});
