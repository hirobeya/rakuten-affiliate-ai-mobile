'use strict';const test=require('node:test'),assert=require('node:assert/strict'),R=require('../../lib/urenavi-core/second-failure-observation');
const args={observation:{source:'user_formal_instruction_20261108',httpStatus:400,reportedTotalTokens:5729,outputLimit:3000,schemaMode:'strict'},previousEvidenceHashes:['a'.repeat(64)]};
test('second reported consumption is appended without authorizing settlement or releasing holds',()=>{const original=JSON.stringify(args),r=R.record(args);assert.equal(r.reportedTotalTokens,5729);assert.equal(r.verifiedProviderReceipt,false);assert.equal(r.holdReleased,0);assert.equal(r.sendPermission,false);assert.equal(r.retainedHolds.comparison,8000);assert.equal(JSON.stringify(args),original);});
test('usage cannot be silently changed in the accounting observation',()=>assert.throws(()=>R.record({...args,observation:{...args.observation,reportedTotalTokens:0}})));

test('malformed historical hash cannot become an accounting evidence reference',()=>assert.throws(()=>R.record({...args,previousEvidenceHashes:['prefix'+'a'.repeat(64)]})));
