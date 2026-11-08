'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../../api/room-ai-v3');
const response=()=>({code:null,body:null,setHeader(){},status(n){this.code=n;return this;},json(x){this.body=x;return this;}});
test('Preview can use a title-confirmed Rakuten genre as a local-only rescue hint',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const hints=[];let apiCalls=0;
  const handler=createHandler({
   authorize:async()=>({ok:true,plan:'owner'}),store:{},
   localZeroCall:(_item,hint)=>{hints.push(hint||'');return hint==='靴下'?{ok:true,model:'local',quality:{status:'ready',text:'synthetic test only'},groq:{totalCalls:0},variants:[]}:null;},
   groq:{callPass1:async()=>{apiCalls++;throw Error('unexpected network call');},callPass2:async()=>{apiCalls++;throw Error('unexpected network call');}}
  });
  const res=response();
  await handler({method:'POST',body:{itemCode:'test:1',itemName:'靴下 5足',itemCaption:'',itemPrice:1000,genreName:'靴下',genrePath:'ファッション > 靴下'}},res);
  assert.equal(res.code,200);
  assert.deepEqual(hints,['','靴下']);
  assert.equal(apiCalls,0);
  assert.equal(res.body.groq.totalCalls,0);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('a category mismatch is not used as a local identity',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const hints=[];let fallback=0;
  const handler=createHandler({
   authorize:async()=>({ok:true,plan:'owner'}),store:{},
   localZeroCall:(_item,hint)=>{hints.push(hint||'');return null;},
   groq:{callPass1:async()=>{fallback++;throw Object.assign(Error('provider disabled in test'),{status:503});},callPass2:async()=>{fallback++;throw Error('provider disabled');}},
   consumeQuota:async()=>false
  });
  await handler({method:'POST',body:{itemCode:'test:2',itemName:'靴下 5足',itemCaption:'',genreName:'ヘアブラシ',genrePath:'ヘアブラシ'}},response());
  assert.deepEqual(hints,['']);
  assert.equal(fallback,0);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
