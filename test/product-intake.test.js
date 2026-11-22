'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {intakeProduct}=require('../lib/urenavi-core/product-intake');

test('preserves title and caption without claiming verified product identity',()=>{
 const source={itemCode:'test:1',itemName:'収納ボックス 90cm',itemCaption:'サイズと材質は商品説明を参照。',itemPrice:2980};
 const result=intakeProduct(source);
 assert.equal(result.status,'intake_ready');
 assert.equal(result.product.listingName,'収納ボックス 90cm');
 assert.equal(result.product.rawItemCaption,source.itemCaption);
 assert.equal(result.product.publicationApproved,false);
 assert.equal(result.product.identityConfidence,'listing_title_only');
});
test('fails closed when title or caption is missing',()=>{
 assert.equal(intakeProduct({itemName:'商品'}).status,'insufficient_source');
 assert.equal(intakeProduct({itemCaption:'説明'}).status,'insufficient_source');
});
test('records option ambiguity without inventing a selected SKU',()=>{
 const result=intakeProduct({itemName:'サイズ選択できる靴下',itemCaption:'カラー別の仕様。'});
 assert.equal(result.product.variantReviewRequired,true);
 assert.equal(result.product.publicationApproved,false);
});


test('a declared specification name survives intake when no safe post is available',()=>{
 const {resolveSourceUnderstanding}=require('../lib/super-urenavi-router');
 const item={itemName:'ALPHA-X 交換部品とは別売の本体',itemCaption:'商品仕様 品 名ALPHA-X（アルファ） 品 番AX-10'};
 const result=resolveSourceUnderstanding(item);
 assert.equal(result.local?.validation.productType.value,'ALPHA-X');
 assert.equal(result.sourceCopy,null);
 assert.equal(result.copyReason,'source_use_unconfirmed');
 assert.equal(resolveSourceUnderstanding({...item,itemCaption:'商品仕様 品 名OTHER 品 番AX-10'}).local,null);
});

test('a declared name can bind a reordered title and only the corroborated feature',()=>{
 const {resolveSourceUnderstanding}=require('../lib/super-urenavi-router');
 const item=require('../tests/fixtures/source-declared-copy-product.json');
 const result=resolveSourceUnderstanding(item);
 assert.equal(result.local.validation.productType.source,'itemCaption');
 assert.ok(result.sourceCopy.text.includes('隙間や細かい部分までしっかり拭ける'));
 const changed=item.itemCaption.replace('素手感覚で使える5本指タイプだから','素手感覚で使える3本指タイプだから');
 assert.ok(!resolveSourceUnderstanding({...item,itemCaption:changed}).sourceCopy);
 assert.ok(!resolveSourceUnderstanding({...item,itemName:'交換用 '+item.itemName}).sourceCopy);
});
