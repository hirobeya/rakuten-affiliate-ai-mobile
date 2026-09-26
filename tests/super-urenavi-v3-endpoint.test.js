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

const pass1={
  productType:{specific:'電気ケトル',general:'ケトル',quote:'電気ケトル'},
  attributes:[
    {name:'温度設定範囲',value:'50-100度',unit:'度',qualifier:'',valueType:'range',quote:'50-100度'},
    {name:'温度設定単位',value:'1℃',unit:'℃',qualifier:'単位',valueType:'single',quote:'1℃単位'}
  ],
  decisionAxes:[{text:'温度設定',attributeRefs:[0,1]}],
  appeals:[{text:'飲み物に合わせて温度を細かく選べる',noHassle:'温度が下がるのを待たなくていい',scene:'飲み物ごとに温度を変えたいとき',attributeRefs:[0,1],strength:3}],
  hooks:[
    {type:'question',text:'飲み物ごとに、お湯の温度を気にすることありませんか？'},
    {type:'scene',text:'朝の一杯を自分好みにしたいとき。'}
  ]
};
const pass2={results:[{verificationIndex:0,supported:true,keepDirectFact:true,reason:'supported'}]};

(async()=>{
  const oldEnv=process.env.VERCEL_ENV;
  process.env.VERCEL_ENV='preview';
  try{
    let p1=0,p2=0;
    const handler=createHandler({
      authorize:async()=>({ok:true,plan:'owner'}),
      store:memoryStore(),
      consumeQuota:async()=>true,
      groq:{
        callPass1:async()=>{p1++;return {raw:pass1,model:'mock'};},
        callPass2:async()=>{p2++;return {raw:pass2,model:'mock'};}
      }
    });
    const req={method:'POST',body:{itemCode:'shop:1',itemName:'電気ケトル 50-100度 1℃単位',itemCaption:'50-100度を1℃単位で設定できます。',itemPrice:8980}};
    const res=mockRes();
    await handler(req,res);
    assert.equal(res.code,200);
    assert.equal(res.body.ok,true);
    assert.equal(res.body.tier,'A');
    assert.equal(res.body.variants.length,3);
    assert.equal(res.body.groq.pass1Calls,1);
    assert.equal(res.body.groq.pass2Calls,1);
    assert.equal(p1,1); assert.equal(p2,1);

    const again=mockRes();
    await handler(req,again);
    assert.equal(again.code,200);
    assert.equal(again.body.groq.totalCalls,0);
    assert.equal(p1,1); assert.equal(p2,1);

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
