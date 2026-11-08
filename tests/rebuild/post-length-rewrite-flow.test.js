'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {advance}=require('../../lib/room-semantic-engine');
const {questions}=require('../../lib/room-semantic-contract');
const Browser=require('../../public/room-copy-result');
const item={itemCode:'test:room-limit',itemName:'収納ボックス',itemCaption:'折りたたみ可能な収納ボックス'};
const short={product:{what:'収納ボックス',acts_on:'収納する物',acts_on_quote:item.itemCaption},sentences:[
 {text:'収納する物をまとめたいときに。',kinds:['scene'],quotes:[item.itemCaption]},
 {text:'使わないときは折りたためる収納ボックス。',kinds:['spec','benefit'],quotes:[item.itemCaption]}
]};
const long={product:short.product,sentences:[0,1,2].map(i=>({text:'収納する物をまとめたいときに、折りたたみ可能な収納ボックスを確認します。'.repeat(6)+'段階'+i+'。',kinds:['scene','spec'],quotes:[item.itemCaption]}))};
const review=()=>({product:{what:'supported',acts_on:'supported'},sentences:short.sentences.map(s=>({text:s.text,reason:'source supported',evidenceQuotes:[],...Object.fromEntries(questions.map(q=>[q,'supported']))})),quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(q=>[q,'supported']))});
test('oversize draft fails closed, rewrites whole post, independently reviews and exposes only final untruncated copy',async()=>{
 assert.ok(long.sentences.every(s=>s.text.length<=350),'fixture must be individually allowed by new sentence schema');
 assert.ok(Browser.compose(long.sentences).length>500);
 let saved=null,calls=[],quota=0;
 const args={item,runKey:'fixed-length-review',now:()=>1,store:{
  loadProduct:async()=>saved,saveProduct:async x=>{saved={schema_version:x.schemaVersion,model:x.model,raw_ai_json:structuredClone(x.rawAiJson)};}
 },provider:{model:'synthetic',requiredTokens:()=>100,call:async(stage)=>{
  calls.push(stage);
  return {raw:stage==='generate'?(calls.filter(x=>x==='generate').length===1?long:short):review(),rateLimit:{}};
 }},consumeQuota:async()=>{quota++;return true;}};
 const first=await advance(args);
 assert.equal(first.ok,false);assert.equal(first.pending,true);assert.equal(first.phase,'regeneration');
 assert.deepEqual(calls,['generate']);
 assert.equal(first.variants.length,0);
 assert.ok(first.diagnostics.history[0].failures.some(f=>f.rule==='post_exceeds_room_limit'));
 const second=await advance(args);
 assert.equal(second.ok,false);assert.equal(second.pending,true);
 assert.deepEqual(calls,['generate','generate']);
 const third=await advance(args);
 assert.equal(third.ok,true);assert.equal(third.pending,false);
 assert.deepEqual(calls,['generate','generate','verify']);
 assert.equal(third.quality.text,Browser.compose(short.sentences));
 assert.ok(Browser.fitsLength(third.quality.text));
 const browserReady={...third,product:short.product,sentences:short.sentences};
 assert.equal(Browser.ready(browserReady),third.quality.text);
 assert.equal(quota,3);
 await advance(args);
 assert.deepEqual(calls,['generate','generate','verify'],'verified cache never re-spends tokens');
});
