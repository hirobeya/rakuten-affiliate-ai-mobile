'use strict';
// Frozen cross-category replay; never invokes Groq or mutates a production path.
// Compare newly executed local results against immutable recorded output.
const test=require('node:test');
const assert=require('node:assert/strict');
const {generate}=require('../../lib/urenavi-core/last-resort');
const C=require('../../lib/urenavi-core/contracts');
const frozen=require('../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
const categories=['A','B','D','F','G','H'];
test('all 44 saved products replay without network or replacing previous successful copy',()=>{
 assert.equal(frozen.rows.length,44);
 const unique=new Set();
 const tally={before:0,after:0,changedSuccessful:0,missingPrevious:0,unreviewed:0,proposals:0};
 for(const row of frozen.rows){
   assert.ok(!unique.has(row.item.itemCode),'duplicate item code');
   unique.add(row.item.itemCode);
   const result=generate(row.item);
   assert.equal(result.groqCalls,0);
   assert.equal(result.apiCost,0);
   assert.equal(result.qualityCertified,false);
   assert.equal(row.sourceHash,C.hash(row.item));
   assert.equal(result.sourceHash,C.hash(Object.fromEntries(['itemCode','itemName','itemCaption','catchcopy'].map(k=>[k,row.item[k]]))));
   assert.equal(Boolean(result.baseline),Boolean(row.before));
   if(result.result){
     tally.after++;
     assert.equal(result.result.quality?.status,'ready');
     assert.ok(String(result.result.quality?.text||'').trim());
   }
   if(row.before){
     tally.before++;
     assert.equal(result.baseline?.quality?.text,row.before);
     assert.equal(result.result?.quality?.text,row.before);
     tally.changedSuccessful+=result.result?.quality?.text!==row.before?1:0;
   }
   if(row.after){
     assert.equal(result.result?.quality?.text,row.after,'previously generated result must remain unchanged');
   }else if(!result.result){
     assert.ok(categories.includes(result.diagnostic?.cause));
   }else{
     assert.equal(result.baseline,null,'new output must not replace a baseline success');
     assert.equal(result.qualityCertified,false,'new machine result is not certified six-axis quality');
   }
   if(result.editorialProposal){
     tally.proposals++;
     assert.equal(result.editorialProposal.publication,false);
     assert.equal(result.editorialProposal.copyable,false);
   }
 }
 assert.equal(tally.before,5);
 assert.ok(tally.after>=6,'no loss of previously rendered outputs');
 assert.equal(tally.changedSuccessful,0);
 assert.equal(tally.missingPrevious,0);
});
