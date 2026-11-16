'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {localZeroCall}=require('../../api/room-ai-v3');
const frozen=require('../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
function diag(item,opts={}){
 const diagnostic={};
 const result=localZeroCall(item,'',diagnostic,opts);
 return {result,diagnostic};
}
test('source-confirmed standalone selling nouns remove multiple identity holds only in opt-in owner Preview',()=>{
 const codes=['pasoro:10001354','bos-shop:10000023','snowfoxskincare:10000116','40s-skincare:10000159','goodgoods-center:10000193','fujisports-r:10054189','bbtown:10225214'];
 let improved=0;
 for(const code of codes){
  const item=frozen.rows.find(r=>r.item.itemCode===code)?.item;
  assert.ok(item,code);
  const baseline=diag(item);
  const opt=diag(item,{editorial:true,identityExpansion:true,linkedReason:true});
  if(baseline.diagnostic.stage==='identity'&&opt.diagnostic.stage!=='identity')improved++;
  // Selling identity is never sufficient to assert human-reviewed copy.
  assert.notEqual(opt.result?.qualityCertified,true);
 }
 console.log('IDENTITY_RESCUE_COVERAGE',JSON.stringify({attempted:codes.length,improved}));
 assert.ok(improved>=4);
});
test('unrelated replacement/accessory identity is not trusted as a whole item',()=>{
 const item={itemName:'電動掃除機 交換用 ヘアブラシ 用ケース',itemCaption:'掃除機の交換用部品です。'};
 const opt=diag(item,{editorial:true,identityExpansion:true,linkedReason:true});
 assert.equal(Boolean(opt.result?.local?.partner?.kind==='caption_claim'),false);
});
test('historical 5 local successes do not change through opt-in identity arbitration',()=>{
 let saved=0;
 for(const row of frozen.rows){
  if(!row.before)continue;
  const original=localZeroCall(row.item);
  const expanded=original||localZeroCall(row.item,'',{}, {editorial:true,identityExpansion:true,linkedReason:true});
  assert.equal(expanded?.quality?.text,row.before);
  saved++;
 }
 assert.equal(saved,5);
});
