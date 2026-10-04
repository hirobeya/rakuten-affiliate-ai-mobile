'use strict';

const assert=require('node:assert/strict');
const {createHandler,localZeroCall}=require('../api/room-ai-v3');

function memoryStore(){
  let row=null;
  return {
    async loadProduct(){return row;},
    async saveProduct(x){row={schema_version:x.schemaVersion,raw_ai_json:x.rawAiJson,model:x.model,result_status:x.resultStatus};}
  };
}
function mockRes(){
  return {code:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(x){this.body=x;return this;}};
}
function groqMock(pass1,pass2,{model='mock',calls={pass1:0,pass2:0}}={}){
  return {
    calls,
    callPass1:async()=>{calls.pass1++;return {raw:pass1,model};},
    callPass2:async()=>{calls.pass2++;return {raw:pass2,model};}
  };
}

const baseItem={itemCode:'shop:1',itemName:'電気ケトル 0.8L 50-100度 1℃単位',itemCaption:'容量0.8L。50-100度を1℃単位で設定できます。',itemPrice:8980};
const localItem={itemCode:'mop:1',itemName:'電動モップ 充電式 コードレス',itemCaption:'充電式の電動モップ。コードレス。',itemPrice:4980};
const pass1Direct={
  productType:{specific:'電気ケトル',general:'ケトル',quote:'電気ケトル'},
  attributes:[{name:'容量',value:'0.8L',unit:'L',qualifier:'',valueType:'single',quote:'0.8L'}],
  decisionAxes:[{text:'容量',attributeRefs:[0]}],
  appeals:[{text:'0.8L',noHassle:'',scene:'',attributeRefs:[0],strength:2}],
  hooks:[]
};
const pass1NeedsReview={
  productType:{specific:'電気ケトル',general:'ケトル',quote:'電気ケトル'},
  attributes:[
    {name:'温度設定範囲',value:'50-100度',unit:'度',qualifier:'',valueType:'range',quote:'50-100度'},
    {name:'温度設定単位',value:'1℃',unit:'℃',qualifier:'単位',valueType:'single',quote:'1℃単位'}
  ],
  decisionAxes:[{text:'温度設定',attributeRefs:[0,1]}],
  appeals:[{text:'50-100度を1℃単位で設定できる電気ケトルです',noHassle:'',scene:'飲み物ごとに温度を変えたいとき',attributeRefs:[0,1],strength:3}],
  hooks:[]
};
const pass2={results:[{verificationIndex:0,supported:true,keepDirectFact:true,reason:'原文範囲内'}]};

(async()=>{
  const oldEnv=process.env.VERCEL_ENV;
  process.env.VERCEL_ENV='preview';
  try{
    {
      const local=localZeroCall(localItem);
      assert.ok(local);
      assert.equal(local.model,'local');
      assert.equal(local.groq.totalCalls,0);
      assert.equal(local.pass2Status,'not_needed');
      assert.match(local.quality.text,/電動モップ/);
      assert.match(local.quality.text,/コードをつながずに使う/);
    }

    {
      let quota=0,groq=0;
      const handler=createHandler({
        authorize:async()=>({ok:true,plan:'owner'}),store:memoryStore(),
        consumeQuota:async()=>{quota++;return true;},
        groq:{callPass1:async()=>{groq++;throw new Error('Groq must not run on local route');},callPass2:async()=>{groq++;throw new Error('Groq must not run on local route');}}
      });
      const res=mockRes();
      await handler({method:'POST',body:localItem},res);
      assert.equal(res.code,200);
      assert.equal(res.body.model,'local');
      assert.equal(res.body.groq.totalCalls,0);
      assert.equal(quota,0);
      assert.equal(groq,0);
    }

    {
      const calls={pass1:0,pass2:0};
      const handler=createHandler({authorize:async()=>({ok:true,plan:'owner'}),store:memoryStore(),consumeQuota:async()=>true,groq:groqMock(pass1Direct,pass2,{calls})});
      const res=mockRes();
      await handler({method:'POST',body:baseItem},res);
      assert.equal(res.code,200);
      assert.equal(res.body.groq.pass1Calls,1);
      assert.equal(res.body.groq.pass2Calls,0);
      assert.equal(res.body.pass2Status,'not_needed');
      assert.equal(calls.pass1,1);
      assert.equal(calls.pass2,0);
    }

    {
      const calls={pass1:0,pass2:0};
      const handler=createHandler({authorize:async()=>({ok:true,plan:'owner'}),store:memoryStore(),consumeQuota:async()=>true,groq:groqMock(pass1NeedsReview,pass2,{calls})});
      const res=mockRes();
      await handler({method:'POST',body:baseItem},res);
      assert.equal(res.code,200);
      assert.equal(res.body.groq.pass1Calls,1);
      assert.equal(res.body.groq.pass2Calls,1);
      assert.equal(res.body.pass2Status,'generated');
      assert.equal(calls.pass1,1);
      assert.equal(calls.pass2,1);
    }

    {
      let quota=0;
      const handler=createHandler({authorize:async()=>({ok:true,plan:'owner'}),store:memoryStore(),consumeQuota:async()=>{quota++;return true;},groq:groqMock(pass1NeedsReview,pass2)});
      const res=mockRes();
      await handler({method:'POST',body:{...baseItem,statusOnly:true}},res);
      assert.equal(res.code,202);
      assert.equal(res.body.phase,'not_started');
      assert.equal(res.body.groq.totalCalls,0);
      assert.equal(quota,0);
    }

    {
      let selectedModel='';
      const handler=createHandler({
        authorize:async()=>({ok:true,plan:'owner'}),store:memoryStore(),consumeQuota:async()=>true,
        createGroq:({model})=>{selectedModel=model;return groqMock(pass1Direct,pass2,{model});}
      });
      const bad=mockRes();
      await handler({method:'POST',body:{...baseItem,evaluationModel:'openai/gpt-oss-20b'}},bad);
      assert.equal(bad.code,400);
      const ok=mockRes();
      await handler({method:'POST',body:{...baseItem,evaluationRun:'comparison',evaluationModel:'openai/gpt-oss-20b'}},ok);
      assert.equal(ok.code,200);
      assert.equal(selectedModel,'openai/gpt-oss-20b');
    }

    {
      let localCalls=0,aiCalls=0;
      const handler=createHandler({
        authorize:async()=>({ok:true,plan:'owner'}),store:memoryStore(),consumeQuota:async()=>true,
        localZeroCall:()=>{localCalls++;return {ok:true,groq:{pass1Calls:0,pass2Calls:0,totalCalls:0}};},
        groq:{callPass1:async()=>{aiCalls++;return {raw:pass1Direct,model:'mock'};},callPass2:async()=>{aiCalls++;return {raw:pass2,model:'mock'};}}
      });
      const res=mockRes();
      await handler({method:'POST',body:{...baseItem,evaluationRun:'force_ai'}},res);
      assert.equal(res.code,200);
      assert.equal(localCalls,0);
      assert.equal(aiCalls,1);
      assert.equal(res.body.groq.pass1Calls,1);
    }

    {
      const handler=createHandler({authorize:async()=>({ok:true,plan:'owner'}),store:memoryStore(),consumeQuota:async()=>false,groq:groqMock(pass1Direct,pass2),localZeroCall:()=>null});
      const res=mockRes();
      await handler({method:'POST',body:baseItem},res);
      assert.equal(res.code,429);
      assert.equal(res.body.message,'AI daily limit reached');
    }

    process.env.VERCEL_ENV='production';
    const blocked=mockRes();
    const handler=createHandler({authorize:async()=>({ok:true,plan:'owner'}),store:memoryStore(),consumeQuota:async()=>true,groq:groqMock(pass1Direct,pass2)});
    await handler({method:'POST',body:baseItem},blocked);
    assert.equal(blocked.code,404);
  }finally{
    if(oldEnv===undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV=oldEnv;
  }
  console.log('super-urenavi-v3-endpoint.test.js: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
