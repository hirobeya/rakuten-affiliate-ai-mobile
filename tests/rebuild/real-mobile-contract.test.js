'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHandler}=require('../../lib/room-copy-handler');
const copyQuality=require('../../public/purchase-copy-quality');
const frozen=require('../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
function response(){return {code:null,body:null,setHeader(){},status(n){this.code=n;return this;},json(b){this.body=b;return this;}};}
function sample(code){const row=frozen.rows.find(r=>r.item.itemCode===code);assert.ok(row);return row.item;}
test('actual rewritten iPhone /api/room-copy endpoint uses verified zero-call editorial copy, no quota or provider',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const vercel=JSON.parse(fs.readFileSync(path.join(__dirname,'../../vercel.json'),'utf8'));
  assert.ok(vercel.rewrites.some(x=>x.source==='/api/room-copy'&&x.destination.includes('urenaviContract=1')));
  for(const code of ['e-kurashi:10019512','e-kitchen:10079039','living-mahoroba:10015748']){
   const item=sample(code);
   let providerCalls=0,quotaCalls=0;
   const handler=createHandler({
    authorize:async()=>({ok:true,plan:'owner',user:{email:'local-test@invalid.example'}}),
    logCost:()=>{},store:{loadProduct:async()=>null,saveProduct:async()=>{}},
    consumeQuota:async()=>{quotaCalls++;throw Error('must not consume quota');},
    provider:{model:'mock',call:async()=>{providerCalls++;throw Error('must not call provider');}}
   });
   const res=response();
   await handler({method:'POST',body:item},res);
   assert.equal(res.code,200,code);
   assert.equal(res.body.model,'local');
   assert.equal(res.body.pending,false);
   assert.equal(res.body.groq.totalCalls,0);
   assert.equal(res.body.quality.text,res.body.variants[0].text);
   assert.equal(quotaCalls,0);assert.equal(providerCalls,0);
   const p=res.body.local.partner;
   assert.equal(p.kind,'caption_claim');
   assert.ok(copyQuality.sourceIncludes(item.itemCaption,p.quote));
   assert.ok(copyQuality.hasUseRelation(p.quote)
       ||copyQuality.sourceOperationReason(p.quote)
       ||copyQuality.verifiedLinkedReason(item,p,res.body.quality.text),code);
   assert.equal(copyQuality.catalogueOnly(res.body.quality.text),false);
   const guard=require('../../public/fact-safety').guardUnsupportedBenefitCopy;
   assert.equal(guard(item,res.body.quality.text),res.body.quality.text);
  }
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('browser copy boundary verifies both exact linked claims, refuses false or missing evidence',()=>{
 const item=sample('e-kitchen:10079039');
 const good={quote:'取手が取り外せる着脱式のフライパンです。',linkedEvidence:[
  {source:'itemCaption',quote:'取手が取り外せる着脱式のフライパンです。'},
  {source:'itemCaption',quote:'重ねて収納できます。'}
 ]};
 const text='取手が取り外せる着脱式のフライパンです。 重ねて収納できます。';
 assert.equal(copyQuality.verifiedLinkedReason(item,good,text),true);
 assert.equal(copyQuality.verifiedLinkedReason(item,good,text.replace('重ねて収納できます。','')),false);
 assert.equal(copyQuality.verifiedLinkedReason(item,{...good,linkedEvidence:[...good.linkedEvidence.slice(0,1),{source:'itemCaption',quote:'空中浮遊できます。'}]},text),false);
});
test('UI uses real canonical route and applies source-bound check before copy',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../public/app.html'),'utf8');
 assert.match(html,/RoomPreviewRequest\.run\(payload/);
 assert.match(html,/verifiedLinkedReason\(item,partner,String\(text\|\|''\)\)/);
 assert.match(html,/sourceOperationReason\(partner\.quote\)/);
 assert.match(html,/result\.quality\.text===text\?text:''/);
});
