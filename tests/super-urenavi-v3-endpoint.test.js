'use strict';

const assert=require('node:assert/strict');
const {createHandler}=require('../api/room-ai-v3');

function memoryStore(){
  let row=null;
  return {
    async loadProduct(){return row;},
    async saveProduct(x){row={schema_version:x.schemaVersion,raw_ai_json:x.rawAiJson,model:x.model,result_status:x.resultStatus};}
  };
}
function mockRes(){
  return {
    code:200,body:null,headers:{},
    setHeader(k,v){this.headers[k]=v;},
    status(c){this.code=c;return this;},
    json(x){this.body=x;return this;}
  };
}

const pass1={product:{what:'電気ケトル',acts_on:'沸かすお湯',acts_on_quote:'50-100度を1℃単位で設定できます。'},sentences:[{text:'飲み物ごとにお湯の温度を選びたいときに。',kinds:['scene'],quotes:['50-100度を1℃単位で設定できます。']},{text:'50-100度を1℃単位で設定できる電気ケトル。',kinds:['spec','benefit'],quotes:['50-100度を1℃単位で設定できます。']}]};
const pass2={product:{what:'supported',acts_on:'supported'},sentences:pass1.sentences.map(s=>({text:s.text,...Object.fromEntries(['target','part','conditions','negation','degree'].map(x=>[x,'supported'])),evidenceQuotes:s.quotes})),quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(x=>[x,'supported']))};

(async()=>{
  const oldEnv=process.env.VERCEL_ENV;
  process.env.VERCEL_ENV='preview';
  try{
    let p1=0,p2=0;
    const handler=createHandler({
      deferPass2:false,
      authorize:async()=>({ok:true,plan:'owner'}),
      store:memoryStore(),
      consumeQuota:async()=>true,
      provider:{model:'mock',requiredTokens:()=>0,call:async stage=>{if(stage==='generate'){p1++;return {raw:pass1};}p2++;return {raw:pass2};}}

    });
    const req={method:'POST',body:{itemCode:'shop:1',itemName:'電気ケトル 50-100度 1℃単位',itemCaption:'50-100度を1℃単位で設定できます。',itemPrice:8980}};
    const res=mockRes();
    await handler(req,res);
    assert.equal(res.code,202);
    await handler(req,res);
    assert.equal(res.code,200);
    assert.equal(res.body.ok,true);
    assert.equal(res.body.tier,'A');
    assert.equal(res.body.variants.length,1);
    assert.equal(res.body.groq.pass1Calls,1);
    assert.equal(res.body.groq.pass2Calls,1);
    assert.equal(p1,1); assert.equal(p2,1);

    const again=mockRes();
    await handler(req,again);
    assert.equal(again.code,200);
    assert.equal(again.body.groq.totalCalls,2); // cumulative stored evaluation calls; cache adds none
    assert.equal(p1,1); assert.equal(p2,1);

    const upstreamLimit=createHandler({authorize:async()=>({ok:true,plan:'owner'}),store:memoryStore(),consumeQuota:async()=>true,provider:{model:'limited',requiredTokens:()=>0,call:async()=>{const e=new Error('provider limit');e.status=429;e.rateLimit={'retry-after':'600'};e.safeError={category:'rate_limit',code:'rate_limit_exceeded',message:'free token limit'};throw e;}}});
    const rateRes=mockRes();await upstreamLimit(req,rateRes);assert.equal(rateRes.code,429);assert.equal(rateRes.body.message,'AI provider rate limit reached');assert.equal(rateRes.body.retryAfterMs,600000);assert.equal(rateRes.headers['Retry-After'],'600');
    const dailyLimit=createHandler({authorize:async()=>({ok:true,plan:'owner'}),store:memoryStore(),consumeQuota:async()=>false,provider:{model:'local-limit',requiredTokens:()=>0,call:async()=>{throw new Error('must not call provider');}}});
    const dailyRes=mockRes();await dailyLimit(req,dailyRes);assert.equal(dailyRes.code,429);assert.equal(dailyRes.body.message,'AI daily limit reached');assert.equal(dailyRes.body.retryAfterMs,0);

    process.env.VERCEL_ENV='production';
    const blocked=mockRes();
    await handler(req,blocked);
    assert.equal(blocked.code,404);
    assert.equal(p1,1); assert.equal(p2,1);
  }finally{
    if(oldEnv===undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV=oldEnv;
  }
  console.log('super-urenavi-v3-endpoint.test.js: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
