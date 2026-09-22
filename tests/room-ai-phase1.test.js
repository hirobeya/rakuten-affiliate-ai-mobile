'use strict';

const assert=require('node:assert/strict');
const {
  evidenceExists,numbersSupported,validateAiExtraction,phase1Post,imageTypeCompatible,productTypeCoverage
}=require('../lib/room-ai');
const {createHandler,defaultCallGroq,runTwoStageGroq,makeInputHash,normalizeCacheCaption,CACHE_TTL_DAYS,parseRetryAfter}=require('../api/room-ai');

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

  await run('baseball glove high-confidence grounded productType produces fact-only post',()=>{
    const v=validateAiExtraction({
      productType:{value:'野球グローブ',source:'itemName',evidence:'野球グローブ'},
      features:[{text:'右投げ用',source:'itemName',evidence:'右投げ用'}],
      unknowns:[],imageProductTypeHint:'野球グローブ',confidence:'high'
    },{itemName:'野球グローブ 右投げ用',itemCaption:''},{imageAvailable:true});
    assert.equal(v.mode,'simple');
    const text=phase1Post({title:v.productType.value,features:v.features,price:5980});
    assert.match(text,/^野球グローブ/m);
    assert.match(text,/右投げ用/);
    assert.doesNotMatch(text,/掃除用手袋/);
  });

  await run('motorcycle glove high-confidence grounded productType produces fact-only post',()=>{
    const v=validateAiExtraction({
      productType:{value:'バイクグローブ',source:'itemName',evidence:'バイクグローブ'},
      features:[{text:'スマホ対応',source:'itemName',evidence:'スマホ対応'}],
      unknowns:[],imageProductTypeHint:'バイクグローブ',confidence:'high'
    },{itemName:'バイクグローブ 本革 スマホ対応',itemCaption:''},{imageAvailable:true});
    assert.equal(v.mode,'simple');
    const text=phase1Post({title:v.productType.value,features:v.features,price:3100});
    assert.match(text,/^バイクグローブ/m);
    assert.match(text,/スマホ対応/);
    assert.doesNotMatch(text,/掃除用手袋/);
  });

  await run('motorcycle glove evidence mismatch cannot reach full output',()=>{
    const v=validateAiExtraction({
      productType:{value:'バイクグローブ',source:'itemName',evidence:'バイクグローブ'},
      features:[],unknowns:[],imageProductTypeHint:null,confidence:'high'
    },{itemName:'野球グローブ 右投げ用',itemCaption:''},{imageAvailable:false});
    assert.equal(v.mode,'fallback');
    assert.equal(v.productType.valid,false);
    assert.ok(v.reasons.includes('product_type_validation_failed'));
  });

  await run('productType coverage allows >=90 percent character support and rejects lower coverage',()=>{
    assert.ok(productTypeCoverage('バイクグローブ','バイク グローブ')>=0.90);
    assert.ok(productTypeCoverage('高級バイクグローブ','バイクグローブ')<0.90);
  });

  await run('partial feature fallback keeps product when less than half features invalid',()=>{
    const v=validateAiExtraction({
      productType:{value:'モップハンガー',source:'itemName',evidence:'モップハンガー'},
      features:[
        {text:'6本掛け',source:'itemName',evidence:'6本掛け'},
        {text:'幅536mm',source:'itemCaption',evidence:'536'},
        {text:'キャスター付',source:'itemCaption',evidence:'キャスター付'}
      ],
      unknowns:[],imageProductTypeHint:null,confidence:'high'
    },{itemName:'モップハンガー 6本掛け',itemCaption:'536 キャスター付'},{imageAvailable:false});
    assert.equal(v.mode,'simple_partial');
    assert.equal(v.featureValidation.invalidCount,1);
    assert.ok(v.reasons.includes('invalid_features_dropped'));
  });

  await run('half or more invalid features forces whole-product fallback',()=>{
    const v=validateAiExtraction({
      productType:{value:'モップハンガー',source:'itemName',evidence:'モップハンガー'},
      features:[
        {text:'幅536mm',source:'itemCaption',evidence:'536'},
        {text:'高さ1375mm',source:'itemCaption',evidence:'1375'}
      ],
      unknowns:[],imageProductTypeHint:null,confidence:'high'
    },{itemName:'モップハンガー',itemCaption:'536 1375'},{imageAvailable:false});
    assert.equal(v.mode,'fallback');
    assert.ok(v.reasons.includes('feature_validation_failed'));
  });

  await run('Retry-After parser supports seconds',()=>{
    assert.equal(parseRetryAfter('2'),2000);
  });

  await run('two-stage Groq skips image when text validation is high and grounded',async()=>{
    let calls=0,images=0;
    const out=await runTwoStageGroq({
      callAI:async({imageDataUrl})=>{calls++;assert.equal(imageDataUrl,null);return {
        raw:{productType:{value:'バイクグローブ',source:'itemName',evidence:'バイクグローブ'},features:[],unknowns:[],imageProductTypeHint:null,confidence:'high'}
      };},
      apiKey:'x',model:'qwen/qwen3.8-27b',itemName:'バイクグローブ',itemCaption:'',itemPrice:1000,imageUrl:'https://example.com/x.jpg',
      imageLoader:async()=>{images++;return {available:true,dataUrl:'data:image/jpeg;base64,AA=='};}
    });
    assert.equal(calls,1);assert.equal(images,0);assert.equal(out.stages.imageAttempted,false);
  });

  await run('two-stage Groq adds image only after uncertain text stage',async()=>{
    let calls=0,images=0;
    const out=await runTwoStageGroq({
      callAI:async({imageDataUrl})=>{
        calls++;
        if(!imageDataUrl) return {raw:{productType:{value:'グローブ',source:'itemName',evidence:'グローブ'},features:[],unknowns:[],imageProductTypeHint:null,confidence:'medium'}};
        return {raw:{productType:{value:'バイクグローブ',source:'itemName',evidence:'バイクグローブ'},features:[],unknowns:[],imageProductTypeHint:'レザーグローブ',confidence:'high'}};
      },
      apiKey:'x',model:'qwen/qwen3.8-27b',itemName:'バイクグローブ グローブ',itemCaption:'',itemPrice:1000,imageUrl:'https://example.com/x.jpg',
      imageLoader:async()=>{images++;return {available:true,dataUrl:'data:image/jpeg;base64,AA=='};}
    });
    assert.equal(calls,2);assert.equal(images,1);assert.equal(out.stages.imageAttempted,true);assert.equal(out.validation.mode,'simple');
  });

  await run('medium confidence is fixed fallback',()=>{
    const v=validateAiExtraction({
      productType:{value:'バイクグローブ',source:'itemName',evidence:'バイクグローブ'},
      features:[],unknowns:[],imageProductTypeHint:'レザーグローブ',confidence:'medium'
    },{itemName:'バイクグローブ レザー',itemCaption:''},{imageAvailable:true});
    assert.equal(v.mode,'fallback');
    assert.equal(v.mediumHandling,'fallback_fixed');
    assert.ok(v.reasons.includes('confidence_medium'));
  });

  await run('image type allows a shared noun core but rejects unrelated type',()=>{
    assert.equal(imageTypeCompatible('バイクグローブ','レザーグローブ'),true);
    assert.equal(imageTypeCompatible('野球用手袋','守備用手袋'),true);
    assert.equal(imageTypeCompatible('バイクグローブ','収納ボックス'),false);
  });

  await run('productType cannot expand beyond evidence',()=>{
    const v=validateAiExtraction({
      productType:{value:'高級バイクグローブ',source:'itemName',evidence:'バイクグローブ'},
      features:[],unknowns:[],imageProductTypeHint:null,confidence:'high'
    },{itemName:'バイクグローブ 本革',itemCaption:''},{imageAvailable:false});
    assert.equal(v.productType.meaningSupported,false);
    assert.equal(v.mode,'fallback');
  });

  await run('cache caption normalization keeps equivalent whitespace on one key',()=>{
    const a=makeInputHash({itemCode:'x',itemName:'商品',imageUrl:'i',itemCaption:'説明  文\nUSB-C'});
    const b=makeInputHash({itemCode:'x',itemName:'商品',imageUrl:'i',itemCaption:'説明\n\n文   USB-C'});
    assert.equal(normalizeCacheCaption('説明  文\nUSB-C'),'説明 文 USB-C');
    assert.equal(a,b);
  });

  await run('missing cache table behaves as cache unavailable and still calls Groq',async()=>{
    const oldEnv=process.env.VERCEL_ENV, oldKey=process.env.GROQ_API_KEY;
    process.env.VERCEL_ENV='preview'; process.env.GROQ_API_KEY='test-key';
    let aiCalls=0;
    const handler=createHandler({
      authorize:async()=>({ok:true,plan:'owner'}),
      loadCache:async()=>{throw new Error('Database request failed (404)');},
      saveCache:async()=>{throw new Error('Database request failed (404)');},
      consumeQuota:async()=>true,
      loadImageDataUrl:async()=>({available:false,dataUrl:null}),
      callGroq:async()=>{aiCalls++;return {
        model:'qwen/qwen3.8-27b',usage:null,
        raw:{productType:{value:'バイクグローブ',source:'itemName',evidence:'バイクグローブ'},features:[],unknowns:[],imageProductTypeHint:null,confidence:'high'}
      };}
    });
    const res=makeRes();
    await handler({method:'POST',headers:{},body:{itemCode:'g1',itemName:'バイクグローブ',itemCaption:'本革',imageUrl:''}},res);
    assert.equal(res.statusCode,200);
    assert.equal(aiCalls,1);
    assert.equal(res.body.cache.status,'unavailable');
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
    const a=makeInputHash({itemCode:'x',itemName:'野球グローブ',imageUrl:'https://example.com/a.jpg',itemCaption:'右投げ'});
    const b=makeInputHash({itemCode:'x',itemName:'野球グローブ',imageUrl:'https://example.com/a.jpg',itemCaption:'右投げ'});
    const c=makeInputHash({itemCode:'x',itemName:'バイクグローブ',imageUrl:'https://example.com/a.jpg',itemCaption:'右投げ'});
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
    assert.match(html,/mediumHandling:'fallback_fixed'/);
    assert.match(html,/cacheKeyComponents/);
    assert.match(html,/resolvedPost:resolvedPostMeta/);
    assert.match(html,/UrenaviPainCopy\.fallbackProductName/);
    assert.match(html,/function aiTargetDecision\(/);
    assert.match(html,/weak_single_candidate/);
    assert.match(html,/setTimeout\(r,250\)/);
    assert.doesNotMatch(html,/Math\.min\(3,queue\.length\)/);
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
