'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {isDescriptorIdentity}=require('../lib/local-identity-role-guard');
const {localZeroCall}=require('../api/room-ai-v3');
const {composeLocalPartnerCopy}=require('../lib/local-partner-reasoner');
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
