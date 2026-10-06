'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const roomV3=require('../api/room-ai-v3');

function response(){
  return {
    headers:{},
    status(code){this.code=code;return this;},
    setHeader(k,v){this.headers[k]=v;},
    json(body){this.body=body;return body;}
  };
}

test('conditional V3 preview version is routed through the V3 UI path',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
  assert.match(html,/startsWith\('super-urenavi-v3-'\)/);
  assert.doesNotMatch(html,/version==='super-urenavi-v3-preview'/);
});

test('tier A without a composed variant is not reported as ready',async()=>{
  const old=process.env.VERCEL_ENV;
  process.env.VERCEL_ENV='preview';
  try{
    const handler=roomV3.createHandler({
      authorize:async()=>({ok:true,plan:'owner'}),
      namespaced:false,
      store:{loadProduct:async()=>null,saveProduct:async()=>{}},
      groq:{callPass1(){},callPass2(){}},
      analyzeProductV3:async()=>({
        ok:false,
        source:'pass1+pass2',
        cacheStatus:'miss',
        validation:{
          valid:true,
          productType:{valid:true,specific:'洗濯ネット'},
          attributes:[{quote:'8枚セット'}],
          decisionAxes:[]
        },
        verifiedAppeals:[],
        pass2Status:'generated',
        groq:{pass1Calls:1,pass2Calls:1,totalCalls:2}
      }),
      composeVariants:()=>({
        tier:'A',
        variants:[],
        quality:{status:'blocked',reasons:['copy_not_ready']}
      })
    });
    const res=response();
    await handler({
      method:'POST',
      body:{evaluationRun:'routing-regression',itemName:'洗濯ネット 8枚セット'}
    },res);
    assert.equal(res.code,200);
    assert.equal(res.body.tier,'A');
    assert.equal(res.body.quality.status,'blocked');
    assert.equal(res.body.quality.text,'');
    assert.deepEqual(res.body.variants,[]);
  }finally{
    if(old===undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV=old;
  }
});
