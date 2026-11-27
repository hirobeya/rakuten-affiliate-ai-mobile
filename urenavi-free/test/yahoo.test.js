'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {handleYahoo}=require('../api/yahoo');
const {normalize}=require('../lib/yahoo');
const sha='a'.repeat(40), now=Date.parse('2026-11-27T06:00:00Z');
const env={URENAVI_FREE_YAHOO_SHA:sha,URENAVI_FREE_YAHOO_FROM:new Date(now).toISOString(),URENAVI_FREE_YAHOO_UNTIL:new Date(now+1800000).toISOString(),URENAVI_FREE_YAHOO_TERMS_CONFIRMED:'true',URENAVI_FREE_YAHOO_APP_ID:'fixture',URENAVI_FREE_REDIS_URL:'https://chief-panda-222800.upstash.io',URENAVI_FREE_REDIS_TOKEN:'fixture'};
const preview={sha,isIsolatedPreview:true};
const query={keyword:'傘',mode:'search',maxPrice:''};
const hit={code:'store_item',name:'傘',price:1500,url:'https://store.shopping.yahoo.co.jp/store/item.html',review:{rate:4.5,count:100},seller:{name:'店'}};
test('Yahoo normalization rejects foreign links and retains source',()=>{
 assert.equal(normalize({...hit,url:'https://evil.example/item'}),null);
 assert.equal(normalize(hit).source,'yahoo');
 assert.equal(normalize(hit).estimatedCommission,null);
});
test('Yahoo QA blocks missing grant before any communication',async()=>{
 const fail=()=>assert.fail('unexpected communication');
 assert.equal((await handleYahoo({...env,URENAVI_FREE_YAHOO_SHA:''},preview,query,{now:()=>now,redisFetch:fail,providerFetch:fail})).status,503);
});
test('Yahoo successful search reserves and settles independently',async()=>{
 const calls=[];
 const result=await handleYahoo(env,preview,query,{now:()=>now,redisFetch:async(_,opts)=>{const args=JSON.parse(opts.body);calls.push(args);assert.match(args[3],/^urenavi:free:yahoo:v1:/);return Response.json({result:1});},providerFetch:async url=>{assert.equal(url.hostname,'shopping.yahooapis.jp');return Response.json({hits:[hit]});}});
 assert.equal(result.status,200);assert.equal(result.data.products[0].price,1500);assert.equal(calls.length,2);
});
test('Yahoo failure does not settle or retry',async()=>{
 let reserve=0, sent=0;
 const result=await handleYahoo(env,preview,query,{now:()=>now,redisFetch:async()=>{reserve++;return Response.json({result:1});},providerFetch:async()=>{sent++;return new Response('',{status:429});}});
 assert.equal(result.status,503);assert.equal(reserve,1);assert.equal(sent,1);
});
