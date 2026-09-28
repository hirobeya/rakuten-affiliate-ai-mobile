'use strict';

const assert=require('node:assert/strict');
const {attributePriority,axisForAttribute,factProof,generatedLeads}=require('../lib/super-urenavi-v3-expression');

const validation={
  valid:true,
  productType:{specific:'電気ケトル',general:'ケトル',valid:true},
  attributes:[
    {name:'容量',value:'0.8L',valueType:'single',quote:'容量0.8L'},
    {name:'温度設定範囲',value:'50-100度',valueType:'range',quote:'50-100度'},
    {name:'型番',value:'ABC-1',valueType:'identifier',quote:'ABC-1'}
  ],
  decisionAxes:[
    {text:'温度設定の幅',attributeRefs:[1]},
    {text:'容量',attributeRefs:[0]}
  ],
  hooks:[]
};
const verified=[{
  index:0,text:'飲み物に合わせて温度を選べる',attributeRefs:[1],strength:3,
  verification:{supported:true}
}];

const ranked=attributePriority(validation,verified);
assert.equal(ranked[0].index,1);
assert.equal(axisForAttribute(validation,1).text,'温度設定の幅');
assert.equal(factProof(validation.attributes[1]),'商品情報では「50-100度」と明記されています。');

const leads=generatedLeads(validation,verified,3);
assert.ok(leads.length>=2);
assert.match(leads[0].text,/電気ケトル/);
assert.match(leads[0].text,/温度設定の幅/);
assert.notEqual(leads[0].text,'買ってから「思っていたのと違う」は避けたいところ。');
assert.notEqual(leads[0].text,'毎日使うものほど、選ぶ基準ははっきりさせたい。');

const other={...validation,productType:{specific:'キッチンスケール',general:'はかり',valid:true},decisionAxes:[{text:'計量範囲',attributeRefs:[0]}],attributes:[{name:'計量範囲',value:'0.05g~500g',valueType:'range',quote:'0.05g~500g'}]};
const otherLead=generatedLeads(other,[],1)[0].text;
assert.match(otherLead,/キッチンスケール/);
assert.match(otherLead,/計量範囲/);
assert.notEqual(otherLead,leads[0].text);

console.log('super-urenavi-v3-expression.test.js: PASS');
