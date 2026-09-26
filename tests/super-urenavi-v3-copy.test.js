'use strict';

const assert=require('node:assert/strict');
const {composeVariants}=require('../lib/super-urenavi-v3-copy');

const item={itemName:'電気ケトル 0.8L 50-100度 1℃単位',itemPrice:8980};
const validation={
  valid:true,
  productType:{specific:'電気ケトル',general:'ケトル',valid:true},
  attributes:[
    {name:'容量',value:'0.8L',quote:'0.8L'},
    {name:'温度設定範囲',value:'50-100度',quote:'50-100度'},
    {name:'温度設定単位',value:'1℃',quote:'1℃単位'}
  ],
  hooks:[
    {type:'question',text:'飲み物ごとに、お湯の温度を気にすることありませんか？'},
    {type:'scene',text:'朝の一杯を自分好みにしたいとき。'},
    {type:'failure_avoidance',text:'好みの温度になるまで待つ時間、気になったことありませんか？'}
  ]
};
const verifiedAppeals=[{
  index:0,text:'飲み物に合わせて温度を細かく選べる',noHassle:'沸かしてから冷めるのを待たなくていい',scene:'',attributeRefs:[1,2],strength:3,
  verification:{required:true,supported:true,keepDirectFact:true,reason:'supported'}
}];

const a=composeVariants({item,analysis:{validation,verifiedAppeals}});
assert.equal(a.tier,'A');
assert.equal(a.variants.length,3);
for(const v of a.variants){
  assert.match(v.text,/50-100度/);
  assert.match(v.text,/1℃単位/);
  assert.match(v.text,/飲み物に合わせて温度を細かく選べる/);
  assert.match(v.text,/8,980円/);
  assert.match(v.text,/ひとことメモ（実際に使用した場合のみ）/);
  assert.match(v.text,/アフィリエイト広告/);
  assert.doesNotMatch(v.text,/実際に使ってみた|使ってよかった/);
}
assert.notEqual(a.variants[0].hook,a.variants[1].hook);

const b=composeVariants({item,analysis:{validation,verifiedAppeals:[]}});
assert.equal(b.tier,'B');
assert.ok(b.variants.length>=2);
assert.match(b.variants[0].text,/0.8L/);
assert.doesNotMatch(b.variants[0].text,/沸かしてから冷めるのを待たなくていい/);

const c=composeVariants({item:{itemName:'未知の商品名',itemPrice:1200},analysis:{validation:{valid:true,productType:{specific:'雑貨',general:'商品',valid:true},attributes:[],hooks:[]},verifiedAppeals:[]}});
assert.equal(c.tier,'C');
assert.equal(c.variants.length,3);
assert.match(c.variants[0].text,/雑貨の商品情報/);
assert.match(c.variants[0].text,/1,200円/);

const invalid=composeVariants({item,analysis:{validation:{valid:false},verifiedAppeals:[]}});
assert.equal(invalid.tier,'invalid');
assert.deepEqual(invalid.variants,[]);

console.log('super-urenavi-v3-copy.test.js: PASS');
