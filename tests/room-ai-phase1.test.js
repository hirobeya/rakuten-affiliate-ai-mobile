'use strict';

const assert=require('node:assert/strict');
const {
  evidenceExists,numbersSupported,validateAiExtraction,phase1Post
}=require('../lib/room-ai');
const {createHandler}=require('../api/room-ai');

function makeRes(){
  return {
    statusCode:200,headers:{},body:null,
    setHeader(k,v){this.headers[k]=v;},
    status(n){this.statusCode=n;return this;},
    json(v){this.body=v;return this;}
  };
}

function run(name,fn){
  return Promise.resolve().then(fn).then(()=>console.log('PASS',name),e=>{console.error('FAIL',name,e);process.exitCode=1;});
}

(async()=>{
  await run('evidence must be a contiguous source quote',()=>{
    assert.equal(evidenceExists('itemName','10000mAh','モバイルバッテリー 10000mAh USB-C',''),true);
    assert.equal(evidenceExists('itemName','10000 mAh USB-C','モバイルバッテリー 10000mAh USB-C',''),true);
    assert.equal(evidenceExists('itemCaption','急速充電','商品説明','別商品案内 急速充電'),true);
    assert.equal(evidenceExists('itemName','急速充電','ペット用グローブ',''),false);
  });

  await run('number and unit must match evidence',()=>{
    assert.equal(numbersSupported('容量10000mAh','10000mAh'),true);
    assert.equal(numbersSupported('容量20000mAh','10000mAh'),false);
    assert.equal(numbersSupported('幅39cm','39cm'),true);
    assert.equal(numbersSupported('幅40cm','39cm'),false);
  });

  await run('itemCaption features validate but are not eligible for phase1 post',()=>{
    const v=validateAiExtraction({
      productType:{value:'モバイルバッテリー',source:'itemName',evidence:'モバイルバッテリー'},
      features:[{text:'USB-C対応',source:'itemCaption',evidence:'USB-C対応'}],
      unknowns:[],imageProductTypeHint:null,confidence:'high'
    },{itemName:'モバイルバッテリー',itemCaption:'USB-C対応'},{imageAvailable:false});
    assert.equal(v.mode,'simple');
    assert.equal(v.features[0].valid,true);
    assert.equal(v.features[0].eligibleForPost,false);
  });

  await run('image product type conflict switches to fallback',()=>{
    const v=validateAiExtraction({
      productType:{value:'収納ボックス',source:'itemName',evidence:'収納ボックス'},
      features:[],unknowns:[],imageProductTypeHint:'収納ベンチ',confidence:'high'
    },{itemName:'収納ボックス ふた付き',itemCaption:''},{imageAvailable:true});
    assert.equal(v.imageConflict,true);
    assert.equal(v.mode,'fallback');
  });

  await run('invalid productType evidence is not trusted for heading',()=>{
    const v=validateAiExtraction({
      productType:{value:'収納ベンチ',source:'itemName',evidence:'収納ベンチ'},
      features:[],unknowns:[],imageProductTypeHint:null,confidence:'high'
    },{itemName:'収納ボックス',itemCaption:''},{imageAvailable:false});
    assert.equal(v.productType.valid,false);
  });

  await run('invalid feature evidence switches to fallback',()=>{
    const v=validateAiExtraction({
      productType:{value:'ペット用グローブ',source:'itemName',evidence:'ペット用グローブ'},
      features:[{text:'急速充電対応',source:'itemName',evidence:'急速充電'}],
      unknowns:[],imageProductTypeHint:null,confidence:'high'
    },{itemName:'ペット用グローブ 毛取り',itemCaption:''},{imageAvailable:false});
    assert.equal(v.mode,'fallback');
  });

  await run('phase1 post only uses eligible features and disclosure',()=>{
    const text=phase1Post({
      title:'収納ベンチ',
      price:5780,
      features:[
        {text:'折りたたみ対応',eligibleForPost:true},
        {text:'大容量',eligibleForPost:false}
      ]
    });
    assert.match(text,/折りたたみ対応/);
    assert.doesNotMatch(text,/大容量/);
    assert.match(text,/価格：5,780円/);
    assert.match(text,/※アフィリエイト広告を利用しています/);
  });

  await run('Production never invokes owner auth, quota, image, or OpenAI',async()=>{
    const old=process.env.VERCEL_ENV;
    process.env.VERCEL_ENV='production';
    let authCalls=0,quotaCalls=0,aiCalls=0,imageCalls=0;
    const handler=createHandler({
      authorize:async()=>{authCalls++;return {ok:true,plan:'owner'};},
      consumeQuota:async()=>{quotaCalls++;return true;},
      loadImageDataUrl:async()=>{imageCalls++;return {available:false,dataUrl:null};},
      callOpenAI:async()=>{aiCalls++;return {raw:{}};}
    });
    const req={method:'POST',headers:{},body:{itemName:'商品'}};
    const res=makeRes();
    await handler(req,res);
    assert.equal(res.statusCode,404);
    assert.equal(authCalls,0);
    assert.equal(quotaCalls,0);
    assert.equal(imageCalls,0);
    assert.equal(aiCalls,0);
    if(old===undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV=old;
  });

  await run('Preview owner mock invokes one AI request and validates output',async()=>{
    const oldEnv=process.env.VERCEL_ENV, oldKey=process.env.OPENAI_API_KEY;
    process.env.VERCEL_ENV='preview';
    process.env.OPENAI_API_KEY='test-key';
    let aiCalls=0;
    const handler=createHandler({
      authorize:async()=>({ok:true,plan:'owner',user:{email:'owner@example.com'}}),
      consumeQuota:async limit=>{assert.equal(limit,200);return true;},
      loadImageDataUrl:async()=>({available:true,dataUrl:'data:image/png;base64,AA=='}),
      callOpenAI:async()=>{aiCalls++;return {
        model:'gpt-5.6-luna',
        usage:{input_tokens:100,output_tokens:50},
        raw:{
          productType:{value:'収納ベンチ',source:'itemName',evidence:'収納ベンチ'},
          features:[{text:'折りたたみ対応',source:'itemName',evidence:'折りたたみ'}],
          unknowns:[],
          imageProductTypeHint:'収納ベンチ',
          confidence:'high'
        }
      };}
    });
    const req={method:'POST',headers:{},body:{itemName:'収納ベンチ 折りたたみ',itemCaption:'',itemPrice:1000,imageUrl:'https://example.com/a.png'}};
    const res=makeRes();
    await handler(req,res);
    assert.equal(res.statusCode,200);
    assert.equal(aiCalls,1);
    assert.equal(res.body.validation.mode,'simple');
    if(oldEnv===undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV=oldEnv;
    if(oldKey===undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY=oldKey;
  });

  await run('daily limit blocks AI call',async()=>{
    const oldEnv=process.env.VERCEL_ENV, oldKey=process.env.OPENAI_API_KEY;
    process.env.VERCEL_ENV='preview';
    process.env.OPENAI_API_KEY='test-key';
    let aiCalls=0;
    const handler=createHandler({
      authorize:async()=>({ok:true,plan:'owner'}),
      consumeQuota:async()=>false,
      callOpenAI:async()=>{aiCalls++;return {raw:{}};}
    });
    const res=makeRes();
    await handler({method:'POST',headers:{},body:{itemName:'商品'}},res);
    assert.equal(res.statusCode,429);
    assert.equal(aiCalls,0);
    if(oldEnv===undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV=oldEnv;
    if(oldKey===undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY=oldKey;
  });

  if(process.exitCode) process.exit(process.exitCode);
  console.log('ROOM AI phase1 regression passed');
})();
