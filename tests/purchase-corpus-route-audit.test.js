'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createHandler}=require('../lib/room-copy-handler');
const safety=require('../public/fact-safety'),quality=require('../public/purchase-copy-quality');
const html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');
test('all 780 source products reach local copy or the shared semantic path without spending provider quota while waiting',async()=>{
 const previous=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const ui=vm.createContext({window:{UrenaviFactSafety:safety,UrenaviPurchaseCopyQuality:quality},localCopyAssessment:()=>({ready:false})});
  vm.runInContext(html.slice(html.indexOf('function roomCopyNeedsReview('),html.indexOf('function isFullyReviewedCopyState(')),ui);
  const items=fs.readdirSync(__dirname+'/fixtures').filter(f=>/^rakuten-large-genres-20260925-.*json$/.test(f)).flatMap(f=>(require('./fixtures/'+f).genres||[]).flatMap(g=>g.items||[]));
  assert.equal(items.length,780);let local=0,semantic=0;
  const handler=createHandler({now:()=>1_800_000_000_000,authorize:async()=>({ok:true,plan:'owner',user:{email:'qa@example.test'}}),store:{loadProduct:async()=>null,saveProduct:async()=>assert.fail('admission wait must not save stale product progress')},provider:{model:'test',requiredTokens:()=>10000,acquire:async()=>({waitMs:5000}),call:async()=>assert.fail('no provider call during a shared-budget wait')},consumeQuota:async()=>assert.fail('no quota spent during a shared-budget wait'),logCost:()=>{}});
  for(const [index,source]of items.entries()){
   const item={itemCode:String(source.itemCode||'corpus:'+index),itemName:String(source.itemName||''),itemCaption:String(source.itemCaption||''),catchcopy:String(source.catchcopy||''),itemPrice:Number(source.itemPrice)||0};
   const res={setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return body;}};
   await handler({method:'POST',body:item},res);
   assert.ok([200,202].includes(res.code),item.itemName+' '+JSON.stringify(res.body));
   assert.equal(res.body.resourceUsage.calls,0);
   if(res.code===200){
    local++;assert.equal(res.body.model,'local');assert.equal(res.body.quality.status,'ready');
    assert.equal(ui.roomCopyNeedsReview(res.body.quality.text,item,true,res.body),false,item.itemName);
   }else{
    semantic++;assert.equal(res.body.pending,true);assert.equal(res.body.retryAfterMs,5000);
    assert.equal(res.body.quality.text,'');assert.deepEqual(res.body.variants,[]);assert.deepEqual(res.body.sentences,[]);
   }
  }
  assert.ok(local>0);assert.ok(semantic>0);console.log('PURCHASE_CORPUS_ROUTE_AUDIT '+JSON.stringify({total:items.length,local,semantic,providerCalls:0}));
 }finally{if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;}
});
