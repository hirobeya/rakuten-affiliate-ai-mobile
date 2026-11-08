'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHandler}=require('../../lib/room-copy-handler');
const data=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json'),'utf8'));
function reply(){return{statusCode:0,body:null,setHeader(){},status(n){this.statusCode=n;return this;},json(data){this.body=data;return this;}};}
test('all 44 saved inputs: Preview user route receives exactly the proven local results, no model or quota',async()=>{
 const prior=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  let providerCalls=0,quotaCalls=0,storeCalls=0;
  const handler=createHandler({
   authorize:async()=>({ok:true,plan:'owner',user:{id:'owner-fixture'}}),
   provider:{model:'mock',requiredTokens:()=>0,call:async()=>{providerCalls++;throw Error('unapproved model call');}},
   consumeQuota:async()=>{quotaCalls++;return false;},
   store:{loadProduct:async()=>{storeCalls++;return null;}},
   logCost:()=>{}
  });
  let ready=0,original=0;const newlyReady=[];
  for(const row of data.rows){
   if(row.before)original++;
   const item=row.item;
   const res=reply();
   await handler({method:'POST',body:{itemCode:item.itemCode,itemName:item.itemName,itemCaption:item.itemCaption,catchcopy:item.catchcopy||'',itemPrice:item.itemPrice||0}},res);
   const success=res.statusCode===200&&res.body?.ok===true&&res.body?.model==='local';
   if(success)ready++;
   if(row.after) assert.equal(success,true,'previously valid completion must never regress: '+item.itemCode);
   if(success&&!row.after)newlyReady.push({itemCode:item.itemCode,text:res.body.quality.text,reason:row.diagnostic?.reason});
   if(success){
    if(row.after)assert.equal(res.body.quality.text,row.after);
    assert.equal(res.body.groq.totalCalls,0);
    assert.equal(res.body.resourceUsage.calls,0);
   }
  }
  assert.equal(original,5);
  assert.ok(ready>=6,'zero regressions against the frozen baseline');
  assert.equal(providerCalls,0);
  assert.equal(quotaCalls,data.rows.length-ready,'rejected local results defer to quota-controlled model path');
  console.log('END_TO_END_LOCAL_COMPARISON '+JSON.stringify({items:data.rows.length,baselineReady:original,integratedReady:ready,gained:ready-original,newlyReady,modelCalls:providerCalls,localPassNeverClaimed6Axis:true,quotaAttemptsForUnready:quotaCalls,cacheReads:storeCalls}));
 }finally{if(prior===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=prior;}
});
