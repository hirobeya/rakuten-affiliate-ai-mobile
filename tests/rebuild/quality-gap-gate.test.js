'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {load,summarize,AXES}=require('../../scripts/rebuild/quality-gap-gate.cjs');
test('frozen 44-product baseline is incomplete and reports every quality axis',()=>{
 const s=load();
 assert.equal(s.sampleCount,44);
 assert.equal(s.generated,6);
 assert.equal(s.notGenerated,38);
 assert.equal(s.allPassed,2);
 assert.equal(s.qualityComplete,false);
 for(const axis of AXES)assert.equal(s.axes[axis].pass+s.axes[axis].weak+s.axes[axis].fail,6);
});
test('missing independent quality dimension is not accepted as complete',()=>{
 const review=require('../../docs/rebuild-20261028/p3-local-first-20261108/editorial-review.json');
 const mutated=structuredClone(review);
 delete mutated.rows[0].axes.grounded;
 assert.throws(()=>summarize(mutated),/quality_baseline_missing_axis/);
});
test('machine-ready cannot be substituted for verified full-quality pass',()=>{
 const review=require('../../docs/rebuild-20261028/p3-local-first-20261108/editorial-review.json');
 const mutated=structuredClone(review);
 mutated.allAxesPassAfter=mutated.reviewedGeneratedTexts;
 assert.throws(()=>summarize(mutated),/quality_baseline_totals_mismatch/);
});
