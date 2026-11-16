'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {headingBoundToSellingProduct,sourceCausalCandidates}=require('../../lib/local-generic-reasoner');
const {localZeroCall,verifiedCaptionEditorialRescue}=require('../../api/room-ai-v3');
const frozen=require('../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
test('a seller-stated reason can be bound by a nearby full product heading without fabricating a sentence',()=>{
 const title='収納ボックス RISUスタックシステムケース ワイド2段セット';
 const sentence='引き出しを開けることで、衣類を取り出しやすくできます。';
 const source='商品名 RISUスタックシステムケース ワイド2段セット。 '+sentence;
 assert.equal(headingBoundToSellingProduct(sentence,'収納ボックス',title,source),true);
 const candidates=sourceCausalCandidates([sentence],'収納ボックス',title,source);
 assert.equal(candidates.length,1);
 assert.equal(candidates[0].quote,sentence);
 assert.equal(candidates[0].body,sentence);
 assert.equal(candidates[0].source,'itemCaption');
});
test('another product or a distant heading never supplies product ownership',()=>{
 const title='収納ボックス RISUスタックシステムケース ワイド2段セット';
 const claim='引き出しを開けることで、衣類を取り出しやすくできます。';
 const header='商品名 RISUスタックシステムケース ワイド2段セット。 ';
 for(const source of [
  header+'関連商品はこちら '+claim,
  header+'別の商品 '+claim,
  header+'説明が続きます。'.repeat(40)+claim,
  '別の商品です。 '+claim
 ]){
  assert.equal(headingBoundToSellingProduct(claim,'収納ボックス',title,source),false,source);
  assert.equal(sourceCausalCandidates([claim],'収納ボックス',title,source).length,0,source);
 }
});
test('actual frozen44: new heading-bound proposals remain source-verbatim, old local copy preserved',()=>{
 let baseline=0,accepted=0,newOnly=[];
 for(const row of frozen.rows){
  const item=row.item,old=localZeroCall(item),diag={};
  if(old)baseline++;
  const candidate=old||localZeroCall(item,'',diag,{editorial:true,linkedReason:true,identityExpansion:true});
  if(old)assert.equal(candidate.quality.text,old.quality.text);
  if(!old&&verifiedCaptionEditorialRescue(item,candidate)){
   accepted++;
   assert.ok(item.itemCaption.includes(candidate.local.partner.quote));
   assert.ok(candidate.quality.text.includes(candidate.local.partner.quote));
   newOnly.push({code:item.itemCode,quote:candidate.local.partner.quote});
  }
 }
 assert.equal(baseline,5);
 console.log('HEADING_BOUND_44',JSON.stringify({baseline,additional:accepted,products:newOnly}));
});
