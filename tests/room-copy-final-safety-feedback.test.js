'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {inspect,questions}=require('../lib/room-semantic-contract');
const {createHandler}=require('../lib/room-copy-handler');
const client=require('../public/room-copy-result');
const item={itemCode:'fixture:shirt-net',itemName:'シャツ用洗濯ネット',itemCaption:'シャツをクルクル巻いて洗うことで、洗濯によってできるシワや型くずれをおさえるので、アイロンがけの負担が減ります。'};
const draft=text=>({product:{what:item.itemName,acts_on:'シャツ',acts_on_quote:item.itemCaption},sentences:[{text,kinds:['benefit'],quotes:[item.itemName,item.itemCaption]}]});
const bad=draft('シャツ用洗濯ネットは、シャツを巻いて洗うとアイロンがけの手間が減ります。');
const good=draft('シャツ用洗濯ネットは、シャツを巻いて洗うとアイロンがけの負担が減ります。');
const review=d=>({product:{what:'supported',acts_on:'supported'},sentences:d.sentences.map(s=>({text:s.text,...Object.fromEntries(questions.map(q=>[q,'supported'])),evidenceQuotes:[]})),quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(q=>[q,'supported']))});
test('coexisting attributes need the same positive source relation; unrelated provision claims still fail',()=>{
 const {unsupportedBenefitTerms,guardUnsupportedBenefitCopy}=require('../public/fact-safety');
 const source={itemName:'洗濯ネット',itemCaption:'六角形の構造が、クッション性と通気性を両立。'};
 const text='洗濯ネットはクッション性と通気性を兼ね備えています。';
 assert.deepEqual(unsupportedBenefitTerms(text,source),[]);
 assert.equal(guardUnsupportedBenefitCopy(source,text),text);
 for(const [caption,body] of [
  ['',text],
  ['クッション性と通気性を両立していません。',text],
  ['クッション性と通気性を両立できない。',text],
  ['クッション性と通気性を両立。','洗濯ネットは防水性と通気性を兼ね備えています。'],
  ['クッション性と通気性を両立。',text+'災害への備えになります。']
 ])assert.ok(unsupportedBenefitTerms(body,{...source,itemCaption:caption}).includes('備え'));
 const unsafe={...source,itemCaption:'クッション性と通気性を両立。'};
 const d={product:{what:'洗濯ネット',acts_on:'衣類',acts_on_quote:unsafe.itemCaption},sentences:[{text:'洗濯ネットはクッション性と通気性を兼ね備え、絶対に衣類を傷めません。',kinds:['benefit'],quotes:[unsafe.itemCaption]}]};
 assert.equal(inspect(unsafe,d).ok,false);
});
test('the existing browser copy guard rejects an ungrounded term before the server calls a draft ready',()=>{
 assert.ok(inspect(item,bad).failures.some(f=>f.rule==='final_copy_guard'&&f.sentence===0&&f.detail.includes('手間')));
 assert.equal(inspect(item,good).ok,true);
});
test('existing one-rewrite flow receives the final copy rejection and publishes only a corrected reviewed post',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  let row=null;const stages=[];
  const provider={model:'fixture',requiredTokens:()=>0,call:async(stage,source,state)=>{
   stages.push([stage,state.attempt]);
   if(stage==='generate'&&state.attempt===1)assert.ok(state.failures.some(f=>f.rule==='final_copy_guard'));
   return {raw:stage==='verify'?review(good):state.attempt?good:bad,rateLimit:{}};
  }};
  const handler=createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'fixture@example.test'}}),provider,localZeroCall:()=>null,consumeQuota:async()=>true,logCost:()=>{},store:{loadProduct:async()=>row,saveProduct:async r=>{row={schema_version:r.schemaVersion,model:r.model,raw_ai_json:structuredClone(r.rawAiJson)};}}});
  const res={setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;}};
  await handler({method:'POST',body:item},res);
  assert.equal(res.code,200);assert.deepEqual(stages,[['generate',0],['generate',1],['verify',1]]);
  const text=client.ready(res.body);assert.ok(text.includes('負担'));assert.ok(!text.includes('手間'));
  const fs=require('node:fs'),vm=require('node:vm'),html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');
  const ui=vm.createContext({window:{UrenaviFactSafety:require('../public/fact-safety')},RoomCopyResult:client});
  vm.runInContext(html.slice(html.indexOf('function roomCopyNeedsReview('),html.indexOf('function isFullyReviewedCopyState(')),ui);
  assert.equal(ui.roomCopyNeedsReview(text,item,true,res.body),false);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
