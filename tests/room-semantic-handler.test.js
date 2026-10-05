'use strict';
const assert=require('node:assert/strict');
const {createHandler}=require('../lib/room-semantic-handler');
const {questions}=require('../lib/room-semantic-contract');
const item={itemCode:'test:handler',itemName:'収納ボックス',itemCaption:'折りたたみ可能な収納ボックス'};
const draft={product:{what:'収納ボックス',acts_on:'収納する物',acts_on_quote:item.itemCaption},sentences:[{text:'使わないときは折りたためる収納ボックス。',kinds:['spec','benefit'],quotes:[item.itemCaption]}]};
const review={product:{what:'supported',acts_on:'supported'},sentences:draft.sentences.map(s=>({text:s.text,...Object.fromEntries(questions.map(q=>[q,'supported'])),evidenceQuotes:[]})),quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(q=>[q,'supported']))};
async function run(handler,body=item){const res={setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;return d;}};await handler({method:'POST',body},res);return res;}
(async()=>{
 process.env.VERCEL_ENV='preview';
 let row=null,calls=0;const store={loadProduct:async()=>row,saveProduct:async x=>{row={schema_version:x.schemaVersion,model:x.model,raw_ai_json:JSON.parse(JSON.stringify(x.rawAiJson))};}};
 const provider={model:'test',requiredTokens:()=>0,call:async stage=>{calls++;return {raw:stage==='generate'?draft:review,rateLimit:{}};}};
 const handler=createHandler({authorize:async()=>({ok:true,plan:'owner'}),store,provider,consumeQuota:async()=>true});
 const generated=await run(handler);assert.equal(generated.code,202);assert.equal(generated.data.requestLlmCalls,1);assert.equal(generated.data.verifiedReuse,false);
 const verified=await run(handler);assert.equal(verified.code,200);assert.equal(verified.data.ok,true);assert.equal(verified.data.requestLlmCalls,1);assert.deepEqual(verified.data.diagnostics.draft,draft);
 const reused=await run(handler);assert.equal(reused.data.verifiedReuse,true);assert.equal(reused.data.requestLlmCalls,0);assert.equal(calls,2);assert.equal(reused.data.variants[0].text,verified.data.variants[0].text);
 const denied=await run(createHandler({authorize:async()=>({ok:true,plan:'base'}),store,provider}));assert.equal(denied.code,403);assert.equal(calls,2);
 process.env.VERCEL_ENV='production';assert.equal((await run(handler)).code,404);assert.equal(calls,2);
 console.log('semantic handler PASS: owner boundary, two fixed stages, verified exact-input zero-call reuse, production disabled');
})().catch(e=>{console.error(e);process.exitCode=1;});
