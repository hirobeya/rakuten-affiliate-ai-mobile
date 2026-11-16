'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createHandler}=require('../../lib/room-copy-handler');
const Quality=require('../../public/purchase-copy-quality');
const Safety=require('../../public/fact-safety');
const frozen=require('../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
const html=fs.readFileSync(path.join(__dirname,'../../public/app.html'),'utf8');
function sourceFunction(name,nextName,extras={}){
 const from=html.indexOf('function '+name+'('),to=html.indexOf('function '+nextName+'(',from);
 assert.ok(from>0&&to>from,name+' extracted from real mobile script');
 const context={
  window:{UrenaviPurchaseCopyQuality:Quality,UrenaviFactSafety:Safety},
  RoomCopyResult:{ready:()=>''},localCopyAssessment:()=>null,...extras
 };
 if(name==='readyV3Post'){
  const a=html.indexOf('function isV3PreviewResult(');
  context.isV3PreviewResult=vm.runInNewContext('('+html.slice(a,from).trim()+')',context);
 }
 return vm.runInNewContext('('+html.slice(from,to).trim()+')',context);
}
const review=sourceFunction('roomCopyNeedsReview','isFullyReviewedCopyState');
const ready=sourceFunction('readyV3Post','aiSalesInsight');
const sample=code=>frozen.rows.find(r=>r.item.itemCode===code)?.item;
function response(){return {code:null,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
function server(){
 let providerCalls=0,quotaCalls=0;
 const handler=createHandler({
  authorize:async()=>({ok:true,plan:'owner',user:{email:'owner-test@invalid.example'}}),
  logCost:()=>{},store:{loadProduct:async()=>null,saveProduct:async()=>{}},
  consumeQuota:async()=>{quotaCalls++;throw Error('no quota');},
  provider:{model:'mock',call:async()=>{providerCalls++;throw Error('no provider');}}
 });
 return {handler,getCalls:()=>({providerCalls,quotaCalls})};
}
test('real iPhone contract: verified local draft passes final copy check across 3 real products',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const api=server();
  for(const code of ['e-kurashi:10019512','e-kitchen:10079039','living-mahoroba:10015748']){
   const item=sample(code);assert.ok(item,code);
   const res=response();await api.handler({method:'POST',body:item},res);
   assert.equal(res.code,200,code);
   const text=ready(res.body);
   assert.ok(text,'mobile result must match source and final variant '+code);
   assert.equal(review(text,item,true,res.body),false,'copy must be enabled for '+code);
   assert.equal(review(text,{...item,itemCaption:'別の商品です。'},true,res.body),true,'never rebind another item '+code);
   const altered={...res.body,variants:[{...res.body.variants[0],text:text+'誇大表現'}]};
   assert.equal(ready(altered),'','mismatched verified variants must be held');
  }
  assert.deepEqual(api.getCalls(),{providerCalls:0,quotaCalls:0});
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('browser requires both original adjacent source clauses, even if first is a complete use relation',()=>{
 const first='フライパンは取手を外すことで重ねて収納できます。';
 const second='重ねて収納できます。';
 const item={itemName:'フライパン',itemCaption:first+' '+second};
 const evidence={kind:'caption_claim',quote:first,linkedEvidence:[{source:'itemCaption',quote:first},{source:'itemCaption',quote:second}]};
 const txt=first+' '+second;
 assert.equal(Quality.hasUseRelation(first),true);
 assert.equal(Quality.verifiedLinkedReason(item,evidence,txt),true);
 const broken={...evidence,linkedEvidence:[evidence.linkedEvidence[0],{source:'itemCaption',quote:'他の商品は重ねて収納できます。'}]};
 assert.equal(Quality.verifiedLinkedReason(item,broken,txt),false);
 assert.equal(Quality.verifiedLinkedReason({...item,itemCaption:first+' 別売り商品 '+second},evidence,txt),false);
 assert.equal(Quality.verifiedLinkedReason({...item,itemCaption:first+'別の説明です。'+second},evidence,txt),false);
 const reply={ok:true,pending:false,phase:'local',model:'local',version:'super-urenavi-v3-conditional-preview',
  groq:{totalCalls:0},quality:{status:'ready',text:txt},variants:[{text:txt}],
  productType:{quote:'フライパン',specific:'フライパン'},local:{partner:broken}};
 assert.equal(review(txt,item,true,reply),true,'no first-quote shortcut for a tampered second clause');
 reply.local.partner=evidence;
 assert.equal(review(txt,item,true,reply),false,'genuine linked source is copyable');
});
test('incomplete, nonlocal or unverified result is never copyable',()=>{
 const item=sample('e-kitchen:10079039');
 assert.equal(ready({ok:true,pending:true,version:'super-urenavi-v3-test',quality:{status:'ready'},variants:[{text:'未検証'}]}),'');
 assert.equal(review('勝手なコピー',item,false,null),true);
 assert.equal(review('勝手なコピー',item,true,{ok:false,version:'super-urenavi-v3-test',quality:{status:'ready'}}),true);
});

test('actual mobile postReady function enables only validated paid copy in the current item state',()=>{
 const item=sample('e-kitchen:10079039');
 const source=fs.readFileSync(path.join(__dirname,'../../public/app.html'),'utf8');
 const statusCode=source.slice(source.indexOf('function isFullyReviewedCopyState('),source.indexOf('function postReady('));
 const context={
  isV3PreviewResult:x=>String(x?.version||'').startsWith('super-urenavi-v3-'),
  readyV3Post:ready,
  RoomCopyResult:{canonical:()=>false,ready:()=>''},
  aiGatesFullOutput:true,currentAccessPlan:'owner',
  roomCopyNeedsReview:review,
  post:()=>responseText,
  aiPostState:()=>({target:{callAi:true},state:{state:stage,data:serverResponse}})
 };
 context.isFullyReviewedCopyState=vm.runInNewContext('('+statusCode.trim()+')',context);
 const postReady=sourceFunction('postReady','postDisplay',context);
 let responseText='',serverResponse=null,stage='done';
 // The same bounded, complete source clauses used by the real owner API.
 const src=item.itemCaption;
 const first='取手が取り外せる着脱式のフライパンです。',second='重ねて収納できます。';
 assert.ok(src.includes(first)&&src.includes(second));
 responseText=first+' '+second;
 serverResponse={
  version:'super-urenavi-v3-conditional-preview',ok:true,pending:false,model:'local',phase:'local',
  groq:{totalCalls:0},quality:{status:'ready',text:responseText},variants:[{text:responseText}],
  productType:{specific:'フライパン',quote:'フライパン'},
  local:{partner:{kind:'caption_claim',quote:first,linkedEvidence:[
   {source:'itemCaption',quote:first},{source:'itemCaption',quote:second}
  ]}}
 };
 assert.equal(postReady(item),true,'real button gate enables validated owner copy');
 stage='pending';assert.equal(postReady(item),false,'pending never enables button');
 stage='done';serverResponse.quality.text+=' 実証されていない効果';
 assert.equal(postReady(item),false,'response content mismatch blocks button');
 serverResponse.quality.text=responseText;serverResponse.local.partner.linkedEvidence[1].quote='必ず重ねて収納できます。';
 assert.equal(postReady(item),false,'forged source clause blocks button');
});
