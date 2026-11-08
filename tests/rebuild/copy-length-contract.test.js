'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {WRITER_SCHEMA,REVIEW_SCHEMA,WRITER_PROMPT,stageRequest}=require('../../lib/room-semantic-provider');
const {SYSTEM,make}=require('../../lib/urenavi-core/editorial-writer');
const {inspect}=require('../../lib/room-semantic-contract');
const browser=require('../../public/room-copy-result');

test('writer and independent reviewer no longer impose 150-character one-or-two sentence copy',()=>{
 for(const schema of [WRITER_SCHEMA,REVIEW_SCHEMA]){
  assert.equal(schema.properties.sentences.maxItems,6);
  assert.equal(schema.properties.sentences.items.properties.text.maxLength,350);
 }
 assert.doesNotMatch(WRITER_PROMPT,/原則1〜2文|短い1〜3文/);
 assert.doesNotMatch(SYSTEM,/短い日本語の文章1〜3文/);
 for(const mode of ['standard','editorial','guided']){
  const source={itemName:'収納ケース',itemCaption:'前面から開けられる収納ケースです。',catchcopy:''};
  const request=mode==='standard'?stageRequest('generate',source):make(source,{},WRITER_SCHEMA,{guided:mode==='guided'});
  assert.equal(request.schema.properties.sentences.maxItems,6);
  assert.equal(request.schema.properties.sentences.items.properties.text.maxLength,350);
 }
});

test('a 5-sentence draft is not rejected merely for its length while every fact still faces evidence checks',()=>{
 const item={itemName:'収納ケース',itemCaption:'前面から開けられる収納ケースです。収納ケースは2段セットです。'};
 const sentences=[
  '収納ケースは前面から開けられるタイプです。',
  '開け方に注目して収納ケースを選びたいときに。',
  '収納ケースには2段セットのタイプがあります。',
  '前面からの開閉を重視したい人に向けた収納ケースです。',
  '2段セットという構成も確認できる収納ケースです。'
 ].map(text=>({text,kinds:['spec'],quotes:['収納ケース','前面から開けられる収納ケースです。','収納ケースは2段セットです。']}));
 const outcome=inspect(item,{product:{what:'収納ケース',acts_on:'収納する物',acts_on_quote:'収納ケース'},sentences});
 assert.equal(outcome.failures.some(f=>f.rule==='incomplete_post'),false);
 assert.equal(sentences.length,5);
 // All other independent content, grounding and semantic vetoes are unchanged.
 assert.ok(Array.isArray(outcome.failures));
});

test('browser copies complete approved multiline text without truncation',()=>{
 const sentences=Array.from({length:5},(_,i)=>({text:'収納ケースで確認したいポイント'+(i+1)+'は、開閉方法と収納する物の組み合わせです。',quotes:['収納ケース'],kinds:['spec']}));
 const full=sentences.map(s=>s.text).join('\n\n')+'\n\n※アフィリエイト広告を利用しています';
 const result={version:'room_contract_test',ok:true,pending:false,product:{what:'収納ケース',acts_on:'収納する物',acts_on_quote:'収納ケース'},sentences,quality:{status:'ready',machine:{ok:true},review:{ok:true},text:full},variants:[{text:full}]};
 assert.equal(browser.ready(result),full);
 assert.equal(browser.ledger(result).length,5);
 assert.ok(full.length>150);
});
