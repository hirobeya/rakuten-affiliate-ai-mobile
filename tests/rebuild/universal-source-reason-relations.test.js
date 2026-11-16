'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {adjacentSourceUseCandidates,sourceMultiUseCandidates,captionSentences}=require('../../lib/local-generic-reasoner');
const {verifiedLinkedReason}=require('../../public/purchase-copy-quality');
const {localZeroCall,verifiedCaptionEditorialRescue}=require('../../api/room-ai-v3');
const screenshot=require('./screenshot-leg-bag-regression.test').screenshotSamples;

const crossCategory=[
 {name:'レッグバッグ',caption:'2WAYレッグバッグです。肩に掛けて使用できるほか、腰に装着しても使用できます。'},
 {name:'収納ラック',caption:'伸縮式の収納ラックです。幅を調節できるほか、棚の高さも変えられます。'},
 {name:'犬用マット',caption:'犬用マットです。床に敷いて使用できるほか、持ち運びにも使えます。'},
 {name:'電気ケトル',caption:'温度調節式の電気ケトルです。注ぎ口を使って水量を調整できます。'},
 {name:'衣類ケース',caption:'衣類ケースです。衣類を分けて収納できるので、取り出しやすくできます。'}
];
test('adjacent verified selling-unit relation is category independent',()=>{
 let accepted=0;
 for(const row of crossCategory){
  const xs=adjacentSourceUseCandidates(captionSentences(row.caption,true),row.name,row.caption);
  assert.ok(xs.length>0,row.name);
  assert.ok(verifiedLinkedReason({itemCaption:row.caption},xs[0],xs[0].body),row.name);
  assert.equal(xs[0].linkedEvidence.length,2);
  assert.ok(xs[0].linkedEvidence.every(x=>row.caption.includes(x.quote)));
  accepted++;
 }
 assert.equal(accepted,crossCategory.length);
});
test('same wording on accessories, unrelated products, offers or negations never becomes an adjacent purchase claim',()=>{
 const unsafe=[
  'おすすめ商品はこちら。2WAYレッグバッグです。肩に掛けて使用できるほか、腰に装着しても使用できます。',
  '2WAYレッグバッグです。関連商品はこちら。肩に掛けて使用できるほか、腰に装着しても使用できます。',
  '2WAYレッグバッグです。どんな場所でも必ず使用できます。',
  '2WAYレッグバッグです。肩に掛けて使用できません。',
  '2WAYレッグバッグです。肩に掛けて使用できるほか、別売りバッグでも使用できます。',
  '2WAYレッグバッグです。肩に掛けると便利で幅広く使えます。'
 ];
 for(const caption of unsafe){
  const result=adjacentSourceUseCandidates(captionSentences(caption,true),'レッグバッグ',caption);
  assert.equal(result.length,0,caption);
 }
});
test('full API and iPhone bound source evidence agree for the screenshot AVIREX product',()=>{
 const item=screenshot.find(x=>x.label==='AVIREX 2WAY leg bag');
 const result=localZeroCall(item,'',{}, {editorial:true,linkedReason:true,identityExpansion:true,verifiedIntent:true});
 assert.equal(result?.model,'local');
 assert.equal(result?.productType?.specific,'レッグバッグ');
 assert.equal(result?.local?.partner?.kind,'caption_claim');
 assert.ok(verifiedCaptionEditorialRescue(item,result));
 assert.ok(verifiedLinkedReason(item,result.local.partner,result.quality.text));
 assert.equal(result.groq.totalCalls,0);
});

test('explicit multi-use source sentences work across unrelated product categories',()=>{
 const cases=[
  {id:'レッグバッグ',caption:'腰に装着できるレッグバッグとしても使えるほか、ショルダーバッグとしても使用できます。'},
  {id:'収納ラック',caption:'伸縮式の収納ラックはキッチン用としても使用できるほか、洗面所用としても使えます。'},
  {id:'ペットベッド',caption:'ペットベッドとしても使えるほか、持ち運び用のクッションとしても使用できます。'},
  {id:'電気ケトル',caption:'電気ケトルとしても使えるほか、温度調節式の給湯器としても使用できます。'},
  {id:'野球グローブ',caption:'野球グローブとしても使えるほか、ソフトボール用としても使用できます。'}
 ];
 for(const c of cases){
  const out=sourceMultiUseCandidates(captionSentences(c.caption,true),c.id,c.id,c.caption);
  assert.equal(out.length,1,c.id);
  assert.equal(out[0].body,c.caption);
  assert.equal(out[0].quote,c.caption);
 }
});
test('similar-looking unsupported seller or other-product language never passes generic multi-use extraction',()=>{
 const bad=[
  'レッグバッグとしても使えるほか、関連商品のショルダーバッグとしても使用できます。',
  'レッグバッグとしても使えるほか、いつでも必ず安全に使用できます。',
  'レッグバッグとしても使えるほか、対応していないショルダーバッグとしても使用できます。',
  '別売りのレッグバッグとしても使えるほか、ショルダーバッグとしても使用できます。',
  'レッグバッグとしても使えるほか、保証付きで使用できます。'
 ];
 for(const caption of bad){
  const out=sourceMultiUseCandidates(captionSentences(caption,true),'レッグバッグ','レッグバッグ',caption);
  assert.equal(out.length,0,caption);
 }
});
