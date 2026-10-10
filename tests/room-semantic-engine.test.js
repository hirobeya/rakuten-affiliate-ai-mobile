'use strict';
const assert=require('node:assert/strict');
const {advance}=require('../lib/room-semantic-engine');
const {questions}=require('../lib/room-semantic-contract');
const {rateWait,duration}=require('../lib/room-semantic-provider');
const item={itemCode:'test:engine',itemName:'収納ボックス',itemCaption:'折りたたみ可能な収納ボックス'};
const draft={product:{what:'収納ボックス',acts_on:'収納する物',acts_on_quote:item.itemCaption},sentences:[{text:'収納する物をまとめたいときに。',kinds:['scene'],quotes:[item.itemCaption]},{text:'使わないときは折りたためる収納ボックス。',kinds:['spec','benefit'],quotes:[item.itemCaption]}]};
function review(ok){return {product:{what:'supported',acts_on:'supported'},sentences:draft.sentences.map(s=>({text:s.text,...Object.fromEntries(questions.map(q=>[q,ok?'supported':'unclear'])),evidenceQuotes:s.quotes})),quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(q=>[q,'supported']))};}
function setup(verdicts){let row=null,clock=0,calls=0,quota=0;const args={item,runKey:String(Math.random()),now:()=>clock,store:{loadProduct:async()=>row,saveProduct:async x=>{row={schema_version:x.schemaVersion,model:x.model,raw_ai_json:JSON.parse(JSON.stringify(x.rawAiJson))};}},consumeQuota:async()=>{quota++;return true;},provider:{model:'test',requiredTokens:()=>100,call:async stage=>{calls++;return {raw:stage==='generate'?draft:review(verdicts.shift()),rateLimit:{'x-ratelimit-remaining-tokens':'0','x-ratelimit-reset-tokens':'2.5s'}};}}};return {args,tick:()=>{clock+=2500;},counts:()=>({calls,quota})};}
(async()=>{
 assert.equal(duration('1m2.5s'),62500);assert.equal(rateWait({'x-ratelimit-remaining-tokens':'200','x-ratelimit-reset-tokens':'65s'},100),0);
 for(const verdicts of [[true],[false,true],[false,false]]){
  const x=setup([...verdicts]);let out=await advance(x.args);assert.equal(out.pending,true);assert.equal(out.retryAfterMs,2500);
  await advance(x.args);assert.deepEqual(x.counts(),{calls:1,quota:1});
  for(let i=0;i<4&&out.pending;i++){x.tick();out=await advance(x.args);}
  assert.equal(out.pending,false);assert.equal(out.ok,verdicts.at(-1));assert.equal(out.variants.length,out.ok?1:0);assert.equal(x.counts().calls,verdicts.length*2);
  const before=x.counts();await advance(x.args);assert.deepEqual(x.counts(),before);if(!out.ok)assert.equal(out.quality.text,'');
 }
 const x=setup([true]);const first=await Promise.all([advance(x.args),advance(x.args)]);assert.equal(first[0].pending,true);assert.equal(x.counts().calls,1);
 const peek=setup([true]);const empty=await advance({...peek.args,readOnly:true});assert.equal(empty.pending,true);assert.deepEqual(peek.counts(),{calls:0,quota:0});await advance(peek.args);peek.tick();const pending=await advance({...peek.args,readOnly:true});assert.equal(pending.phase,'verification');assert.deepEqual(pending.diagnostics.draft,draft);assert.deepEqual(peek.counts(),{calls:1,quota:1});
 const malformed=setup([true]);let errorCalls=0;const normalCall=malformed.args.provider.call;malformed.args.provider.call=async stage=>{errorCalls++;if(errorCalls===1){const e=new Error('invalid JSON');e.status=400;e.safeError={code:'json_validate_failed'};e.failedGeneration='recorded invalid JSON';throw e;}return normalCall(stage);};let retry=await advance(malformed.args);assert.equal(retry.phase,'regeneration');assert.equal(retry.groq.totalCalls,1);assert.equal(retry.diagnostics.upstreamErrors[0].failedGeneration,'recorded invalid JSON');assert.equal(retry.variants.length,0);for(let i=0;i<3&&retry.pending;i++){malformed.tick();retry=await advance(malformed.args);}assert.equal(retry.ok,true);assert.equal(retry.groq.totalCalls,3);
 const alwaysBad=setup([]);alwaysBad.args.provider.call=async()=>{const e=new Error('invalid JSON');e.status=400;e.safeError={code:'json_validate_failed'};throw e;};let bad=await advance(alwaysBad.args);alwaysBad.tick();bad=await advance(alwaysBad.args);assert.equal(bad.pending,false);assert.equal(bad.ok,false);assert.equal(bad.groq.totalCalls,2);assert.equal(bad.variants.length,0);
 // A Groq 429 must stop immediately, even if retry-after suggests a short wait.
 for(const retryAfter of ['0','614']){
  const limited=setup([true]);let providerCalls=0;
  limited.args.provider.call=async()=>{providerCalls++;const e=new Error('rate limited');e.status=429;e.rateLimit={'retry-after':retryAfter};throw e;};
  await assert.rejects(()=>advance(limited.args),e=>e.status===429&&e.stage==='generate');
  limited.tick();
  assert.equal(providerCalls,1);
  assert.deepEqual(limited.counts(),{calls:0,quota:1});
 }
 console.log('room-semantic-engine: PASS (header waits, deduplication, one rewrite, no failed publication)');
})().catch(e=>{console.error(e);process.exitCode=1;});
