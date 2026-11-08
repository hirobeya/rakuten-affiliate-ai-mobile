'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../../lib/urenavi-core/last-resort'),C=require('../../lib/urenavi-core/contracts');
const {fixture}=require('./fixture.cjs');
const G=require('../../lib/local-generic-reasoner');
const frozen=require('../../docs/evaluations/20261027-fixed/inputs.json');
function bundle(){const f=fixture();f.review.quality.choice.verdict='fail';return R.packageInput({...f,category:'キッチン用品',weaknesses:['本文の購入理由を具体化する']});}
function raw(b){return {sentences:[{text:b.draft.sentences[0].text,evidenceIds:['e0'],featureIds:['f'],relationIds:['r']}]};}
const bench=require('../fixtures/room-products.json').find(r=>r.category==='収納ベンチ').item;
test('existing normal results stay byte-identical and never enter the provider route',()=>{
 const local=require('../../api/room-ai-v3').localZeroCall;
 for(const e of frozen.entries.filter(e=>/room-products|room-unseen|live-local-analysis/.test(e.name)))for(const row of Array.isArray(e.data)?e.data:e.data.items){const old=local(row.item),r=R.generate(row.item);if(old)assert.deepEqual(r.result,old);assert.equal(r.groqCalls,0);assert.equal(r.apiCost,0);assert.equal(r.qualityCertified,false);}
});
test('normal and batch reuse the same scoped operation with its source quote',()=>{
 for(const mode of ['normal','batch']){const r=R.generate(bench,{mode});assert.equal(r.baseline,null);assert.match(r.result.quality.text,/収納ベンチは、座部を上げると、内部に物を収納可能です。/);assert.equal(r.result.local.partner.quote,'座部を上げると、内部に物を収納可能');assert.equal(r.groqCalls,0);}
});
for(const caption of [
 '●座部を上げると、内部に物を収納可能',
 '収納ベンチ ●関連商品の説明 ●座部を上げると、内部に物を収納可能',
 '収納ベンチ ●別売の座部を上げると、内部に物を収納可能',
 '収納ベンチ ●座部を上げると、内部に物を収納できません',
 '収納ベンチ ●座部を上げると、内部に物を収納可能で絶対安心',
 '収納ベンチ ●当社の開発した座部を上げると、内部に物を収納可能',
 '収納ベンチ ●座部を上げると、収納カバーだけ使用可能',
])test('scope/negation/seller text does not become a local accepted operation: '+caption,()=>{
 const cs=G.safeCaptionCandidates({itemName:'収納ベンチ',itemCaption:caption,identity:'収納ベンチ',editorial:true});
 // Cover-only claims may be extracted but must preserve that limitation.
 if(caption.includes('カバーだけ'))assert.ok(cs.every(c=>c.body.includes('カバーだけ')));else assert.equal(cs.length,0);
});
test('minimal schema has closed objects and all required fields',()=>{
 const b=bundle();function check(s){if(s.type==='object'){assert.equal(s.additionalProperties,false);assert.deepEqual(s.required.slice().sort(),Object.keys(s.properties).sort());Object.values(s.properties).forEach(check);}if(s.type==='array')check(s.items);}
 check(R.schema(b));assert.equal(C.validSchema(raw(b),R.schema(b)),true);
});
test('low/medium differ only in effort at a fixed output budget',()=>{
 const b=bundle(),low=R.request(b,{effort:'low'}),medium=R.request(b,{effort:'medium'});assert.deepEqual({...low,reasoning_effort:'medium'},medium);assert.equal(low.max_completion_tokens,1000);
 assert.ok(JSON.stringify(R.schema(b)).length<JSON.stringify(C.WRITE_SCHEMA).length);
});
test('safe conversion retains the product and is never copyable without full review',()=>{
 const b=bundle(),converted=R.adapt(b,raw(b));assert.deepEqual(converted.draft.product,b.draft.product);assert.equal(C.inspect(b.item,converted.draft).ok,true);assert.equal(converted.publication,false);assert.equal(converted.copyable,false);
 assert.throws(()=>R.accept(b,converted,b.review,{verdict:'better'}),/full_semantic_review_required/);
});
for(const mutation of [
 r=>r.sentences[0].evidenceIds.push('invented'),r=>r.sentences[0].featureIds.push('invented'),r=>r.sentences[0].relationIds.push('invented'),
 r=>r.sentences[0].evidenceIds=[],r=>r.sentences[0].evidenceIds.push('e0'),r=>r.sentences[0].featureIds=[],r=>r.sentences[0].text='',r=>r.sentences[0].extra='x',r=>r.sentences=[],
])test('invalid IDs or structure stop private conversion '+mutation.toString(),()=>{const b=bundle(),r=raw(b);mutation(r);assert.throws(()=>R.adapt(b,r));});
for(const dimension of C.dimensions)test('unsafe semantic '+dimension+' never qualifies for editing',()=>{const f=fixture();f.review.quality.choice.verdict='fail';f.review.plan[0][dimension]='unclear';assert.throws(()=>R.packageInput({...f,category:'test',weaknesses:['weak']}),/expression_only_failure_required/);});
for(const axis of ['understanding','specificity','audience_value','grounded'])test('nonexpressive failure '+axis+' cannot invoke provider editing',()=>{const f=fixture();f.review.quality[axis].verdict='fail';assert.throws(()=>R.packageInput({...f,category:'test',weaknesses:['weak']}));});
test('matching raw text or a claimed score never establishes semantic support',()=>{const b=bundle(),r=raw(b);r.sentences[0].text='絶対に健康になります。';assert.throws(()=>R.adapt(b,r));});
function gate(){const budget=require('./editorial-budget-fixture.cjs').fixture(),b=bundle(),now=budget.now;const proof={sourceHash:b.pack.sourceHash,packageHash:b.hash,observedAt:now-1,validUntil:now+10000,improvementEvidence:'SYNTHETIC editorial assessment only'};for(const key of ['localRepairsExhausted','noReusableVerifiedCache','expectedImprovementSupported','organizationCapacityVerified','ownerCapacityVerified','freePlanConfirmed','moneyBudgetVerified','persistentClaimAvailable','auditHealthy','duplicateAbsent','noUnknownConsumption','reviewReserved','semanticReviewAvailable'])proof[key]=true;return {bundle:b,generation:{sourceHash:b.pack.sourceHash,result:null,attempts:2,diagnostic:{cause:'F'}},proof,budget,now};}
test('even a fully eligible offline preparation has no send permission',()=>{const r=R.assess(gate());assert.equal(r.candidate,true);assert.equal(r.sendEnabled,false);assert.equal(r.maxWriterCalls,1);assert.equal(r.maxAutomaticRetries,0);});
for(const key of ['localRepairsExhausted','noReusableVerifiedCache','expectedImprovementSupported','organizationCapacityVerified','ownerCapacityVerified','freePlanConfirmed','moneyBudgetVerified','persistentClaimAvailable','auditHealthy','duplicateAbsent','noUnknownConsumption','reviewReserved','semanticReviewAvailable'])test('missing '+key+' holds with zero calls',()=>{const g=gate();g.proof[key]=false;const r=R.assess(g);assert.equal(r.candidate,false);assert.ok(r.holds.includes(key));assert.equal(r.groqCalls,0);});
for(const cause of ['A','B','C','E','G','H'])test('failure cause '+cause+' cannot fall through to Groq',()=>{const g=gate();g.generation.diagnostic.cause=cause;assert.equal(R.assess(g).candidate,false);});
test('local result, stale proof and mismatched identity each hold',()=>{for(const mutate of [g=>g.generation.result={},g=>g.proof.validUntil=1,g=>g.proof.sourceHash='other',g=>g.proof.packageHash='other',g=>g.proof.improvementEvidence='']){const g=gate();mutate(g);assert.equal(R.assess(g).candidate,false);}});

test('local generation from another source cannot qualify for this package',()=>{const g=gate();g.generation.sourceHash='other';assert.equal(R.assess(g).candidate,false);});
test('posted or mutated package cannot prepare output or qualify for editing',()=>{const b=bundle(),clone=structuredClone(b);assert.throws(()=>R.request(clone),/trusted_editorial_bundle_required/);b.pack.features[0].content='invented';assert.throws(()=>R.adapt(b,raw(b)),/trusted_editorial_bundle_required/);const g=gate();g.bundle=structuredClone(g.bundle);assert.equal(R.assess(g).candidate,false);});
