'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  validateKnowledge,resolveTypeKnowledge,KNOWLEDGE_PROMPT_VERSION
}=require('../lib/product-type-knowledge');

function memoryStore(seed=null,{failRead=false,failWrite=false}={}){
  let row=seed;
  return {
    async loadTypeKnowledge(){if(failRead) throw new Error('db down'); return row;},
    async saveTypeKnowledge(input){if(failWrite) throw new Error('db down'); row={...input,raw_ai_json:input.rawAiJson,validation_status:input.validationStatus};},
    read(){return row;}
  };
}

test('knowledge is ranking-only and strips capability/claim phrases',()=>{
  const checked=validateKnowledge({
    productType:'電気ケトル',
    readerSituations:['朝に使う','安心して使う','4時間保温'],
    decisionAxes:['容量の選び方','高速沸騰','置く場所との相性']
  },'電気ケトル');
  assert.equal(checked.valid,true);
  assert.deepEqual(checked.knowledge.readerSituations,['朝に使う']);
  assert.deepEqual(checked.knowledge.decisionAxes,['容量の選び方','置く場所との相性']);
  assert.equal(checked.knowledge.usage,'ranking_only');
});

test('cache hit uses zero Groq calls',async()=>{
  let calls=0;
  const store=memoryStore({
    validation_status:'valid',model:'mock',raw_ai_json:{
      productType:'ワイヤレスイヤホン',readerSituations:['通勤中に使う'],decisionAxes:['装着感を比べる']
    }
  });
  const r=await resolveTypeKnowledge({
    productType:'ワイヤレスイヤホン',store,generateOnMiss:true,apiKey:'x',
    callKnowledge:async()=>{calls++;throw new Error('must not call');}
  });
  assert.equal(r.status,'hit');
  assert.equal(r.groqCalls,0);
  assert.equal(calls,0);
});

test('cache miss does not call Groq unless explicitly allowed',async()=>{
  let calls=0;
  const r=await resolveTypeKnowledge({
    productType:'フードプロセッサー',store:memoryStore(),generateOnMiss:false,apiKey:'x',
    callKnowledge:async()=>{calls++;return {raw:{}};}
  });
  assert.equal(r.status,'miss');
  assert.equal(r.groqCalls,0);
  assert.equal(calls,0);
});

test('new type generates once, validates, stores, then reuses cache',async()=>{
  let calls=0;
  const store=memoryStore();
  const callKnowledge=async({productType})=>{
    calls++;
    return {model:'mock',raw:{
      productType,
      readerSituations:['外出前に使う','毎日の支度で使う'],
      decisionAxes:['手入れ方法を比べる','サイズ感を比べる']
    }};
  };
  const first=await resolveTypeKnowledge({productType:'電気シェーバー',store,generateOnMiss:true,apiKey:'x',callKnowledge});
  assert.equal(first.status,'generated');
  assert.equal(first.groqCalls,1);
  assert.equal(store.read().validation_status,'valid');
  assert.equal(store.read().promptVersion,KNOWLEDGE_PROMPT_VERSION);
  const second=await resolveTypeKnowledge({productType:'電気シェーバー',store,generateOnMiss:true,apiKey:'x',callKnowledge});
  assert.equal(second.status,'hit');
  assert.equal(second.groqCalls,0);
  assert.equal(calls,1);
});

test('invalid knowledge is negative cached and not regenerated immediately',async()=>{
  let calls=0;
  const store=memoryStore();
  const callKnowledge=async({productType})=>{
    calls++;
    return {model:'mock',raw:{productType,readerSituations:['安心'],decisionAxes:['必ず改善']}};
  };
  const first=await resolveTypeKnowledge({productType:'加湿器',store,generateOnMiss:true,apiKey:'x',callKnowledge});
  assert.equal(first.status,'generated_invalid');
  assert.equal(store.read().validation_status,'invalid');
  const second=await resolveTypeKnowledge({productType:'加湿器',store,generateOnMiss:true,apiKey:'x',callKnowledge});
  assert.equal(second.status,'negative_hit');
  assert.equal(calls,1);
});

test('cache outage prevents Groq generation to avoid repeated paid calls',async()=>{
  let calls=0;
  const r=await resolveTypeKnowledge({
    productType:'ノンフライヤー',store:memoryStore(null,{failRead:true}),generateOnMiss:true,apiKey:'x',
    callKnowledge:async()=>{calls++;return {raw:{}};}
  });
  assert.equal(r.status,'cache_unavailable');
  assert.equal(r.groqCalls,0);
  assert.equal(calls,0);
});
