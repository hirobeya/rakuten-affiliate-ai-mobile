'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const frozen=require('../docs/evaluations/20261027-fixed/inputs.json');
const before=require('../docs/evaluations/20261027-fixed/results.json');
const {localZeroCall}=require('../api/room-ai-v3');
const {restatedReason}=require('../public/purchase-copy-quality');
const rows=[...frozen.entries.find(x=>x.name.endsWith('room-products.json')).data,...frozen.entries.find(x=>x.name.endsWith('room-unseen-products.json')).data,...frozen.entries.find(x=>x.name.endsWith('live-local-analysis.json')).data.items.map(x=>({id:'washnet-'+x.rank,item:x.item}))];
test('fixed weak local-ready posts defer while all five source-relation controls retain identical text',()=>{
 const weak=new Set(['u01','u09','u10','washnet-4']);
 let preserved=0,deferred=0;
 for(const old of before.localRows.filter(x=>x.ready)){
  const row=rows.find(x=>x.id===old.id),item=structuredClone(row.item),saved=JSON.stringify(item),diagnostics={};
  const actual=localZeroCall(item,'',diagnostics);
  assert.equal(JSON.stringify(item),saved);
  if(weak.has(old.id)){assert.equal(actual,null,old.id);assert.equal(diagnostics.stage,'purchase_reason');deferred++;}
  else{assert.ok(actual,old.id);assert.equal(actual.quality.text,old.text);assert.equal(actual.groq.totalCalls,0);preserved++;}
 }
 assert.equal(deferred,4);assert.equal(preserved,5);
});
test('rejection is about missing relationships and never bans a useful configuration or compatibility itself',()=>{
 assert.ok(restatedReason('サイズ組み合わせ自由で、選べる6枚セットの収納袋です。'));
 assert.equal(restatedReason('衣類の大きさに合わせてサイズを組み合わせ自由に選べる6枚セットの収納袋です。'),'');
 assert.equal(restatedReason('IH対応のフライパンは、取っ手を外せるのでそのまま食卓に出せます。',{identity:'フライパン'}),'');
 assert.equal(restatedReason('収納ボックスは使わないときに折りたたんで収納できます。',{identity:'収納ボックス',quote:'折りたたみ'}),'');
});
