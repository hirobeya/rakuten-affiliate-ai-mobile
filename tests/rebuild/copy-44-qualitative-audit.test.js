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

test('real mobile API fails closed on legacy escaped-heading copy, without consuming any provider quota',async()=>{
 const {createHandler}=require('../../lib/room-copy-handler');
 const item=corpus.rows.find(row=>row.item.itemCode==='emoor-nedogko:10000048')?.item;
 assert.ok(item);
 const old=localZeroCall(item);
 assert.equal(old?.local?.partner?.kind,'caption_claim');
 assert.equal(item.itemCaption.includes(old.local.partner.quote),false,'pre-existing source mismatch is a reproducible real fixture');
 const env=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  let aiCalls=0,quotaClaims=0;
  const handler=createHandler({
   authorize:async()=>({ok:true,plan:'owner',user:{email:'owner-local@invalid.example'}}),
   logCost:()=>{},store:{loadProduct:async()=>null,saveProduct:async()=>{}},
   consumeQuota:async()=>{quotaClaims++;throw Error('must not spend quota');},
   provider:{model:'mock',call:async()=>{aiCalls++;throw Error('provider must not run');}}
  });
  const res={code:null,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({method:'POST',body:item},res);
  assert.equal(res.code,409);
  assert.equal(res.body.quality.status,'blocked');
  assert.equal(res.body.quality.text,'');
  assert.deepEqual(res.body.variants,[]);
  assert.equal(res.body.groq.totalCalls,0);
  assert.equal(aiCalls,0);
  assert.equal(quotaClaims,0);
 }finally{if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;}
});

test('specific usage intent on a literally title-bound signal is not replaced by a catalogue comparison',()=>{
 const row=corpus.rows.find(x=>x.item.itemCode==='besthouse:10000083');
 const debug={};
 const result=localZeroCall(row.item,'',debug,{editorial:true,linkedReason:true,identityExpansion:true});
 console.log('SPECIFIC_INTENT_RESULT',JSON.stringify({status:debug.stage,reason:debug.reason,text:result?.quality?.text||'',partner:result?.local?.partner||null}));
 const {verifiedTitleSignalEditorialRescue}=require('../../api/room-ai-v3');
 const {SAFE_SIGNALS}=require('../../lib/local-partner-reasoner');
 const structured=require('../../public/structured-room-copy');
 const quote=result?.local?.partner?.quote||'';
 const lines=String(result?.quality?.text||'').split('\\n').map(x=>x.trim()).filter(Boolean);
 console.log('TITLE_SIGNAL_PROOF',JSON.stringify({
  verified:verifiedTitleSignalEditorialRescue(row.item,result),quote,
  titleBound:row.item.itemName.includes(quote),
  lines,verifiedAppeals:result?.verifiedAppeals?.map(x=>({text:x.text,keep:x.verification?.keepDirectFact})),
  rule:SAFE_SIGNALS.filter(x=>[x.term,...(x.aliases||[])].some(t=>t.toLowerCase()===quote.toLowerCase())).map(x=>x.intent),
  risky:structured.RISK.test(result?.quality?.text||''),
  catalogue:require('../../public/purchase-copy-quality').catalogueOnly(result?.quality?.text||'')
 }));
 if(result){
  assert.ok(result.local.partner.quote);
  assert.ok(row.item.itemName.includes(result.local.partner.quote)||row.item.itemCaption.includes(result.local.partner.quote));
 }
});
