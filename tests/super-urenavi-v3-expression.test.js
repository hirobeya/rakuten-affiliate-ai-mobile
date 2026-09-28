'use strict';
const assert=require('node:assert/strict');
const {
  isDirectRestatement,structuralAppealStrength,rankGroundedAttributes,
  evidenceSentence,productSpecificLeads
}=require('../lib/super-urenavi-v3-expression');

const attributes=[
  {name:'容量',value:'0.8L',valueType:'single',quote:'容量0.8L'},
  {name:'温度設定範囲',value:'50-100度',valueType:'range',quote:'50-100度'},
  {name:'温度設定単位',value:'1℃',valueType:'single',quote:'1℃単位'}
];
const direct={text:'50-100度',noHassle:'',scene:'',attributeRefs:[1],strength:3};
assert.equal(isDirectRestatement(direct,attributes),true);
assert.equal(structuralAppealStrength(direct,attributes),false);

const value={text:'飲み物に合わせて温度を細かく選べる',noHassle:'沸かしてから冷めるのを待たなくていい',scene:'飲み物ごとに温度を変えたいとき',attributeRefs:[1,2],strength:3,verification:{supported:true}};
assert.equal(isDirectRestatement(value,attributes),false);
assert.equal(structuralAppealStrength(value,attributes),true);

const validation={
  productType:{specific:'電気ケトル',general:'ケトル'},
  attributes,
  decisionAxes:[{text:'温度設定の細かさ',attributeRefs:[1,2]}],
  hooks:[]
};
const ranked=rankGroundedAttributes(validation,[value]);
assert.equal(ranked[0].index,1);
assert.match(evidenceSentence(value,attributes),/50-100度/);
assert.match(evidenceSentence(value,attributes),/1℃単位/);
const leads=productSpecificLeads(validation,value,3);
assert.ok(leads.length>=2);
assert.ok(leads.some(x=>/電気ケトル/.test(x.text)));
assert.ok(leads.some(x=>/温度設定の細かさ/.test(x.text)));

console.log('super-urenavi-v3-expression.test.js: PASS');
