'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {probe}=require('../lib/room-writer-raw/gemini-storage-probe');const {PREFIX}=require('../lib/room-writer-raw/gemini-attempt-store');
function storage({duplicate='gemini_already_exists'}={}){const rows=new Map();let writes=0;return {rows,get writes(){return writes;},blob:{async get(name){return rows.has(name)?{statusCode:200,stream:new Blob([rows.get(name)]).stream()}:null;},async put(name,body,options){assert(name.startsWith(PREFIX+'/storage-probes/'));assert.equal(options.access,'private');assert.equal(options.allowOverwrite,false);if(rows.has(name))throw Error(duplicate);writes++;rows.set(name,body);return {url:'https://private.example/mock'};}}};}
test('storage-only proof checks exact exclusion, injected failures, recovery and prior deployment',async()=>{
 const s=storage(),sha='c'.repeat(40),previousSha='d'.repeat(40);
 s.rows.set(PREFIX+'/storage-probes/'+previousSha+'/proof.json',JSON.stringify({passed:true,executionSha:previousSha,noProviderRequest:true}));
 const p=await probe({sha,context:'runtime',previousSha,blob:s.blob,anonymousGet:async()=>({status:403})});
 assert.equal(p.version,2);assert.equal(p.successfulCreates,1);assert.equal(p.claimReadbackFailureBlocksResend,true);assert.equal(p.resultSaveFailureBlocksResend,true);assert.equal(p.crossDeployment,true);assert.equal(p.providerCalls,0);
 const writes=s.writes;const r=await probe({sha,context:'runtime',previousSha,blob:s.blob,anonymousGet:()=>assert.fail('recovery does not repeat probe')});assert.equal(r.recovered,true);assert.equal(s.writes,writes);
});
test('a network failure in another contender is not certified as create-only exclusion',async()=>{
 const s=storage({duplicate:'arbitrary_network_failure'});await assert.rejects(probe({sha:'e'.repeat(40),context:'runtime',previousSha:null,blob:s.blob,anonymousGet:async()=>({status:403})}),/exclusion_failed/);
});
test('an anonymously readable object cannot pass private storage proof',async()=>{
 const s=storage();await assert.rejects(probe({sha:'f'.repeat(40),context:'runtime',previousSha:null,blob:s.blob,anonymousGet:async()=>({status:200})}),/private_access_unproven/);
});
