'use strict';
const assert=require('node:assert/strict');
const {readerLayerSafe,validateUnderstanding}=require('../lib/super-urenavi-v3-understanding');
const {composeVariants}=require('../lib/super-urenavi-v3-copy');

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

// Historical fryer-style leakage: direct facts must not license health or cleanup claims.
const fryerItem={itemName:'ノンフライヤー 14L 1400W 50-220℃',itemCaption:'容量14L、消費電力1400W、温度設定50-220℃'};
const fryerChecked=validateUnderstanding({
 productType:{specific:'ノンフライヤー',general:'調理家電',quote:'ノンフライヤー'},
 attributes:[
  {name:'容量',value:'14L',unit:'L',qualifier:'',valueType:'single',quote:'容量14L'},
  {name:'温度設定',value:'50-220℃',unit:'℃',qualifier:'',valueType:'range',quote:'温度設定50-220℃'}
 ],
 decisionAxes:[{text:'健康的に調理できて掃除も楽か',attributeRefs:[0,1]}],
 appeals:[{text:'ヘルシーな料理を手軽に作れる',noHassle:'掃除の手間が減る',scene:'健康を気にする食事',attributeRefs:[0,1],strength:3}],
 hooks:[{type:'question',text:'健康面を気にしながら手軽に料理したくありませんか？'},{type:'scene',text:'料理の温度や量を見比べたいとき。'}]
},fryerItem);
assert.equal(fryerChecked.decisionAxes.length,0);
assert.equal(fryerChecked.appeals.length,0);
assert.deepEqual(fryerChecked.hooks.map(x=>x.text),['料理の温度や量を見比べたいとき。']);

const kettleItem={itemName:'電気ケトル 温度調節 50-100度 1℃単位',itemCaption:'50-100度を1℃単位で設定できます。',itemPrice:8980};
const kettleRaw={
 productType:{specific:'電気ケトル',general:'ケトル',quote:'電気ケトル'},
 attributes:[
  {name:'温度設定範囲',value:'50-100度',unit:'度',qualifier:'',valueType:'range',quote:'50-100度'},
  {name:'温度設定単位',value:'1℃',unit:'℃',qualifier:'単位',valueType:'single',quote:'1℃単位'}
 ],
 decisionAxes:[{text:'温度設定の細かさ',attributeRefs:[0,1]}],
 appeals:[{text:'飲み物に合わせて温度を細かく選べる',noHassle:'',scene:'飲み物ごとに温度を変えたいとき',attributeRefs:[0,1],strength:3}],
 hooks:[{type:'question',text:'飲み物ごとに、お湯の温度を気にすることありませんか？'}]
};
const kettleValidation=validateUnderstanding(kettleRaw,kettleItem);
assert.equal(kettleValidation.attributes[1].quote,'1℃単位');
assert.equal(kettleValidation.attributes[1].value,'1℃');
const verified=kettleValidation.appeals.map(a=>({...a,verification:{required:true,supported:true,keepDirectFact:true,reason:'supported'}}));
const composed=composeVariants({item:kettleItem,analysis:{validation:kettleValidation,verifiedAppeals:verified}});
assert.equal(composed.tier,'A');
assert.match(composed.variants[0].text,/1℃単位/);
assert.doesNotMatch(composed.variants[0].text,/1°C単位/);

// Unicode-equivalent substitutions are still not literal source evidence.
const alteredQuote=validateUnderstanding({
 ...kettleRaw,
 attributes:[kettleRaw.attributes[0],{...kettleRaw.attributes[1],value:'1°C',unit:'°C',quote:'1°C単位'}]
},kettleItem);
assert.equal(alteredQuote.attributes.length,1);
assert.ok(alteredQuote.reasons.includes('attribute_quote_not_grounded:1'));

console.log('super-urenavi-v3-safety-regression.test.js: PASS');
