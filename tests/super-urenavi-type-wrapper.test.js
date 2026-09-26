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

test('local route never generates type knowledge with Groq',async()=>{
  let calls=0;
  const h=createHandler({
    baseHandler:base({ok:true,route:{route:'local'},validation:VALIDATION}),
    store:store(),
    callKnowledge:async()=>{calls++;return {raw:{}};}
  });
  const res=response();
  await h({},res);
  assert.equal(res.code,200);
  assert.equal(res.body.typeKnowledge.status,'miss');
  assert.equal(res.body.typeKnowledge.groqCalls,0);
  assert.equal(calls,0);
});

test('text route learns a new type once and attaches ranking-only knowledge',async()=>{
  let calls=0;
  const s=store();
  const h=createHandler({
    baseHandler:base({ok:true,route:{route:'text'},validation:VALIDATION}),store:s,
    callKnowledge:async({productType})=>{
      calls++;
      return {model:'mock',raw:{productType,readerSituations:['朝に使う'],decisionAxes:['容量の選び方']}};
    }
  });
  process.env.GROQ_API_KEY='mock';
  const a=response();await h({},a);
  assert.equal(a.body.typeKnowledge.status,'generated');
  assert.equal(a.body.typeKnowledge.knowledge.usage,'ranking_only');
  const b=response();await h({},b);
  assert.equal(b.body.typeKnowledge.status,'hit');
  assert.equal(calls,1);
});

test('cached knowledge on cache route is reused with zero Groq',async()=>{
  let calls=0;
  const s=store({validation_status:'valid',model:'mock',raw_ai_json:{productType:'電気ケトル',readerSituations:['朝に使う'],decisionAxes:['容量の選び方']}});
  const h=createHandler({
    baseHandler:base({ok:true,route:{route:'cache'},validation:VALIDATION}),store:s,
    callKnowledge:async()=>{calls++;return {raw:{}};}
  });
  const res=response();await h({},res);
  assert.equal(res.body.typeKnowledge.status,'hit');
  assert.equal(res.body.typeKnowledge.groqCalls,0);
  assert.equal(calls,0);
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
