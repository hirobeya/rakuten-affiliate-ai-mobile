'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const H=require('../../scripts/rebuild/preview/api/calibration'),P=require('../../scripts/rebuild/preview/persistence'),L=require('../../lib/urenavi-core/live-calibration');
const goodEnv={VERCEL_ENV:'preview',URENAVI_CALIBRATION_ISOLATED_PREVIEW:'1',VERCEL_GIT_COMMIT_REF:'rebuild/urenavi-core-20261028',GROQ_API_KEY:'private-test-groq'};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
test('isolated status exposes credential presence only; cannot execute through posted permission',async()=>{
 let calls=0,storage=0;const handler=H.create({env:goodEnv,run:()=>{calls++;},loadBlob:()=>{storage++;throw Error('never load');}});
 const status=response();await handler({method:'GET'},status);assert.equal(status.code,200);assert.equal(status.body.groqCredentialPresent,true);assert.equal(status.body.inferenceEnabled,false);assert.ok(!JSON.stringify(status.body).includes('private-test-groq'));
 const blocked=response();await handler({method:'POST',headers:{},body:{action:'execute',snapshot:{grant:{approved:true}},URENAVI_CALIBRATION_LIVE:'approved-one-call'}},blocked);assert.equal(blocked.code,423);assert.equal(calls,0);assert.equal(storage,0);
});
test('Production, unrelated branch and missing isolation marker are refused before any storage or Groq',async()=>{
 for(const env of [{...goodEnv,VERCEL_ENV:'production'},{...goodEnv,VERCEL_GIT_COMMIT_REF:'main'},{...goodEnv,URENAVI_CALIBRATION_ISOLATED_PREVIEW:undefined}]){let calls=0;const r=response();await H.create({env,run:()=>{calls++;}})({method:'GET'},r);assert.equal(r.code,403);assert.equal(calls,0);}
});
test('runtime arming alone is insufficient: execution secret and verified facts required',async()=>{
 const env={...goodEnv,URENAVI_CALIBRATION_LIVE:'approved-one-call',URENAVI_CALIBRATION_EXECUTION_SECRET:'private-execution',BLOB_STORE_ID:'synthetic-store'};let calls=0;
 const handler=H.create({env,run:()=>{calls++;}});
 for(const [header,expected]of [[undefined,403],['wrong',403],['private-execution',412]]){const r=response();await handler({method:'POST',headers:{'x-urenavi-execution-secret':header},body:{action:'execute',snapshot:{}}},r);assert.equal(r.code,expected);}
 assert.equal(calls,0);
});
function blobMock(){const data=new Map();let version=0;return {data,async put(key,body,options){assert.equal(options.access,'private');assert.equal(options.addRandomSuffix,false);if(!options.allowOverwrite&&data.has(key))throw Error('exists');if(options.ifMatch&&data.get(key)?.etag!==options.ifMatch)throw Error('precondition');const etag='v'+(++version);data.set(key,{body,etag});return {etag};},async get(key,options){assert.equal(options.useCache,false);const value=data.get(key);return value?{statusCode:200,stream:new Blob([value.body]).stream(),blob:{etag:value.etag}}:null;}};}
test('remote create-only claim survives independent instances and disallows duplicates forever',async()=>{
 const blob=blobMock();const outcomes=await Promise.allSettled([P.create(blob).claim({approved:'synthetic'}),P.create(blob).claim({approved:'synthetic'})]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);await assert.rejects(P.create(blob).claim({approved:'different snapshot'}));
});
test('persisted journal uses conditional overwrite and rejects stale or missing read-back before local save',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'urenavi-blob-test-'));
 const blob=blobMock(),p=P.create(blob,{directory}),file=path.join(directory,'http/transport.json');
 try{
  await p.save(file,{version:1});assert.deepEqual(JSON.parse(fs.readFileSync(file)),{version:1});await p.save(file,{version:2});assert.deepEqual(JSON.parse(fs.readFileSync(file)),{version:2});
  const key=P.PREFIX+'/http/transport.json';blob.data.get(key).etag='external-change';await assert.rejects(p.save(file,{version:3}));assert.deepEqual(JSON.parse(fs.readFileSync(file)),{version:2});
  const absent=blobMock();absent.get=async()=>null;await assert.rejects(P.create(absent,{directory}).save(path.join(directory,'calibration.json'),{}));assert.equal(fs.existsSync(path.join(directory,'calibration.json')),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('storage-only probes cannot consume real claim or call inference, even concurrently',async()=>{
 const blob=blobMock();let calls=0;const h=H.create({env:{...goodEnv,BLOB_STORE_ID:'synthetic-store'},loadBlob:()=>blob,run:()=>{calls++;}}),body={action:'storage-probe',probeId:'abcdef0123456789abcdef0123456789'},r1=response(),r2=response();await Promise.all([h({method:'POST',body},r1),h({method:'POST',body},r2)]);assert.deepEqual([r1.code,r2.code].sort(),[200,409]);assert.equal(calls,0);assert.equal(blob.data.has(P.PREFIX+'/claimed.json'),false);
});
test('isolated deployment config has only calibration API, no existing app routes or cron',()=>{
 const cfg=require('../../scripts/rebuild/preview/vercel.json');assert.equal(cfg.crons,undefined);assert.deepEqual(Object.keys(cfg.functions),['api/calibration.js']);assert.deepEqual(fs.readdirSync(path.join(__dirname,'../../scripts/rebuild/preview/api')),['calibration.js']);assert.equal(cfg.env.URENAVI_CALIBRATION_LIVE,undefined);assert.equal(cfg.env.URENAVI_CALIBRATION_EXECUTION_SECRET,undefined);
});
