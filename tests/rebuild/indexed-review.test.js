'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const indexed=require('../../lib/urenavi-core/indexed-review'),provider=require('../../lib/room-semantic-provider'),contract=require('../../lib/room-semantic-contract');
const source='座部を上げると内部に物を収納できます。';
const item={itemName:'収納ベンチ',itemCaption:source};
const draft={product:{what:'収納ベンチ',acts_on:'収納',acts_on_quote:source},sentences:[{text:'物をしまいたいときに、座部を上げると内部に収納できる収納ベンチです。',quotes:[source],kinds:['scene','benefit']}]};
function verdict(id=0){return {sentenceId:id,evidenceQuotes:[],reason:'synthetic independent check',...Object.fromEntries(contract.questions.map(q=>[q,'supported']))};}
function raw(){return {product:{what:'supported',acts_on:'supported'},sentences:[verdict()],quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(q=>[q,'supported']))};}
test('indexed review retains every original sentence, source binding and independent semantic question',()=>{
 const state={draft},before=JSON.stringify(state),r=provider.stageRequest('verify',item,state,provider.REVIEW_PROMPT,'editorial');
 assert.equal(r.userPayload.draft.sentences[0].text,draft.sentences[0].text);
 assert.equal(r.userPayload.draft.sentences[0].sentenceId,0);
 assert.equal(r.userPayload.itemCaption,source);
 assert.equal(r.schema.additionalProperties,false);
 for(const q of contract.questions)assert(r.schema.properties.sentences.items.required.includes(q));
 assert.equal(r.schema.properties.sentences.items.properties.text,undefined);
 assert.equal(JSON.stringify(state),before);
 const restored=indexed.restore(raw(),state);assert.equal(restored.sentences[0].text,draft.sentences[0].text);
 assert.equal(contract.assessReview(item,draft,restored).ok,true);
 for(const q of contract.questions){const bad=raw();bad.sentences[0][q]='not_supported';assert.equal(contract.assessReview(item,draft,indexed.restore(bad,state)).ok,false,q);}
 const badQuality=raw();badQuality.quality.reason='unclear';assert.equal(contract.assessReview(item,draft,indexed.restore(badQuality,state)).ok,false);
});
for(const id of [-1,1,0.5,'0',null])test('invalid sentence identity rejects '+JSON.stringify(id),()=>assert.throws(()=>indexed.restore({...raw(),sentences:[verdict(id)]},{draft}),/identity/));
test('missing, duplicate, changed or injected text cannot acquire a review verdict',()=>{
 const state={draft:{...draft,sentences:[...draft.sentences,{...draft.sentences[0],text:'別の原文を確認したいときに。'}]}};
 assert.throws(()=>indexed.restore({...raw(),sentences:[verdict(0),verdict(0)]},state),/identity/);
 assert.throws(()=>indexed.restore(raw(),state),/coverage/);
 assert.throws(()=>indexed.restore({...raw(),sentences:[{...verdict(),text:'書き換えた本文'}]},{draft}),/identity/);
 const restored=indexed.restore({...raw(),sentences:[verdict(1),verdict(0)]},state);
 assert.equal(restored.sentences[0].text,state.draft.sentences[1].text);
 assert.equal(restored.sentences[1].text,state.draft.sentences[0].text);
});
test('semantic reviewer still rejects unsupported performance despite valid IDs',()=>{
 const wrong={...draft,sentences:[{...draft.sentences[0],text:'収納ベンチの天然木が安定感を提供します。'}]};
 const review=raw();review.sentences[0].degree='not_supported';
 assert.equal(contract.publication(item,wrong,indexed.restore(review,{draft:wrong})).status,'blocked');
});
