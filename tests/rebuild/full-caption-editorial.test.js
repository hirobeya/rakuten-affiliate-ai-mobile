'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {captionSentences,editorialCaptionText,safeCaptionCandidates}=require('../../lib/local-generic-reasoner');

const name='洗濯ネット';
const claim='洗濯ネットは、衣類を包み込み洗濯時の擦れやねじれをおさえます。';
const longDescription=name+'。'+'大切なお知らせです。'.repeat(170)+claim;

test('editorial reads sourced claims past 1200 characters and 30 sentences',()=>{
 assert.ok(longDescription.indexOf(claim)>1200);
 assert.equal(captionSentences(longDescription).some(x=>x.includes(claim)),false);
 assert.equal(captionSentences(longDescription,true).some(x=>x.includes(claim)),true);
 const picks=safeCaptionCandidates({itemName:name,itemCaption:longDescription,identity:name,editorial:true});
 assert.ok(picks.some(x=>x.kind==='caption_claim'&&x.quote===claim),'late verbatim claim should remain eligible for existing veto gates');
 assert.equal(safeCaptionCandidates({itemName:name,itemCaption:longDescription,identity:name}).some(x=>x.quote===claim),false);
});
test('editorial never reads a late related-product catalogue as target evidence',()=>{
 const source=name+'。'+'大切なお知らせです。'.repeat(170)+'関連商品はこちら '+claim;
 assert.equal(editorialCaptionText(source).includes(claim),false);
 assert.equal(safeCaptionCandidates({itemName:name,itemCaption:source,identity:name,editorial:true}).some(x=>x.quote===claim),false);
});
test('editorial does not use incomplete unpunctuated oversized segments',()=>{
 const source=name+'。'+'X'.repeat(1400)+claim;
 assert.equal(safeCaptionCandidates({itemName:name,itemCaption:source,identity:name,editorial:true}).some(x=>x.quote===claim),false);
});
