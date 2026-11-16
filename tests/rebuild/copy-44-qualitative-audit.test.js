'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {localZeroCall,verifiedCaptionEditorialRescue}=require('../../api/room-ai-v3');
const corpus=require('../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
test('independent source-grounded copy audit of all 44 fixtures',()=>{
 const rows=[];
 for(const row of corpus.rows){
  const item=row.item;
  const baseline=localZeroCall(item);
  const editorial=baseline||localZeroCall(item,'',{}, {editorial:true,linkedReason:true,identityExpansion:true});
  const accepted=baseline||verifiedCaptionEditorialRescue(item,editorial)?editorial:null;
  if(accepted){
   const q=accepted.local?.partner?.quote||'';
   rows.push({code:item.itemCode,identity:accepted.productType?.specific,copy:accepted.quality.text,
     reasonQuote:q,source:item.itemCaption?.includes(q)||item.itemName?.includes(q),
     linkedEvidence:accepted.local?.partner?.linkedEvidence||[],baseline:!!baseline});
  }
 }
 console.log('COPY_44_AUDIT_BEGIN');
 for(const row of rows)console.log('COPY_44_AUDIT',JSON.stringify(row));
 console.log('COPY_44_AUDIT_END',rows.length);
 assert.ok(rows.length>=8);
 assert.ok(rows.filter(row=>!row.baseline).every(row=>!row.reasonQuote||row.source));
 console.log('COPY_44_HISTORICAL_SOURCE_REVIEW',JSON.stringify(rows.filter(row=>row.baseline&&!row.source).map(row=>row.code)));
});

test('editorial specific-use gate rejects universal claims and category restatements without approving six axes',()=>{
 const {reviewSourceBenefit}=require('../../lib/local-editorial-quality');
 const weak=[
  'サイズバリエーションも豊富にあるので、自由に組み合わせてどんな場所にもぴったりと収納できます。',
  'さらに水洗いできるのでいつでも清潔に使うことができます。',
  '人工の革を使用していて比較的柔らかいので取りやすく、すぐに使用できます。',
  '無地デザインなのでコーディネートに組み合わせもしやすい靴下です。',
  '持ち運びにも便利で、簡単にヘアケアできます。'
 ];
 for(const quote of weak)assert.equal(reviewSourceBenefit({quote,identity:'商品'}).ok,false,quote);
 const strong='精密な注ぎ口のデザインにより、水流の量や速度のコントロールを初心者でも簡単に調整できます。';
 const result=reviewSourceBenefit({quote:strong,identity:'電気ケトル'});
 assert.equal(result.ok,true);
 assert.equal(result.sixAxisCertified,false);
});
