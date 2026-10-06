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


{
  const semantic={
    semanticDraft:true,
    attributes:[
      {name:'原文根拠1',value:'型崩れを防ぐ',quote:'型崩れを防ぐ'},
      {name:'原文根拠2',value:'ドラム式対応',quote:'ドラム式対応'}
    ],
    appeals:[{
      index:0,
      text:'ブラジャー用洗濯ネットは型崩れを防ぎ、ドラム式でも使えます。',
      noHassle:'',
      scene:'洗濯機で洗うときに形崩れが心配なとき',
      attributeRefs:[0,1],
      strength:3,
      needsVerification:true
    }]
  };
  const verified=applyVerification(semantic,{results:[{
    verificationIndex:0,
    supported:false,
    keepDirectFact:true,
    reason:'scene only unsupported',
    checks:[
      {sentence:'洗濯機で洗うときに形崩れが心配なとき',supported:false,evidenceQuotes:[],reason:'scene unsupported'},
      {sentence:'ブラジャー用洗濯ネットは型崩れを防ぎ、ドラム式でも使えます。',supported:true,evidenceQuotes:['型崩れを防ぐ','ドラム式対応'],reason:'body supported'}
    ]
  }]});
  assert.equal(verified[0].verification.supported,true,'semantic verification keeps supported body');
  assert.equal(verified[0].scene,'');
  assert.equal(verified[0].verification.reason,'verified_text_scene_dropped');
}

{
  const semantic={
    semanticDraft:true,
    attributes:[{name:'原文根拠',value:'シングルサイズの布団が入る大容量サイズです。',quote:'シングルサイズの布団が入る大容量サイズです。'}],
    appeals:[{
      index:0,
      text:'シングルサイズの布団が入る大容量サイズです。',
      noHassle:'',
      scene:'シングルサイズの布団を洗いたいとき',
      attributeRefs:[0],
      strength:3,
      needsVerification:true
    }]
  };
  const verified=applyVerification(semantic,{results:[{
    verificationIndex:0,
    supported:false,
    keepDirectFact:true,
    reason:'model top-level flag is inconsistent',
    checks:[
      {sentence:'シングルサイズの布団を洗いたいとき',supported:true,evidenceQuotes:['シングルサイズの布団が入る大容量サイズです。'],reason:'supported'},
      {sentence:'シングルサイズの布団が入る大容量サイズです。',supported:true,evidenceQuotes:['シングルサイズの布団が入る大容量サイズです。'],reason:'supported'}
    ]
  }]});
  assert.equal(verified[0].verification.supported,true,'checks, not contradictory top-level flag, decide semantic support');
  assert.equal(verified[0].scene,'シングルサイズの布団を洗いたいとき');
}
