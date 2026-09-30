'use strict';
const assert=require('node:assert/strict');
const {composeVariants}=require('../lib/super-urenavi-v3-copy');
const item={itemName:'電気ケトル 0.8L 50-100度 1℃単位',itemPrice:8980};
const validation={valid:true,productType:{specific:'電気ケトル',general:'ケトル',valid:true},attributes:[{name:'容量',value:'0.8L',quote:'0.8L'},{name:'温度設定範囲',value:'50-100度',quote:'50-100度'},{name:'温度設定単位',value:'1℃',quote:'1℃単位'}],decisionAxes:[{text:'飲み物に合わせて温度設定を重視する場合',attributeRefs:[1,2]}],appeals:[
 {index:0,text:'飲み物に合わせて温度を細かく選べる',noHassle:'',scene:'飲み物ごとに温度を変えたいとき',attributeRefs:[1,2],strength:3},
 {index:1,text:'0.8Lなら一度に大量のお湯が不要な場面で選びやすい',noHassle:'',scene:'一人分や少量を沸かしたいとき',attributeRefs:[0],strength:2},
 {index:2,text:'50-100度の範囲を見ながら用途に合う温度を選べる',noHassle:'',scene:'使う温度帯を比べたいとき',attributeRefs:[1],strength:2}
],hooks:[]};
const verifiedAppeals=validation.appeals.map(a=>({...a,verification:{required:false,supported:true,keepDirectFact:true,reason:'supported'}}));
const a=composeVariants({item,analysis:{validation,verifiedAppeals}});
assert.equal(a.tier,'A');assert.equal(a.quality.copyReady,true);assert.equal(a.variants.length,3);
assert.deepEqual(a.variants.map(v=>v.appealIndex),[0,1,2]);
assert.match(a.variants[0].text,/1℃単位/);assert.match(a.variants[0].text,/50-100度/);
assert.match(a.variants[1].text,/0.8L/);assert.doesNotMatch(a.variants[1].text,/飲み物に合わせて温度を細かく選べる/);
assert.match(a.variants[2].text,/50-100度/);assert.doesNotMatch(a.variants[2].text,/0.8Lなら一度に大量/);
for(const v of a.variants){assert.match(v.text,/8,980円/);assert.match(v.text,/ひとことメモ（実際に使用した場合のみ）/);assert.match(v.text,/アフィリエイト広告/);}
assert.equal(new Set(a.variants.map(v=>v.hook)).size,3);
const rejected=composeVariants({item,analysis:{validation,verifiedAppeals:[]}});assert.equal(rejected.tier,'needs_value');assert.equal(rejected.quality.copyReady,false);assert.deepEqual(rejected.variants,[]);
const noFacts=composeVariants({item:{itemName:'未知の商品名',itemPrice:1200},analysis:{validation:{valid:true,productType:{specific:'雑貨',general:'商品',valid:true},attributes:[],decisionAxes:[],appeals:[],hooks:[]},verifiedAppeals:[]}});assert.equal(noFacts.tier,'needs_value');assert.deepEqual(noFacts.variants,[]);
const invalid=composeVariants({item,analysis:{validation:{valid:false},verifiedAppeals:[]}});assert.equal(invalid.tier,'invalid');assert.deepEqual(invalid.variants,[]);
console.log('super-urenavi-v3-copy.test.js: PASS');
