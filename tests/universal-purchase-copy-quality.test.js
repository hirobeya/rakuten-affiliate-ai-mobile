'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const quality=require('../public/purchase-copy-quality');
const {composeGenericFromSources,safeCaptionCandidates}=require('../lib/local-generic-reasoner');
const {composeLocalPartnerCopy}=require('../lib/local-partner-reasoner');
const {localZeroCall}=require('../api/room-ai-v3');
const {inspect,questions}=require('../lib/room-semantic-contract');
const {createHandler}=require('../lib/room-copy-handler');
const client=require('../public/room-copy-result');
const html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');
function ui(){const c=vm.createContext({window:{UrenaviFactSafety:require('../public/fact-safety'),UrenaviPurchaseCopyQuality:quality},RoomCopyResult:client,localCopyAssessment:()=>({ready:false})});vm.runInContext(html.slice(html.indexOf('function roomCopyNeedsReview('),html.indexOf('function isFullyReviewedCopyState(')),c);return c;}
const examples=[
 ['焙じ茶','焙じ茶は香ばしい香りを楽しめます。'],
 ['刺繍キット','刺繍キットは図案を見ながら刺繍できます。'],
 ['型紙集','型紙集は実物大型紙を使って裁断できます。'],
 ['ギフトボックス','ギフトボックスは小分けのお菓子を入れることができます。'],
 ['調整台','調整台は高さを変えて作業できます。']
];
for(const [identity,caption] of examples)test('source use relationships work without category-specific hooks: '+identity,()=>{
 const item={itemName:identity,itemCaption:caption,identity};
 const copy=composeGenericFromSources(item);
 assert.ok(copy);assert.equal(copy.quote,caption);assert.equal(copy.source,'itemCaption');
 assert.equal(copy.text,caption+'\n\n※アフィリエイト広告を利用しています');
 assert.equal(quality.catalogueOnly(copy.text),false);
 assert.doesNotMatch(copy.text,/見て選ぶ|表記の|困って|悩んで|買いました/);
 // The ranking hint is not a source-association approval.
 const unrelated={...item,itemCaption:'関連商品：'+caption};
 assert.equal(safeCaptionCandidates(unrelated).length,0);
});
test('complete caption purchase reason outranks a known title capacity label',()=>{
 const item={itemName:'収納ボックス 30L',itemCaption:'収納ボックスには毛布を収納できます。',identity:'収納ボックス'};
 const result=composeLocalPartnerCopy(item);
 assert.equal(result.quote,item.itemCaption);assert.equal(result.hook,'');
 assert.ok(result.decision.evaluatedCount>=2);assert.equal(result.decision.runnerUpQuote,'30L');
 assert.doesNotMatch(result.text,/容量まで見て選ぶ/);
});
test('short complete local source sentence reaches copy boundary only with its exact server result',()=>{
 const item={itemName:'洗濯ネット 布団 毛布 大容量',itemCaption:'シングルサイズの布団が入る大容量サイズです。'};
 const result=localZeroCall(item);assert.ok(result);assert.equal(result.groq.totalCalls,0);
 const text=result.quality.text,c=ui();assert.equal(c.roomCopyNeedsReview(text,item,true,result),false);
 assert.equal(c.roomCopyNeedsReview(text,item,true),true);
 assert.equal(c.roomCopyNeedsReview(text,item,false,result),true);
 assert.equal(c.roomCopyNeedsReview(text,{...item,itemCaption:''},true,result),true);
 assert.equal(c.roomCopyNeedsReview(text,{...item,itemName:'別の商品'},true,result),true);
 for(const mutate of [r=>r.pending=true,r=>r.quality.text+='別文',r=>r.variants[0].text+='別文',r=>r.groq.totalCalls=1,r=>r.local.partner.kind='numeric',r=>r.local.partner.quote='無関係な原文の文章です。']){
  const fake=structuredClone(result);mutate(fake);assert.equal(c.roomCopyNeedsReview(text,item,true,fake),true);
 }
 assert.doesNotMatch(result.verifiedAppeals[0].text,/^。/);
});
test('safe literal protection labels fail purchase quality in local, machine and final browser paths',()=>{
 const item={itemName:'洗濯ネット 型崩れ防止',itemCaption:''};
 const text='保護に関わる仕様を見て選ぶなら。\n「型崩れ防止」表記の洗濯ネットです。';
 assert.equal(localZeroCall(item),null);assert.equal(ui().roomCopyNeedsReview(text,item,true),true);
 const draft={product:{what:'洗濯ネット',acts_on:'衣類',acts_on_quote:item.itemName},sentences:[{text,kinds:['spec'],quotes:[item.itemName]}]};
 assert.ok(inspect(item,draft).failures.some(f=>f.rule==='catalogue_only_copy'));
});
test('a source relationship hint never overrides promotional, part, negative or unsupported evidence',()=>{
 const title='洗濯ネット 大容量 布団';
 for(const caption of ['関連商品の洗濯ネットには布団を収納できます。','付属の洗濯ネットには布団を収納できます。','洗濯ネットには布団を収納できません。','洗濯ネットは8枚セットなので、大変お得！','洗濯ネットには布団を収納でき、絶対に傷みません。']){
  assert.equal(safeCaptionCandidates({itemName:title,itemCaption:caption,identity:'洗濯ネット'}).length,0,caption);
 }
});
test('unknown category catalogue draft uses existing bounded rewrite and five-question review before exact UI copy',async()=>{
 const previous=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const item={itemCode:'quality:unregistered',itemName:'型紙集',itemCaption:'型紙集は実物大型紙を使って裁断できます。'};
  const product={what:'型紙集',acts_on:'裁断する布',acts_on_quote:item.itemCaption};
  const weak={product,sentences:[{text:'仕様を見て選ぶなら、型紙集です。',kinds:['spec'],quotes:[item.itemCaption]}]};
  const strong={product,sentences:[{text:'実物大型紙を使って布を裁断したいときに、この型紙集。',kinds:['scene','benefit'],quotes:[item.itemCaption]}]};
  let row=null;const stages=[],logs=[];
  const handler=createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'qa@example.test'}}),store:{loadProduct:async()=>row,saveProduct:async x=>{row={schema_version:x.schemaVersion,model:x.model,raw_ai_json:structuredClone(x.rawAiJson)};}},localZeroCall:()=>null,consumeQuota:async()=>true,logCost:x=>logs.push(x),provider:{model:'test',requiredTokens:()=>1,call:async(stage,source,state)=>{
   stages.push(stage);
   if(stage==='generate'){
    if(state.attempt===1)assert.ok(state.failures.some(f=>f.rule==='catalogue_only_copy'));
    return {raw:state.attempt?strong:weak};
   }
   return {raw:{product:{what:'supported',acts_on:'supported'},sentences:strong.sentences.map(s=>({text:s.text,...Object.fromEntries(questions.map(q=>[q,'supported'])),evidenceQuotes:[]})),quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(q=>[q,'supported']))}};
  }}});
  const request=()=>({method:'POST',body:item});
  const res=()=>({setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return body;}});
  let r=res();await handler(request(),r);
  for(let i=0;r.body.pending&&i<3;i++){r=res();await handler(request(),r);}
  assert.deepEqual(stages,['generate','generate','verify']);
  assert.equal(r.code,200);assert.ok(client.ready(r.body));
  assert.equal(ui().roomCopyNeedsReview(client.ready(r.body),item,true,r.body),false);
  const cached=res();await handler(request(),cached);assert.equal(stages.length,3);assert.equal(cached.body.resourceUsage.calls,0);
  assert.deepEqual(questions,['target','part','conditions','negation','degree']);
 }finally{if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;}
});
