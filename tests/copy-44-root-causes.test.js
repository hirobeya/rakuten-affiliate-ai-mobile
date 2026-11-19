'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {localZeroCall,verifiedCaptionEditorialRescue,verifiedTitleSignalEditorialRescue}=require('../api/room-ai-v3');
const corpus=require('../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
const {captionSentences,safeCaptionCandidates}=require('../lib/local-generic-reasoner');
test('44 source-complete product audit separates understanding, sourcing, drafting and release',()=>{
 const rows=[],stages={};
 for(const record of corpus.rows){
  const item=record.item,baseDiag={},editDiag={};
  const baseline=localZeroCall(item,'',baseDiag);
  const editorial=localZeroCall(item,'',editDiag,{editorial:true,linkedReason:true,identityExpansion:true,verifiedIntent:true});
  const candidate=baseline||editorial;
  const approved=Boolean(baseline||verifiedCaptionEditorialRescue(item,editorial)||verifiedTitleSignalEditorialRescue(item,editorial));
  const key=approved?'ready':String(editDiag.stage||'unknown')+':'+String(editDiag.reason||'no_reason');
  stages[key]=(stages[key]||0)+1;
  const facts=safeCaptionCandidates({
   itemName:item.itemName,itemCaption:item.itemCaption,
   identity:editDiag.identityCandidates?.literal||editDiag.identityCandidates?.rule||'',
   editorial:true,linkedReason:true
  });
  rows.push({code:item.itemCode,title:item.itemName?.slice(0,55),
   originalChars:item.itemCaption?.length||0,
   sourceSentences:captionSentences(item.itemCaption,true).length,
   base:baseDiag.stage||null,editorial:editDiag.stage||null,reason:editDiag.reason||null,
   identity:editDiag.identityCandidates||null,
   candidates:facts.length,approved,copy:candidate?.quality?.text||''});
 }
 console.log('COPY_44_ROOT_CAUSES',JSON.stringify(stages));
 for(const row of rows)console.log('COPY_44_DIAG',JSON.stringify(row));
 assert.equal(rows.length,44);
});
