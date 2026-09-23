'use strict';

const assert=require('node:assert/strict');
const {
  evidenceExists,numbersSupported,validateAiExtraction,phase1Post,imageTypeCompatible,productTypeCoverage
}=require('../lib/room-ai');
const {createHandler,defaultCallGroq,runTwoStageGroq,makeInputHash,normalizeCacheCaption,CACHE_TTL_DAYS,parseRetryAfter,classifyGroqError,schemaForCall,SYSTEM_PROMPT}=require('../api/room-ai');

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

  await run('validated itemCaption features are eligible for grounded phase1 post',()=>{
    const v=validateAiExtraction({
      productType:{value:'モバイルバッテリー',source:'itemName',evidence:'モバイルバッテリー'},
      features:[{text:'USB-C対応',source:'itemCaption',evidence:'USB-C対応'}],
      unknowns:[],imageProductTypeHint:null,confidence:'high'
    },{itemName:'モバイルバッテリー',itemCaption:'USB-C対応'},{imageAvailable:false});
    assert.equal(v.mode,'simple');
    assert.equal(v.features[0].valid,true);
    assert.equal(v.features[0].eligibleForPost,true);
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

  await run('Production paid plan can use text-only AI',async()=>{
    const oldEnv=process.env.VERCEL_ENV, oldKey=process.env.GROQ_API_KEY;
    process.env.VERCEL_ENV='production';
    process.env.GROQ_API_KEY='test-key';
    let authCalls=0,quotaCalls=0,aiCalls=0,imageCalls=0;
    const handler=createHandler({
      authorize:async()=>{authCalls++;return {ok:true,plan:'base'};},
      consumeQuota:async()=>{quotaCalls++;return true;},
      loadCache:async()=>null,
      saveCache:async()=>{},
      loadImageDataUrl:async()=>{imageCalls++;return {available:true,dataUrl:'data:image/png;base64,AA=='};},
      callGroq:async()=>{aiCalls++;return {
        model:'qwen/qwen3.8-27b',
        usage:{input_tokens:100,output_tokens:40},
        raw:{productType:{value:'バイクグローブ',source:'itemName',evidence:'バイクグローブ'},features:[],confidence:'high'}
      };}
    });
    const res=makeRes();
    await handler({method:'POST',headers:{},body:{itemName:'バイクグローブ',itemCaption:'',itemPrice:1000}},res);
    assert.equal(res.statusCode,200);
    assert.equal(authCalls,1);
    assert.equal(quotaCalls,1);
    assert.equal(aiCalls,1);
    assert.equal(imageCalls,0);
    assert.equal(res.body.stages.imageAttempted,false);
    if(oldEnv===undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV=oldEnv;
    if(oldKey===undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY=oldKey;
  });

  await run('Production client enables AI only for paid plans while debug stays Preview owner only',()=>{
    const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/app.html'),'utf8');
    assert.match(html,/runtimeKnown/);
    assert.match(html,/\['base','pro','owner'\]\.includes\(currentAccessPlan\)/);
    assert.match(html,/debugExportAllowed=runtimeKnown && preview && currentAccessPlan==='owner'/);
    assert.match(html,/if\(!aiGatesFullOutput\|\|generation!==aiRunGeneration\) return/);
    assert.match(html,/async function runAiPreview\(items\)\{\n  if\(!aiGatesFullOutput\) return/);
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

  await run('compact schema removes unknowns and limits features to three short fields',()=>{
    const text=schemaForCall(false), image=schemaForCall(true);
    assert.deepEqual(text.required,['productType','features','confidence']);
    assert.equal(text.properties.features.maxItems,3);
    assert.equal(text.properties.features.items.properties.text.maxLength,15);
    assert.equal(text.properties.features.items.properties.evidence.maxLength,15);
    assert.equal(Object.hasOwn(text.properties,'unknowns'),false);
    assert.equal(Object.hasOwn(text.properties,'imageProductTypeHint'),false);
    assert.equal(image.properties.imageProductTypeHint.maxLength,24);
  });

  await run('coverage counterexample glove versus glove case stays rejected',()=>{
    const v=validateAiExtraction({
      productType:{value:'グローブケース',source:'itemName',evidence:'グローブ'},
      features:[],confidence:'high'
    },{itemName:'グローブ ケース',itemCaption:''},{imageAvailable:false});
    assert.equal(v.productType.meaningSupported,false);
    assert.equal(v.mode,'fallback');
  });

  await run('invalid numeric feature forces whole-product fallback even below half',()=>{
    const v=validateAiExtraction({
      productType:{value:'モップハンガー',source:'itemName',evidence:'モップハンガー'},
      features:[
        {text:'6本掛け',source:'itemName',evidence:'6本掛け'},
        {text:'幅536mm',source:'itemCaption',evidence:'536'},
        {text:'キャスター付',source:'itemCaption',evidence:'キャスター付'}
      ],
      confidence:'high'
    },{itemName:'モップハンガー 6本掛け',itemCaption:'536 キャスター付'},{imageAvailable:false});
    assert.equal(v.mode,'fallback');
    assert.equal(v.featureValidation.criticalInvalidNumeric,true);
    assert.ok(v.reasons.includes('critical_invalid_numeric_feature'));
  });

  await run('invalid claim feature forces whole-product fallback',()=>{
    const v=validateAiExtraction({
      productType:{value:'美顔ローラー',source:'itemName',evidence:'美顔ローラー'},
      features:[
        {text:'小顔効果',source:'itemCaption',evidence:'小顔'},
        {text:'約196g',source:'itemCaption',evidence:'約196g'},
        {text:'日本製',source:'itemCaption',evidence:'日本製'}
      ],
      confidence:'high'
    },{itemName:'美顔ローラー',itemCaption:'小顔 約196g 日本製'},{imageAvailable:false});
    assert.equal(v.mode,'fallback');
    assert.equal(v.featureValidation.criticalInvalidClaim,true);
    assert.ok(v.reasons.includes('critical_invalid_claim_feature'));
  });

  await run('Groq error classifier maps safe categories',()=>{
    assert.equal(classifyGroqError(429,{error:{type:'tokens',code:'rate_limit_exceeded',message:'rate'}}),'rate_limit');
    assert.equal(classifyGroqError(400,{error:{type:'invalid_request_error',code:'json_schema',message:'schema invalid'}}),'schema_error');
    assert.equal(classifyGroqError(400,{error:{type:'invalid_request_error',code:'bad_image',message:'image invalid'}}),'image_error');
    assert.equal(classifyGroqError(404,{error:{type:'invalid_request_error',code:'model_not_found',message:'model'}}),'model_error');
    assert.equal(classifyGroqError(400,{error:{type:'invalid_request_error',message:'bad request'}}),'invalid_request');
    assert.equal(classifyGroqError(500,{error:{type:'server_error'}}),'other');
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
        {text:'軽量仕様',source:'itemCaption',evidence:'薄型'},
        {text:'キャスター付',source:'itemCaption',evidence:'キャスター付'}
      ],
      confidence:'high'
    },{itemName:'モップハンガー 6本掛け',itemCaption:'軽量 キャスター付'},{imageAvailable:false});
    assert.equal(v.mode,'simple_partial');
    assert.equal(v.featureValidation.invalidCount,1);
    assert.equal(v.featureValidation.criticalInvalidNumeric,false);
    assert.equal(v.featureValidation.criticalInvalidClaim,false);
    assert.ok(v.reasons.includes('invalid_features_dropped'));
  });

  await run('half or more invalid features forces whole-product fallback',()=>{
    const v=validateAiExtraction({
      productType:{value:'モップハンガー',source:'itemName',evidence:'モップハンガー'},
      features:[
        {text:'コンパクト',source:'itemCaption',evidence:'コンパクト'},
        {text:'軽量仕様',source:'itemCaption',evidence:'薄型'},
        {text:'省スペース',source:'itemCaption',evidence:'折りたたみ'}
      ],
      confidence:'high'
    },{itemName:'モップハンガー',itemCaption:'コンパクト 軽量 省スペース'},{imageAvailable:false});
    assert.equal(v.mode,'fallback');
    assert.equal(v.featureValidation.invalidCount,2);
    assert.equal(v.featureValidation.criticalInvalidNumeric,false);
    assert.equal(v.featureValidation.criticalInvalidClaim,false);
    assert.ok(v.reasons.includes('feature_validation_failed'));
  });

  await run('Groq schema/output budget stays below observed OTPM single-request limit',()=>{
    const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../api/room-ai.js'),'utf8');
    assert.match(src,/maxItems:3/);
    assert.match(src,/max_output_tokens:Math\.max\(256,Math\.min\(400,Number\(maxOutputTokens\)\|\|320\)\)/);
    assert.doesNotMatch(src,/max_output_tokens:420/);
    assert.doesNotMatch(src,/max_output_tokens:700/);
    assert.ok(SYSTEM_PROMPT.length<420);
    assert.doesNotMatch(src,/unknowns:\{type:'array'/);
  });

  await run('rule-first AI gate only calls Groq when rule analysis needs help',()=>{
    const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/app.html'),'utf8');
    assert.doesNotMatch(html,/FREE_TIER_AI_PER_SEARCH_LIMIT/);
    assert.match(html,/if\(target\.callAi\)/);
    assert.match(html,/reason:'rule_confident'/);
    assert.match(html,/if\(!target\.callAi\)/);
    assert.match(html,/function ensureAiForItem\(index\)/);
  });

  await run('Groq caption input is capped for token control',()=>{
    const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../api/room-ai.js'),'utf8');
    assert.match(src,/preprocessedCaption\.length<=700/);
    assert.match(src,/slice\(0,520\)/);
    assert.match(src,/slice\(-160\)/);
  });

  await run('AI targeting distinguishes safe fallback from AI-needed fallback',()=>{
    const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/app.html'),'utf8');
    assert.match(src,/fallbackFacts\.length>=1/);
    assert.match(src,/insufficient_grounded_facts/);
    assert.match(src,/if\(conflicts\.length\) reasons\.push\('rule_conflict'\)/);
    assert.doesNotMatch(src,/if\(a\?\.outputMode!=='full'\) reasons\.push\('rule_fallback'\)/);
  });

  await run('Retry-After parser supports seconds',()=>{
    assert.equal(parseRetryAfter('2'),2000);
  });

  await run('Preview free tier keeps Groq text-only and does not escalate to image',async()=>{
    let calls=0,images=0;
    const out=await runTwoStageGroq({
      callAI:async()=>{calls++;return {raw:{productType:{value:'グローブ',source:'itemName',evidence:'グローブ'},features:[],confidence:'medium'}};},
      apiKey:'x',model:'qwen/qwen3.8-27b',itemName:'バイクグローブ',itemCaption:'',itemPrice:1000,imageUrl:'https://example.com/x.jpg',
      imageLoader:async()=>{images++;return {available:true,dataUrl:'data:image/jpeg;base64,AA=='};},
      allowImage:false
    });
    assert.equal(calls,1);
    assert.equal(images,0);
    assert.equal(out.stages.imageAttempted,false);
    assert.equal(out.stages.imageSkippedForFreeTier,true);
  });

  await run('Preview Groq retries json_validate_failed only once',()=>{
    const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../api/room-ai.js'),'utf8');
    assert.match(src,/retryableJson400/);
    assert.match(src,/safeError\?\.code==='json_validate_failed'/);
    assert.match(src,/attempt===0/);
  });

  await run('two-stage Groq skips image when text validation is high and grounded',async()=>{
    let calls=0,images=0;
    const out=await runTwoStageGroq({
      callAI:async({imageDataUrl})=>{calls++;assert.equal(imageDataUrl,null);return {
        raw:{productType:{value:'バイクグローブ',source:'itemName',evidence:'バイクグローブ'},features:[],confidence:'high'}
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
        if(!imageDataUrl) return {raw:{productType:{value:'グローブ',source:'itemName',evidence:'グローブ'},features:[],confidence:'medium'}};
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
        raw:{productType:{value:'バイクグローブ',source:'itemName',evidence:'バイクグローブ'},features:[],confidence:'high'}
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
        prompt_version:'2026-09-23-ai-phase1-groq-v4',
          validation_rule_version:'2026-09-23-ai-value-v5',
          raw_ai_json:{
          productType:{value:'野球グローブ',source:'itemName',evidence:'野球グローブ'},
          features:[],unknowns:[],imageProductTypeHint:null,confidence:'high'
        },
        model:'qwen/qwen3.8-27b',image_available:false
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
    assert.match(html,/debugExportAllowed=runtimeKnown && preview && currentAccessPlan==='owner'/);
    assert.match(html,/const paidPlan=\['base','pro','owner'\]\.includes\(currentAccessPlan\)/);
    assert.match(html,/aiGatesFullOutput=runtimeKnown/);
    assert.match(html,/preview\s*\?debugExportAllowed/);
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
    assert.match(html,/safeFallback/);
    assert.match(html,/insufficient_grounded_facts/);
    assert.match(html,/rule_conflict/);
    assert.doesNotMatch(html,/weak_single_candidate/);
    assert.match(html,/setTimeout\(r,750\)/);
    assert.doesNotMatch(html,/Math\.min\(3,queue\.length\)/);
    assert.doesNotMatch(html,/AI確認中です/);
    assert.match(html,/if\(gate\.status==='fallback'\) return ''/);
    assert.match(html,/if\(aiGatesFullOutput&&s\.target\.callAi&&s\.state\?\.state!=='done'\) return false/);
    assert.match(html,/\.tab\[data-i=/);
  });

  await run('AI sales copy is grounded and legacy wrong audience is gated',()=>{
    const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/app.html'),'utf8');
    assert.doesNotMatch(html,/function groundedTitleFeatures\(/);
    assert.match(html,/function aiSalesInsight\(/);
    assert.match(html,/商品内容をGroqで確認中です/);
    assert.match(html,/if\(aiGatesFullOutput\)\{\n    runAiPreview\(a\);/);
    assert.doesNotMatch(html,/debugExportAllowed && new URLSearchParams\(location\.search\)/);
  });

  await run('new AI versions invalidate stale cache and caption facts can be posted',async()=>{
    const fs=require('node:fs'),path=require('node:path');
    const apiText=fs.readFileSync(path.join(__dirname,'../api/room-ai.js'),'utf8');
    const libText=fs.readFileSync(path.join(__dirname,'../lib/room-ai.js'),'utf8');
    const appText=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
    assert.match(apiText,/2026-09-23-ai-phase1-groq-v4/);
    assert.match(apiText,/cacheVersionMatch/);
    assert.match(apiText,/事実ベースで理解して構造化/);
    assert.match(libText,/eligibleForPost:valid&&\(source==='itemName'\|\|source==='itemCaption'\)/);
    assert.match(appText,/ルール判定で商品内容を十分に確認できたため、AI使用を節約しています。/);
  });

  await run('AI-needed products hide unfinished fallback copy until validation completes',()=>{
    const fs=require('node:fs'),path=require('node:path');
    const html=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
    assert.match(html,/if\(gate\.status==='fallback'\) return ''/);
    assert.match(html,/確認が終わると投稿文を表示します/);
    assert.match(html,/誤った投稿文は表示していません/);
  });

  await run('fact-only Groq output feeds deterministic value templates with validation',()=>{
    const {buildDerivedCopy,buildValueFirstPost}=require('../lib/room-ai');
    const v=validateAiExtraction({
      productType:{value:'バイクグローブ',source:'itemName',evidence:'バイクグローブ'},
      features:[
        {text:'スマホ対応',source:'itemName',evidence:'スマホ対応'},
        {text:'本革',source:'itemName',evidence:'本革'}
      ],
      confidence:'high'
    },{itemName:'バイクグローブ スマホ対応 本革',itemCaption:''},{imageAvailable:false});
    const derived=buildDerivedCopy(v);
    const post=buildValueFirstPost({validation:v,derived,itemPrice:3100});
    assert.equal(derived.valid,true);
    assert.match(post,/手袋を外す手間/);
    assert.match(post,/商品の特徴/);
    assert.match(post,/スマホ対応/);
    assert.match(post,/本革/);
  });


  await run('sales copy uses validated AI facts without obsolete grounded helper path',()=>{
    const fs=require('node:fs'),path=require('node:path');
    const html=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
    assert.match(html,/function specificGroundedProductType\(/);
    assert.doesNotMatch(html,/function groundedCaptionFeatures\(/);
    assert.match(html,/function ensureAiForItem\(index\)/);
    assert.doesNotMatch(html,/function audienceForProduct\(/);
    assert.match(html,/const features=\(v\.features\|\|\[\]\)/);
    assert.doesNotMatch(html,/UrenaviBenefitGrounding/);
    assert.doesNotMatch(html,/function groundedBenefitLines\(/);
    assert.doesNotMatch(html,/insight\.sellingPoints/);
    assert.match(html,/この商品の選びどころ/);
    const libText=fs.readFileSync(path.join(__dirname,'../lib/room-ai.js'),'utf8');
    assert.match(libText,/商品の特徴👇/);
    assert.match(html,/result\?\.roomPost/);
    assert.match(html,/function aiSafeFallbackPost\(item,result=null\)/);
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
