'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../../lib/room-copy-handler');
const {fitsLength}=require('../../public/room-copy-result');
const source={itemCode:'source:overlimit',itemName:'収納ケース',itemCaption:'前面が開く収納ケース。'};
const res=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return body;}});
test('over-limit local result is NOT published as ready; falls back safely without provider calls while waiting',async()=>{
 const original=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const oversized='長い本文'.repeat(150);
  assert.equal(fitsLength(oversized),false);
  let providerCalls=0,quotaCalls=0,localCalls=0;
  const local=()=>{localCalls++;return {ok:true,pending:false,model:'local',phase:'local',quality:{status:'ready',text:oversized},variants:[{text:oversized}],groq:{totalCalls:0}};};
  const handler=createHandler({
   authorize:async()=>({ok:true,plan:'owner',user:{email:'qa@example.test'}}),
   store:{loadProduct:async()=>null,saveProduct:async()=>{throw Error('waiting cannot save progress')}},
   localZeroCall:local,
   provider:{model:'synthetic',requiredTokens:()=>100,acquire:async()=>({waitMs:3000}),call:async()=>{providerCalls++;throw Error('must not call')}},
   consumeQuota:async()=>{quotaCalls++;throw Error('must not spend')},
   logCost:()=>{}
  });
  const response=res();await handler({method:'POST',body:source},response);
  assert.equal(response.code,202);
  assert.equal(response.body.ok,false);
  assert.equal(response.body.pending,true);
  assert.equal(response.body.quality.text,'');
  assert.deepEqual(response.body.variants,[]);
  assert.equal(providerCalls,0);assert.equal(quotaCalls,0);
  assert.equal(localCalls,2,'both local passes checked without unsafely publishing over-limit output');
 }finally{if(original===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=original;}
});
test('short but properly verified local copy remains available without provider calls',async()=>{
 const original=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const text='前面の開き方を確認したいときに。収納ケースは前面が開くタイプです。';
  let providerCalls=0;
  const handler=createHandler({
   authorize:async()=>({ok:true,plan:'owner',user:{email:'qa@example.test'}}),
   localZeroCall:()=>({ok:true,pending:false,model:'local',phase:'local',quality:{status:'ready',text},variants:[{text}],groq:{totalCalls:0}}),
   provider:{model:'synthetic',requiredTokens:()=>100,call:async()=>{providerCalls++;throw Error('must not call')}},
   logCost:()=>{}
  });
  const response=res();await handler({method:'POST',body:source},response);
  assert.equal(response.code,200);
  assert.equal(response.body.ok,true);
  assert.equal(response.body.quality.text,text);
  assert.equal(providerCalls,0);
 }finally{if(original===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=original;}
});
