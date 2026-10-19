'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {isDescriptorIdentity}=require('../lib/local-identity-role-guard');
const {localZeroCall}=require('../api/room-ai-v3');
const {composeLocalPartnerCopy}=require('../lib/local-partner-reasoner');
test('complete source-associated use case competes with a known product title specification',()=>{
  const item={itemName:'収納ボックス 30L',itemCaption:'収納ボックスには毛布を収納できます。',identity:'収納ボックス'};
  const result=composeLocalPartnerCopy(item);
  assert.equal(result.quote,item.itemCaption);
  assert.equal(result.source,'itemCaption');
  assert.ok(result.decision.evaluatedCount>=2);
  assert.equal(result.decision.runnerUpQuote,'30L');
  assert.ok(result.text.includes(item.itemCaption));
  const ready=localZeroCall(item);
  assert.equal(ready?.quality?.status,'ready');
  assert.ok(ready?.attributes?.some(fact=>fact.quote===item.itemCaption));
  assert.ok(ready?.quality?.text.includes(item.itemCaption));
});
test('unsafe or unrelated caption cannot displace a grounded title choice',()=>{
  for(const itemCaption of [
    '同じシリーズの収納ボックスには毛布を収納できます。',
    '収納ボックスには毛布を収納でき、絶対に傷みません。',
    '収納ボックスには毛布を収納できません。',
    '収納ボックスには毛布を収納出来ません。',
    '収納ボックスには毛布を収納でき、ストレスフリーです。',
    '収納ボックスには毛布を収納でき、使い勝手抜群です。',
    '収納ボックスは幅30cmです。'
  ]){
    const result=composeLocalPartnerCopy({itemName:'収納ボックス 30L',itemCaption,identity:'収納ボックス'});
    assert.equal(result?.quote,'30L');
    assert.equal(result?.source,'itemName');
    assert.ok(!result.text.includes(itemCaption));
  }
});
test('promotional grades are never a whole product identity',()=>{
  for(const value of ['プレミアム','デラックス','ラグジュアリー','高品質','premium'])assert.equal(isDescriptorIdentity(value),true);
  for(const value of ['ヘアブラシ','収納ボックス','モバイルバッテリー'])assert.equal(isDescriptorIdentity(value),false);
  const item=require('./fixtures/room-products.json').find(row=>row.category==='ヘアブラシ').item;
  const result=localZeroCall(item);
  assert.notEqual(result?.productType?.specific,'プレミアム');
  assert.ok(!result||!result.quality.text.includes('プレミアムは、'));
});
test('caption publishing skips decorative promotions and guarantees but can select clean functional evidence',()=>{
  const itemName='グルーミンググローブ',identity='グルーミンググローブ';
  for(const noisy of ['【ペットブラシ | 構造】グルーミンググローブのメッシュ構造です。','グルーミンググローブはメッシュ構造で蒸れる心配はありません。','グルーミンググローブの持ち手はラグジュアリーな高級感です。']){
    const result=composeLocalPartnerCopy({itemName,identity,itemCaption:noisy});
    assert.notEqual(result?.kind,'caption_claim',noisy);
    const clean='グルーミンググローブは持ち手を掛けて収納できます。';
    const selected=composeLocalPartnerCopy({itemName,identity,itemCaption:noisy+' '+clean});
    assert.equal(selected?.quote,clean);
    assert.ok(!selected.text.includes(noisy));
  }
});
test('shared title keywords cannot promote another product or accessory claim to the main item',()=>{
  for(const scope of ['同じシリーズの','関連商品の','別売の','付属の']){
    const item={itemName:'収納ボックス 収納付き',itemCaption:scope+'収納付きベッドは持ち手付きで簡単に移動できます。'};
    assert.equal(localZeroCall(item),null,scope);
    const clean='収納ボックスは持ち手を掛けて収納できます。';
    const candidate=composeLocalPartnerCopy({...item,itemCaption:item.itemCaption+' '+clean,identity:'収納ボックス'});
    assert.equal(candidate?.quote,clean);
  }
});
