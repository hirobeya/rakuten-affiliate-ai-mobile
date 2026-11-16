'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHandler,provenLocalCopy}=require('../../lib/room-copy-handler');
const {localZeroCall}=require('../../api/room-ai-v3');
const frozen=require('../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
const get=code=>frozen.rows.find(row=>row.item.itemCode===code)?.item;
function res(){
 return {statusCode:null,body:null,headers:{},
  setHeader(k,v){this.headers[k]=v;},
  status(n){this.statusCode=n;return this;},
  json(data){this.body=data;return this;}};
}
function inject(plan='base'){
 let calls=0,claims=0,writes=0;
 const handler=createHandler({
  authorize:async()=>({ok:plan!=='free',plan,user:{email:'customer@example.invalid'}}),
  logCost:()=>{},
  store:{loadProduct:async()=>null,saveProduct:async()=>{writes++;throw Error('no production writes');}},
  consumeQuota:async()=>{claims++;throw Error('must not consume quota');},
  provider:{model:'mock',call:async()=>{calls++;throw Error('must not call provider');}}
 });
 return {handler,spent:()=>({calls,claims,writes})};
}
test('paid Production performs exactly one source-proven local generation without provider or database writes',async()=>{
 const prev=process.env.VERCEL_ENV;process.env.VERCEL_ENV='production';
 try{
  for(const plan of ['owner','base','pro']){
   const api=inject(plan),response=res(),item=get('e-kitchen:10079039');
   assert.ok(item);
   await api.handler({method:'POST',body:item},response);
   assert.equal(response.statusCode,200,plan);
   assert.equal(response.body.ok,true);
   assert.equal(response.body.model,'local');
   assert.equal(response.body.quality.status,'ready');
   assert.equal(response.body.quality.text,response.body.variants[0].text);
   assert.equal(provenLocalCopy(item,response.body),true);
   assert.equal(response.body.groq.totalCalls,0);
   assert.deepEqual(api.spent(),{calls:0,claims:0,writes:0});
  }
 }finally{if(prev===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=prev;}
});
test('paid Production may use title-signal buyer motive only with verified source quote',async()=>{
 const prev=process.env.VERCEL_ENV;process.env.VERCEL_ENV='production';
 try{
  const item=get('besthouse:10000083'),api=inject('base'),response=res();
  await api.handler({method:'POST',body:item},response);
  assert.equal(response.statusCode,200);
  assert.equal(response.body.local.partner.kind,'signal');
  assert.ok(response.body.quality.text.includes('ケーブルの持ち歩きを減らしたいとき。'));
  assert.equal(provenLocalCopy(item,response.body),true);
  assert.deepEqual(api.spent(),{calls:0,claims:0,writes:0});
 }finally{if(prev===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=prev;}
});
test('paid Production fails closed on missing or altered source and never invokes Groq',async()=>{
 const prev=process.env.VERCEL_ENV;process.env.VERCEL_ENV='production';
 try{
  for(const code of ['yukaiya:10001267','emoor-nedogko:10000048']){
   const api=inject('base'),response=res(),item=get(code);
   await api.handler({method:'POST',body:item},response);
   assert.ok([200,409].includes(response.statusCode),code);
   if(response.statusCode===200){
    assert.equal(provenLocalCopy(item,response.body),true,'a late real quote may safely rescue this product');
   }else{
    assert.equal(response.body.quality.status,'blocked');
    assert.equal(response.body.quality.text,'');
    assert.deepEqual(response.body.variants,[]);
   }
   assert.equal(response.body.groq.totalCalls,0);
   assert.deepEqual(api.spent(),{calls:0,claims:0,writes:0});
  }
  const unsafe={...localZeroCall(get('daiya:10001447'))};
  unsafe.local={...unsafe.local,partner:{...unsafe.local.partner,kind:'caption_claim',quote:'必ず全商品に対応できます。'}};
  const api=createHandler({
   authorize:async()=>({ok:true,plan:'base',user:{email:'customer@example.invalid'}}),
   localZeroCall:()=>unsafe,logCost:()=>{},
   consumeQuota:async()=>{throw Error('no quota');},
   provider:{model:'mock',call:async()=>{throw Error('no provider');}}
  });
  const blocked=res();await api({method:'POST',body:get('e-kitchen:10079039')},blocked);
  assert.equal(blocked.statusCode,409);
  assert.equal(blocked.body.quality.status,'blocked');
 }finally{if(prev===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=prev;}
});
test('Production rejects free users and evaluation modes without provider calls',async()=>{
 const prev=process.env.VERCEL_ENV;process.env.VERCEL_ENV='production';
 try{
  const item=get('e-kitchen:10079039');
  const free=inject('free'),r0=res();await free.handler({method:'POST',body:item},r0);
  assert.equal(r0.statusCode,403);
  const paid=inject('base'),r1=res();
  await paid.handler({method:'POST',body:{...item,evaluationRun:'testing'}},r1);
  assert.equal(r1.statusCode,409);
  const r2=res();await paid.handler({method:'POST',body:{...item,statusOnly:true}},r2);
  assert.equal(r2.statusCode,409);
  assert.deepEqual(free.spent(),{calls:0,claims:0,writes:0});
  assert.deepEqual(paid.spent(),{calls:0,claims:0,writes:0});
 }finally{if(prev===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=prev;}
});
test('paid iPhone UI sends the same room-copy contract to the production route',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../public/app.html'),'utf8');
 const vercel=JSON.parse(fs.readFileSync(path.join(__dirname,'../../vercel.json'),'utf8'));
 const client=fs.readFileSync(path.join(__dirname,'../../public/room-preview-request.js'),'utf8');
 assert.match(html,/usePurchasePlan=debugExportAllowed\|\|\(runtimeKnown&&!preview&&paidPlan\)/);
 assert.match(html,/RoomPreviewRequest\.run\(payload/);
 assert.match(client,/fetchImpl\('\/api\/room-copy'/);
 assert.ok(vercel.rewrites.some(r=>r.source==='/api/room-copy'&&r.destination.includes('urenaviContract=1')));
 const route=fs.readFileSync(path.join(__dirname,'../../api/room-ai-v3.js'),'utf8');
 assert.match(route,/req\.query\?\.urenaviContract==='1'/);
});

test('all 44 independently sourced products have one unambiguous paid ready/blocked contract without external AI',async()=>{
 const Quality=require('../../public/purchase-copy-quality');
 const prev=process.env.VERCEL_ENV;process.env.VERCEL_ENV='production';
 const api=inject('base'),counts={ready:0,blocked:0};
 try{
  for(const row of frozen.rows){
   const output=res();
   await api.handler({method:'POST',body:row.item},output);
   assert.ok([200,409].includes(output.statusCode),row.item.itemCode);
   if(output.statusCode===200){
    counts.ready++;
    assert.equal(Quality.verifiedLocalCopy(row.item,output.body,output.body.quality.text),true,row.item.itemCode);
    assert.equal(provenLocalCopy(row.item,output.body),true,row.item.itemCode);
    assert.equal(output.body.groq.totalCalls,0,row.item.itemCode);
   }else{
    counts.blocked++;
    assert.equal(output.body.quality.status,'blocked',row.item.itemCode);
    assert.equal(output.body.quality.text,'',row.item.itemCode);
    assert.deepEqual(output.body.variants,[],row.item.itemCode);
   }
  }
  assert.equal(counts.ready+counts.blocked,frozen.rows.length);
  assert.deepEqual(api.spent(),{calls:0,claims:0,writes:0});
  console.log('PAID_PRODUCTION_44_VERIFIED',JSON.stringify(counts));
 }finally{if(prev===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=prev;}
});
test('NFKC-transformed markup headings cannot become source-proven published claims',()=>{
 const Quality=require('../../public/purchase-copy-quality');
 const item=get('emoor-nedogko:10000048');
 const quote='<3D構造体> 通気性に優れた立体構造で、寝返りしやすく、ムレを防ぎながらもしっかりと体を支えます。';
 assert.equal(Quality.sourceIncludes(item.itemCaption,quote),true);
 assert.equal(Quality.sourceQuoteIncludes(item.itemCaption,quote),false);
 const raw=localZeroCall(item);
 assert.equal(raw?.local?.partner?.quote,quote);
 assert.equal(Quality.verifiedLocalCopy(item,raw,raw.quality.text),false);
});
