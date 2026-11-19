'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceEvidenceHints,payload,WRITER_PROMPT}=require('../lib/room-semantic-provider');
const corpus=require('../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
const items=corpus.rows.map(r=>r.item);
test('real Groq writer gets original-span hints, never a publication grant',()=>{
 const item=items.find(i=>i.itemCode==='linofle:10000458');
 const hints=sourceEvidenceHints(item,{partnerProductType:'洗濯ネット'});
 assert.ok(hints.length>0,'expected original merchant choice relation');
 for(const hint of hints){
  assert.equal(item.itemCaption.slice(hint.start,hint.end),hint.quote);
  assert.equal(hint.source,'itemCaption');
  assert.equal(hint.publicationApproved,false);
 }
 const request=payload('generate',item,{partnerProductType:'洗濯ネット'});
 assert.deepEqual(request.sourceEvidenceHints,hints);
 assert.equal(request.itemCaption,item.itemCaption);
 assert.ok(request.sourceEvidenceHints.every(h=>h.publicationApproved===false));
});
test('hints are absent when owner product identity is unknown or conflicting',()=>{
 const item=items.find(i=>i.itemCode==='linofle:10000458');
 for(const type of ['', 'ペットベッド','洗濯ネット用別売パーツ']){
  const hints=sourceEvidenceHints(item,{partnerProductType:type});
  assert.deepEqual(hints,[]);
  assert.equal(Object.hasOwn(payload('generate',item,{partnerProductType:type}),'sourceEvidenceHints'),false);
 }
});
test('no quote may be inferred from an accessory, negation, or blank caption',()=>{
 const rows=[
  {itemName:'洗濯ネット 6枚',itemCaption:'この洗濯ネットでは衣類を取り出しやすくできません。'},
  {itemName:'洗濯ネット 6枚',itemCaption:'関連商品はこちら。別売りの洗濯ネットは使い分けできます。'},
  {itemName:'洗濯ネット 6枚',itemCaption:''}
 ];
 for(const item of rows){
  assert.deepEqual(sourceEvidenceHints(item,{partnerProductType:'洗濯ネット'}),[]);
 }
});
test('fixed 44-source corpus has only literal original excerpts, never guessed benefits',()=>{
 let found=0;
 for(const item of items){
  const candidate=String(item.itemName||'').includes('洗濯ネット')?'洗濯ネット':'';
  const hints=sourceEvidenceHints(item,{partnerProductType:candidate});
  found+=hints.length;
  assert.ok(hints.length<=3);
  hints.forEach(h=>{
   assert.equal(item.itemCaption.slice(h.start,h.end),h.quote,item.itemCode);
   assert.equal(h.publicationApproved,false);
  });
 }
 assert.equal(items.length,44);
 assert.ok(found>0);
});

test('long seller descriptions are preserved and optional hints are dropped by complete token budget',()=>{
 const item=items.find(i=>i.itemCode==='linofle:10000458');
 const long={...item,itemCaption:item.itemCaption+('洗濯ネットの仕様は商品ページをご確認ください。'.repeat(260))};
 assert.ok(sourceEvidenceHints(long,{partnerProductType:'洗濯ネット'}).length>0);
 const request=payload('generate',long,{partnerProductType:'洗濯ネット'});
 assert.equal(request.itemCaption,long.itemCaption);
 assert.equal(Object.hasOwn(request,'sourceEvidenceHints'),false);
});
