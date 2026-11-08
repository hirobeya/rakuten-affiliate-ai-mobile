'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {restatedReason}=require('../../public/purchase-copy-quality');
const {inspect,publication,questions}=require('../../lib/room-semantic-contract');
const weak={
 itemName:'IH対応フライパン',
 itemCaption:'IH対応のフライパン。調理器具です。'
};
const weakDraft={
 product:{what:'フライパン',acts_on:'食材',acts_on_quote:weak.itemName},
 sentences:[{text:'フライパンは、IH対応の調理器具です。',kinds:['spec'],quotes:[weak.itemCaption]}]
};
function approve(draft){return {product:{what:'supported',acts_on:'supported'},quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(k=>[k,'supported'])),sentences:draft.sentences.map(s=>({text:s.text,reason:'approval fixture',evidenceQuotes:[],...Object.fromEntries(questions.map(k=>[k,'supported']))}))};}
test('category-neutral product-definition-only post is blocked despite all-positive AI review',()=>{
 const text=weakDraft.sentences[0].text;
 assert.equal(restatedReason(text,{identity:'フライパン'}),'','local gate remains unchanged');
 const machine=inspect(weak,weakDraft);
 assert.equal(machine.ok,true,'recorded weak AI copy was not independently vetoed at machine stage');
 const published=publication(weak,weakDraft,approve(weakDraft));
 assert.equal(published.status,'blocked');
 assert.equal(published.text,'');
 assert.ok(published.reasons.some(f=>f.rule==='quality_reason_definition_only'));
 assert.equal(published.machine.ok,true,'AI-only quality failure does not alter local checks');
});
test('verified concrete single-sentence use relationship remains eligible',()=>{
 const item={itemName:'電気ケトル',itemCaption:'忙しい朝にカップ1杯分が約85秒で沸騰する。'};
 const draft={product:{what:'電気ケトル',acts_on:'お湯',acts_on_quote:item.itemCaption},sentences:[{text:'忙しい朝にお湯を用意したいとき、カップ1杯分を約85秒で沸かせる電気ケトルです。',kinds:['scene','spec'],quotes:[item.itemCaption]}]};
 assert.equal(restatedReason(draft.sentences[0].text,{identity:'電気ケトル'}),'');
 assert.equal(publication(item,draft,approve(draft)).status,'ready');
});
test('natural standalone functionality is not confused with a definition',()=>{
 assert.equal(restatedReason('細かい網目の洗濯ネットは、洗濯時に衣類の型崩れや絡みを防ぎます。'),'');
 assert.equal(restatedReason('食器の水気を拭き取れるクロスです。'),'');
 assert.equal(restatedReason('カバーを外して洗えるペットベッドです。'),'');
});
