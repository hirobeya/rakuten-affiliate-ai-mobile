'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../lib/room-copy-handler');
const {questions,inspect}=require('../lib/room-semantic-contract');
const client=require('../public/room-copy-result');
const quality=require('../public/purchase-copy-quality');
const cases=[
 {name:'お茶 緑茶 レモンフレーバー',quote:'レモンフレーバーのお茶は爽やかなレモンの香りが広がります。',wrong:'すべてのお茶でレモンの香りが広がります。',right:'レモンの香りを楽しみたいときに、レモンフレーバーのお茶。'},
 {name:'ワンピース 通常タイプ 裏起毛タイプ',quote:'裏起毛タイプのワンピースには内側に起毛素材を使用しています。',wrong:'どのワンピースにも内側に起毛素材を使用しています。',right:'内側の起毛素材を選びたいときに、裏起毛タイプのワンピース。'},
 {name:'料理本 通常版 大型文字版',quote:'大型文字版の料理本には大きな文字でレシピを掲載しています。',wrong:'どちらの料理本にも大きな文字でレシピを掲載しています。',right:'大きな文字でレシピを確認したいときに、大型文字版の料理本。'}
];
test('variant feedback preserves scope through the existing one-rewrite path across unrelated categories',async()=>{
 const previous=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{for(const [index,c] of cases.entries()){
  const item={itemCode:'variant:'+index,itemName:c.name,itemCaption:c.quote};
  const product={what:c.name,acts_on:c.name,acts_on_quote:c.quote};
  const draft=text=>({product,sentences:[{text,kinds:['scene','benefit'],quotes:[c.quote]}]});
  let row=null,calls=0,quotas=0;const stages=[];
  const handler=createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'qa@example.test'}}),localZeroCall:()=>null,store:{loadProduct:async()=>row,saveProduct:async x=>{row={schema_version:x.schemaVersion,model:x.model,raw_ai_json:structuredClone(x.rawAiJson)};}},consumeQuota:async()=>{quotas++;return true;},logCost:()=>{},provider:{model:'test',requiredTokens:()=>1,call:async(stage,source,state)=>{
   calls++;stages.push(stage);
   if(stage==='generate'){
    if(state.attempt)assert.ok(state.failures.some(f=>f.rule==='part_not_supported'));
    return {raw:draft(state.attempt?c.right:c.wrong)};
   }
   return {raw:{product:{what:'supported',acts_on:'supported'},sentences:state.draft.sentences.map(s=>({text:s.text,...Object.fromEntries(questions.map(q=>[q,q==='part'&&!state.attempt?'not_supported':'supported'])),evidenceQuotes:[],reason:state.attempt?'選択肢の範囲を維持':'一方の選択肢の仕様を全種類に拡大'})),quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(q=>[q,'supported']))}};
  }}});
  const res=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return body;}});
  let r=res();await handler({method:'POST',body:item},r);
  for(let i=0;r.body.pending&&i<4;i++){r=res();await handler({method:'POST',body:item},r);}
  assert.equal(r.code,200);assert.equal(calls,4);assert.equal(quotas,4);
  assert.deepEqual(stages,['generate','verify','generate','verify']);
  assert.ok(client.ready(r.body).startsWith(c.right));assert.ok(!client.ready(r.body).includes(c.wrong));
  assert.equal(r.body.quality.status,'ready');
  const cached=res();await handler({method:'POST',body:item},cached);assert.equal(calls,4);assert.equal(cached.body.resourceUsage.calls,0);
 }}finally{if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;}
});
test('a selection appraisal cannot pass as the final purchase reason even with exact source evidence',()=>{
 const item={itemName:'お茶',itemCaption:'低温密閉抽出で、香りも旨みも引き立つお茶です。'};
 for(const text of ['香りと旨みが引き立つ点が選びやすいです。','低温密閉抽出で香りも旨みも引き立つ点が適しています。']){
  const draft={product:{what:'お茶',acts_on:'飲料',acts_on_quote:item.itemCaption},sentences:[{text,kinds:['benefit'],quotes:[item.itemCaption]}]};
  assert.equal(quality.catalogueOnly(text),true);
  assert.ok(inspect(item,draft).failures.some(f=>f.rule==='catalogue_only_copy'));
 }
 assert.equal(quality.catalogueOnly('レモンフレーバーのお茶で、爽やかな香りを楽しみたいときに。'),false);
});
