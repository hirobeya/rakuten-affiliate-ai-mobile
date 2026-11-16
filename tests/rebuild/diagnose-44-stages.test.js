'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {localZeroCall,verifiedCaptionEditorialRescue}=require('../../api/room-ai-v3');
const frozen=require('../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
test('44 real products reveal precise local stop stages without provider calls',()=>{
 const stages={},cases=[];
 for(const row of frozen.rows){
  const b={},e={};
  const baseline=localZeroCall(row.item,'',b);
  const editorial=baseline||localZeroCall(row.item,'',e,{editorial:true,linkedReason:true});
  const accepted=baseline||verifiedCaptionEditorialRescue(row.item,editorial)?editorial:null;
  const why=accepted?'ready':(e.stage||b.stage||'unknown');
  stages[why]=(stages[why]||0)+1;
  cases.push({itemCode:row.item.itemCode,cat:row.category,status:why,
   reason:accepted?'':(e.reason||b.reason||''),
   identity:e.identity||b.identity||null,
   possibleIdentity:e.identityCandidates||b.identityCandidates||null,
   candidateQuote:e.purchaseCandidate?.quote||b.purchaseCandidate?.quote||null,
   candidateKind:e.purchaseCandidate?.kind||b.purchaseCandidate?.kind||null,
   captionLen:row.item.itemCaption?.length||0,
   originCause:row.diagnostic?.cause||null});
  assert.equal(baseline?.groq?.totalCalls||0,0);
  assert.equal(editorial?.groq?.totalCalls||0,0);
 }
 console.log('LOCAL_44_DIAGNOSTIC_STAGES',JSON.stringify(stages));
 for(const record of cases)if(record.status!=='ready')console.log('LOCAL_44_DIAGNOSTIC_ROW',JSON.stringify(record));
 assert.equal(cases.length,44);
 assert.ok((stages.ready||0)>=8);
});
