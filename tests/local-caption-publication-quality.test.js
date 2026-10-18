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
test('shared title keywords cannot promote another product or accessory claim to the main item',()=>{
  for(const scope of ['同じシリーズの','関連商品の','別売の','付属の']){
    const item={itemName:'収納ボックス 収納付き',itemCaption:scope+'収納付きベッドは持ち手付きで簡単に移動できます。'};
    assert.equal(localZeroCall(item),null,scope);
    const clean='収納ボックスは持ち手を掛けて収納できます。';
    const candidate=composeLocalPartnerCopy({...item,itemCaption:item.itemCaption+' '+clean,identity:'収納ボックス'});
    assert.equal(candidate?.quote,clean);
  }
});
