'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHandler,localZeroCall,verifiedCaptionEditorialRescue}=require('../../api/room-ai-v3');
const frozen=require('../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
function response(){return {statusCode:200,body:null,setHeader(){},status(s){this.statusCode=s;return this;},json(b){this.body=b;return this;}};}
function store(){return {loadProduct:async()=>null,saveProduct:async()=>{},findTypeIdentityInTitle:async()=>''};}
test('frozen 44 regression: existing local success preserved; editorial-only new result must have exact source-backed caption',()=>{
 let previous=0,additional=0;
 for(const row of frozen.rows){
  const item=row.item,baseline=localZeroCall(item);
  if(baseline){previous++;continue;}
  const edited=localZeroCall(item,'',{}, {editorial:true});
  if(verifiedCaptionEditorialRescue(item,edited)){
   additional++;
   assert.equal(edited.quality.status,'ready');
   assert.equal(edited.groq.totalCalls,0);
   assert.equal(edited.local.partner.kind,'caption_claim');
   assert.ok(item.itemCaption.includes(edited.local.partner.quote));
  }
 }
 assert.equal(previous,5);
 assert.ok(additional>=1,'source-grounded editorial path must actually recover a previously held item');
});
test('editorial rescue does not accept generic or fabricated approval',()=>{
 const quote='座部を上げると、内部に物を収納可能';
 const item={itemName:'収納ベンチ',itemCaption:quote,itemCode:'test:1'};
 const claim={ok:true,quality:{status:'ready',text:quote},variants:[{text:quote}],local:{partner:{kind:'caption_claim',quote}},verifiedAppeals:[{text:quote,verification:{keepDirectFact:true}}]};
 assert.equal(verifiedCaptionEditorialRescue(item,claim),true);
 assert.equal(verifiedCaptionEditorialRescue(item,{...claim,local:{partner:{kind:'signal',quote:'収納できる'}}}),false);
 assert.equal(verifiedCaptionEditorialRescue(item,{...claim,local:{partner:{kind:'caption_claim',quote:'空中浮遊'}}}),false);
 assert.equal(verifiedCaptionEditorialRescue(item,{...claim,verifiedAppeals:[{text:quote,verification:{keepDirectFact:false}}]}),false);
 assert.equal(verifiedCaptionEditorialRescue(item,{...claim,variants:[{text:'別の文章'}]}),false);
});
test('owner preview recovers the frozen new caption copy without any provider or quota request',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const item=frozen.rows.find(r=>r.item.itemCode==='e-kurashi:10019512')?.item;
  assert.ok(item);
  assert.equal(localZeroCall(item),null);
  let providerCalls=0,quotaCalls=0;
  const handler=createHandler({authorize:async()=>({ok:true,plan:'owner'}),store:store(),consumeQuota:async()=>{quotaCalls++;throw Error('no quota');},groq:{callPass1:async()=>{providerCalls++;throw Error('no provider');},callPass2:async()=>{providerCalls++;throw Error('no provider');}}});
  const res=response();await handler({method:'POST',body:item},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.model,'local');
  assert.equal(res.body.groq.totalCalls,0);
  assert.equal(providerCalls,0);assert.equal(quotaCalls,0);
  assert.ok(res.body.quality.text.includes('座部を上げると、内部に物を収納可能'));
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
