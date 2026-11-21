'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const quality=require('../public/purchase-copy-quality');
const html=fs.readFileSync(path.resolve(__dirname,'../public/app.html'),'utf8');

test('quality gate is the previously verified generic PR184 module, not a new product-specific rule',()=>{
 assert.match(html,/<script src="\/purchase-copy-quality\.js\?v=20261121-1"><\/script>/);
 assert.match(html,/quality\.catalogueOnly\(text\)\|\|quality\.restatedReason\(text,\{identity\}\)/);
 assert.equal(typeof quality.catalogueOnly,'function');
 assert.equal(typeof quality.restatedReason,'function');
});
test('catalogue-only pitch is blocked; concrete cited use statements are not rejected just for their category',()=>{
 assert.equal(quality.catalogueOnly('仕様を確認して選ぶ商品です。'),true);
 assert.equal(quality.catalogueOnly('幅20cmの収納ケースで、棚の空きスペースに収まります。'),false);
 assert.ok(quality.restatedReason('組み合わせ自由です。とても便利です。',{identity:'収納ケース'}));
 assert.equal(quality.restatedReason('組み合わせを用途に合わせて選べます。',{identity:'収納ケース'}),'');
});
