'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  createHandler:actualCreateHandler,
  resolveLocalUnderstanding,
  promoteImageHint
}=require('../lib/super-urenavi-router');
// Offline route tests use an explicit fake capacity boundary with mock
// transport only. Production never receives this bypass.
function createHandler(deps={}){
 const offlineMockCapacity=async({callAI,apiKey,model,item})=>{
  if(!deps.callGroq)throw Error('mock transport required for offline test');
  return callAI({apiKey,model,itemName:item.itemName,itemCaption:item.itemCaption,
   itemPrice:item.itemPrice,imageDataUrl:null,maxRetries:0});
 };
 return actualCreateHandler({...deps,capacityGate:deps.capacityGate||offlineMockCapacity});
}

function makeRes(){
  return {
    statusCode:200,body:null,headers:{},
    setHeader(k,v){this.headers[k]=v;},
    status(n){this.statusCode=n;return this;},
    json(v){this.body=v;return v;}
  };
}

function validRaw(type,extra={}){
  return {
    productType:{value:type,source:'itemName',evidence:type},
    features:[],sellingPoints:[],confidence:'high',...extra
  };
}

function makeStore(overrides={}){
  return {
    loadProduct:async()=>null,
    saveProduct:async()=>{},
    loadImage:async()=>null,
    saveImage:async()=>{},
    ...overrides
  };
}

async function withPreviewKey(fn){
  const oldEnv=process.env.VERCEL_ENV;
  const oldKey=process.env.GROQ_API_KEY;
  process.env.VERCEL_ENV='preview';
  process.env.GROQ_API_KEY='test-key';
  try{return await fn();}
  finally{
    if(oldEnv===undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV=oldEnv;
    if(oldKey===undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY=oldKey;
  }
}

test('local allowlist resolves exact grounded type without guessing accessories',()=>{
  const hit=resolveLocalUnderstanding({itemName:'温度調節 電気ケトル 1.0L',itemCaption:''});
  assert.equal(hit?.raw?.productType?.value,'電気ケトル');
  assert.equal(hit?.validation?.productType?.valid,true);
  assert.equal(resolveLocalUnderstanding({itemName:'モバイルバッテリー用ケース 収納ポーチ',itemCaption:''}),null);
});

test('cached image hint can only promote a type that exists in current source',()=>{
  const good=promoteImageHint(
    {features:[],sellingPoints:[],confidence:'medium'},
    'バイクグローブ',
    {itemName:'本革 バイクグローブ メンズ',itemCaption:''}
  );
  assert.equal(good?.validation?.productType?.valid,true);
  assert.equal(promoteImageHint({features:[],sellingPoints:[]},'収納ボックス',{itemName:'バイクグローブ',itemCaption:''}),null);
});

test('router order is product cache then local and local consumes zero Groq quota',async()=>withPreviewKey(async()=>{
  let quota=0,groq=0,saved=0;
  const handler=createHandler({
    authorize:async()=>({ok:true,plan:'owner'}),
    consumeQuota:async()=>{quota++;return true;},
    callGroq:async()=>{groq++;return {raw:validRaw('電気ケトル'),model:'mock'};},
    store:makeStore({saveProduct:async()=>{saved++;}})
  });
  const res=makeRes();
  await handler({method:'POST',body:{itemCode:'x1',itemName:'電気ケトル 1.0L',itemCaption:'',imageUrl:''}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.route.route,'local');
  assert.equal(quota,0);
  assert.equal(groq,0);
  assert.equal(saved,1);
}));

test('valid text Groq result stops before image',async()=>withPreviewKey(async()=>{
  let groq=0,imageLoads=0;
  const handler=createHandler({
    authorize:async()=>({ok:true,plan:'owner'}),consumeQuota:async()=>true,
    callGroq:async({imageDataUrl})=>{groq++;assert.equal(imageDataUrl,null);return {raw:validRaw('未知ケトル'),model:'mock'};},
    loadImageDataUrl:async()=>{imageLoads++;return {available:true,dataUrl:'data:image/jpeg;base64,AA=='};},
    store:makeStore()
  });
  const res=makeRes();
  await handler({method:'POST',body:{itemCode:'x2',itemName:'未知ケトル ステンレス',itemCaption:'',imageUrl:'https://example.com/x.jpg'}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.route.route,'text');
  assert.equal(groq,1);
  assert.equal(imageLoads,0);
}));

test('legacy image-cache data does not add another execution route',async()=>withPreviewKey(async()=>{
  let groq=0,imageLoads=0;
  const handler=createHandler({
    authorize:async()=>({ok:true,plan:'owner'}),consumeQuota:async()=>true,
    callGroq:async()=>{groq++;return {raw:{productType:{value:'グローブ',source:'itemName',evidence:'グローブ'},features:[],sellingPoints:[],confidence:'medium'},model:'mock'};},
    loadImageDataUrl:async()=>{imageLoads++;return {available:true,dataUrl:'data:image/jpeg;base64,AA=='};},
    store:makeStore({loadImage:async()=>({result_status:'ok',raw_ai_json:{imageProductTypeHint:'バイクグローブ'}})})
  });
  const res=makeRes();
  await handler({method:'POST',body:{itemCode:'x3',itemName:'本革 バイクグローブ グローブ',itemCaption:'',imageUrl:'https://example.com/x.jpg'}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.cache.status,'miss');
  assert.equal(res.body.route.route,'text');
  assert.equal(res.body.stages.imageAttempted,false);
  assert.equal(groq,1);
  assert.equal(imageLoads,0);
}));

test('uncertain text ends after one provider call with no image lookup or image persistence',async()=>withPreviewKey(async()=>{
  let groq=0,imageLoads=0,imageSaves=0;
  const handler=createHandler({
    authorize:async()=>({ok:true,plan:'owner'}),consumeQuota:async()=>true,
    callGroq:async({imageDataUrl})=>{
      groq++;
      if(!imageDataUrl) return {raw:{productType:{value:'グローブ',source:'itemName',evidence:'グローブ'},features:[],sellingPoints:[],confidence:'medium'},model:'mock'};
      return {raw:validRaw('バイクグローブ',{imageProductTypeHint:'バイクグローブ'}),model:'mock'};
    },
    loadImageDataUrl:async()=>{imageLoads++;return {available:true,dataUrl:'data:image/jpeg;base64,AA=='};},
    store:makeStore({saveImage:async()=>{imageSaves++;}})
  });
  const res=makeRes();
  await handler({method:'POST',body:{itemCode:'x4',itemName:'本革 バイクグローブ グローブ',itemCaption:'',imageUrl:'https://example.com/x.jpg'}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.route.route,'text');
  assert.equal(res.body.stages.imageAttempted,false);
  assert.equal(res.body.stages.secondProviderAttempt,false);
  assert.equal(groq,1);
  assert.equal(imageLoads,0);
  assert.equal(imageSaves,0);
}));

test('single-attempt transport never retries after 429 or JSON validation failure',async()=>{
 const {defaultCallGroq}=require('../lib/room-ai-handler');
 for(const [status,body] of [
  [429,{error:{code:'rate_limit_exceeded',message:'test quota'}}],
  [400,{error:{code:'json_validate_failed',message:'test invalid structured output'}}]
 ]){
  let sends=0;
  const fetchImpl=async()=>{
   sends++;
   return {ok:false,status,
    headers:{get:()=>null},
    json:async()=>body};
  };
  await assert.rejects(
   defaultCallGroq({apiKey:'mock',model:'openai/gpt-oss-120b',
    itemName:'未確定の収納用品',itemCaption:'説明',itemPrice:1200,
    imageDataUrl:null,maxRetries:0,fetchImpl}),
   error=>error.status===status
  );
  assert.equal(sends,1,'no hidden request retry is allowed');
 }
});
test('unified route always selects fixed 120B and sends no image even if supplied',async()=>withPreviewKey(async()=>{
 let sends=0;
 const handler=createHandler({
  authorize:async()=>({ok:true,plan:'owner'}),
  consumeQuota:async()=>true,
  store:makeStore(),
  callGroq:async({model,imageDataUrl})=>{
   sends++;
   assert.equal(model,'openai/gpt-oss-120b');
   assert.equal(imageDataUrl,null);
   return {raw:{productType:{value:'不明商品',source:'itemName',evidence:'不明商品'},
    features:[],sellingPoints:[],confidence:'medium'},model};
  },
  loadImageDataUrl:async()=>{throw Error('image route must never run');}
 });
 const r=makeRes();
 await handler({method:'POST',body:{itemCode:'test:one',itemName:'不明商品 製品',
  itemCaption:'仕様は未記載',itemPrice:1200,imageUrl:'https://example.com/image.jpg'}},r);
 assert.equal(r.statusCode,200);
 assert.equal(sends,1);
 assert.equal(r.body.stages.imageAttempted,false);
}));
