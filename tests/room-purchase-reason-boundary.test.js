'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspect,publication,questions}=require('../lib/room-semantic-contract');
const {advance}=require('../lib/room-semantic-engine');
const quality=Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(k=>[k,'supported']));
function approval(draft){return {product:{what:'supported',acts_on:'supported'},quality,sentences:draft.sentences.map(s=>({text:s.text,reason:'test approval',evidenceQuotes:[],...Object.fromEntries(questions.map(k=>[k,'supported']))}))};}
function fixture(identity,quote,texts){const item={itemCode:'test:reason-boundary',itemName:identity,itemCaption:quote};return {item,draft:{product:{what:identity,acts_on:identity,acts_on_quote:quote},sentences:texts.map(text=>({text,quotes:[quote],kinds:['spec','scene']}))}};}
test('AI approval cannot bypass the same feature-restatement veto used for local posts',()=>{
 for(const f of [
  fixture('収納ボックス','折りたたみ',['折りたたみで選びたいときに。','折りたたみの収納ボックスです。']),
  fixture('ランドリーネット','サイズ組み合わせ自由で、選べる6枚セット',['サイズ組み合わせ自由で、選べる6枚セットのランドリーネットです。']),
  fixture('フライパン','IHでの調理に対応',['IHでの調理に対応しています。','フライパンです。','IHでの調理に対応した商品です。'])
 ]){
  const before=JSON.stringify(f),out=publication(f.item,f.draft,approval(f.draft));
  assert.equal(out.status,'blocked');assert.equal(out.text,'');
  assert(out.reasons.some(r=>r.rule==='restated_purchase_reason'));
  assert.equal(JSON.stringify(f),before);
 }
});
test('the veto preserves concrete use relationships and does not certify source support',()=>{
 for(const f of [
  fixture('収納ボックス','使わないときに折りたたんで収納できます。',['使わないときに折りたたんで収納できる収納ボックスです。']),
  fixture('収納袋','衣類の大きさに合わせてサイズを組み合わせ自由に選べる6枚セットの収納袋です。',['衣類の大きさに合わせてサイズを組み合わせ自由に選べる6枚セットの収納袋です。'])
 ])assert.equal(publication(f.item,f.draft,approval(f.draft)).status,'ready');
 const f=fixture('収納ボックス','折りたたみ',['収納ボックスは使わないときに折りたためます。']);
 const review=approval(f.draft);review.sentences[0].degree='unclear';
 assert.equal(publication(f.item,f.draft,review).status,'blocked');
});
test('the existing rewrite receives the rejection; repeated weak drafts never publish',async()=>{
 const {item,draft}=fixture('収納ボックス','折りたたみ',['折りたたみで選びたいときに。','折りたたみの収納ボックスです。']);
 let row=null;const calls=[];
 const args={item,runKey:'reason-boundary',now:()=>1000,consumeQuota:async()=>true,
  store:{loadProduct:async()=>row,saveProduct:async x=>{row={schema_version:x.schemaVersion,model:x.model,raw_ai_json:structuredClone(x.rawAiJson)};}},
  provider:{model:'test',requiredTokens:()=>100,call:async(stage,_item,state)=>{calls.push({stage,failures:structuredClone(state.failures)});return {raw:stage==='generate'?draft:approval(draft),rateLimit:{}};}}};
 let out;for(let i=0;i<4;i++){out=await advance(args);if(!out.pending)break;}
 assert.equal(out.ok,false);assert.equal(out.pending,false);assert.equal(out.quality.text,'');
 assert.deepEqual(calls.map(x=>x.stage),['generate','generate']);
 assert(calls[1].failures.some(r=>r.rule==='restated_purchase_reason'));
 assert.equal(inspect(item,draft).ok,false);
});
