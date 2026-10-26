'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../lib/room-review-comparison');
const fixture=require('../data/fixed-review-cases-20261027.json').cases[0];
const {createProvider,REVIEW_PROMPT,estimate}=require('../lib/room-semantic-provider');
function res(){return {setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return body;}};}
function setup({auth=true,wait=false,quota=true}={}){
 let cached=null,quotaCalls=0,sends=0,reads=0,budgetRow={revision:'start',models:{'openai/gpt-oss-120b':{tokenLimit:8000,remainingTokens:8000,remainingRequests:1000}}};
 const budget={load:async()=>structuredClone(budgetRow),swap:async(rev,next)=>{if(rev!==budgetRow.revision)return false;budgetRow=structuredClone(next);return true;}};
 if(wait)budgetRow.notBefore=5000;
 const handler=createHandler({authorize:async()=>auth?{ok:true,plan:'owner',user:{email:'qa@example.test'}}:{ok:false},now:()=>1000,budgetStore:budget,store:{loadProduct:async()=>{reads++;return cached;},saveProduct:async row=>{cached={schema_version:row.schemaVersion,raw_ai_json:row.rawAiJson};}},consumeQuota:async()=>{quotaCalls++;return quota;},logCost(){},providerFactory:()=>({model:'openai/gpt-oss-120b',requiredTokens:()=>100,call:async(stage,item,state)=>{assert.equal(stage,'verify');assert.deepEqual(item,fixture.item);assert.deepEqual(state.draft,fixture.draft);sends++;return {raw:fixture.savedReview,usage:{prompt_tokens:100,completion_tokens:50},rateLimit:{'x-ratelimit-remaining-tokens':'7500','x-ratelimit-remaining-requests':'999'}};}})});
 return {handler,counts:()=>({quotaCalls,sends,reads}),budget:()=>budgetRow};
}
async function preview(fn){const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';try{await fn();}finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}}
test('Production and non-owner requests cannot read cases, cache or send review calls',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='production';try{const x=setup(),r=res();await x.handler({method:'GET'},r);assert.equal(r.code,404);assert.deepEqual(x.counts(),{quotaCalls:0,sends:0,reads:0});}finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
 await preview(async()=>{const x=setup({auth:false}),r=res();await x.handler({method:'GET'},r);assert.equal(r.code,403);assert.equal(x.counts().reads,0);});
});
test('one immutable recorded review is cached, charged once, and never returned as publishable text',()=>preview(async()=>{
 const x=setup(),body={caseId:fixture.id,variant:'after'},before=JSON.stringify(fixture),a=res();await x.handler({method:'POST',body},a);
 assert.equal(a.code,200);assert.equal(a.body.publishable,false);assert.equal(a.body.experiment,true);assert.equal(a.body.pending,false);assert.equal(a.body.quality,undefined);assert.equal(a.body.variants,undefined);assert.equal(a.body.resourceUsage.calls,1);
 const b=res();await x.handler({method:'POST',body},b);assert.equal(b.body.cached,true);assert.equal(b.body.resourceUsage.calls,0);assert.equal(x.counts().sends,1);assert.equal(x.counts().quotaCalls,1);assert.equal(JSON.stringify(fixture),before);
}));
test('status checks and shared waits spend neither quota nor calls; unapproved inputs are refused',()=>preview(async()=>{
 for(const options of [{},{wait:true}]){const x=setup(options),r=res();await x.handler({method:'POST',body:{caseId:fixture.id,variant:'after',...(options.wait?{}:{statusOnly:true})}},r);assert.equal(r.code,202);assert.equal(x.counts().sends,0);assert.equal(x.counts().quotaCalls,0);}
 for(const extra of [{reviewPrompt:'untrusted'},{draft:{}},{model:'other'}]){const x=setup(),r=res();await x.handler({method:'POST',body:{caseId:fixture.id,variant:'after',...extra}},r);assert.equal(r.code,400);assert.equal(x.counts().sends,0);}
 const x=setup({quota:false}),r=res();await x.handler({method:'POST',body:{caseId:fixture.id,variant:'after'}},r);assert.equal(r.code,429);assert.equal(x.counts().sends,0);assert.equal(x.budget().lease,null);
}));
test('review prompt comparison budgets the same chosen prompt it actually sends; default remains fixed',async()=>{
 for(const reviewPrompt of [undefined,'bounded comparison prompt']){let sent;const p=createProvider({apiKey:'synthetic',...(reviewPrompt?{reviewPrompt}:{}),fetchImpl:async(_,o)=>{sent=JSON.parse(o.body);return {ok:true,headers:new Headers(),json:async()=>({choices:[{message:{content:'{}'}}]})};}});const n=p.requiredTokens('verify',fixture.item,{draft:fixture.draft});await p.call('verify',fixture.item,{draft:fixture.draft});assert.equal(sent.messages[0].content,reviewPrompt||REVIEW_PROMPT);assert.equal(n,estimate({messages:sent.messages,response_format:sent.response_format},3000));assert.equal(sent.max_completion_tokens,3000);}
});
test('shared budget release finishes before the HTTP response is sent',()=>preview(async()=>{
 const x=setup(),r=res();const original=r.json;r.json=function(body){assert.equal(x.budget().lease,null,'response must not freeze a sent lease');return original.call(this,body);};
 await x.handler({method:'POST',body:{caseId:fixture.id,variant:'after'}},r);assert.equal(r.code,200);assert.equal(x.counts().sends,1);
}));
