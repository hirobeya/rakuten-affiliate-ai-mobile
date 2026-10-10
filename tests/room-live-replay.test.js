'use strict';
const assert=require('node:assert/strict');
const {inspect,publication}=require('../lib/room-semantic-contract');
const baseline=require('../docs/room-fixed-evaluation-20261004-in-progress.json').runs;
const limited=require('../docs/room-rate-limit-evaluation-20261004.json').runs;
const whitespace=require('../docs/room-whitespace-interrupted-draft-20261004.json');
// Replay recorded live failures to protect the server veto. This does not
// evaluate a fresh model run, naturalness, or completion across 17 categories.
assert.equal(inspect(whitespace.item,whitespace.draft).ok,true,'a real correctly sourced draft does not fail because of Japanese sentence-boundary whitespace');
for(const r of baseline.filter(r=>r.fixtureId==='01')){
 assert.equal(publication(r.item,r.result.diagnostics.draft,r.result.diagnostics.review).status,'ready','previously grounded glove outputs remain usable');
}
const charging=baseline.find(r=>r.fixtureId==='04'&&r.run===2);
assert(inspect(charging.item,charging.result.diagnostics.draft).failures.some(x=>x.rule==='unsupported_immediate_result'));
const drying=baseline.find(r=>r.fixtureId==='05'&&r.run===1);
assert(inspect(drying.item,drying.result.diagnostics.draft).failures.some(x=>x.rule==='unsupported_immediate_result'));
const prevention=limited.find(r=>r.status===200);
assert(publication(prevention.item,prevention.result.diagnostics.draft,prevention.result.diagnostics.review).reasons.some(x=>x.rule==='unsupported_prevention_result'));
for(const r of baseline.filter(r=>r.fixtureId==='03'&&r.run<3)){
 assert(!inspect(r.item,r.result.diagnostics.draft).failures.some(x=>x.rule==='measurement_without_evidence'),'real unit-before-value dimensions no longer fail');
}
console.log('room-live-replay: PASS (recorded server-veto regressions; not a fresh model evaluation)');
