'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {localZeroCall,extractLiteralSpecs}=require('../api/room-ai-v3');

test('numeric unit attached to a component noun is not sliced into a standalone fact',()=>{
  const specs=extractLiteralSpecs({itemName:'自動給餌器 スマホ操作 カメラ付き 5gプロペラ付き'});
  assert.equal(specs.some(x=>x.quote==='5g'),false);
});

test('origin-only metadata cannot complete a zero-call ROOM post',()=>{
  const result=localZeroCall({
    itemCode:'quality:origin-only',
    itemName:'電子体温計 日本製',
    itemCaption:'約15秒で検温。前回値メモリ付き。',
    itemPrice:2200
  });
  assert.equal(result,null);
});

test('equivalent volume spellings remain deduplicated facts without becoming a label-only finished post',()=>{
  const item={
    itemCode:'quality:volume-dedupe',
    itemName:'電気ケトル 1.2L 1200ml',
    itemCaption:'',
    itemPrice:3759
  };
  assert.equal(localZeroCall(item),null);
  const result=localZeroCall({...item,itemCaption:'電気ケトルは1.2Lの容量で、カップ6杯分のお湯を用意できます。'});
  assert.ok(result,'a complete source use relationship still allows local publication');
  const values=result.attributes.map(x=>x.quote);
  assert.equal(values.filter(x=>x==='1.2L'||x==='1200ml').length,1);

});


test('grounded caption purchase reason completes locally with zero Groq calls',()=>{
  const result=localZeroCall({
    itemCode:'quality:caption-grounded',
    itemName:'洗濯ネット ふくらむ洗濯ネット特大70 大容量 布団 毛布 70cm ドラム式',
    itemCaption:'シングルサイズの布団が入る大容量サイズです。口が大きく開くので寝具等の大物でも出し入れがしやすいロングファスナーを使用しています。',
    itemPrice:1680
  });
  assert.ok(result);
  assert.equal(result.groq.totalCalls,0);
  assert.equal(result.quality.status,'ready');
  assert.equal(result.local.method,'partner_reasoning');
  assert.match(result.quality.text,/布団|ロングファスナー/);
});


test('bare count or size facts cannot complete a local ROOM post',()=>{
  assert.equal(localZeroCall({
    itemCode:'quality:count-only',
    itemName:'洗濯ネット 6枚セット',
    itemCaption:'',
    itemPrice:1000
  }),null);
  assert.equal(localZeroCall({
    itemCode:'quality:size-only',
    itemName:'洗濯ネット 110cm×90cm',
    itemCaption:'',
    itemPrice:700
  }),null);
});

test('caption evidence does not turn bare dimensions or a negated claim into a purchase reason',()=>{
  for(const itemCaption of ['サイズは110cm×90cmです。','布団を収納できない洗濯ネットです。']){
    assert.equal(localZeroCall({itemName:'洗濯ネット 110cm×90cm 布団',itemCaption}),null);
  }
});

test('sleeve or season labels alone remain drafts rather than zero-call completed posts',()=>{
  for(const spec of ['長袖','半袖','春夏','秋冬']){
    assert.equal(localZeroCall({itemName:'シャツ '+spec,itemCaption:''}),null,spec);
  }
  const result=localZeroCall({itemName:'コードレス 掃除機',itemCaption:''});
  assert.ok(result,'a separate grounded functional reason must remain available');
  assert.equal(result.groq.totalCalls,0);
});
