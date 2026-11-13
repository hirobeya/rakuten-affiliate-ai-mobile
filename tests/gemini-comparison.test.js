'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {MODEL, ENDPOINT, buildGeminiComparison, buildGeminiLowThinkingCandidate, compareOnce, toGeminiSchema} = require('../lib/room-writer-raw/gemini-comparison');
const {SYSTEM, schema} = require('../lib/room-writer-raw/contract-v2');
const {prepare} = require('../lib/room-writer-raw/source');
const item = {itemCode:'example:1',itemName:'収納ボックス',itemCaption:'ふた付きの収納ボックス。',catchcopy:'片付けに。',itemPrice:1000};
test('offline preparation retains exact source and instructions without transport', async () => {
  assert.equal(MODEL, 'gemini-3.8-flash');
  assert.equal(ENDPOINT, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
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
test('incomplete/schema-invalid outputs retain actual usage, never retry',async()=>{
 let calls=0;
 await assert.rejects(compareOnce(item,{execute:true,freeTierConfirmed:true,apiKey:'test',fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({candidates:[{finishReason:'MAX_TOKENS'}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,totalTokenCount:120}})};}}),e=>e.tokens.total===120);
 assert.equal(calls,1);
});
test('source loss is rejected without transport',async()=>{
 let calls=0;await assert.rejects(compareOnce({...item,itemCaption:''},{execute:true,freeTierConfirmed:true,apiKey:'test',fetchImpl:()=>{calls++;}}));assert.equal(calls,0);
});
test('schema failure preserves exact provider content, response ID and actual usage',async()=>{
 let calls=0;const content='{"unexpected":"original model output"}';
 await assert.rejects(compareOnce(item,{execute:true,freeTierConfirmed:true,apiKey:'test',fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({responseId:'mock-response',candidates:[{finishReason:'STOP',content:{parts:[{text:content}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,totalTokenCount:125}})};}}),e=>e.message==='gemini_schema_invalid'&&e.tokens.total===125&&e.rawCandidateText===content&&e.providerRequestId==='mock-response');assert.equal(calls,1);
});
test('invalid provider JSON envelope is distinct from candidate schema failure',async()=>{
 let calls=0;await assert.rejects(compareOnce(item,{execute:true,freeTierConfirmed:true,apiKey:'test',fetchImpl:async()=>{calls++;return {ok:true,json:async()=>{throw new SyntaxError('untrusted raw content');}};}}),/gemini_response_json_invalid/);assert.equal(calls,1);
});

test('503 keeps only allowlisted provider diagnostics and makes exactly one attempt',async()=>{
 let calls=0;const secret='fake-secret-never-recorded';
 await assert.rejects(compareOnce(item,{execute:true,freeTierConfirmed:true,apiKey:secret,fetchImpl:async()=>{calls++;return {ok:false,status:503,headers:{get:n=>({'x-request-id':'mock-provider-503','x-goog-request-id':secret,'retry-after':'30','set-cookie':secret}[n]||null)},json:async()=>({error:{code:503,status:'UNAVAILABLE',message:secret,details:[{secret}]},echo:secret})};}}),e=>{
 assert.equal(e.httpStatus,503);assert.deepEqual(e.providerDiagnostic,{httpStatus:503,status:'UNAVAILABLE',code:503,headers:{'x-request-id':'mock-provider-503','retry-after':'30'}});assert(!JSON.stringify(e.providerDiagnostic).includes(secret));return e.message==='gemini_http_503_no_retry';});assert.equal(calls,1);
});

test('a stalled diagnostic body cannot replace a known 503 or trigger another request',async()=>{
 let calls=0;const start=Date.now();await assert.rejects(compareOnce(item,{execute:true,freeTierConfirmed:true,apiKey:'mock-secret',fetchImpl:async()=>{calls++;return {ok:false,status:503,json:()=>new Promise(()=>{})};}}),e=>e.message==='gemini_http_503_no_retry'&&e.httpStatus===503&&e.providerDiagnostic.status===null);assert.equal(calls,1);assert(Date.now()-start<2000);
});


test('low-thinking Gemini profile is an offline-only, distinct future request',()=>{
 const baseline=buildGeminiComparison(item);
 const candidate=buildGeminiLowThinkingCandidate(item);
 assert.equal(candidate.held,false);
 assert.equal(candidate.profile,'low-thinking-next-trial');
 assert.equal(candidate.approved,false);
 assert.equal(candidate.execute,false);
 assert.notEqual(candidate.requestHash,baseline.requestHash);
 assert.equal(candidate.sourceHash,baseline.sourceHash);
 assert.deepEqual(candidate.request.contents,baseline.request.contents);
 assert.deepEqual(candidate.request.systemInstruction,baseline.request.systemInstruction);
 assert.deepEqual(candidate.request.generationConfig.responseJsonSchema,baseline.request.generationConfig.responseJsonSchema);
 assert.deepEqual(candidate.request.generationConfig.thinkingConfig,{thinkingLevel:'low'});
 assert.equal(candidate.request.generationConfig.maxOutputTokens,4000);
 assert.equal(baseline.request.generationConfig.thinkingConfig,undefined);
 assert.equal(baseline.request.generationConfig.maxOutputTokens,2000);
});
