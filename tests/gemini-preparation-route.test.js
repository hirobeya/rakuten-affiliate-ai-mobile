'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const H=require('../lib/room-writer-raw/gemini-preview-route'),{history,decision}=require('../lib/room-writer-raw/gemini-history'),{hash}=require('../lib/room-writer-raw/source'),{blob}=require('./fixtures/gemini-process-worker.cjs'),{create,createIndependent}=require('../lib/room-writer-raw/gemini-attempt-store');
const SHA='e'.repeat(40),scope={itemCode:history.approval.itemCode,model:history.approval.model,requestHash:history.approval.requestHash};
function response(){return {setHeader(){},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
function req(method='POST',ids={}){return {method,headers:{origin:'https://safe.vercel.app',host:'safe.vercel.app'},body:{id:'3',confirm:'single-free-tier-call',...ids},query:{id:'3',...ids}};}
function account(){return {project:'Default Gemini Project',projectId:'gen-lang-client-0210652653',tier:'free',model:scope.model,currentQuotaEvidence:{verified:true,projectId:'gen-lang-client-0210652653',model:scope.model,tier:'free',limits:{rpm:5,tpm:250000,rpd:20},observedAtMs:Date.now()-1,validUntilMs:Date.now()+120000}};}
async function preview(fn){const keys=['VERCEL_ENV','VERCEL_GIT_COMMIT_REF','VERCEL_GIT_COMMIT_SHA','GEMINI_API_KEY'];const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));Object.assign(process.env,{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'experiment/urenavi-gemini-comparison-20261113',VERCEL_GIT_COMMIT_SHA:SHA,GEMINI_API_KEY:'mock-not-a-real-key'});try{await fn();}finally{for(const k of keys)if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}}
test('near-budget virtual delays preserve unknown usage and return below 60 seconds',async t=>preview(async()=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.parse('2026-11-13T13:00:00Z')});
 const events={};for(const n of ['auth','state','claim','provider','save']){let signal;const wait=new Promise(r=>{signal=r;});events[n]={wait,signal};}
 const delay=(name,ms)=>{events[name].signal();return new Promise(r=>setTimeout(r,ms));};let claimed=false,record;
 const store={state:async()=>{await delay('state',6999);return {};},readProbe:async()=>({version:2,passed:true,context:'runtime',executionSha:SHA}),begin:async()=>{await delay('claim',6999);claimed=true;},dispatch:async()=>{},finish:async(s,r)=>{await delay('save',6999);record=r;}};
 const handler=H.createHandler({authorizeImpl:async()=>{await delay('auth',7999);return {ok:true,plan:'owner'};},account:account(),decide:()=>({allow:true}),storeFactory:()=>store,compare:()=>{events.provider.signal();return new Promise(()=>{});}});
 const r=response(),start=Date.now(),running=handler(req(),r);
 for(const [name,ms]of [['auth',7999],['state',6999],['claim',6999],['provider',25001],['save',6999]]){await events[name].wait;t.mock.timers.tick(ms);}
 await running;assert.equal(claimed,true);assert.equal(record.result.tokens,null);assert.equal(record.result.error,'gemini_stage_timeout');assert(Date.now()-start<57000);assert.equal(r.statusCode,502);
}));
test('explicit separately approved mock trial has independent result GET and cannot clear original D',()=>preview(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gemini-route-'));try{
 const priorHash=hash(history),ids={approvalId:'mock-only-approval-route',executionId:'mock-only-execution-route'};
 const grant={...scope,...ids,status:'approved',approvedBy:'mock administrator',approvedAt:new Date(Date.now()-1000).toISOString(),maxCalls:1,independentTrialAcknowledged:true,priorHistory:{approvalId:history.approval.id,classification:'D',historyHash:priorHash},freeTierConfirmation:{verified:true,limits:{rpm:5,tpm:250000,rpd:20},projectId:'gen-lang-client-0210652653',tier:'free',model:scope.model,observedAtMs:Date.now()-1000,validUntilMs:Date.now()+60000,evidenceReference:'mock only'}};
 const b=blob(dir);let calls=0;
 const handler=H.createHandler({authorizeImpl:async()=>({ok:true,plan:'owner'}),account:account(),nextGrant:grant,storeFactory:(req,g,s)=>({...g?createIndependent(b,g,s):create(b),readProbe:async()=>({version:2,passed:true,context:'runtime',executionSha:SHA})}),compare:async()=>{calls++;return {model:scope.model,status:'generated_unreviewed',tokens:{input:2,output:3,total:5},draft:{product:{name:'mock',unit:null,basis:[{field:'itemName',quote:'mock'}]},hold:{active:true,reason:'mock only'},post:null}};}});
 const a=response();await handler(req('POST',ids),a);assert.equal(a.statusCode,200);
 const r=response();await handler(req('GET',ids),r);assert.equal(r.body.recovery.status,'recovered');assert.equal(r.body.receipt.result.tokens.total,5);assert.equal(calls,1);
 const duplicate=response();await handler(req('POST',ids),duplicate);assert.equal(duplicate.statusCode,409);assert.equal(calls,1);
 const old=response();await handler(req(),old);assert.equal(old.body.error,'target_history_unresolved');assert.equal(decision(scope,{}).allow,false);assert.equal(hash(history),priorHash);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}));
