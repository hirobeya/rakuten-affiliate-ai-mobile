'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {composeSourceCopy,inspect}=require('../../lib/urenavi-core/source-purchase-relations');
const {sourcePassages}=require('../../lib/urenavi-core/source-passages');
const {generate}=require('../../lib/manual-room-copy');
const {planLinkedSourceComparison}=require('../../lib/urenavi-core/linked-source-ai-plan');

const item=(itemCaption,itemName='保存ケース')=>({itemName,itemCaption,itemPrice:1200});

test('source spans retain punctuation, CRLF, bullets, and section boundaries',()=>{
 const raw='  保存ケース。\r\n商品説明 ●仕切りがあります。●これにより、食材を分けて収納できます。';
 const parts=sourcePassages(raw);
 assert.ok(parts.some(x=>x.kind==='section'&&x.quote==='商品説明'));
 for(const span of parts)assert.equal(raw.slice(span.start,span.end),span.quote);
});
test('explicit continuation binds a feature and benefit across sentences without guessing',()=>{
 const input=item('保存ケースは、仕切りが付いています。\nそのため、食材を分けて収納できます。');
 const out=composeSourceCopy(input,'保存ケース',{inputOwner:true});
 assert.equal(out.proof.kind,'explicit_continuation');
 assert.ok(out.text.includes('仕切りが付いています。そのため、食材を分けて収納できます。'));
 assert.equal(generate(input).path,'linked_source_relation');
 for(const evidence of out.proof.evidence)assert.equal(input.itemCaption.slice(evidence.start,evidence.end),evidence.quote);
 for(const source of [
  '保存ケースは、仕切りが付いています。\n食材を分けて収納できます。',
  '保存ケースは、仕切りが付いています。\n関連商品\nそのため、食材を分けて収納できます。',
  '保存ケースは、仕切りが付いています。\n別売りのトレーがあります。\nこれにより、食材を分けて収納できます。',
  '保存ケースは、仕切りが付いています。\n\nそのため、食材を分けて収納できます。',
  '保存ケースは、仕切りが付いています。\nそのため、食材を分けて収納できます。\n仕切りは付いていません。'
 ])assert.equal(composeSourceCopy(item(source),'保存ケース',{inputOwner:true}),null,source);
});
test('unrelated section cannot establish an attributed benefit',()=>{
 const source=item('別モデルの保存ケース。 商品説明 ●中には食材、薬味なども収納可能');
 assert.deepEqual(inspect(source,'保存ケース'),[]);
});
test('comparison planning requires priced, confirmed capacity and never sends',()=>{
 const valid={identity:'保存ケース',relations:[{}],requiredTokens:()=>2000,
  rates:{inputPerMillion:0.5,outputPerMillion:0.8},limits:{remainingRequests:1,remainingTokens:2000}};
 assert.deepEqual(planLinkedSourceComparison(valid),{eligible:true,reservedTokens:2000,requests:1,maxCost:0.0016});
 assert.equal(planLinkedSourceComparison({...valid,rates:null}).reason,'price_unverified');
 assert.equal(planLinkedSourceComparison({...valid,limits:{remainingRequests:1,remainingTokens:null}}).eligible,false);
});

test('ordinary extra description does not discard a complete scoped input reason',()=>{
 const {compose,verify}=require('../../lib/manual-purchase-reason');
 const src=item('透明のケースです。\n保存ケースは、食材を持ち運ぶとき、仕切りが付いているので、食材を分けて収納できます。');
 const result=compose(src);
 assert.equal(result.proof.sentence.start,src.itemCaption.indexOf('保存ケースは'));
 for(const key of ['scene','feature','benefit']){
  const p=result.proof[key];assert.equal(src.itemCaption.slice(p.start,p.end),p.quote);
 }
 assert.equal(verify(src,result.proof,result.text),true);
 assert.equal(compose({...src,itemCaption:src.itemCaption+'\n仕切りは付いていません。'}),null);
});
test('offline writer receives linked proof only under the existing token ceiling',()=>{
 const {payload,planSourceComparison}=require('../../lib/room-semantic-provider');
 const source=item('保存ケースは、仕切りが付いています。\nそのため、食材を分けて収納できます。');
 const state={partnerProductType:'保存ケース'};
 const input=payload('generate',source,state);
 assert.equal(input.linkedSourceEvidence[0].publicationApproved,false);
 assert.ok(input.linkedSourceEvidence[0].sourceSpans.length>=2);
 assert.equal(planSourceComparison(source,state).eligible,false);
 assert.equal(planSourceComparison(source,state,{rates:{inputPerMillion:0,outputPerMillion:0},
  limits:{remainingRequests:1,remainingTokens:8000}}).eligible,true);
});

test('literal causal source claims are reusable without a product-category rewrite',()=>{
 const source=item('保存ケースは、仕切りを使うことで、衣類を分けて収納できます。');
 const result=composeSourceCopy(source,'保存ケース',{inputOwner:true});
 assert.ok(result,'explicit claim with verified product ownership should yield copy');
 assert.equal(result.proof.kind,'explicit_cause');
 assert.equal(result.text.split('\n')[1],'仕切りを使うことで、衣類を分けて収納できます。');
 assert.equal(source.itemCaption.slice(result.proof.literal.start,result.proof.literal.end),result.proof.literal.quote);
 assert.equal(generate(source).path,'linked_source_relation');
 for(const caption of [
  '関連商品\n保存ケースは、仕切りを使うことで、衣類を分けて収納できます。',
  '保存ケースは、仕切りを使うことで、衣類を分けて収納できます。\n仕切りは付属しません。',
  '別モデルの保存ケースは、仕切りを使うことで、衣類を分けて収納できます。'
 ]) assert.equal(composeSourceCopy(item(caption),'保存ケース',{inputOwner:true}),null,caption);
});
