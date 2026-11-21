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
