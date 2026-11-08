'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {audit}=require('../../scripts/rebuild/writer-budget-admission.cjs');
test('all 44 frozen sources have a deterministic comparable budget admission result',()=>{
 const {summary,rows}=audit();
 assert.equal(summary.items,44);
 assert.equal(rows.length,44);
 assert.equal(summary.sourcePreserved,true);
 assert.equal(summary.modelCalls,0);
 assert.equal(summary.notQualityEvidence,true);
 assert.equal(summary.notLiveRemainingBalance,true);
 assert.ok(rows.every(r=>r.itemCode && ['standard','editorial','guided'].every(m=>Number.isFinite(r.estimate[m])&&r.estimate[m]>0)));
 for(const m of ['standard','editorial','guided'])assert.equal(summary.feasibleByMode[m]+summary.overLimitByMode[m],44);
 assert.equal(summary.allModesOverLimit.length,rows.filter(r=>!r.hasAnyEligible).length);
 console.log('WRITER_BUDGET_FEASIBILITY '+JSON.stringify(summary));
});
test('selection never presents the least expensive estimate as a quality or runtime certification',()=>{
 const {summary,rows}=audit();
 for(const r of rows){
  if(r.best){
   assert.ok(r.eligible.includes(r.best));
   assert.ok(r.estimate[r.best]<=summary.limitTpmHistorical);
   assert.equal(r.estimate[r.best],Math.min(...r.eligible.map(m=>r.estimate[m])));
  }
  if(!r.hasAnyEligible)assert.equal(r.best,null);
 }
 assert.match(summary.recommendedFirstCandidate,/not automatically sent/);
});
