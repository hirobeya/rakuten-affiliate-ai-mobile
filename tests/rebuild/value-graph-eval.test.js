'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const R=require('../../lib/urenavi-core/last-resort');
const frozen=JSON.parse(fs.readFileSync(path.join(__dirname,'../../docs/evaluations/20261027-fixed/inputs.json'),'utf8'));
test('frozen product set: opt-in editorial remains local-only and never damages accepted copy',()=>{
 const rows=[];
 for(const e of frozen.entries.filter(e=>/room-products|room-unseen|live-local-analysis/.test(e.name))){
  for(const row of Array.isArray(e.data)?e.data:e.data.items){
   const g=R.generate(row.item);
   assert.equal(g.groqCalls,0);
   if(g.baseline)assert.deepEqual(g.result,g.baseline,'previously ready copy changed');
   const batch=R.generate(row.item,{mode:'batch'});
   assert.deepEqual(batch.result,g.result,'batch output diverged');
   rows.push({before:Boolean(g.baseline),after:Boolean(g.result)});
  }
 }
 const before=rows.filter(r=>r.before).length,after=rows.filter(r=>r.after).length;
 console.log('FROZEN_LOCAL_EVALUATION '+JSON.stringify({products:rows.length,readyBefore:before,readyAfter:after,groqCalls:0,qualityCertified:false}));
 assert.ok(rows.length>=40);
 assert.ok(after>=before);
});
