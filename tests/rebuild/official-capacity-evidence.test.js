'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {MODEL}=require('../../lib/urenavi-core/generation-comparison');
const {importOfficialEvidence,matchesOfficialArtifact,officialWindows,officialEvidenceBlockers}=require('../../lib/urenavi-core/official-capacity-evidence');
const verifiedAt='2026-11-20T08:00:00.000Z';
const minute='2026-11-20T08:00:40.200Z';
const day='2026-11-21T07:59:59.500Z';
const account={organization:'isolated',project:'test',credentialSha256:'1'.repeat(64)};
const base={verifiedAt,model:MODEL,account,plan:'free',billable:false,exclusiveWindow:true,unresolvedSends:0};
const parse=values=>Buffer.from(JSON.stringify(values));
const ready=e=>officialWindows(e,account,Date.parse(verifiedAt),1000,10000);
test('header observations retain only RPD/TPM and bind to exact artifact bytes',()=>{
 const raw=parse({
  'x-ratelimit-limit-requests':'1000','X-RateLimit-Remaining-Requests':'42','x-ratelimit-reset-requests':'23h59m59.5s',
  'x-ratelimit-limit-tokens':'8000','x-ratelimit-remaining-tokens':'5000','x-ratelimit-reset-tokens':'40s200ms'
 });
 const e=importOfficialEvidence({...base,source:'groq_headers',counters:{rpm:{limit:99},tpd:{limit:999}}},raw);
 assert.deepEqual(e.counters,{
  rpm:{limit:null,remaining:null,resetAt:null},rpd:{limit:1000,remaining:42,resetAt:day},
  tpm:{limit:8000,remaining:5000,resetAt:minute},tpd:{limit:null,remaining:null,resetAt:null}
 });
 assert.equal(ready(e),null);
 assert.equal(matchesOfficialArtifact(e,raw),true);
 assert.equal(matchesOfficialArtifact({...e,counters:{...e.counters,rpm:e.counters.rpd}},raw),false);
 assert.equal(matchesOfficialArtifact(e,Buffer.concat([raw,Buffer.from('\n')])),false);
});
test('Console limits without remaining/reset do not constitute confirmation',()=>{
 const capture=Buffer.from('test-only Console capture');
 const observation={...base,source:'groq_console'};
 const partial=importOfficialEvidence({...observation,counters:{rpm:{limit:30}}},capture);
 assert.equal(partial.counters.rpm.remaining,null);
 assert.equal(ready(partial),null);
 const counters={rpm:{limit:30,remaining:5,resetAt:minute},rpd:{limit:1000,remaining:100,resetAt:day},
  tpm:{limit:8000,remaining:7000,resetAt:minute},tpd:{limit:200000,remaining:20000,resetAt:day}};
 const full=importOfficialEvidence({...observation,counters},capture);
 assert.deepEqual(ready(full),{counters});
 const different={...counters,tpm:{...counters.tpm,resetAt:'2026-11-20T08:00:32.000Z'},
  tpd:{...counters.tpd,resetAt:'2026-11-21T07:59:25.000Z'}};
 assert.deepEqual(ready({...full,counters:different}),{counters:different});
 for(const axis of Object.keys(counters)){
  const replace=patch=>ready({...full,counters:{...counters,[axis]:{...counters[axis],...patch}}});
  assert.equal(replace({remaining:null}),null);
  assert.equal(replace({resetAt:'2026-11-20T08:00:10.000Z'}),null);
 }
 assert.equal(officialWindows(full,account,Date.parse(verifiedAt)+60001,1000,10000),null);
 assert.throws(()=>importOfficialEvidence({...observation,counters:{rpm:{limit:9,remaining:10}}},capture),/invalid_official_counter/);
});
test('header artifacts reject credentials, duplicate fields and non-integer counts',()=>{
 const observation={...base,source:'groq_headers'};
 for(const fields of [
  {authorization:'test-secret'}, {'x-ratelimit-limit-requests':'1','X-ratelimit-limit-requests':'2'},
  {'x-ratelimit-remaining-tokens':'0.5'}
 ])assert.throws(()=>importOfficialEvidence(observation,parse(fields)),/invalid_rate_header/);
});

test('diagnostics and actual admission share exactly the same fail-closed predicate',()=>{
 const raw=Buffer.from('test-only Console capture');
 const minuteEnd='2026-11-20T08:00:40.200Z';
 const dayEnd='2026-11-21T07:59:59.500Z';
 const complete=importOfficialEvidence({...base,source:'groq_console',counters:{
  rpm:{limit:30,remaining:10,resetAt:minuteEnd},
  rpd:{limit:1000,remaining:100,resetAt:dayEnd},
  tpm:{limit:8000,remaining:7000,resetAt:minuteEnd},
  tpd:{limit:200000,remaining:20000,resetAt:dayEnd}
 }},raw);
 const timestamp=Date.parse(verifiedAt);
 assert.deepEqual(officialEvidenceBlockers(complete,account,timestamp,1000,10000),[]);
 assert.ok(officialWindows(complete,account,timestamp,1000,10000));
 for(const axis of ['rpm','rpd','tpm','tpd']){
  const partial={...complete,counters:{...complete.counters,[axis]:{...complete.counters[axis],remaining:null}}};
  assert.ok(officialEvidenceBlockers(partial,account,timestamp,1000,10000).includes(axis+'_official_counter_unverified'));
  assert.equal(officialWindows(partial,account,timestamp,1000,10000),null);
 }
 const header={...complete,source:'groq_headers'};
 assert.ok(officialEvidenceBlockers(header,account,timestamp,1000,10000).includes('console_evidence_required'));
 assert.equal(officialWindows(header,account,timestamp,1000,10000),null);
 const notFree={...complete,billable:null};
 assert.ok(officialEvidenceBlockers(notFree,account,timestamp,1000,10000).includes('free_nonbillable_unverified'));
 assert.equal(officialWindows(notFree,account,timestamp,1000,10000),null);
});

