'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../../lib/room-copy-handler');
const source={itemCode:'test:approval',itemName:'収納ベンチ',itemCaption:'座部を上げると内部に物を収納できる収納ベンチです。'};
const sha='a'.repeat(40),other='b'.repeat(40);
const res=()=>({setHeader(){},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}});
async function environment(settings,fn){
 const keys=['VERCEL_ENV','VERCEL_GIT_COMMIT_SHA','URENAVI_AI_WRITER_EVAL_APPROVED_SHA'];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  for(const k of keys){if(settings[k]===undefined)delete process.env[k];else process.env[k]=settings[k];}
  return await fn();
 }finally{
  for(const k of keys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}
 }
}
function fixture(){
 const calls={provider:0,quota:0,cache:0};
 const handler=createHandler({
  authorize:async()=>({ok:true,plan:'owner',user:{email:'owner@example.test'}}),
  provider:{model:'mock',requiredTokens:()=>10,call:async()=>{calls.provider++;throw Error('prohibited real send');}},
  store:{loadProduct:async()=>{calls.cache++;return null;},saveProduct:async()=>{throw Error('must not save');}},
  consumeQuota:async()=>{calls.quota++;throw Error('must not spend');},
  logCost:()=>{}
 });
 return {handler,calls};
}
for(const [label,approved] of [['missing',undefined],['mismatched',other],['malformed','yes']]){
 test('editorial and guided cannot send when commit-bound approval is '+label,async()=>{
  await environment({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_SHA:sha,URENAVI_AI_WRITER_EVAL_APPROVED_SHA:approved},async()=>{
   for(const writer of ['editorial','guided']){
    const x=fixture(),r=res();
    await x.handler({method:'POST',body:{...source,evaluationRun:'quality_check',evaluationWriter:writer}},r);
    assert.equal(r.statusCode,403);
    assert.equal(r.body.message,'ai_writer_evaluation_not_approved');
    assert.deepEqual(x.calls,{provider:0,quota:0,cache:0});
   }
  });
 });
}
test('read-only evaluation status can inspect isolated writer namespace without enabling inference',async()=>{
 await environment({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_SHA:sha},async()=>{
  for(const writer of ['editorial','guided']){
   const x=fixture(),r=res();
   await x.handler({method:'POST',body:{...source,evaluationRun:'quality_check',evaluationWriter:writer,statusOnly:true}},r);
   assert.equal(r.statusCode,202);
   assert.equal(r.body.pending,true);
   assert.equal(x.calls.provider,0);
   assert.equal(x.calls.quota,0);
   assert.equal(x.calls.cache,1);
  }
 });
});
test('production rejects a writer experiment even if owner and approval SHA match',async()=>{
 await environment({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_SHA:sha,URENAVI_AI_WRITER_EVAL_APPROVED_SHA:sha},async()=>{
  const x=fixture(),r=res();
  await x.handler({method:'POST',body:{...source,evaluationRun:'quality_check',evaluationWriter:'editorial'}},r);
  assert.equal(r.statusCode,404);
  assert.deepEqual(x.calls,{provider:0,quota:0,cache:0});
 });
});
