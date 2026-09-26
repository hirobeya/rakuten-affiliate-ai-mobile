'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {createHandler}=require('../lib/super-urenavi-type-wrapper');

function response(){
  return {
    code:0,body:null,headers:{},
    setHeader(k,v){this.headers[k]=v;},
    status(code){this.code=code;return this;},
    json(body){this.body=body;return body;}
  };
}

function store(seed=null){
  let row=seed;
  return {
    async loadTypeKnowledge(){return row;},
    async saveTypeKnowledge(input){row={...input,raw_ai_json:input.rawAiJson,validation_status:input.validationStatus};}
  };
}

function base(payload){
  return async (_req,res)=>res.status(200).json(JSON.parse(JSON.stringify(payload)));
}

const VALIDATION={productType:{valid:true,value:'電気ケトル'}};

function knowledgeCall(counter){
  return async({productType})=>{
    counter.count++;
    return {model:'mock',raw:{productType,readerSituations:['朝の支度'],decisionAxes:['容量の選び方']}};
  };
}

test('validated local route learns type knowledge once, then reuses it',async()=>{
  const counter={count:0},s=store();
  process.env.GROQ_API_KEY='mock';
  const h=createHandler({
    baseHandler:base({ok:true,route:{route:'local'},validation:VALIDATION}),
    store:s,callKnowledge:knowledgeCall(counter)
  });
  const a=response();await h({},a);
  assert.equal(a.body.typeKnowledge.status,'generated');
  assert.equal(a.body.typeKnowledge.groqCalls,1);
  const b=response();await h({},b);
  assert.equal(b.body.typeKnowledge.status,'hit');
  assert.equal(b.body.typeKnowledge.groqCalls,0);
  assert.equal(counter.count,1);
});

test('text route learns a new type once and attaches ranking-only knowledge',async()=>{
  const counter={count:0},s=store();
  const h=createHandler({
    baseHandler:base({ok:true,route:{route:'text'},validation:VALIDATION}),store:s,
    callKnowledge:knowledgeCall(counter)
  });
  process.env.GROQ_API_KEY='mock';
  const a=response();await h({},a);
  assert.equal(a.body.typeKnowledge.status,'generated');
  assert.equal(a.body.typeKnowledge.knowledge.usage,'ranking_only');
  const b=response();await h({},b);
  assert.equal(b.body.typeKnowledge.status,'hit');
  assert.equal(counter.count,1);
});

test('cached knowledge on cache route is reused with zero Groq',async()=>{
  let calls=0;
  const s=store({validation_status:'valid',model:'mock',raw_ai_json:{productType:'電気ケトル',readerSituations:['朝の支度'],decisionAxes:['容量の選び方']}});
  const h=createHandler({
    baseHandler:base({ok:true,route:{route:'cache'},validation:VALIDATION}),store:s,
    callKnowledge:async()=>{calls++;return {raw:{}};}
  });
  const res=response();await h({},res);
  assert.equal(res.body.typeKnowledge.status,'hit');
  assert.equal(res.body.typeKnowledge.groqCalls,0);
  assert.equal(calls,0);
});

test('cache route generates once when product understanding exists but type knowledge does not',async()=>{
  const counter={count:0},s=store();
  process.env.GROQ_API_KEY='mock';
  const h=createHandler({
    baseHandler:base({ok:true,route:{route:'cache'},validation:VALIDATION}),store:s,
    callKnowledge:knowledgeCall(counter)
  });
  const res=response();await h({},res);
  assert.equal(res.body.typeKnowledge.status,'generated');
  assert.equal(counter.count,1);
});

test('invalid or failed product understanding never triggers type knowledge',async()=>{
  let calls=0;
  const h=createHandler({
    baseHandler:base({ok:true,route:{route:'text'},validation:{productType:{valid:false,value:'商品'}}}),
    store:store(),callKnowledge:async()=>{calls++;return {raw:{}};}
  });
  const res=response();await h({},res);
  assert.equal(res.body.typeKnowledge,undefined);
  assert.equal(calls,0);
});
