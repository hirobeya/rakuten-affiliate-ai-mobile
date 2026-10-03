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
 console.log('room-semantic-engine: PASS (header waits, deduplication, one rewrite, no failed publication)');
})().catch(e=>{console.error(e);process.exitCode=1;});
