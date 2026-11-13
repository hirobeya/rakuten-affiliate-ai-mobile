'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {buildGeminiComparison, compareOnce, toGeminiSchema} = require('../lib/room-writer-raw/gemini-comparison');
const {SYSTEM, schema} = require('../lib/room-writer-raw/contract-v2');
const {prepare} = require('../lib/room-writer-raw/source');
const item = {itemCode:'example:1',itemName:'収納ボックス',itemCaption:'ふた付きの収納ボックス。',catchcopy:'片付けに。',itemPrice:1000};
test('offline preparation retains exact source and instructions without transport', async () => {
  const prepared = buildGeminiComparison(item);
  assert.equal(prepared.held, false);
  assert.equal(prepared.request.systemInstruction.parts[0].text,SYSTEM);
  assert.deepEqual(JSON.parse(prepared.request.contents[0].parts[0].text).productData,prepare(item).source);
  assert.deepEqual(prepared.request.generationConfig.responseJsonSchema,toGeminiSchema(schema));
  assert.deepEqual(Object.keys(prepared.request.generationConfig.responseJsonSchema.properties),['product','hold','post']);
  assert.equal(prepared.request.generationConfig.responseJsonSchema.properties.product.properties.name.type,'string');
  assert.equal(prepared.request.generationConfig.responseJsonSchema.properties.product.properties.name.maxLength,undefined);
  const result = await compareOnce(item,{fetchImpl:()=>{throw Error('network called')}});
  assert.equal(result.status,'offline_ready');
});
test('live mode fails closed without explicit free tier and key', async () => {
  await assert.rejects(compareOnce(item,{execute:true,apiKey:'key'}), /free_tier_unverified/);
  await assert.rejects(compareOnce(item,{execute:true,freeTierConfirmed:true}), /api_key_missing/);
});
test('at most one HTTP attempt and no retry on provider errors', async () => {
  let calls=0;
  await assert.rejects(compareOnce(item,{execute:true,freeTierConfirmed:true,apiKey:'test',
    fetchImpl:async()=>{calls++;return {ok:false,status:429}}}), /gemini_http_429_no_retry/);
  assert.equal(calls,1);
});
test('valid response is returned unapproved with real usage only', async () => {
  const draft = {product:{name:'収納ボックス',unit:null,basis:[{field:'itemName',quote:'収納ボックス'}]},
    hold:{active:false,reason:''},post:{sentences:[{text:'ふた付きの収納ボックス。',kind:'fact',scope:null,basis:[{field:'itemCaption',quote:'ふた付きの収納ボックス。'}]}],notes:[],tags:[]}};
  const result=await compareOnce(item,{execute:true,freeTierConfirmed:true,apiKey:'test',fetchImpl:async()=>
    ({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(draft)}]}}],usageMetadata:{promptTokenCount:345,candidatesTokenCount:77,totalTokenCount:422}})})});
  assert.equal(result.status,'generated_unreviewed');
  assert.deepEqual(result.draft,draft);
  assert.equal(result.tokens.total,422);
});
