'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createProvider,REVIEW_SCHEMA}=require('../lib/room-semantic-provider');
const {assessReview,questions}=require('../lib/room-semantic-contract');
const item={itemName:'授乳ワンピース',itemCaption:'授乳ワンピースは、胸の上布を授乳ケープとして使えます。来客時や急な授乳にも使えます。'};
const sentence='授乳ワンピースは胸の上布を授乳ケープとして使えるので、来客時の授乳にも使えます。';
function review(text=sentence){return {product:{what:'supported',acts_on:'supported'},quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(q=>[q,'supported'])),sentences:[{text,...Object.fromEntries(questions.map(q=>[q,'supported'])),evidenceQuotes:[],reason:'原文の構造と用途を保持'}]};}
const draft={product:{what:'授乳ワンピース',acts_on:'授乳',acts_on_quote:item.itemCaption},sentences:[{text:sentence,kinds:['scene','spec'],quotes:[item.itemCaption]}]};
test('each strict review request can only select the exact current draft sentences without changing response fields',async()=>{
 const bodies=[];
 const provider=createProvider({apiKey:'mock',fetchImpl:async(_url,options)=>{bodies.push(JSON.parse(options.body));return {ok:true,headers:new Headers(),json:async()=>({choices:[{message:{content:JSON.stringify(review())}}]})};}});
 for(const texts of [[sentence],['料理本の大きな文字で、レシピを確認したいときに。','刺繍キットの図案を見ながらステッチできます。']]){
  await provider.call('verify',item,{draft:{...draft,sentences:texts.map(text=>({...draft.sentences[0],text}))}});
  const body=bodies.at(-1),schema=body.response_format.json_schema.schema;
  assert.equal(body.response_format.json_schema.strict,true);
  assert.deepEqual(schema.properties.sentences.items.properties.text.enum,texts);
  assert.equal(schema.properties.sentences.minItems,texts.length);
  assert.equal(schema.properties.sentences.maxItems,texts.length);
  assert.deepEqual(schema.properties.sentences.items.required,REVIEW_SCHEMA.properties.sentences.items.required);
  for(const q of questions)assert.deepEqual(schema.properties.sentences.items.properties[q],REVIEW_SCHEMA.properties.sentences.items.properties[q]);
 }
 assert.equal(REVIEW_SCHEMA.properties.sentences.items.properties.text.enum,undefined,'request-specific text must never leak into the shared schema');
 assert.deepEqual(bodies[0].response_format.json_schema.schema.properties.sentences.items.properties.text.enum,[sentence]);
});
test('an exact review may pass but typo, duplicate and unsupported-condition verdicts still veto publication',()=>{
 assert.equal(assessReview(item,draft,review()).ok,true);
 const typo=review(sentence.replace('授乳ワンピース','授乳ワンビース'));
 assert.ok(assessReview(item,draft,typo).failures.some(f=>f.rule==='missing_or_duplicate_review'));
 const duplicated=review();duplicated.sentences.push(structuredClone(duplicated.sentences[0]));
 assert.ok(assessReview(item,draft,duplicated).failures.some(f=>f.rule==='missing_or_duplicate_review'));
 const unsupported=review();unsupported.sentences[0].conditions='not_supported';unsupported.sentences[0].reason='便利な構造が原文にある';
 assert.ok(assessReview(item,draft,unsupported).failures.some(f=>f.rule==='conditions_not_supported'),'positive prose cannot override a rejecting verdict');
});
