'use strict';

const assert=require('node:assert/strict');
const {buildVerificationInput,applyVerification}=require('../lib/super-urenavi-v3-verifier');

const validation={
  attributes:[
    {name:'計量範囲',value:'0.05g~500g',unit:'g',qualifier:'',quote:'0.05g~500g'},
    {name:'本体重量',value:'約178g',unit:'g',qualifier:'約',quote:'本体重量約178g'},
    {name:'型番',value:'EC1165-51W',unit:'',qualifier:'',quote:'EC1165-51W'}
  ],
  appeals:[
    {index:0,text:'少量を量るときの判断材料になる',noHassle:'',scene:'料理で少量を計量するとき',attributeRefs:[0],strength:3,needsVerification:true},
    {index:1,text:'約178g',noHassle:'',scene:'',attributeRefs:[1],strength:2,needsVerification:false},
    {index:2,text:'必要な電力条件に合う',noHassle:'',scene:'',attributeRefs:[2],strength:3,needsVerification:true}
  ]
};

const input=buildVerificationInput(validation);
assert.equal(input.length,2);
assert.equal(input[0].appealIndex,0);
assert.equal(input[1].appealIndex,2);
assert.deepEqual(Object.keys(input[0]).sort(),['appealIndex','attributes','proposed','verificationIndex'].sort());
assert.equal(input[0].attributes[0].quote,'0.05g~500g');
assert.equal('reasoning' in input[0],false);

const applied=applyVerification(validation,{results:[
  {verificationIndex:0,supported:true,keepDirectFact:true,reason:'計量範囲から少量計量の場面は無理がない'},
  {verificationIndex:1,supported:false,keepDirectFact:true,reason:'型番から電力条件は判断できない'}
]});
assert.equal(applied[0].verification.supported,true);
assert.equal(applied[1].verification.required,false);
assert.equal(applied[1].verification.supported,true);
assert.equal(applied[2].verification.supported,false);
assert.equal(applied[2].verification.keepDirectFact,true);

const missing=applyVerification(validation,{results:[]});
assert.equal(missing[0].verification.supported,false);
assert.equal(missing[0].verification.reason,'missing_verification');
assert.equal(missing[2].verification.supported,false);

console.log('super-urenavi-v3-verifier.test.js: PASS');
