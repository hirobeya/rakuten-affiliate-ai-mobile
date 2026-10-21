'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../lib/room-copy-handler');
const {publication,questions}=require('../lib/room-semantic-contract');
const client=require('../public/room-copy-result');
const {measure,meteredProvider}=require('../lib/room-copy-cost');
const {run}=require('../public/room-preview-request');
const item={itemCode:'qa:box',itemName:'収納ボックス',itemCaption:'折りたたみ可能な収納ボックス。小物を収納できます。'};
const draft={product:{what:'収納ボックス',acts_on:'小物',acts_on_quote:'小物を収納できます。'},sentences:[{text:'小物をまとめたいときに、折りたたみ可能な収納ボックス。',kinds:['scene','spec'],quotes:[item.itemCaption]}]};
const review={product:{what:'supported',acts_on:'supported'},sentences:draft.sentences.map(s=>({text:s.text,...Object.fromEntries(questions.map(q=>[q,'supported'])),evidenceQuotes:[]})),quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(q=>[q,'supported']))};
function res(){return {setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return body;}};}
function setup({wait=false,reject=false}={}){
 let row=null,calls=0;const logs=[];
 const provider={model:'openai/gpt-oss-120b',requiredTokens:()=>10,call:async stage=>{calls++;if(reject){const e=new Error('429');e.status=429;throw e;}return {model:'openai/gpt-oss-120b',raw:stage==='generate'?draft:review,usage:{prompt_tokens:100,completion_tokens:50},rateLimit:wait?{'x-ratelimit-remaining-tokens':'0','x-ratelimit-reset-tokens':'60s'}:{}};}};
 const store={loadProduct:async()=>row,saveProduct:async x=>{row={schema_version:x.schemaVersion,model:x.model,raw_ai_json:structuredClone(x.rawAiJson)};}};
 const handler=createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'qa@example.test'}}),store,provider,consumeQuota:async()=>true,localZeroCall:()=>null,logCost:x=>logs.push(x)});
 return {handler,logs,calls:()=>calls};
}
test('Preview canonical writer and every-sentence reviewer publish only verified text and reuse cache',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const x=setup(),r=res();await x.handler({method:'POST',body:item},r);
  assert.equal(r.code,200);assert.equal(x.calls(),2);assert.equal(r.body.resourceUsage.calls,2);assert.equal(r.body.resourceUsage.inputTokens,200);assert.equal(r.body.resourceUsage.outputTokens,100);assert.deepEqual(r.body.product,draft.product);assert.deepEqual(r.body.sentences,draft.sentences);assert.equal(client.ready(r.body),publication(item,draft,review).text);
  const html=require('node:fs').readFileSync('public/app.html','utf8');
  const ui={window:{UrenaviFactSafety:require('../public/fact-safety')},RoomCopyResult:client,localCopyAssessment:()=>({ready:false})};
  require('node:vm').createContext(ui);
  require('node:vm').runInContext(html.slice(html.indexOf('function roomCopyNeedsReview('),html.indexOf('function isFullyReviewedCopyState(')),ui);
  // The contract permits one concrete, fully reviewed sentence. Do not let
  // a separate client length rule reject the server's complete verified post.
  assert.equal(ui.roomCopyNeedsReview(client.ready(r.body),item,true,r.body),false);
  assert.equal(ui.roomCopyNeedsReview(client.ready(r.body),item,true),true);
  assert.equal(ui.roomCopyNeedsReview(client.ready(r.body),item,true,{...r.body,pending:true}),true);
  assert.equal(ui.roomCopyNeedsReview('便利な収納ボックスです。',item,true,r.body),true);
  assert.equal(ui.roomCopyNeedsReview(client.ready(r.body),item,false),true);
  assert.equal(x.logs.length,2);assert.ok(x.logs.every(x=>x.estimatedUsd===.000045));assert.ok(x.logs.every(x=>!JSON.stringify(x).includes('qa@example.test')));
  const cached=res();await x.handler({method:'POST',body:item},cached);assert.equal(x.calls(),2);assert.equal(client.ready(cached.body),client.ready(r.body));assert.equal(x.logs.at(-1).calls,0);assert.equal(cached.body.resourceUsage.calls,0);
  const unsafe=structuredClone(r.body);unsafe.sentences[0].text='絶対に売れる商品';assert.equal(client.ready(unsafe),'');
  const unclear=structuredClone(r.body);unclear.quality.review.ok=false;assert.equal(client.ready(unclear),'');
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('pending verification never publishes or calls verifier before required wait; read-only costs zero',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const x=setup({wait:true}),r=res();await x.handler({method:'POST',body:item},r);assert.equal(r.code,202);assert.equal(x.calls(),1);assert.equal(client.ready(r.body),'');assert.deepEqual(r.body.sentences,[]);
  await x.handler({method:'POST',body:{...item,statusOnly:true}},res());assert.equal(x.calls(),1);
  await x.handler({method:'POST',body:item},res());assert.equal(x.calls(),1);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('429 stops once, records unknown billed usage, never calls subsequent stage',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{const x=setup({reject:true}),r=res();await x.handler({method:'POST',body:item},r);assert.equal(r.code,429);assert.equal(x.calls(),1);assert.equal(x.logs[0].estimatedUsd,null);assert.equal(x.logs[0].failed,true);}
 finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('Production and non-owner calls cannot use new Preview endpoint',async()=>{
 const old=process.env.VERCEL_ENV;
 try{process.env.VERCEL_ENV='production';const x=setup(),r=res();await x.handler({method:'POST',body:item},r);assert.equal(r.code,404);assert.equal(x.calls(),0);process.env.VERCEL_ENV='preview';const denied=createHandler({authorize:async()=>({ok:true,plan:'pro'})});const d=res();await denied({method:'POST',body:item},d);assert.equal(d.code,403);}
 finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('safe local completion is preserved with no Groq call; client sends one request on 202 and 429',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  let calls=0;const logs=[];const local={ok:true,model:'local',quality:{status:'ready'},groq:{totalCalls:0}};
  const handler=createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'qa@example.test'}}),localZeroCall:()=>local,provider:{call:async()=>{calls++;}},logCost:x=>logs.push(x)});
  const r=res();await handler({method:'POST',body:item},r);assert.equal(calls,0);const {resourceUsage,...copy}=r.body;assert.deepEqual(copy,local);assert.equal(resourceUsage.calls,0);assert.equal(logs[0].estimatedUsd,0);
  for(const status of [202,429]){let dispatched=0;await run(item,{fetchImpl:async url=>{dispatched++;assert.equal(url,'/api/room-copy');return {status,json:async()=>({pending:status===202})};},waitImpl:()=>assert.fail('no timed retry')});assert.equal(dispatched,1);}
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('cost measurement leaves unknown models or token counts unknown and includes output reasoning tokens',async()=>{
 assert.equal(measure({model:'unknown',usage:{prompt_tokens:100,completion_tokens:50}}).estimatedUsd,null);
 assert.equal(measure({model:'openai/gpt-oss-120b',usage:{}}).estimatedUsd,null);
 assert.equal(measure({model:'openai/gpt-oss-20b',usage:{input_tokens:1000,output_tokens:500,output_tokens_details:{reasoning_tokens:400}}}).estimatedUsd,.000225);
 const rows=[];const provider=meteredProvider({model:'openai/gpt-oss-20b',call:async()=>({usage:{prompt_tokens:1000,completion_tokens:500}})},{log:x=>rows.push(x)});await provider.call('generate',{},{});assert.equal(rows[0].outputTokens,500);
});

test('public copy URL reuses the existing function and rejects production dispatch',async()=>{
 const config=require('../vercel.json');
 assert.deepEqual(config.rewrites[0],{source:'/api/room-copy',destination:'/api/room-ai-v3?urenaviContract=1'});
 const previous=process.env.VERCEL_ENV;process.env.VERCEL_ENV='production';
 try{let status;const res={setHeader(){},status(n){status=n;return this;},json(body){return body;}};
  await require('../api/room-ai-v3')({method:'POST',query:{urenaviContract:'1'},body:{}},res);assert.equal(status,404);
 }finally{process.env.VERCEL_ENV=previous;}
});

test('semantic generator requires evidenced purchase value, not generic one-line usage',()=>{
 const prompts=require('../lib/room-semantic-provider');
 assert.match(prompts.WRITER_PROMPT,/商品固有の特徴/);
 assert.match(prompts.WRITER_PROMPT,/一般的な一文だけでは完成扱いにしない/);
 assert.match(prompts.REVIEW_PROMPT,/distinguishable evidenced feature/);
 assert.match(prompts.REVIEW_PROMPT,/Do not demand a specific sentence count/);
 const engine=require('../lib/room-semantic-engine');
 assert.match(engine.VERSION,/^room_contract_[a-f0-9]{16}$/);
});
