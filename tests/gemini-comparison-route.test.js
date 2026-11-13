'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../lib/room-writer-raw/gemini-preview-route');
const {create,PREFIX}=require('../lib/room-writer-raw/gemini-attempt-store');
const {decision,history}=require('../lib/room-writer-raw/gemini-history');
const {buildGeminiComparison,MODEL}=require('../lib/room-writer-raw/gemini-comparison');
const SHA='b'.repeat(40),scope={itemCode:'shopworld:10138423',model:MODEL,requestHash:buildGeminiComparison(H.loadItem('3')).requestHash};
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
async function preview(fn){const names=['VERCEL_ENV','VERCEL_GIT_COMMIT_REF','VERCEL_GIT_COMMIT_SHA','GEMINI_API_KEY','GEMINI_PRIOR_ATTEMPTS_RECONCILED'];const saved=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'experiment/urenavi-gemini-comparison-20261113',VERCEL_GIT_COMMIT_SHA:SHA,GEMINI_API_KEY:'mock-secret-never-reported',GEMINI_PRIOR_ATTEMPTS_RECONCILED:'20261113-evidence-verified'});
 try{await fn();}finally{for(const k of names)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
function request(method='POST',body={id:'3',confirm:'single-free-tier-call'}){return {method,headers:{origin:'https://safe.vercel.app',host:'safe.vercel.app'},body,query:{id:'3'}};}
function memory(){const rows=new Map();let failRead=false,failResult=false;
 const blob={async put(k,v,o){assert.equal(o.access,'private');assert.equal(o.allowOverwrite,false);if(rows.has(k))throw Error('exists');if(failResult&&k.endsWith('/result.json'))throw Error('save_failed');rows.set(k,v);return {url:'https://private.example/mock'};},async get(k,o){assert.equal(o.useCache,false);if(failRead)throw Error('read_failed');return rows.has(k)?{statusCode:200,stream:new Blob([rows.get(k)]).stream()}:null;}};
 return {rows,blob,readFail:v=>{failRead=v;},resultFail:()=>{failResult=true;}};}
function storeWithProof(m){return {...create(m.blob),readProbe:async()=>({version:2,passed:true,context:'runtime',executionSha:SHA})};}
function config(m,extra={}){return {authorizeImpl:async()=>({ok:true,plan:'owner'}),storeFactory:()=>storeWithProof(m),decide:()=>({allow:true,reason:null,history:[]}),account:{project:'Default Gemini Project',projectId:'mock-project',tier:'free',model:MODEL,currentQuotaEvidence:{verified:true,projectId:'mock-project',model:MODEL,tier:'free',limits:{rpm:5,tpm:250000,rpd:20},observedAtMs:Date.now()-1000,validUntilMs:Date.now()+60000}},...extra};}
const rejectedDraft={product:{name:'架空商品',unit:null,basis:[{field:'itemName',quote:'存在しない原文'}]},hold:{active:false,reason:''},post:{sentences:[{text:'根拠のない架空機能です。',kind:'fact',scope:null,basis:[{field:'itemCaption',quote:'架空の原文'}]}],notes:[],tags:[]}};
const generated=()=>({status:'generated_unreviewed',model:MODEL,modelVersion:MODEL,providerRequestId:'mock-response-id',requestHash:scope.requestHash,draft:structuredClone(rejectedDraft),tokens:{input:100,output:30,total:140}});
test('full fixed sources remain available and schema input is unchanged',()=>{
 assert.equal(H.loadItem('3').itemCode,scope.itemCode);assert.equal(H.loadItem('4').itemCode,'arkham:10000161');assert.equal(H.loadItem('../.env'),null);
 assert.equal(JSON.parse(buildGeminiComparison(H.loadItem('3')).request.contents[0].parts[0].text).productData.itemCaption,H.loadItem('3').itemCaption);
});
test('D is preserved as D and only a matching request is held; magic env cannot unlock',()=>{
 const d=decision(scope,{});assert.equal(d.reason,'target_history_unresolved');assert.equal(d.history[0].classification,'D');assert.equal(d.history[0].providerSent,null);
 const unscoped=structuredClone(history);unscoped.records=[{classification:'D',itemCode:null,model:null,requestHash:null}];assert.equal(decision(scope,{},unscoped).reason,'target_history_evidence_missing');
 const unrelated=structuredClone(history);unrelated.records=[{classification:'D',itemCode:'other:1',model:MODEL,requestHash:scope.requestHash}];assert.equal(decision(scope,{},unrelated).reason,'target_history_evidence_missing');
 const cleared=structuredClone(history);cleared.records=[{...scope,at:'2026-11-13T06:55:00Z',classification:'A',providerSent:false,verifiedPreDispatchProof:{...scope,providerDispatch:false,reviewedBy:'test fixture',reviewedAt:'2026-11-13',periodStart:'2026-11-13T00:00:00Z',periodEnd:'2026-11-13T23:59:59Z',evidence:[{reference:'mock-test-only',sha256:'c'.repeat(64)}]}}];assert.equal(decision(scope,{},cleared).allow,true);const missingHash=structuredClone(cleared);missingHash.records[0].requestHash=null;missingHash.records[0].verifiedPreDispatchProof.requestHash=null;assert.equal(decision(scope,{},missingHash).allow,false);const wrongPeriod=structuredClone(cleared);wrongPeriod.records[0].verifiedPreDispatchProof.periodEnd='2026-11-13T01:00:00Z';assert.equal(decision(scope,{},wrongPeriod).allow,false);
 assert.equal(decision(scope,{legacy:{claim:{}}},cleared).reason,'existing_attempt_do_not_resend');assert.equal(decision({...scope,model:'other'},{},cleared).reason,'outside_one_call_approval');
});
test('Production, unrelated branch, cross-origin, unauthenticated and nonowner cannot send',()=>preview(async()=>{
 let calls=0;const m=memory();
 for(const change of [{env:'production'},{branch:'other'},{origin:'https://evil.example'},{access:{ok:false}},{access:{ok:true,plan:'base'}}]){
  process.env.VERCEL_ENV=change.env||'preview';process.env.VERCEL_GIT_COMMIT_REF=change.branch||'experiment/urenavi-gemini-comparison-20261113';
  const req=request();if(change.origin)req.headers.origin=change.origin;
  const h=H.createHandler(config(m,{authorizeImpl:async()=>change.access||{ok:true,plan:'owner'},compare:async()=>{calls++;}}));const r=response();await h(req,r);assert([403,404].includes(r.statusCode));
 }assert.equal(calls,0);assert.equal(m.rows.size,0);
}));
test('matching history D blocks provider even with old unlock env',()=>preview(async()=>{
 const m=memory(),r=response();await H.createHandler(config(m,{decide:decision}))(request(),r);assert.equal(r.body.error,'target_history_unresolved');assert.equal(r.body.tokens,null);assert.equal(m.rows.size,0);
}));
test('missing runtime proof, quota proof and insufficient time block before claim',()=>preview(async()=>{
 for(const extra of [{storeFactory:()=>({...storeWithProof(memory()),readProbe:async()=>null})},{account:{}},{clock:(()=>{let n=0;return ()=>Date.now()+(n++>5?16000:0);})()}]){
  const m=memory(),r=response();await H.createHandler(config(m,{...extra,compare:()=>assert.fail('no send')}))(request(),r);assert.equal(r.statusCode,409);assert.equal(m.rows.size,0);
 }
}));
test('only approved product and immutable server source are accepted',()=>preview(async()=>{
 for(const body of [{id:'4',confirm:'single-free-tier-call'},{id:'3',confirm:'single-free-tier-call',itemCaption:'modified'}]){
 const m=memory(),r=response();await H.createHandler(config(m,{compare:()=>assert.fail('no send')}))(request('POST',body),r);assert([400,403].includes(r.statusCode));assert.equal(m.rows.size,0);
 }
}));
test('two concurrent claims, another instance, changed request cannot replenish approval',async()=>{
 const m=memory();const record={...scope};const results=await Promise.allSettled([create(m.blob).begin(record),create(m.blob).begin(record)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 await assert.rejects(create(m.blob).begin({...scope,requestHash:'a'.repeat(64)}));assert.equal((await create(m.blob).state(scope)).approvalClaim.itemCode,scope.itemCode);
});
test('failed write readback leaves an immutable claim; a new instance cannot resend',async()=>{
 const m=memory();m.readFail(true);await assert.rejects(create(m.blob).begin(scope));m.readFail(false);await assert.rejects(create(m.blob).begin(scope));assert.equal(m.rows.size,1);
});
test('timeout retains unknown consumption and forbids repeated calls',()=>preview(async()=>{
 const m=memory();let calls=0;const h=H.createHandler(config(m,{compare:async()=>{calls++;throw new DOMException('timed out','TimeoutError');}}));const a=response(),b=response();await Promise.all([h(request(),a),h(request(),b)]);assert.equal(calls,1);assert([a.statusCode,b.statusCode].includes(409));
 const saved=await create(m.blob).state(scope);assert.equal(saved.result.result.tokens,null);assert.equal(saved.result.result.failureStage,'provider');
 const c=response();await h(request(),c);assert.equal(c.statusCode,409);assert.equal(calls,1);
}));
test('unsupported claims rejected, original text and tokens retained, GET restores without provider',()=>preview(async()=>{
 const m=memory();let calls=0;const h=H.createHandler(config(m,{compare:async()=>{calls++;return generated();}}));const a=response();await h(request(),a);assert.equal(a.statusCode,200);assert.equal(a.body.copy,null);assert.equal(a.body.mechanical.ok,false);assert.equal(a.body.generatedCopy,'根拠のない架空機能です。');
 const b=response();await H.createHandler(config(m,{compare:()=>assert.fail('GET must never generate')}))(request('GET'),b);assert.equal(b.body.receipt.result.generatedCopy,a.body.generatedCopy);assert.equal(b.body.receipt.result.tokens.total,140);assert.equal(calls,1);assert(!JSON.stringify(b.body).includes('mock-secret-never-reported'));
}));
test('result save failure cannot be followed by another provider call',()=>preview(async()=>{
 const m=memory();m.resultFail();let calls=0;const h=H.createHandler(config(m,{compare:async()=>{calls++;return generated();}}));const a=response();await h(request(),a);assert.equal(a.statusCode,503);assert.equal(a.body.error,'result_save_failed_do_not_resend');assert.equal(a.body.tokens.total,140);const b=response();await h(request(),b);assert.equal(b.statusCode,409);assert.equal(calls,1);
}));
test('storage-only runtime action cannot call Gemini and rejects arbitrary fields',()=>preview(async()=>{
 const m=memory(),h=H.createHandler(config(m,{probeImpl:async(options,req)=>{assert.equal(req.headers['x-vercel-oidc-token'],'mock-runtime-oidc');return {passed:true,noProviderRequest:true};},compare:()=>assert.fail('no provider')}));
 const a=response(),req=request('POST',{id:'3',operation:'storage-probe'});req.headers['x-vercel-oidc-token']='mock-runtime-oidc';await h(req,a);assert.equal(a.body.providerCalls,0);assert(!JSON.stringify(a.body).includes('mock-runtime-oidc'));const b=response();await h(request('POST',{id:'3',operation:'storage-probe',other:1}),b);assert.equal(b.statusCode,400);
}));
test('storage namespace rejects traversal and Groq prefixes',()=>{
 assert.throws(()=>create(memory().blob,{namespace:'groq'}));assert.throws(()=>create(memory().blob,{namespace:PREFIX+'/../groq'}));
});


test('isolated Blob observations separate worker startup, SDK request and body read without exposing credentials',async()=>{
 const {EventEmitter}=require('node:events');const {sdk}=require('../lib/room-writer-raw/gemini-blob');const observations=[];let operations=0;
 const fakeFork=(file,args,options)=>{assert.equal(options.env.VERCEL_BLOB_RETRIES,'0');assert.equal(options.env.VERCEL_OIDC_TOKEN,'mock-private-oidc');const child=new EventEmitter();child.kill=()=>{};child.send=message=>{operations++;queueMicrotask(()=>{child.emit('message',{phase:'ready'});child.emit('message',{ok:true,value:{statusCode:200,text:'{"stored":true}'},timings:{sdkModuleMs:2,sdkRequestMs:40,bodyReadMs:3}});});};return child;};
 const b=sdk({oidcToken:'mock-private-oidc',forkImpl:fakeFork,onObservation:o=>observations.push(o)});const result=await b.get(PREFIX+'/mock-only-read.json');assert.equal(JSON.parse(await new Response(result.stream).text()).stored,true);assert.equal(operations,1);assert.equal(observations.length,1);assert.equal(observations[0].sdkRequestMs,40);assert.equal(observations[0].outcome,'completed');assert(observations[0].workerStartupMs>=0);assert(!JSON.stringify(observations).includes('mock-private-oidc'));assert(!JSON.stringify(observations).includes('mock-only-read.json'));
});
