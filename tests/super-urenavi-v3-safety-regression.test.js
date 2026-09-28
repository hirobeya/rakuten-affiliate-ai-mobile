'use strict';
const assert=require('node:assert/strict');
const {readerLayerSafe,validateUnderstanding}=require('../lib/super-urenavi-v3-understanding');

assert.equal(readerLayerSafe('健康面が気になる人にも安心。'),false);
assert.equal(readerLayerSafe('疲れにくくて長く使えそう。'),false);
assert.equal(readerLayerSafe('ランキング1位だから選びやすい。'),false);
assert.equal(readerLayerSafe('朝の支度で、あと少し余裕が欲しいとき。'),true);

const item={itemName:'電気シェーバー 本体重量 約92g',itemCaption:'商品重量 約92g'};
const checked=validateUnderstanding({
  productType:{specific:'電気シェーバー',general:'シェーバー',quote:'電気シェーバー'},
  attributes:[{name:'商品重量',value:'約92g',unit:'g',qualifier:'約',valueType:'single',quote:'商品重量 約92g'}],
  decisionAxes:[{text:'疲れにくく安心して使えるか',attributeRefs:[0]}],
  appeals:[{text:'持ちやすさの判断材料になる',noHassle:'',scene:'腕が疲れにくいケア',attributeRefs:[0],strength:3}],
  hooks:[{type:'scene',text:'健康面も気にせず安心して使いたいとき。'},{type:'scene',text:'手に持つ道具の重さが気になるとき。'}]
},item);

assert.equal(checked.valid,true);
assert.equal(checked.decisionAxes.length,0);
assert.equal(checked.appeals.length,0);
assert.deepEqual(checked.hooks.map(x=>x.text),['手に持つ道具の重さが気になるとき。']);
console.log('super-urenavi-v3-safety-regression.test.js: PASS');
