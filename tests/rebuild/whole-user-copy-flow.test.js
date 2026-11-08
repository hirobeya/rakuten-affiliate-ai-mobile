'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../../lib/room-copy-handler');
const BrowserCopy=require('../../public/room-copy-result');
const BrowserRequest=require('../../public/room-preview-request');
const {questions}=require('../../lib/room-semantic-contract');

const item={itemCode:'integration:storage',itemName:'収納ボックス',itemCaption:'折りたたみ可能な収納ボックス',catchcopy:'',itemPrice:1980};
const draft={product:{what:'収納ボックス',acts_on:'収納する物',acts_on_quote:item.itemCaption},sentences:[
 {text:'収納する物をまとめたいときに。',kinds:['scene'],quotes:[item.itemCaption]},
 {text:'使わないときは折りたためる収納ボックス。',kinds:['spec','benefit'],quotes:[item.itemCaption]}
]};
function semanticReview(accepted){
 return {product:{what:'supported',acts_on:'supported'},sentences:draft.sentences.map(s=>({
  text:s.text,reason:'source checked',evidenceQuotes:s.quotes,
  ...Object.fromEntries(questions.map(q=>[q,accepted?'supported':'unclear']))
 })),quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(q=>[q,accepted?'supported':'unclear']))};
}
function makeStore(){let row=null;return{loadProduct:async()=>row,saveProduct:async x=>{row={schema_version:x.schemaVersion,model:x.model,raw_ai_json:structuredClone(x.rawAiJson)};}};}
function res(){return{code:200,data:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(x){this.data=x;return this;}};}
function setup({accepted=true,source=item,providerFails=false}={}){
 let calls=0,quota=0;
 const provider={model:'mock:editorial',requiredTokens:()=>100,call:async stage=>{
  calls++;
  if(providerFails)throw Object.assign(Error('unavailable'),{status:429});
  return {model:'mock:editorial',raw:stage==='generate'?draft:semanticReview(accepted),usage:{prompt_tokens:500,completion_tokens:180},rateLimit:{}};
 }};
 const handler=createHandler({authorize:async()=>({ok:true,plan:'owner',user:{id:'integration-owner'}}),
  store:makeStore(),localZeroCall:()=>null,provider,consumeQuota:async()=>{quota++;return true;},logCost:()=>{}});
 return {handler,source,counts:()=>({calls,quota})};
}
async function requestViaBrowser(handler,source){
 return BrowserRequest.run(source,{fetchImpl:async(url,request)=>{
  assert.equal(url,'/api/room-copy');assert.equal(request.method,'POST');assert.equal(request.credentials,'include');
  const reply=res();await handler({method:request.method,body:JSON.parse(request.body),query:{urenaviContract:'1'}},reply);
  return {status:reply.code,json:async()=>reply.data};
 }});
}
test('whole Preview flow: input → server generation → independent review → iPhone copy contract → cache',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const x=setup();
  const first=await requestViaBrowser(x.handler,item);
  assert.equal(first.status,200);
  assert.equal(first.data.ok,true);assert.equal(first.data.pending,false);
  assert.equal(first.data.quality.machine.ok,true);assert.equal(first.data.quality.review.ok,true);
  assert.equal(first.data.product.what,'収納ボックス');
  const copy=BrowserCopy.ready(first.data);
  assert.ok(copy.includes('折りたためる収納ボックス'));
  assert.match(copy,/※アフィリエイト広告を利用しています/);
  assert.equal(BrowserCopy.ledger(first.data).length,2);
  assert.deepEqual(x.counts(),{calls:2,quota:2});
  const second=await requestViaBrowser(x.handler,item);
  assert.equal(BrowserCopy.ready(second.data),copy);
  assert.deepEqual(x.counts(),{calls:2,quota:2},'cached ready must not request or bill again');
  assert.equal(second.data.resourceUsage.calls,0);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('rejected independent semantic review cannot become a copyable post',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const x=setup({accepted:false});
  const r=await requestViaBrowser(x.handler,item);
  assert.equal(r.data.ok,false);
  assert.equal(BrowserCopy.ready(r.data),'');
  assert.equal(r.data.sentences.length,0);
  assert.equal(r.data.quality.text,'');
  assert.ok(x.counts().calls<=4);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('provider rate limit fails closed, never returns copyable fallback',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const x=setup({providerFails:true});
  const r=await requestViaBrowser(x.handler,item);
  assert.equal(r.status,429);assert.equal(BrowserCopy.ready(r.data),'');
  assert.deepEqual(x.counts(),{calls:1,quota:1});
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('Production rejects the entire flow without provider or quota calls',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='production';
 try{
  const x=setup();
  const r=await requestViaBrowser(x.handler,item);
  assert.equal(r.status,404);assert.equal(BrowserCopy.ready(r.data),'');
  assert.deepEqual(x.counts(),{calls:0,quota:0});
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
