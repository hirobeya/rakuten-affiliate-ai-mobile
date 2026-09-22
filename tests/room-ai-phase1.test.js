'use strict';

const assert=require('node:assert/strict');
const {
  evidenceExists,numbersSupported,validateAiExtraction,phase1Post
}=require('../lib/room-ai');
const {createHandler,defaultCallGroq,makeInputHash,CACHE_TTL_DAYS}=require('../api/room-ai');

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
    assert.equal(v.mode,'fallback');
    assert.ok(v.reasons.includes('product_type_validation_failed'));
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


  await run('Groq caller uses Qwen 3.8 Responses API with structured output and image',async()=>{
    let seenUrl='',seenOptions=null;
    const raw={
      productType:{value:'野球グローブ',source:'itemName',evidence:'野球グローブ'},
      features:[],unknowns:[],imageProductTypeHint:'野球グローブ',confidence:'high'
    };
    const fakeFetch=async(url,options)=>{
      seenUrl=url;seenOptions=options;
      return {ok:true,json:async()=>({output_text:JSON.stringify(raw),model:'qwen/qwen3.8-27b',usage:{input_tokens:10,output_tokens:10}})};
    };
    const result=await defaultCallGroq({
      apiKey:'test-key',model:'qwen/qwen3.8-27b',
      itemName:'野球グローブ',itemCaption:'',itemPrice:3000,
      imageDataUrl:'data:image/png;base64,AA==',fetchImpl:fakeFetch
    });
    assert.equal(seenUrl,'https://api.groq.com/openai/v1/responses');
    assert.equal(seenOptions.headers.Authorization,'Bearer test-key');
    const body=JSON.parse(seenOptions.body);
    assert.equal(body.model,'qwen/qwen3.8-27b');
    assert.equal(body.reasoning.effort,'none');
    assert.equal(body.text.format.type,'json_schema');
    assert.equal(body.text.format.strict,true);
    assert.equal(body.input[1].content[1].type,'input_image');
    assert.equal(result.raw.productType.value,'野球グローブ');
  });

  await run('Production never invokes owner auth, quota, image, or Groq',async()=>{
    const old=process.env.VERCEL_ENV;
    process.env.VERCEL_ENV='production';
    let authCalls=0,quotaCalls=0,aiCalls=0,imageCalls=0;
    const handler=createHandler({
      authorize:async()=>{authCalls++;return {ok:true,plan:'owner'};},
      consumeQuota:async()=>{quotaCalls++;return true;},
      loadImageDataUrl:async()=>{imageCalls++;return {available:false,dataUrl:null};},
      callGroq:async()=>{aiCalls++;return {raw:{}};}
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
    const oldEnv=process.env.VERCEL_ENV, oldKey=process.env.GROQ_API_KEY;
    process.env.VERCEL_ENV='preview';
    process.env.GROQ_API_KEY='test-key';
    let aiCalls=0;
    const handler=createHandler({
      authorize:async()=>({ok:true,plan:'owner',user:{email:'owner@example.com'}}),
      consumeQuota:async limit=>{assert.equal(limit,200);return true;},
      loadImageDataUrl:async()=>({available:true,dataUrl:'data:image/png;base64,AA=='}),
      callGroq:async()=>{aiCalls++;return {
        model:'qwen/qwen3.8-27b',
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
    if(oldKey===undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY=oldKey;
  });

  await run('low confidence always falls back',()=>{
    const v=validateAiExtraction({
      productType:{value:'バイクグローブ',source:'itemName',evidence:'バイクグローブ'},
      features:[],unknowns:[],imageProductTypeHint:null,confidence:'low'
    },{itemName:'バイクグローブ 本革',itemCaption:''},{imageAvailable:false});
    assert.equal(v.mode,'fallback');
    assert.ok(v.reasons.includes('confidence_low'));
  });

  await run('productType promotional or claim text is rejected',()=>{
    const promo=validateAiExtraction({
      productType:{value:'楽天1位 バイクグローブ',source:'itemName',evidence:'楽天1位 バイクグローブ'},
      features:[],unknowns:[],imageProductTypeHint:null,confidence:'high'
    },{itemName:'楽天1位 バイクグローブ',itemCaption:''},{imageAvailable:false});
    assert.equal(promo.productType.valid,false);
    assert.equal(promo.mode,'fallback');
  });

  await run('cache hash is stable and includes itemCode name and image',()=>{
    const a=makeInputHash({itemCode:'x',itemName:'野球グローブ',imageUrl:'https://example.com/a.jpg'});
    const b=makeInputHash({itemCode:'x',itemName:'野球グローブ',imageUrl:'https://example.com/a.jpg'});
    const c=makeInputHash({itemCode:'x',itemName:'バイクグローブ',imageUrl:'https://example.com/a.jpg'});
    assert.equal(a,b);
    assert.notEqual(a,c);
    assert.equal(CACHE_TTL_DAYS,90);
  });

  await run('cache hit bypasses quota image and Groq but revalidates evidence',async()=>{
    const oldEnv=process.env.VERCEL_ENV;
    process.env.VERCEL_ENV='preview';
    let quotaCalls=0,imageCalls=0,aiCalls=0;
    const handler=createHandler({
      authorize:async()=>({ok:true,plan:'owner'}),
      loadCache:async()=>({
        raw_ai_json:{
          productType:{value:'野球グローブ',source:'itemName',evidence:'野球グローブ'},
          features:[],unknowns:[],imageProductTypeHint:null,confidence:'high'
        },
        model:'qwen/qwen3.8-27b',prompt_version:'test',image_available:false
      }),
      consumeQuota:async()=>{quotaCalls++;return true;},
      loadImageDataUrl:async()=>{imageCalls++;return {available:false,dataUrl:null};},
      callGroq:async()=>{aiCalls++;return {raw:{}};}
    });
    const res=makeRes();
    await handler({method:'POST',headers:{},body:{itemCode:'b1',itemName:'野球グローブ',imageUrl:''}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.cache.hit,true);
    assert.equal(res.body.validation.mode,'simple');
    assert.equal(quotaCalls,0);
    assert.equal(imageCalls,0);
    assert.equal(aiCalls,0);
    if(oldEnv===undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV=oldEnv;
  });

  await run('Preview app keeps AI gate default OFF and routes all three media through one resolver',()=>{
    const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/app.html'),'utf8');
    assert.match(html,/let aiGatesFullOutput=false/);
    assert.match(html,/aiGatesFullOutput=debugExportAllowed && new URLSearchParams\(location\.search\)\.get\('aiGatesFullOutput'\)==='1'/);
    assert.match(html,/function resolvedPost\(/);
    assert.match(html,/if\(p==='threads'\) return UrenaviPainCopy\.makeThreadsCopy/);
    assert.match(html,/if\(p==='instagram'\) return UrenaviPainCopy\.makeInstagramCopy/);
    assert.match(html,/return UrenaviPainCopy\.makeRoomCopy/);
    assert.match(html,/rule_second_opinion_conflict/);
  });

  await run('daily limit blocks AI call',async()=>{
    const oldEnv=process.env.VERCEL_ENV, oldKey=process.env.GROQ_API_KEY;
    process.env.VERCEL_ENV='preview';
    process.env.GROQ_API_KEY='test-key';
    let aiCalls=0;
    const handler=createHandler({
      authorize:async()=>({ok:true,plan:'owner'}),
      consumeQuota:async()=>false,
      callGroq:async()=>{aiCalls++;return {raw:{}};}
    });
    const res=makeRes();
    await handler({method:'POST',headers:{},body:{itemName:'商品'}},res);
    assert.equal(res.statusCode,429);
    assert.equal(aiCalls,0);
    if(oldEnv===undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV=oldEnv;
    if(oldKey===undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY=oldKey;
  });

  if(process.exitCode) process.exit(process.exitCode);
  console.log('ROOM AI phase1 regression passed');
})();
