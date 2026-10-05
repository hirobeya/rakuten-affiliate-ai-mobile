'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const legacy=require('../lib/room-ai-handler');
const {callStructured}=require('../lib/super-urenavi-v3-groq');
const {defaultCallKnowledgeGroq}=require('../lib/product-type-knowledge');
const {run}=require('../public/room-preview-request');
const v3=require('../api/room-ai-v3');
const router=require('../lib/super-urenavi-router');
const wrapper=require('../lib/super-urenavi-type-wrapper');
const fs=require('node:fs');
const vm=require('node:vm');
const response=()=>({headers:{},status(code){this.code=code;return this;},setHeader(k,v){this.headers[k]=v;},json(body){this.body=body;return body;}});
const rateError=()=>Object.assign(new Error('rate limited'),{status:429,retryAfterMs:614000,safeError:{category:'rate_limit'},rateLimit:{'retry-after':'614'}});

test('all active transports stop after one 429 and preserve Retry-After',async()=>{
 for(const invoke of [fetchImpl=>legacy.defaultCallGroq({apiKey:'mock',model:'mock',itemName:'test',fetchImpl}),fetchImpl=>callStructured({apiKey:'mock',model:'mock',schema:{},fetchImpl}),fetchImpl=>defaultCallKnowledgeGroq({apiKey:'mock',model:'mock',productType:'test',fetchImpl})]){
  for(const after of ['0','614']){
   let calls=0;
   await assert.rejects(()=>invoke(async()=>{calls++;return {ok:false,status:429,headers:new Headers({'retry-after':after}),json:async()=>({error:{type:'rate_limit_error'}})};}),e=>e.status===429&&e.retryAfterMs===Number(after)*1000);
   assert.equal(calls,1);
  }
 }
});
test('Preview 429 is an explicit failure, never polled again',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  let analyses=0,requests=0,waits=0;
  const handler=v3.createHandler({authorize:async()=>({ok:true,plan:'owner'}),namespaced:false,localZeroCall:null,store:{loadProduct:async()=>null,saveProduct:async()=>{}},groq:{callPass1(){},callPass2(){}},analyzeProductV3:async()=>{analyses++;throw rateError();}});
  const out=await run({itemName:'test'},{fetchImpl:async()=>{requests++;const res=response();await handler({method:'POST',body:{itemName:'test'}},res);assert.equal(res.headers['Retry-After'],'614');return {status:res.code,json:async()=>res.body};},waitImpl:async()=>{waits++;}});
  assert.equal(out.status,429);assert.equal(out.data.ok,false);assert.equal(out.data.pending,false);assert.equal(out.data.retryAfterMs,614000);assert.equal(requests,1);assert.equal(analyses,1);assert.equal(waits,0);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('legacy analysis stops before the image stage and returns 429',async()=>{
 const old={env:process.env.VERCEL_ENV,key:process.env.GROQ_API_KEY};process.env.VERCEL_ENV='preview';process.env.GROQ_API_KEY='mock';
 try{
  let calls=0,images=0;
  const h=router.createHandler({authorize:async()=>({ok:true,plan:'owner'}),consumeQuota:async()=>true,store:{loadProduct:async()=>null,saveProduct:async()=>{}},callGroq:async()=>{calls++;throw rateError();},loadImageDataUrl:async()=>{images++;}});
  const res=response();await h({method:'POST',body:{itemName:'xyz-unknown',imageUrl:'https://example.com/image.png'}},res);
  assert.equal(res.code,429);assert.equal(res.body.ok,false);assert.equal(res.headers['Retry-After'],'614');assert.equal(calls,1);assert.equal(images,0);
 }finally{for(const [k,v] of [['VERCEL_ENV',old.env],['GROQ_API_KEY',old.key]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test('type knowledge 429 is not a successful product response or zero-call claim',async()=>{
 const old=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='mock';
 try{
  let calls=0;
  const h=wrapper.createHandler({baseHandler:async(_req,res)=>res.status(200).json({ok:true,route:{route:'local'},validation:{productType:{valid:true,value:'電気ケトル'}}}),store:{loadTypeKnowledge:async()=>null},callKnowledge:async()=>{calls++;throw rateError();}});
  const res=response();await h({},res);assert.equal(res.code,429);assert.equal(res.body.ok,false);assert.equal(res.body.typeKnowledge.groqCalls,1);assert.equal(calls,1);
 }finally{if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old;}
});
test('one UI operation stops remaining products after 429 in either route',async()=>{
 const html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');const start=html.indexOf('async function runAiPreview('),end=html.indexOf('\nasync function ensureAiForItem(',start);
 for(const usePurchasePlan of [true,false]){
  let calls=0;
  const ctx={usePurchasePlan,aiGatesFullOutput:true,aiRunGeneration:0,Map,aiTargetDecision:()=>({callAi:true}),updateAiPanel(){},requestAiRoom:async(_item,index)=>{calls++;ctx.aiRoomResults.set(index,{state:'error',status:429});},setTimeout(){throw Error('must not schedule continuation');}};
  vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);await ctx.runAiPreview([{}, {}, {}]);assert.equal(calls,1);assert.equal(ctx.aiRoomResults.get(1).state,'error');
 }
});
