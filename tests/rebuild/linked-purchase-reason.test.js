'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {safeCaptionCandidates,linkedStorageCandidates}=require('../../lib/local-generic-reasoner');
const {localZeroCall}=require('../../api/room-ai-v3');
const frozen=require('../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
test('source-linked removable handle and stacking becomes a buyer-use candidate only in editorial mode',()=>{
 const row=frozen.rows.find(x=>x.item.itemCode==='e-kitchen:10079039');
 assert.ok(row);
 const item=row.item;
 const candidates=safeCaptionCandidates({itemName:item.itemName,itemCaption:item.itemCaption,identity:'フライパン',editorial:true});
 const linked=candidates.find(x=>Array.isArray(x.linkedEvidence));
 assert.ok(linked,'must extract a real two-sentence source relation');
 assert.ok(linked.body.includes('重ねて収納できます'));
 assert.ok(linked.linkedEvidence.every(x=>item.itemCaption.includes(x.quote)));
 const ordinary=safeCaptionCandidates({itemName:item.itemName,itemCaption:item.itemCaption,identity:'フライパン',editorial:false});
 assert.equal(ordinary.some(x=>x.linkedEvidence),false);
});
test('unrelated product, nonadjacent feature, negation and incomplete quote cannot be combined',()=>{
 const id='フライパン',a='取手が取り外せるフライパンです。',b='重ねて収納できます。';
 assert.equal(linkedStorageCandidates([a,b],id,a+b).length,1);
 assert.equal(linkedStorageCandidates([a,'別の使い方です。',b],id,a+'別の使い方です。'+b).length,0);
 assert.equal(linkedStorageCandidates([a,b],id,'関連商品はこちら '+a+b).length,0);
 assert.equal(linkedStorageCandidates([a,b],id,a+'別売り品 '+b).length,0);
 assert.equal(linkedStorageCandidates([a,'重ねて収納できません。'],id,a+'重ねて収納できません。').length,0);
 assert.equal(linkedStorageCandidates([a,b],id,a+'サイズは異なります。'+b).length,0);
});
test('frozen 44 local results remain safe and previous successful results remain unchanged',()=>{
 const prior=new Map(),newCandidates=[];
 for(const row of frozen.rows){
  const item=row.item,baseline=localZeroCall(item);
  if(baseline)prior.set(item.itemCode,baseline.quality.text);
  const edited=baseline||localZeroCall(item,'',{}, {editorial:true});
  if(baseline)assert.equal(edited.quality.text,prior.get(item.itemCode));
  if(!baseline&&edited?.local?.partner?.linkedEvidence?.length){
   assert.ok(edited.local.partner.linkedEvidence.every(f=>item.itemCaption.includes(f.quote)&&edited.quality.text.includes(f.quote)));
   newCandidates.push(item.itemCode);
  }
 }
 assert.equal(prior.size,5);
 assert.ok(newCandidates.includes('e-kitchen:10079039'),'actual linked purchase reason must reach local generation');
 console.log('LINKED_REASON_REPLAY',JSON.stringify({baseline:prior.size,newSourceLinkedCandidates:newCandidates}));
});
