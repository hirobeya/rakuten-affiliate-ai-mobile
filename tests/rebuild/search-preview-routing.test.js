'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Runtime=require('../../lib/urenavi-core/operational-preview-runtime');
function response(){return {setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};}
function routedRequest(query){
 let requested,passedOptions;const options={headers:{Authorization:'Bearer synthetic-token'}};
 const window={fetch:async(url,init)=>{requested=url;passedOptions=init;return {};}};
 vm.runInNewContext(fs.readFileSync('public/return-state.js','utf8'),{window});
 return window.fetch('/api/search?'+new URLSearchParams(query),options).then(()=>{assert.equal(passedOptions,options);return new URL(requested,'https://preview.example.invalid');});
}
test('actual app fetch wrapper resolves to a deployed Preview route with keyword and filters preserved',async()=>{
 const query={keyword:'レッグバッグ',minPrice:'1000',maxPrice:'10000',sort:'-reviewAverage'},url=await routedRequest(query);
 assert.equal(url.pathname,'/api/search-v2');assert.deepEqual(Object.fromEntries(url.searchParams),query);
 const adapter=fs.readFileSync('scripts/rebuild/real-search-preview/api/search-v2.js','utf8');assert.match(adapter,/endpoint\('searchV2'\)/);
 assert.equal(typeof require('../../api/search-v2'),'function');assert.equal(typeof require('../../api/search-v2').createHandler,'function');
});
test('v2 Preview retains owner rejection, one quota claim, original search data and existing intent processing without Blob writes',async()=>{
 const oldEnv=process.env.VERCEL_ENV,oldFetch=global.fetch,keys=['RAKUTEN_APP_ID','RAKUTEN_ACCESS_KEY','RAKUTEN_AFFILIATE_ID'],old=keys.map(k=>process.env[k]);
 let quota=0,upstream=0,blobCalls=0;
 try{
  process.env.VERCEL_ENV='preview';keys.forEach(k=>{process.env[k]='synthetic-not-a-real-key';});
  const query={keyword:'レッグバッグ',minPrice:'1000',maxPrice:'10000',sort:'-reviewAverage'};
  const url=await routedRequest(query);
  const blob={get:async()=>{blobCalls++;},put:async()=>{blobCalls++;}};
  const wrong=Runtime.create({blob,approvedUserId:'approved',authorizeSearch:async()=>({ok:true,user:{id:'other'}}),claimSearch:async()=>{quota++;return true;}});
  const refused=response();await wrong.searchV2({method:'GET',headers:{},query:Object.fromEntries(url.searchParams)},refused);assert.equal(refused.code,403);assert.equal(quota,0);
  global.fetch=async raw=>{
   const provider=new URL(raw);assert.equal(provider.hostname,'openapi.rakuten.co.jp');assert.equal(provider.searchParams.get('keyword'),query.keyword);assert.equal(provider.searchParams.get('minPrice'),'1000');assert.equal(provider.searchParams.get('maxPrice'),'10000');upstream++;
   return {ok:true,json:async()=>({items:[{itemName:'検証用レッグバッグ',itemCode:'synthetic:bag',itemPrice:2500,itemCaption:'検証用の原文',catchcopy:'検証用キャッチ',reviewAverage:4.5,reviewCount:12,itemUrl:'https://example.invalid/bag'}],count:1})};
  };
  const runtime=Runtime.create({blob,approvedUserId:'approved',authorizeSearch:async()=>({ok:true,plan:'owner',user:{id:'approved'}}),claimSearch:async id=>{assert.equal(id,'approved');quota++;return true;}});
  const success=response();await runtime.searchV2({method:'GET',headers:{},query:Object.fromEntries(url.searchParams)},success);
  assert.equal(success.code,200);assert.equal(quota,1);assert.equal(upstream,1);assert.equal(blobCalls,0);
  assert.equal(success.body.items[0].itemCode,'synthetic:bag');assert.equal(success.body.items[0].itemName,'検証用レッグバッグ');assert.equal(success.body.items[0].itemCaption,'検証用の原文');assert.equal(typeof success.body.items[0].baseScore,'number');
  const limited=Runtime.create({blob,approvedUserId:'approved',authorizeSearch:async()=>({ok:true,user:{id:'approved'}}),claimSearch:async()=>false});
  const stopped=response();await limited.searchV2({method:'GET',headers:{},query},stopped);assert.equal(stopped.code,429);assert.equal(upstream,1);assert.equal(blobCalls,0);
  process.env.VERCEL_ENV='production';const production=response();await runtime.searchV2({method:'GET',headers:{},query},production);assert.equal(production.code,404);assert.equal(quota,1);assert.equal(upstream,1);
 }finally{global.fetch=oldFetch;if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});
