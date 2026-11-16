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
 assert.ok(rows.length>=15);
 assert.ok(rows.every(row=>!row.reasonQuote||row.source));
});
