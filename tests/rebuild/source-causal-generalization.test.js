'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {sourceCausalCandidates,safeCaptionCandidates}=require('../../lib/local-generic-reasoner');
const {localZeroCall,verifiedCaptionEditorialRescue}=require('../../api/room-ai-v3');
const frozen=require('../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');

const id='洗濯ネット';
const statement='洗濯ネットは衣類を包み込むことで、洗濯中の擦れを抑えられます。';

test('source-first editorial reason uses an explicit complete seller clause, not a category assumption',()=>{
 const input=[statement],caption=statement;
 const candidates=sourceCausalCandidates(input,id,id,caption);
 assert.equal(candidates.length,1);
 assert.equal(candidates[0].quote,statement);
 assert.equal(candidates[0].body,statement);
 assert.equal(candidates[0].source,'itemCaption');
 assert.equal(sourceCausalCandidates(input,id,id,'別の商品です。').length,0);
 assert.equal(sourceCausalCandidates(input,'フライパン','フライパン','洗濯ネットは衣類を包み込むことで、洗濯中の擦れを抑えられます。').length,0);
});
test('unsupported, ungrounded, risky, seller or negated benefits never pass the source-first candidate gate',()=>{
 const samples=[
  '洗濯ネットは衣類を包み込むことで、洗濯中の擦れを必ず防げます。',
  '洗濯ネットは衣類を包み込むことで、洗濯中の擦れを抑えられません。',
  '関連商品はこちら 洗濯ネットは衣類を包み込むことで、洗濯中の擦れを抑えられます。',
  '当店の洗濯ネットは毎日改善に取り組むことで、人気になりました。',
  '洗濯ネットは高級感があるので、快適に使えます。',
  '洗濯ネットは衣類を包み込みます。'
 ];
 for(const text of samples)assert.equal(sourceCausalCandidates([text],id,id,text).length,0,text);
});
test('new cross-category relation option does not replace existing 44 product success or weaken quote gate',()=>{
 const changed=[],candidates=[];
 for(const row of frozen.rows){
  const base=localZeroCall(row.item);
  const normal=base||localZeroCall(row.item,'',{}, {editorial:true});
  const candidate=base||localZeroCall(row.item,'',{}, {editorial:true,linkedReason:true});
  if(base)assert.equal(candidate?.quality?.text,base.quality.text);
  if(!base&&candidate&&verifiedCaptionEditorialRescue(row.item,candidate)){
   candidates.push({itemCode:row.item.itemCode,text:candidate.quality.text,from:row.diagnostic?.cause});
   if(!normal)changed.push(row.item.itemCode);
   assert.equal(candidate.groq.totalCalls,0);
   assert.equal(candidate.model,'local');
  }
 }
 console.log('SOURCE_CAUSAL_44',JSON.stringify({localBaseline:5,newlyPublished:changed,allRecoveredCandidates:candidates.map(x=>x.itemCode)}));
 assert.ok(candidates.length>=3,'must not regress the three existing source-grounded editorial candidates');
});
