'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Runtime=require('../../lib/urenavi-core/operational-preview-runtime');
function response(){return {setHeader(){},status(n){this.code=n;return this;},json(value){this.body=value;}};}
test('approved Preview runtime binds both routes to one server Auth ID and defaults to no Blob writes',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';try{
 let quota=0,gets=0,puts=0;const blob={get:async()=>{gets++;return {statusCode:404};},put:async()=>{puts++;throw Error('forbidden');}};
 assert.throws(()=>Runtime.create({blob}),/approved_search_user_required/);
 const runtime=Runtime.create({blob,approvedUserId:'approved',authorizeSearch:async()=>({ok:true,user:{id:'other'}}),authorizeCopy:async()=>({ok:true,plan:'owner',user:{email:'approved'}}),claimSearch:async()=>{quota++;return true;}});
 const sr=response();await runtime.search({method:'GET',headers:{'x-user-id':'approved'},query:{keyword:'バッグ',userId:'approved'}},sr);assert.equal(sr.code,403);
 const cr=response();await runtime.copy({method:'POST',headers:{'x-fixture-owner':'approved'},body:{completedCoreOnly:true,itemCode:'shop:1',itemName:'バッグ',itemCaption:'バッグ',catchcopy:''}},cr);assert.equal(cr.code,403);
 assert.equal(runtime.sourceCaptureEnabled,false);assert.equal(quota,0);assert.equal(gets,0);assert.equal(puts,0);
 await assert.rejects(()=>runtime.saveCompleted({authorization:{ok:true,user:{id:'approved'}},artifact:{}}),/not_authorized/);assert.equal(puts,0);
 process.env.VERCEL_ENV='production';const pr=response();await runtime.search({method:'GET',headers:{},query:{}},pr);assert.equal(pr.code,404);assert.equal(quota,0);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
