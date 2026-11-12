'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const {plan}=require('../../lib/urenavi-core/buyer-decision-plan');
const {generate}=require('../../lib/urenavi-core/last-resort');
const base=path.resolve(__dirname,'../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products/');
const items=[3,4,5,6].map(i=>require(path.join(base,'0'+i+'.json')));
test('buyer decision plans use source-bound facts and never certify publication',()=>{
 const expected=['use','care','charging','storage'];
 items.forEach((fixture,i)=>{
  const old=generate(fixture.source);
  assert.deepEqual(old,fixture.local);
  const identity=generate(fixture.source,{experimentalNarrativeDraft:true}).narrativeDraft.identity;
  const result=plan(fixture.source,{identity});
  assert.equal(result.status,'plan_for_review',fixture.source.itemCode);
  assert.equal(result.selectedDecision.group,expected[i]);
  assert.equal(result.selectedDecision.readyForDraftComparison,i!==1);
  assert.equal(result.selectedDecision.planStrength,i===1?'single_sourced_feature':'multiple_sourced_features');
  assert.equal(result.proof.sellerFeatureQuotesVerified,true);
  assert.equal(result.proof.sellingUnitOwnershipVerified,false);
  assert.equal(result.proof.actualConsumerBenefitVerified,false);
  assert.equal(result.publication,false);
  assert.equal(result.copyable,false);
  assert.equal(result.semanticApproved,false);
  assert.equal(result.selectedDecision.sceneIsSellerFact,false);
  assert(result.selectedDecision.evidence.length>=1);
  for(const f of [...result.selectedDecision.evidence,...result.selectedDecision.cautions]){
   assert.equal(fixture.source[f.source].slice(f.at,f.at+f.quote.length),f.quote);
  }
 });
});
test('warnings are not mistaken for advantages',()=>{
 const fixture=items[1],identity='お掃除手袋';
 const result=plan(fixture.source,{identity});
 assert(result.selectedDecision.cautions.some(x=>x.axis==='caution'));
 assert(result.selectedDecision.evidence.every(x=>x.axis!=='caution'));
});
test('do not invent purchase relationship from generic category',()=>{
 const f={itemCode:'generic:1',itemName:'収納用品',itemCaption:'カラーは全4色',catchcopy:''};
 const result=plan(f,{identity:'収納用品'});
 assert.equal(result.status,'held');
 assert.equal(result.publication,false);
});
test('reject unrelated accessory claims and false identity',()=>{
 const f={itemCode:'generic:2',itemName:'収納バッグ',itemCaption:'関連商品：取手が取り外せる。重ねて収納できます。',catchcopy:''};
 assert.equal(plan(f,{identity:'収納バッグ'}).status,'held');
 assert.equal(plan(f,{identity:'フライパン'}).status,'held');
});
test('unseen product evidence uses generic decision grouping, not known item code',()=>{
 const f={itemCode:'other:88',itemName:'重ねられる収納ボックス',itemCaption:'取手が取り外せる。重ねて収納できます。',catchcopy:''};
 const result=plan(f,{identity:'収納ボックス'});
 assert.equal(result.status,'plan_for_review');
 assert.equal(result.selectedDecision.group,'storage');
 assert.equal(result.selectedDecision.relationStatus,'multi_feature_grounded');
});
