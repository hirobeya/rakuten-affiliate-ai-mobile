'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {replay}=require('../../scripts/room-writer-raw/prove-local-four.cjs');
const {prepareV2}=require('../../lib/room-writer-raw/prepare-v2');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products');
test('four fresh acquired products reproduce exactly with no provider calls',()=>{
 const r=replay();
 assert.equal(r.rows.length,4);
 assert.equal(r.allReproduced,true);
 assert.equal(r.groqCalls,0);
 assert.equal(r.completePostCount,0);
 for(const row of r.rows){
  assert.equal(row.qualityStatus,'unverified');
  assert.equal(row.liveGroqCandidateEligible,false);
  assert.equal(row.localStatus,'incomplete');
  assert.equal(row.localText,null);
  assert.equal(row.reproducedExactly,true);
 }
});
test('four incomplete products cannot be automatically promoted to Groq',async()=>{
 for(const i of [3,4,5,6]){
  const item=JSON.parse(fs.readFileSync(path.join(base,String(i).padStart(2,'0')+'.json'),'utf8'));
  const result=await prepareV2({item:item.source});
  assert.equal(result.status,'local_quality_unverified');
  assert.equal(result.calls,0);
  assert.equal(result.publication,false);
  assert.equal(result.copyable,false);
  assert.equal(result.request,undefined);
 }
});
