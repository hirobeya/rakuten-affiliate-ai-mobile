'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  createHandler,
  resolveLocalUnderstanding,
  promoteImageHint
}=require('../lib/super-urenavi-router');

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

test('image cache hit prevents a second Groq call',async()=>withPreviewKey(async()=>{
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
  assert.equal(res.body.cache.status,'image_hit');
  assert.equal(res.body.stages.imageCacheHit,true);
  assert.equal(groq,1);
  assert.equal(imageLoads,0);
}));

test('uncertain text with no image cache escalates to image exactly once',async()=>withPreviewKey(async()=>{
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
  assert.equal(res.body.route.route,'image');
  assert.equal(groq,2);
  assert.equal(imageLoads,1);
  assert.equal(imageSaves,1);
}));
