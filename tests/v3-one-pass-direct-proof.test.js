'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {validateUnderstanding}=require('../lib/super-urenavi-v3-understanding');
const {canSkipPass2WithExactProof}=require('../lib/super-urenavi-v3-direct-proof');
const {needsPass2,analyzeProductV3}=require('../lib/super-urenavi-v3-engine');

function item(){
  return {
    itemCode:'one-pass:umbrella',
    itemName:'折りたたみ傘',
    itemCaption:'雨の日に使う折りたたみ傘です。使わないときは折りたためます。',
    itemPrice:0
  };
}

function exactRaw(){
  return {
    semanticDraft:true,
    productType:{specific:'折りたたみ傘',general:'傘',quote:'折りたたみ傘'},
    attributes:[
      {name:'原文根拠1',value:'雨の日に使う折りたたみ傘です。',unit:'',qualifier:'',valueType:'text',quote:'雨の日に使う折りたたみ傘です。'},
      {name:'原文根拠2',value:'使わないときは折りたためます。',unit:'',qualifier:'',valueType:'text',quote:'使わないときは折りたためます。'}
    ],
    decisionAxes:[],hooks:[],
    appeals:[{text:'使わないときは折りたためます。',noHassle:'',scene:'雨の日に使う折りたたみ傘です。',attributeRefs:[0,1],strength:3}]
  };
}

test('exact whole source sentences can skip pass2',()=>{
  const target=item();
  const validation=validateUnderstanding(exactRaw(),target);
  assert.equal(validation.valid,true);
  assert.equal(canSkipPass2WithExactProof(validation,target),true);
  assert.equal(needsPass2(validation,target),false);
});

test('semantic paraphrase still requires pass2',()=>{
  const target=item();
  const raw=exactRaw();
  raw.appeals[0].scene='雨の日のお出かけに。';
  const validation=validateUnderstanding(raw,target);
  assert.equal(validation.valid,true);
  assert.equal(canSkipPass2WithExactProof(validation,target),false);
  assert.equal(needsPass2(validation,target),true);
});

test('positive claim inverted from negative source cannot skip pass2',()=>{
  const target={itemCode:'negative',itemName:'ポーチ',itemCaption:'このポーチは防水ではありません。雨天では使用しないでください。',itemPrice:0};
  const raw={
    semanticDraft:true,
    productType:{specific:'ポーチ',general:'収納用品',quote:'ポーチ'},
    attributes:[{name:'原文根拠1',value:'防水',unit:'',qualifier:'',valueType:'text',quote:'このポーチは防水ではありません。'}],
    decisionAxes:[],hooks:[],
    appeals:[{text:'防水です。',noHassle:'',scene:'雨天では使用しないでください。',attributeRefs:[0],strength:3}]
  };
  const validation=validateUnderstanding(raw,target);
  assert.equal(validation.valid,true);
  assert.equal(canSkipPass2WithExactProof(validation,target),false);
  assert.equal(needsPass2(validation,target),true);
});

test('engine completes exact direct proof with one Groq call and zero pass2 calls',async()=>{
  const target=item();
  let pass2Calls=0;
  const stages=[];
  const stored=[];
  const result=await analyzeProductV3({
    item:target,
    model:'mock',
    store:{loadProduct:async()=>null,saveProduct:async row=>{stored.push(row);}},
    consumeQuota:async stage=>{stages.push(stage);return true;},
    callPass1:async()=>({raw:exactRaw(),model:'mock'}),
    callPass2:async()=>{pass2Calls++;throw new Error('pass2 must not run for exact direct proof');}
  });
  assert.equal(result.ok,true);
  assert.deepEqual(result.groq,{pass1Calls:1,pass2Calls:0,totalCalls:1});
  assert.equal(result.pass2Status,'not_needed');
  assert.equal(pass2Calls,0);
  assert.deepEqual(stages,['pass1']);
  assert.equal(stored.at(-1)?.resultStatus,'ok');
});
