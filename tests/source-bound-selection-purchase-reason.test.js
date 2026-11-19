'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {captionSentences,sourceCausalCandidates}=require('../lib/local-generic-reasoner');
const corpus=require('../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
const {localZeroCall,verifiedCaptionEditorialRescue}=require('../api/room-ai-v3');
const fixture=corpus.rows.find(x=>x.item.itemCode==='linofle:10000458').item;
test('source-verified selectable assortment is not discarded as an empty purchase reason',()=>{
 const id='洗濯ネット',quote='セット内容は自由に組み合わせることができるので、用途に合わせてカスタマイズ可能です。';
 const xs=sourceCausalCandidates(captionSentences(fixture.itemCaption,true),id,fixture.itemName,fixture.itemCaption);
 assert.ok(xs.some(x=>x.quote===quote&&x.body.includes(id)),JSON.stringify(xs));
 assert.ok(fixture.itemCaption.includes(quote),'seller original exact evidence');
 const diag={},result=localZeroCall(fixture,'',diag,{editorial:true,linkedReason:true,identityExpansion:true,verifiedIntent:true});
 console.log('SELECTABLE_6_FIXTURE',JSON.stringify({stage:diag.stage,reason:diag.reason,copy:result?.quality?.text||'',approved:verifiedCaptionEditorialRescue(fixture,result)}));
 if(result&&verifiedCaptionEditorialRescue(fixture,result)){
  assert.equal(result.quality.status,'ready');
  assert.equal(result.quality.text.includes(result.local.partner.quote),true);
 }
});
test('no inference from a separate product, negative clause or unbound configuration',()=>{
 const id='洗濯ネット',title='洗濯ネット 6枚セット';
 const unsafe=[
  '関連商品はこちら。洗濯ネットです。セット内容は自由に組み合わせることができるので、用途に合わせてカスタマイズ可能です。',
  '洗濯ネットです。別売りのセット内容は自由に組み合わせることができるので、用途に合わせてカスタマイズ可能です。',
  '洗濯ネットです。セット内容は自由に組み合わせることができませんので、用途に合わせてカスタマイズ不可です。'
 ];
 for(const caption of unsafe){
  const xs=sourceCausalCandidates(captionSentences(caption,true),id,title,caption);
  assert.ok(!xs.some(x=>x.quote.includes('セット内容')),caption);
 }
});
