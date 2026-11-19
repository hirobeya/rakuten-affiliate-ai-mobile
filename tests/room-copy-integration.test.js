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
function setup({wait=false,reject=false,realLocal=false}={}){
 let row=null,calls=0;const logs=[];
 const provider={model:'openai/gpt-oss-120b',requiredTokens:()=>10,call:async stage=>{calls++;if(reject){const e=new Error('429');e.status=429;throw e;}return {model:'openai/gpt-oss-120b',raw:stage==='generate'?draft:review,usage:{prompt_tokens:100,completion_tokens:50},rateLimit:wait?{'x-ratelimit-remaining-tokens':'0','x-ratelimit-reset-tokens':'60s'}:{}};}};
 const store={loadProduct:async()=>row,saveProduct:async x=>{row={schema_version:x.schemaVersion,model:x.model,raw_ai_json:structuredClone(x.rawAiJson)};}};
 const handler=createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'qa@example.test'}}),store,provider,consumeQuota:async()=>true,localZeroCall:realLocal?undefined:()=>null,logCost:x=>logs.push(x)});
 return {handler,logs,calls:()=>calls};
}
test('actual local route completes a concrete source use relation without quota, cache or provider access',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const source={itemCode:'choice:source',itemName:'洗濯ネット ランドリーネット',itemCaption:'洗濯ネットは口が大きく開くので布団の出し入れがしやすい構造です。'};
  const never=()=>assert.fail('local completion must not spend provider resources');
  const handler=createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'qa@example.test'}}),store:{loadProduct:never,saveProduct:never},provider:{call:never},consumeQuota:never,logCost(){}});
  const r=res();await handler({method:'POST',body:source},r);
  assert.equal(r.code,200);assert.equal(r.body.model,'local');assert.equal(r.body.resourceUsage.calls,0);
  assert.equal(r.body.quality.status,'ready');assert.ok(r.body.quality.text.includes(source.itemCaption));
  assert.equal(client.ready(r.body),''); // Local is never labelled AI-reviewed.
  const html=require('node:fs').readFileSync('public/app.html','utf8');
  const ui={window:{UrenaviFactSafety:require('../public/fact-safety'),UrenaviPurchaseCopyQuality:require('../public/purchase-copy-quality')},RoomCopyResult:client,localCopyAssessment:()=>({ready:false})};
  require('node:vm').createContext(ui);
  require('node:vm').runInContext(html.slice(html.indexOf('function roomCopyNeedsReview('),html.indexOf('function isFullyReviewedCopyState(')),ui);
  assert.equal(ui.roomCopyNeedsReview(r.body.quality.text,source,true,r.body),false);
  assert.equal(ui.roomCopyNeedsReview(r.body.quality.text,{...source,itemCaption:''},true,r.body),true);
  assert.equal(r.body.pass2Status,'not_needed');
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('actual local deferral reaches existing writer and review and then reuses completion',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const x=setup({realLocal:true}),first=res();await x.handler({method:'POST',body:item},first);
  assert.equal(first.code,200);assert.equal(first.body.quality.status,'ready');assert.equal(x.calls(),2);
  assert.deepEqual(first.body.sentences,draft.sentences);
  const again=res();await x.handler({method:'POST',body:item},again);
  assert.equal(again.body.resourceUsage.calls,0);assert.equal(x.calls(),2);
  assert.equal(client.ready(again.body),client.ready(first.body));
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
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
test('unknown provider outcome is terminal across repeated requests and cache resumes, with no new quota claims',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  for(const status of [429,502]){
   let calls=0,claims=0,row=null;
   const provider={model:'openai/gpt-oss-120b',requiredTokens:()=>100,
    call:async()=>{calls++;const e=new Error('unknown upstream outcome');e.status=status;throw e;}};
   const store={loadProduct:async()=>row,saveProduct:async x=>{
    row={schema_version:x.schemaVersion,model:x.model,raw_ai_json:structuredClone(x.rawAiJson)};
   }};
   const handler=createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'qa@example.test'}}),
    store,provider,localZeroCall:()=>null,consumeQuota:async()=>{claims++;return true;},logCost:()=>{}});
   const first=res();await handler({method:'POST',body:item},first);
   assert.equal(first.code,status);
   assert.equal(calls,1);
   assert.equal(claims,1);
   const second=res();await handler({method:'POST',body:item},second);
   assert.equal(second.code,200);
   assert.equal(second.body.ok,false);
   assert.equal(second.body.pending,false);
   assert.equal(second.body.quality.status,'blocked');
   assert.equal(second.body.quality.text,'');
   assert.deepEqual(second.body.variants,[]);
   assert.equal(second.body.groq.totalCalls,1);
   assert.equal(calls,1,'a second visit cannot repeat a potentially charged request');
   assert.equal(claims,1,'no new quota is claimed');
  }
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});

test('Production local-only denies unsupported copy with no AI, while Preview remains owner-only',async()=>{
 const old=process.env.VERCEL_ENV;
 try{
  process.env.VERCEL_ENV='production';
  const x=setup(),r=res();await x.handler({method:'POST',body:item},r);
  assert.equal(r.code,409);assert.equal(x.calls(),0);
  assert.equal(r.body.quality.status,'blocked');
  process.env.VERCEL_ENV='preview';
  const denied=createHandler({authorize:async()=>({ok:true,plan:'pro'})});
  const d=res();await denied({method:'POST',body:item},d);assert.equal(d.code,403);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('safe local completion is preserved with no Groq call; client sends one request on 202 and 429',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  let calls=0;const logs=[];const local={ok:true,model:'local',quality:{status:'ready'},groq:{totalCalls:0}};
  const handler=createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'qa@example.test'}}),localZeroCall:()=>local,provider:{call:async()=>{calls++;}},logCost:x=>logs.push(x)});
  const r=res();await handler({method:'POST',body:item},r);
  assert.equal(calls,0);
  assert.equal(r.code,409,'a mock ready flag alone cannot be published as a sourced result');
  assert.equal(r.body.quality.status,'blocked');assert.equal(r.body.quality.text,'');
  assert.deepEqual(r.body.variants,[]);
  assert.equal(r.body.groq.totalCalls,0);
  assert.equal(logs.length,0,'blocked response makes no provider cost claim');
  for(const status of [202,429]){let dispatched=0;await run(item,{fetchImpl:async url=>{dispatched++;assert.equal(url,'/api/room-copy');return {status,json:async()=>({pending:status===202})};},waitImpl:()=>assert.fail('no timed retry')});assert.equal(dispatched,1);}
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('cost measurement leaves unknown models or token counts unknown and includes output reasoning tokens',async()=>{
 assert.equal(measure({model:'unknown',usage:{prompt_tokens:100,completion_tokens:50}}).estimatedUsd,null);
 assert.equal(measure({model:'openai/gpt-oss-120b',usage:{}}).estimatedUsd,null);
 assert.equal(measure({model:'openai/gpt-oss-20b',usage:{input_tokens:1000,output_tokens:500,output_tokens_details:{reasoning_tokens:400}}}).estimatedUsd,.000225);
 const rows=[];const provider=meteredProvider({model:'openai/gpt-oss-20b',call:async()=>({usage:{prompt_tokens:1000,completion_tokens:500}})},{log:x=>rows.push(x)});await provider.call('generate',{},{});assert.equal(rows[0].outputTokens,500);
});

test('public copy URL dispatches through the existing function and denies unauthenticated Production calls',async()=>{
 const config=require('../vercel.json');
 assert.deepEqual(config.rewrites[0],{source:'/api/room-copy',destination:'/api/room-ai-v3?urenaviContract=1'});
 const previous=process.env.VERCEL_ENV;process.env.VERCEL_ENV='production';
 try{
  let status;const res={setHeader(){},status(n){status=n;return this;},json(body){return body;}};
  await require('../api/room-ai-v3')({method:'POST',query:{urenaviContract:'1'},headers:{},body:{}},res);
  assert.equal(status,403);
 }finally{if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;}
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

test('Production semantic rescue is default-off and requires an explicit bounded daily limit',async()=>{
 const oldEnv=process.env.VERCEL_ENV;
 const oldFlag=process.env.URENAVI_PAID_SEMANTIC_FALLBACK;
 const oldLimit=process.env.URENAVI_PAID_SEMANTIC_DAILY_LIMIT;
 process.env.VERCEL_ENV='production';
 try{
  for(const config of [
   {flag:undefined,limit:2},
   {flag:'false',limit:2},
   {flag:'true',limit:undefined},
   {flag:'true',limit:0},
   {flag:'true',limit:21}
  ]){
   if(config.flag===undefined)delete process.env.URENAVI_PAID_SEMANTIC_FALLBACK;
   else process.env.URENAVI_PAID_SEMANTIC_FALLBACK=config.flag;
   if(config.limit===undefined)delete process.env.URENAVI_PAID_SEMANTIC_DAILY_LIMIT;
   else process.env.URENAVI_PAID_SEMANTIC_DAILY_LIMIT=String(config.limit);
   const x=setup({realLocal:true}),r=res();await x.handler({method:'POST',body:item},r);
   assert.equal(r.code,409,JSON.stringify(config));
   assert.equal(x.calls(),0,'unapproved configuration cannot spend AI tokens');
   assert.equal(r.body.quality.text,'');
  }
  process.env.URENAVI_PAID_SEMANTIC_FALLBACK='true';
  process.env.URENAVI_PAID_SEMANTIC_DAILY_LIMIT='2';
  const x=setup({realLocal:true}),r=res();await x.handler({method:'POST',body:item},r);
  assert.equal(r.code,200);
  assert.equal(x.calls(),2,'only the existing structured writer and reviewer execute');
  assert.equal(r.body.quality.status,'ready');
  assert.equal(r.body.product.what,'収納ボックス');
  assert.equal(client.ready(r.body),publication(item,draft,review).text);
  assert.equal(r.body.resourceUsage.calls,2);
 }finally{
  if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;
  if(oldFlag===undefined)delete process.env.URENAVI_PAID_SEMANTIC_FALLBACK;else process.env.URENAVI_PAID_SEMANTIC_FALLBACK=oldFlag;
  if(oldLimit===undefined)delete process.env.URENAVI_PAID_SEMANTIC_DAILY_LIMIT;else process.env.URENAVI_PAID_SEMANTIC_DAILY_LIMIT=oldLimit;
 }
});
