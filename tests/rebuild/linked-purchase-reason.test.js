'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {safeCaptionCandidates,linkedStorageCandidates}=require('../../lib/local-generic-reasoner');
const {localZeroCall,verifiedCaptionEditorialRescue,createHandler}=require('../../api/room-ai-v3');
const frozen=require('../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
test('source-linked removable handle and stacking becomes a buyer-use candidate only in editorial mode',()=>{
 const row=frozen.rows.find(x=>x.item.itemCode==='e-kitchen:10079039');
 assert.ok(row);
 const item=row.item;
 const candidates=safeCaptionCandidates({itemName:item.itemName,itemCaption:item.itemCaption,identity:'フライパン',editorial:true,linkedReason:true});
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
  const edited=baseline||localZeroCall(item,'',{}, {editorial:true,linkedReason:true});
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

test('final local rescue must reject a second unsupported or altered source clause',()=>{
 const item={itemCode:'safe:1',itemName:'フライパン',itemCaption:'取手が取り外せるフライパンです。重ねて収納できます。'};
 const text='取手が取り外せるフライパンです。重ねて収納できます。';
 const base={
  ok:true,quality:{status:'ready',text},variants:[{text}],
  local:{partner:{kind:'caption_claim',quote:'取手が取り外せるフライパンです。',linkedEvidence:[
   {source:'itemCaption',quote:'取手が取り外せるフライパンです。'},
   {source:'itemCaption',quote:'重ねて収納できます。'}
  ]}},
  verifiedAppeals:[{text,verification:{keepDirectFact:true}}]
 };
 assert.equal(verifiedCaptionEditorialRescue(item,base),true);
 const forged=structuredClone(base);forged.local.partner.linkedEvidence[1].quote='必ず収納できます。';
 assert.equal(verifiedCaptionEditorialRescue(item,forged),false);
 const unbound=structuredClone(base);unbound.local.partner.linkedEvidence[1].quote='重ねて収納できます';
 unbound.quality.text='取手が取り外せるフライパンです。';
 unbound.variants[0].text=unbound.quality.text;
 assert.equal(verifiedCaptionEditorialRescue(item,unbound),false);
});

test('the real Preview owner API uses opt-in linked reason without any Groq or quota call',async()=>{
 const row=frozen.rows.find(x=>x.item.itemCode==='e-kitchen:10079039');
 const oldEnv=process.env.VERCEL_ENV;
 process.env.VERCEL_ENV='preview';
 try{
  let providerCalls=0,quotaCalls=0;
  const res={code:0,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  const handler=createHandler({
   authorize:async()=>({ok:true,plan:'owner'}),
   store:{loadProduct:async()=>null,saveProduct:async()=>{},findTypeIdentityInTitle:async()=>''},
   consumeQuota:async()=>{quotaCalls++;throw Error('must not use AI quota');},
   groq:{callPass1:async()=>{providerCalls++;throw Error('must not call Groq');},callPass2:async()=>{providerCalls++;throw Error('must not call Groq');}}
  });
  await handler({method:'POST',body:row.item},res);
  assert.equal(res.code,200);
  assert.equal(res.body.model,'local');
  assert.equal(res.body.quality.status,'ready');
  assert.equal(res.body.groq.totalCalls,0);
  assert.equal(providerCalls,0);
  assert.equal(quotaCalls,0);
  assert.ok(res.body.local.partner.linkedEvidence.length===2);
  assert.ok(res.body.quality.text.includes('重ねて収納できます。'));
 }finally{if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;}
});
