'use strict';
const assert=require('node:assert/strict');
const {rankProductCandidates}=require('../lib/pro-search');

const items=[
  {itemCode:'shop:1',itemName:'収納ボックス 折りたたみ',itemPrice:2200,reviewCount:200,reviewAverage:4.5,affiliateRate:4,itemCaption:'折りたたみ収納',itemUrl:'https://item.rakuten.co.jp/shop/1/'},
  {itemCode:'shop:2',itemName:'収納ボックス フタ付き',itemPrice:3300,reviewCount:80,reviewAverage:4.2,affiliateRate:3,itemCaption:'フタ付き収納',itemUrl:'https://item.rakuten.co.jp/shop/2/'},
  {itemCode:'shop:3',itemName:'ペット用毛取りグローブ',itemPrice:1200,reviewCount:100,reviewAverage:4.4,affiliateRate:3,itemCaption:'抜け毛に使う',itemUrl:'https://item.rakuten.co.jp/shop/3/'},
  {itemCode:'shop:4',itemName:'ふるさと納税 返礼品',itemPrice:10000,reviewCount:300,reviewAverage:4.9,affiliateRate:5},
  {itemCode:'shop:5',itemName:'収納ボックス 大容量',itemPrice:2800,reviewCount:150,reviewAverage:4.6,affiliateRate:4}
];
const settings={product_keyword:'収納ボックス',genre_name:'収納用品',sort:'standard',sale_priority:false};
const result=rankProductCandidates(settings,items);
assert.equal(result.length,3);
assert.ok(result.every(x=>x.itemCode!=='shop:4'));
assert.ok(result.every(x=>Number.isFinite(x.score)&&Number.isFinite(x.sellability)&&Number.isFinite(x.profitability)));
assert.equal(result[0].itemName.includes('収納ボックス'),true);
assert.deepEqual(rankProductCandidates(settings,items),result,'deterministic results from identical source data');
const excluded=rankProductCandidates(settings,items,{excludeCodes:[result[0].itemCode]});
assert.ok(!excluded.some(x=>x.itemCode===result[0].itemCode));
assert.deepEqual(rankProductCandidates(settings,[]),[]);
console.log('pro-candidate-ranker.test.js: PASS (API-independent ranking)');
