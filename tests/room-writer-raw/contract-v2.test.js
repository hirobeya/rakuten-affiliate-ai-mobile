'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('../../lib/room-writer-raw/source');
const V1=require('../../lib/room-writer-raw/contract');
const V2=require('../../lib/room-writer-raw/contract-v2');
const {prepareV2}=require('../../lib/room-writer-raw/prepare-v2');
const {prepareFallback,execute}=require('../../lib/room-writer-raw/route');

const item={
 itemCode:'v2-offline:10000001',
 itemName:'洗える布製の収納ケース',
 itemCaption:'布製ケース。ファスナーで開閉できます。内側には2つのポケットがあります。水拭きは可能ですが洗濯機は使用しないでください。',
 catchcopy:'収納を整理したい方へ',
 itemPrice:1900
};
const generateLocal=async()=>({groqCalls:0,result:{text:'布製ケースは絶対に洗濯機で洗えます'}});
const failed=async p=>({
 version:p.version,sourceHash:p.sourceHash,outputHash:p.outputHash,localHash:p.localHash,
 reviewerId:'offline-fixture-reviewer',method:'independent_review',
 status:'failed',reason:'原文の洗濯機不可に反する断定がある',
 axes:{understanding:false,specificity:true,choice:null,audience_value:null,naturalness:true,grounded:false}
});

test('v2 is a separate, versioned Groq wire request without changing v1',()=>{
 const source=S.prepare(item),one=V1.build(source),two=V2.build(source);
 assert.equal(one.held,false);assert.equal(two.held,false);
 assert.equal(V2.CONTRACT_VERSION,'raw-source-fallback-v2');
 assert.equal(one.request.response_format.json_schema.name,'room_raw_source_fallback_v1');
 assert.equal(two.request.response_format.json_schema.name,'room_raw_source_fallback_v2');
 assert.notEqual(one.requestHash,two.requestHash);
 assert.equal(one.inputHash,two.inputHash);
 assert.deepEqual(one.envelope.source,two.envelope.source);
 assert.equal(two.request.model,'openai/gpt-oss-120b');
 assert.equal(two.request.max_completion_tokens,2000);
 assert.equal(two.request.messages[1].content,one.request.messages[1].content);
 assert.equal(two.request.messages.some(m=>m.role==='tool'),false);
 assert(V2.SYSTEM.includes('一字一句'));
 assert(V2.SYSTEM.includes('安全'));
 assert(V2.SYSTEM.includes('自然'));
});
test('v2 remains offline and withheld when local quality is unknown',async()=>{
 const result=await prepareV2({item,generateLocal});
 assert.equal(result.status,'local_quality_unverified');
 assert.equal(result.calls,0);
 assert.equal(result.publication,false);
 assert.equal(result.copyable,false);
 assert.equal(result.request,undefined);
});
test('v2 prepares only an independently failed local output and cannot use v1 execute',async()=>{
 const result=await prepareV2({item,generateLocal,assessLocal:failed});
 assert.equal(result.status,'v2_offline_prepared_not_authorized');
 assert.equal(result.calls,0);
 assert.equal(result.publication,false);
 assert.equal(result.copyable,false);
 assert.equal(typeof result.sourceHash,'string');
 assert.equal(typeof result.qualityHash,'string');
 assert.equal(result.requestHash,S.hash(result.request));
 assert.equal(result.request.response_format.json_schema.name,'room_raw_source_fallback_v2');
 const bad=await execute({prepared:result});
 assert.equal(bad.status,'held');
 assert.equal(bad.calls,0);
 assert.equal(bad.reason,'fallback_not_prepared');
});
test('unmodified v1 preparation still uses frozen v1 request',async()=>{
 const r=await prepareFallback({item,generateLocal,assessLocal:failed});
 assert.equal(r.status,'fallback_prepared_not_authorized');
 assert.equal(r.bundle.request.response_format.json_schema.name,'room_raw_source_fallback_v1');
});
