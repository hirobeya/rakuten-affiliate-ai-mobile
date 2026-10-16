'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const structured=require('../public/structured-room-copy');
const {localZeroCall}=require('../api/room-ai-v3');
const {createHandler}=require('../lib/room-copy-handler');
const client=require('../public/room-copy-result');
const html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');
function appContext(){
 const window={};const ctx=vm.createContext({window,Intl});
 for(const name of ['structured-room-copy','fact-safety','pain-copy','room-copy-quality'])vm.runInContext(fs.readFileSync(require.resolve('../public/'+name+'.js'),'utf8'),ctx);
 ctx.UrenaviPainCopy=window.UrenaviPainCopy;
 ctx.groundedAnalysis=item=>window.UrenaviPainCopy.analyzeRoomProduct(item);
 ctx.usePurchasePlan=true;
 for(const [start,end] of [['function localCopyAssessment(','function neutralRulePost('],['function roomCopyNeedsReview(','function isFullyReviewedCopyState('],['function aiTargetDecision(item){','function activeAiProgress(']]){
  const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a);vm.runInContext(html.slice(a,b),ctx);
 }
 return ctx;
}
function corpus(){return fs.readdirSync(__dirname+'/fixtures').filter(f=>/^rakuten-large-genres-20260925-.*json$/.test(f)).flatMap(f=>(require('./fixtures/'+f).genres||[]).flatMap(g=>g.items||[]));}
test('all factual-only corpus drafts retain source facts but cannot bypass the real app publication or AI routing gates',()=>{
 const ctx=appContext(),items=corpus();assert.equal(items.length,780);let count=0;
 for(const item of items){
  const draft=structured.compose(item);
  if(draft.status!=='draft')continue;
  count++;
  assert.ok(draft.text);assert.equal(draft.values.length,0);
  assert.equal(draft.understanding.scene,'');assert.equal(draft.understanding.method,'source_label');
  for(const fact of draft.facts)assert.ok(String(item[fact.source]||'').includes(fact.quote));
  for(const proof of draft.understanding.identityEvidence)assert.ok(item.itemName.includes(proof.quote));
  assert.equal(structured.assess(item).ready,false,item.itemName);
  assert.equal(ctx.roomCopyNeedsReview(draft.text,item),true,item.itemName);
  assert.equal(ctx.aiTargetDecision(item).callAi,true,item.itemName);
  for(const method of ['makeRoomCopy','makeThreadsCopy','makeInstagramCopy'])assert.equal(ctx.window.UrenaviPainCopy[method](item,''),draft.text);
  // The server may only complete via its separately grounded, stronger path.
  const local=localZeroCall(item);
  if(local)assert.notEqual(local.quality.text,draft.text);
 }
 assert.ok(count>0,'the corpus must exercise factual-only drafts');
 console.log('FACTUAL_DRAFT_BOUNDARIES '+JSON.stringify({total:items.length,drafts:count}));
});
test('factual draft requires verified generation; a 429 cannot return draft text as a publishable response',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const item={itemCode:'test:printer',itemName:'プリンター WiFi',itemCaption:''};
  assert.equal(structured.compose(item).status,'draft');assert.equal(localZeroCall(item),null);
  let calls=0,quotas=0;
  const handler=createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'test@example.test'}}),store:{loadProduct:async()=>null,saveProduct:async()=>{}},consumeQuota:async()=>{quotas++;return true;},provider:{model:'openai/gpt-oss-120b',requiredTokens:()=>10,call:async()=>{calls++;throw Object.assign(new Error('rate limit'),{status:429});}},logCost:()=>{}});
  const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return body;}};
  await handler({method:'POST',body:item},res);
  assert.equal(res.code,429);assert.equal(calls,1);assert.equal(quotas,1);
  assert.equal(res.body.pending,false);assert.equal(client.ready(res.body),'');
  assert.ok(!res.body.quality?.text);assert.ok(!res.body.variants?.length);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('missing facts, conflicting identities and product accessories remain blocked rather than becoming factual drafts',()=>{
 for(const itemName of ['架空品','収納ベンチ モバイルバッテリー 木製','モバイルバッテリー用ケース USB-C']){
  const item={itemName};assert.equal(structured.compose(item).text,'');assert.equal(structured.assess(item).ready,false);
 }
 const supported={itemName:'掃除機 コードレス 充電式'};
 assert.equal(structured.assess(supported).ready,true);
 assert.equal(appContext().roomCopyNeedsReview(structured.compose(supported).text,supported),false);
});
