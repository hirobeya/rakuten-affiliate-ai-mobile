'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {payload}=require('../lib/room-semantic-provider');
const {bind,inspect}=require('../lib/room-semantic-contract');
test('rewrite context retrieves whole exact original sentences across categories without approving or changing the rejected quote',()=>{
 for(const [kind,original,wrong] of [
  ['授乳ワンピース','胸の上布を授乳ケープとして使える一体型デザイン。','胸の上布を授乳ケープとして使える一体型デザインです。'],
  ['ほうじ茶','三角ティーバッグの中で茶葉が踊ります。','三角ティーバッグの中で茶葉が踊るのです。'],
  ['料理本','レシピの手順を大きな写真で紹介。','レシピの手順を大きな写真で紹介します。'],
  ['洗濯ネット','本体は洗えません。カバーのみ洗濯できます。','カバーのみ洗濯できるのです。']
 ]){
  const item={itemName:kind,itemCaption:original};
  const draft={product:{what:kind,acts_on:kind,acts_on_quote:wrong},sentences:[{text:kind+'を使いたいときに。',kinds:['scene'],quotes:[wrong]}]};
  const before=structuredClone(draft);
  const generated=payload('generate',item,{attempt:1,previousDraft:draft,failures:[{rule:'quote_not_in_source'}]});
  const hints=generated.feedback.sourceQuoteHints;
  assert.equal(hints.length,1);assert.equal(hints[0].rejectedQuote,wrong);
  assert.ok(original.includes(hints[0].originalPassage));assert.ok(bind(item,hints[0].originalPassage));
  assert.equal(bind(item,wrong),null);assert.ok(inspect(item,draft).failures.some(f=>f.rule==='quote_not_in_source'));
  assert.deepEqual(draft,before,'retrieval must never mutate or silently fix the old draft');
  if(kind==='洗濯ネット')assert.ok(hints[0].originalPassage.startsWith('カバーのみ'),'the actual scope remains in the original candidate');
  assert.equal(payload('verify',item,{draft}).draft,draft);
  assert.equal(payload('generate',item,{}).feedback,undefined);
 }
});
test('retrieval is bounded, source-only and absent for unrelated or already valid quotes',()=>{
 const item={itemName:'料理本',itemCaption:'料理本には大きな写真を掲載しています。'};
 const draft={product:{what:'料理本',acts_on:'料理',acts_on_quote:item.itemCaption},sentences:[{quotes:[item.itemCaption,'架空のまったく関係しない記述です。']} ]};
 assert.deepEqual(payload('generate',item,{attempt:1,previousDraft:draft,failures:[]}).feedback.sourceQuoteHints,[]);
 const many={...draft,sentences:[{quotes:Array.from({length:20},(_,i)=>'料理本には大きな写真を掲載します'+i+'。')}]};
 assert.ok(payload('generate',item,{attempt:1,previousDraft:many}).feedback.sourceQuoteHints.length<=2);
});
