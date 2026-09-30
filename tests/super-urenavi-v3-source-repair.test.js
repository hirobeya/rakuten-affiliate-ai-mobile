'use strict';
const assert=require('node:assert/strict');
const {recoverExactSubstring,repairPass1SourceText}=require('../lib/super-urenavi-v3-source-repair');

assert.equal(recoverExactSubstring('50〜100℃の範囲','50-100°C'),'50〜100℃');
assert.equal(recoverExactSubstring('1℃単位で設定','1°C単位'),'1℃単位');
assert.equal(recoverExactSubstring('容量0.8L','容量0.8L'),'容量0.8L');
assert.equal(recoverExactSubstring('10cmと10cm','10cm'),'','ambiguous repeated source must not be guessed');

const item={itemName:'電気ケトル 0.8L 50〜100℃ 1℃単位',itemCaption:'容量0.8L。50〜100℃の範囲を1℃単位で設定できます。'};
const raw={productType:{specific:'電気ケトル',general:'ケトル',quote:'電気ケトル'},attributes:[{name:'温度範囲',value:'50-100°C',unit:'℃',qualifier:'',valueType:'range',quote:'50-100°C'},{name:'設定単位',value:'1°C',unit:'℃',qualifier:'単位',valueType:'single',quote:'1°C単位'}],decisionAxes:[],appeals:[],hooks:[]};
const fixed=repairPass1SourceText(raw,item);
assert.equal(fixed.attributes[0].quote,'50〜100℃');
assert.equal(fixed.attributes[0].value,'50〜100℃');
assert.equal(fixed.attributes[1].quote,'1℃単位');
assert.equal(fixed.attributes[1].value,'1℃');
console.log('super-urenavi-v3-source-repair.test.js: PASS');
