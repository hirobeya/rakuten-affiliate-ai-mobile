'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../lib/room-copy-handler');
const {questions}=require('../lib/room-semantic-contract');
const {run}=require('../public/room-preview-request');
const Copy=require('../public/room-copy-result'),Outcomes=require('../public/room-outcomes'),Ops=require('../public/room-operations'),Today=require('../public/room-today-plan');
function memory(){const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};}
// Synthetic product/provider: verifies the real application modules together,
// not Rakuten availability, model quality, real posting or an iPhone browser.
test('verified copy flows through explicit posting, duplicate exclusion, exchange, corrected outcomes and another-device restore',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const item={itemCode:'workflow:box',itemName:'収納ボックス',itemCaption:'折りたたみ可能な収納ボックス。小物を収納できます。'};
  const draft={product:{what:'収納ボックス',acts_on:'小物',acts_on_quote:'小物を収納できます。'},sentences:[{text:'小物をまとめたいときに、折りたたみ可能な収納ボックス。',kinds:['scene','spec'],quotes:[item.itemCaption]}]};
  const review={product:{what:'supported',acts_on:'supported'},sentences:draft.sentences.map(s=>({text:s.text,...Object.fromEntries(questions.map(q=>[q,'supported'])),evidenceQuotes:[]})),quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(q=>[q,'supported']))};
  let cached=null,providerCalls=0,requests=0;
  const handler=createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'flow@example.test'}}),store:{loadProduct:async()=>cached,saveProduct:async x=>{cached={schema_version:x.schemaVersion,model:x.model,raw_ai_json:structuredClone(x.rawAiJson)};}},consumeQuota:async()=>true,provider:{model:'openai/gpt-oss-120b',requiredTokens:()=>10,call:async stage=>{providerCalls++;return {raw:stage==='generate'?draft:review,usage:{input_tokens:10,output_tokens:10},rateLimit:{}};}},logCost:()=>{}});
  const request=()=>run(item,{fetchImpl:async(url,options)=>{requests++;assert.equal(url,'/api/room-copy');const res={setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return body;}};await handler({method:options.method,body:JSON.parse(options.body)},res);return {status:res.code,json:async()=>res.body};}});
  const device=memory(),outcomes=Outcomes.createStore(device,'owner'),ops=Ops.createStore(device,'owner');
  const response=await request();assert.equal(response.status,200);assert.equal(providerCalls,2);assert.ok(Copy.ready(response.data));
  assert.equal(outcomes.read().products.length,0,'generation alone does not record a copy or post');
  const at='2026-10-16T01:00:00.000Z';outcomes.prepared(item,at);
  assert.equal(outcomes.isPosted(item),false);
  assert.equal(Today.next({outcomes:outcomes.summary(),operations:ops.summary(at)}).href,'#outcomeHistory');
  outcomes.posted(item.itemCode,at);
  const sameProduct={itemUrl:'https://item.rakuten.co.jp/workflow/box/?scid=example'};
  assert.equal(outcomes.isPosted(sameProduct),true);
  assert.equal([item,sameProduct].filter(i=>!outcomes.isPosted(i)).length,0);
  const contact=ops.add({type:'like_return',url:'https://room.rakuten.co.jp/room_workflow/items',name:'テスト相手'},at);
  assert.equal(Today.next({outcomes:outcomes.summary(),operations:ops.summary(at)}).href,'#roomOpsQueue');
  assert.throws(()=>ops.transition(contact.id,'complete',at));
  ops.transition(contact.id,'open',at);ops.transition(contact.id,'complete',at);
  assert.equal(ops.summary(at).today,1);assert.throws(()=>ops.add({type:'like_visit',url:contact.url},at));
  outcomes.result({id:item.itemCode,date:'2026-10-16',sales:1000,commission:'',minutes:5});
  assert.equal(outcomes.summary().commission.total,null);
  outcomes.result({id:item.itemCode,date:'2026-10-16',sales:1200,commission:0,minutes:10});
  assert.equal(outcomes.read().results.length,1);assert.equal(outcomes.summary().sales.total,1200);assert.equal(outcomes.summary().commission.total,0);
  const otherDevice=memory(),restored=Outcomes.createStore(otherDevice,'owner'),restoredOps=Ops.createStore(otherDevice,'owner');
  restored.restore(outcomes.exportData());restoredOps.restore(ops.exportData());
  assert.equal(restored.isPosted(sameProduct),true);assert.equal(restored.summary().sales.total,1200);assert.equal(restoredOps.summary(at).today,1);
  assert.deepEqual(restored.restore(outcomes.exportData()),{added:0,records:0});
  assert.equal(Outcomes.createStore(otherDevice,'another-owner').read().products.length,0);
  const reused=await request();assert.equal(Copy.ready(reused.data),Copy.ready(response.data));assert.equal(providerCalls,2);assert.equal(requests,2);assert.equal(reused.data.resourceUsage.calls,0);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
