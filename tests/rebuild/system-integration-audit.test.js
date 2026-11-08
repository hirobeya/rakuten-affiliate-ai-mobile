'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {audit}=require('../../scripts/rebuild/system-integration-audit.cjs');
test('actual iPhone request resolves via rewrite and query dispatch into room-copy handler',()=>{
 const r=audit();
 for(const id of ['route_to_backend','original_source_passed','reviewed_copy_gate']){
  const c=r.contracts.find(x=>x.id===id);
  assert.equal(c?.observed,true,id);
 }
});
test('production subscription use is not falsely marked complete while server forbids it',()=>{
 const r=audit();
 assert.ok(r.blockers.includes('production_ai_route_returns_404'));
 assert.ok(r.blockers.includes('ai_generation_owner_only'));
 assert.equal(r.contracts.find(x=>x.id==='paid_customer_production_copy_eligible').observed,false);
 assert.equal(r.launchReady,false);
 assert.equal(r.qualityCertified,false);
 assert.equal(r.productionChanged,false);
});
test('frozen quality numbers are not confused with functioning of the whole system',()=>{
 const r=audit();
 assert.equal(r.measured.frozenProducts,44);
 assert.equal(r.measured.previousReady,5);
 assert.equal(r.measured.currentReady,6);
 assert.ok(r.blockers.includes('six_axis_appeal_quality_not_proven'));
 assert.ok(r.blockers.includes('paid_subscriber_real_iphone_full_journey_not_accepted'));
});
