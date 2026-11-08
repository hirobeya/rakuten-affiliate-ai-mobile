'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {restatedReason}=require('../../public/purchase-copy-quality');
const {inspect,publication,questions}=require('../../lib/room-semantic-contract');
const weak={
 itemName:'洗濯ネット 選べる6枚セット',
 itemCaption:'サイズ組み合わせ自由で、選べる6枚セットのランドリーネットです。'
};
const weakDraft={
 product:{what:'洗濯ネット',acts_on:'衣類',acts_on_quote:weak.itemName},
 sentences:[{text:'洗濯ネットは、サイズ組み合わせ自由で、選べる6枚セットのランドリーネットです。',kinds:['spec'],quotes:[weak.itemCaption]}]
};
function approve(draft){return {product:{what:'supported',acts_on:'supported'},quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(k=>[k,'supported'])),sentences:draft.sentences.map(s=>({text:s.text,reason:'approval fixture',evidenceQuotes:[],...Object.fromEntries(questions.map(k=>[k,'supported']))}))};}
test('archived definition-only post is blocked despite all-positive AI review',()=>{
 const text=weakDraft.sentences[0].text;
 assert.equal(restatedReason(text,{identity:'洗濯ネット'}),'product_definition_without_choice_reason');
 const machine=inspect(weak,weakDraft);
 assert.ok(machine.failures.some(f=>f.rule==='restated_purchase_reason'));
 const published=publication(weak,weakDraft,approve(weakDraft));
 assert.equal(published.status,'blocked');
 assert.equal(published.text,'');
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
