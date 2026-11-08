'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspect}=require('../../lib/room-semantic-contract');
const {rows}=require('./editorial-targets.fixture.cjs');
const frozen=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json'),'utf8')).rows;
test('four cross-category editorial targets must pass existing source and machine safety checks',()=>{
 const observations=[];
 for(const target of rows){
  const source=frozen.find(x=>x.item.itemCode===target.itemCode);
  assert.ok(source,target.itemCode);
  const review=inspect(source.item,target);
  observations.push({itemCode:target.itemCode,baselineHasOutput:Boolean(source.after),machineSafe:review.ok,errors:review.failures});
  assert.equal(review.ok,true,JSON.stringify({itemCode:target.itemCode,failures:review.failures}));
  assert.ok(target.sentences.every(s=>s.quotes.every(q=>q.length>0)));
 }
 assert.equal(rows.length,4);
 console.log('EDITORIAL_REFERENCE_EVIDENCE '+JSON.stringify({count:observations.length,observations,actualAIOutputs:0,independentModelReviewCompleted:false}));
});
