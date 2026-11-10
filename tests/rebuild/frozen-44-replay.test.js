'use strict';
// Frozen cross-category replay; never invokes Groq or mutates a production path.
// Compare newly executed local results against immutable recorded output.
const test=require('node:test');
const assert=require('node:assert/strict');
const {generate}=require('../../lib/urenavi-core/last-resort');
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
   assert.equal(result.sourceHash,row.sourceHash);
   assert.equal(Boolean(result.baseline),Boolean(row.before));
   assert.equal(Boolean(result.result),Boolean(row.after));
   if(row.before){
     tally.before++;
     assert.deepEqual(result.baseline,row.before);
     assert.deepEqual(result.result,row.before);
     tally.changedSuccessful+=JSON.stringify(result.result)!==JSON.stringify(row.before)?1:0;
   }
   if(row.after){
     tally.after++;
     assert.deepEqual(result.result,row.after);
   }else{
     assert.ok(categories.includes(result.diagnostic?.cause));
   }
   if(result.editorialProposal){
     tally.proposals++;
     assert.equal(result.editorialProposal.publication,false);
     assert.equal(result.editorialProposal.copyable,false);
   }
 }
 assert.equal(tally.before,5);
 assert.equal(tally.after,6);
 assert.equal(tally.changedSuccessful,0);
 assert.equal(tally.missingPrevious,0);
});
