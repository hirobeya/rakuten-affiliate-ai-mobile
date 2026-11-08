'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHandler}=require('../../lib/room-copy-handler');
const {localZeroCall}=require('../../api/room-ai-v3');
const {generate}=require('../../lib/urenavi-core/last-resort');
const {ready}=require('../../public/room-copy-result');
const source=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json'),'utf8'));
const row=source.rows.find(x=>x.item.itemCode==='e-kurashi:10019512');
const item=row.item;
const response=()=>({code:null,data:null,setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
test('previously offline-only editorial local rescue reaches actual Preview handler without Groq',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const sample={itemCode:item.itemCode,itemName:item.itemName,itemCaption:item.itemCaption,catchcopy:item.catchcopy||'',itemPrice:item.itemPrice||0};
  const first=localZeroCall(sample);
  const rescued=localZeroCall(sample,'',null,{editorial:true});
  assert.equal(first,null,'freeze: normal pass cannot finish this item');
  assert.equal(rescued?.quality?.status,'ready');
  assert.equal(rescued?.quality?.text,row.after);
  assert.equal(generate(sample).result?.quality?.text,row.after);
  let network=0,quota=0,store=0;
  const handler=createHandler({
   authorize:async()=>({ok:true,plan:'owner',user:{id:'test-owner'}}),
   provider:{model:'mock',requiredTokens:()=>0,call:async()=>{network++;throw Error('provider_must_not_be_called');}},
   consumeQuota:async()=>{quota++;throw Error('quota_must_not_be_consumed');},
   store:{loadProduct:async()=>{store++;throw Error('db_must_not_be_read');}},
   logCost:()=>{}
  });
  const out=response();
  await handler({method:'POST',body:sample},out);
  assert.equal(out.code,200);
  assert.equal(out.data.quality.text,row.after);
  assert.equal(out.data.resourceUsage.calls,0);
  assert.equal(out.data.groq.totalCalls,0);
  assert.equal(network,0);assert.equal(quota,0);assert.equal(store,0);
  assert.equal(out.data.model,'local');
  // This is a legacy V3 local copy, not a reviewed room_contract_ AI draft.
  assert.equal(ready(out.data),'');
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('no result is promoted from an unverified second pass',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const calls=[];
  const handler=createHandler({
   authorize:async()=>({ok:true,plan:'owner',user:{id:'test-owner'}}),
   localZeroCall:(i,identity,diagnostics,options)=>{calls.push(options?.editorial===true?'editorial':'normal');return {ok:true,pending:false,model:'local',quality:{status:'ready',text:'not bound'},variants:[{text:'different text'}],groq:{totalCalls:0}};},
   provider:{model:'mock',requiredTokens:()=>0,call:async()=>{throw Error('not approved');}},
   consumeQuota:async()=>false,
   store:{loadProduct:async()=>null},
   logCost:()=>{}
  });
  const out=response();
  await handler({method:'POST',body:{itemCode:'x',itemName:'商品A',itemCaption:'説明'}},out);
  assert.deepEqual(calls,['normal','editorial']);
  assert.notEqual(out.data?.quality?.text,'not bound');
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
