'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {dimensions,sameDimension,withoutDimensions,relevantQualifiers}=require('../../lib/room-writer-raw/verify');

function equalDimension(source,claim){
 const allowed=dimensions(source),got=dimensions(claim);
 return got.length===1&&allowed.some(x=>sameDimension(x,got[0]));
}
test('dimension: equivalent omitted first unit is accepted',()=>{
 assert.equal(equalDimension('約22cm×13cm','約22×13cm'),true);
 assert.equal(equalDimension('約22cm×13cm','約22cm×13cm'),true);
});
test('dimension: changed size, unit and approximate scope remain rejected',()=>{
 assert.equal(equalDimension('約22cm×13cm','約23×13cm'),false);
 assert.equal(equalDimension('約22cm×13cm','約22×13mm'),false);
 assert.equal(equalDimension('約22cm×13cm','22×13cm'),false);
 assert.equal(equalDimension('約22cm×13cm','約13×22cm'),false);
});
test('dimension: consumed dimension is not mistaken for a standalone numeric claim',()=>{
 assert.equal(withoutDimensions('約22×13cm、重量約55g').includes('22'),false);
 assert.equal(withoutDimensions('約22×13cm、重量約55g').includes('55g'),true);
});
test('qualifier: additive だけでなく is not an exclusive limitation',()=>{
 assert.equal(relevantQualifiers('毛並みをきれいに整えるだけでなく、抜け毛を取ります').includes('だけ'),false);
 assert.equal(relevantQualifiers('毛並みを整えるだけではなく、抜け毛も取ります').includes('だけ'),false);
});
test('qualifier: true exclusive だけ stays subject to scope checks',()=>{
 assert.equal(relevantQualifiers('このモデルだけ対応').includes('だけ'),true);
 assert.equal(relevantQualifiers('このモデルのみ対応').includes('のみ'),true);
});
