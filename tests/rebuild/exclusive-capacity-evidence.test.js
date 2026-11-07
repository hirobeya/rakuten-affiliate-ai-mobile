'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const C=require('../../lib/urenavi-core/contracts'),P=require('../../lib/urenavi-core/comparison-policy'),E=require('../../lib/urenavi-core/exclusive-capacity-evidence'),F=require('../../lib/urenavi-core/free-calibration-profile'),Run=require('../../lib/urenavi-core/comparison-runner'),H=require('../../scripts/rebuild/preview/api/calibration'),Store=require('../../scripts/rebuild/preview/comparison-persistence'),Old=require('../../scripts/rebuild/preview/persistence');
const SHA='a'.repeat(40),candidate=require('./fixture.cjs').fixture().draft;
function fixture(){
 const f=require('./comparison-fixture.cjs').fixture(),s=f.snapshot;
 f.now+=86400000;const n=f.now;
 Object.assign(s.grant,{profile:F.NAME,estimatedInputAccepted:true,providerCountMayExceedReservationAccepted:true,noMinuteHeadroomAccepted:true,residualRiskApprovalReference:'SYNTHETIC TEST ONLY',approvedExecutionSha:SHA,expiresAt:n+30000});
 s.inputProof={kind:'fixed-wire-input-estimate',profile:F.NAME,wireHash:P.WIRE_HASH,receiptHash:C.hash(f.receipt),manifestHash:F.MANIFEST_HASH,inputReservation:5000,providerBoundCertified:false,upperTokens:null,observedAt:n,validUntil:n+30000};
 Object.assign(s.account,{plan:'Free',day:new Date(n).toISOString().slice(0,10),validUntil:n+30000});
 Object.assign(s.isolation,{observedAt:n,exclusiveUntil:n+30000,windowStartedAt:n-120000,noSendsSinceWindowStart:true});
 for(const k of E.CALLERS)s.isolation.callers[k].pausedSince=n-120000;
 s.capacityProof={kind:E.KIND,validUntil:n+30000,ledger:{completeOrganizationInventory:true,allCallersReconciled:true,unresolvedRequests:0,unresolvedReservations:0,reference:'synthetic-complete-ledger-not-console-empty-usage',confirmedBy:'offline-test',pendingCheckReference:'synthetic-all-caller-pending-check',coverageStart:n-86400000,coverageEnd:n-120000,reconciledAt:n-100000,callerReferences:Object.fromEntries(E.CALLERS.map(k=>[k,'synthetic-caller-audit'])),requests:[{requestId:f.receipt.requestId,caller:'preview',httpStatus:400,sentAt:f.receipt.providerEvidence.requestedAt,completedAt:f.receipt.providerEvidence.observedAt,terminalResponseConfirmed:true,usage:structuredClone(f.receipt.reportedUsage),reference:'synthetic-old-receipt'}],retainedHolds:[{kind:'retained-budget-hold',id:'synthetic-distinct-historical-hold',tokens:8000,requests:1,reference:'synthetic-historical-budget-not-a-pending-request'}]}};
 return {...f,estimateProfileEnabled:true,executionSha:SHA};
}
function check(f){return P.validate({...f,now:f.now,runtimeMode:'offline'});}
function response(){return {setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};}
function blob(f){
 const data=new Map(),writes=[];let version=0;
 for(const [key,file]of [['claim','claimed.json'],['calibration','calibration.json'],['transport','http/transport.json']])data.set(Old.PREFIX+'/'+file,{body:JSON.stringify(f.prior[key].value),etag:'old'});
 data.set(Old.PREFIX+'/reconciliation-v1.json',{body:JSON.stringify(f.receipt),etag:'receipt'});
 return {data,writes,async get(k,o){assert.equal(o.useCache,false);const d=data.get(k);return d?{statusCode:200,stream:new Blob([d.body]).stream(),blob:{etag:d.etag}}:null;},async put(k,body,o){assert.ok(k.startsWith(P.PREFIX+'/'));if(data.has(k)&&(!o.allowOverwrite||o.ifMatch!==data.get(k).etag))throw Error('CAS conflict');const etag='v'+(++version);data.set(k,{body,etag});writes.push(k);return {etag};}};
}
function env(armed=false){return {VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'rebuild/urenavi-core-20261028',VERCEL_GIT_COMMIT_SHA:SHA,URENAVI_CALIBRATION_ISOLATED_PREVIEW:'1',URENAVI_CALIBRATION_EXECUTION_SECRET:'synthetic-secret',URENAVI_FREE_CALIBRATION_LIVE:armed?'approved-one-call':undefined,BLOB_STORE_ID:'synthetic',GROQ_API_KEY:'synthetic-no-live-key'};}
function live(f){f.snapshot.grant.mode='live-one-call';f.snapshot.account.mode='live-calibration';return f;}
test('derived evidence accepts a complete frozen inventory without claiming an observed provider residual/reset',()=>{
 const f=fixture(),before=C.hash(f),v=check(f);
 assert.equal(v.capacityBasis.providerRemainingObserved,false);assert.equal(v.capacityBasis.providerResetObserved,false);
 assert.equal(v.capacityBasis.headroomKind,'conservative-local-reservation-budget');assert.equal(v.effectiveAccount.otherTokens,14000);assert.equal(v.effectiveAccount.project.otherTokens,14000);assert.equal(v.reservation.total,8000);assert.equal(C.hash(f),before);
});
for(const [name,change]of [
 ['only delayed Usage/absent inventory',f=>{delete f.snapshot.capacityProof.ledger;}],
 ['incomplete inventory',f=>{f.snapshot.capacityProof.ledger.completeOrganizationInventory=false;}],
 ['missing caller audit',f=>{delete f.snapshot.capacityProof.ledger.callerReferences.production;}],
 ['pending request',f=>{f.snapshot.capacityProof.ledger.unresolvedRequests=1;}],
 ['pending reservation',f=>{f.snapshot.capacityProof.ledger.unresolvedReservations=1;}],
 ['audit coverage gap',f=>{f.snapshot.capacityProof.ledger.coverageEnd--;}],
 ['less than24h coverage',f=>{f.snapshot.capacityProof.ledger.coverageStart++;}],
 ['caller stopped after window start',f=>{f.snapshot.isolation.callers.production.pausedSince++;}],
 ['caller still active',f=>{f.snapshot.isolation.callers.production.paused=false;}],
 ['continuity not attested',f=>{f.snapshot.isolation.noSendsSinceWindowStart=false;}],
 ['stale continuity check',f=>{f.snapshot.isolation.observedAt=f.now-60000;}],
 ['new send inside exclusive window',f=>{f.snapshot.capacityProof.ledger.requests[0].sentAt=f.snapshot.isolation.windowStartedAt+1;}],
 ['unknown consumption',f=>{delete f.snapshot.capacityProof.ledger.requests[0].usage;}],
 ['nonterminal response',f=>{f.snapshot.capacityProof.ledger.requests[0].terminalResponseConfirmed=false;}],
 ['429 in audited inventory',f=>{f.snapshot.capacityProof.ledger.requests[0].httpStatus=429;}],
 ['missing old request',f=>{f.snapshot.capacityProof.ledger.requests=[];}],
 ['old usage falsified',f=>{f.snapshot.capacityProof.ledger.requests[0].usage.prompt_tokens++;}],
 ['duplicate request',f=>{f.snapshot.capacityProof.ledger.requests.push(structuredClone(f.snapshot.capacityProof.ledger.requests[0]));}],
 ['old request added as hold',f=>{f.snapshot.capacityProof.ledger.retainedHolds[0].id=f.receipt.requestId;}],
 ['old attempt added as hold',f=>{f.snapshot.capacityProof.ledger.retainedHolds[0].id=f.receipt.attemptId;}],
 ['extra minute consumption',f=>{f.snapshot.account.otherWindowTokens=1;}],
 ['false account day',f=>{f.snapshot.account.day='synthetic';}],
 ['historical hold dropped',f=>{f.snapshot.capacityProof.ledger.retainedHolds=[];}],
 ['expired certificate',f=>{f.snapshot.capacityProof.validUntil=f.now;}],
 ['SHA mismatch',f=>{f.snapshot.grant.mode='live-one-call';f.snapshot.account.mode='live-calibration';f.snapshot.grant.approvedExecutionSha='b'.repeat(40);}]
])test('exclusive ledger denies '+name,()=>{const f=fixture();change(f);assert.throws(()=>P.validate({...f,now:f.now,runtimeMode:f.snapshot.grant.mode==='live-one-call'?'live':'offline'}));});
test('59,999ms is not idle enough, 60,000ms is accepted only with complete audited evidence',()=>{
 const f=fixture(),e=f.snapshot.capacityProof.ledger;e.requests.push({requestId:'req_synthetic_recent',caller:'local-cli',httpStatus:200,sentAt:f.now-130000,completedAt:f.now-59999,terminalResponseConfirmed:true,usage:{prompt_tokens:100,completion_tokens:100,total_tokens:200},reference:'synthetic-terminal'});e.reconciledAt=f.now-1000;
 for(const p of [f.snapshot.account,f.snapshot.account.project]){p.otherTokens+=200;p.otherRequests++;}assert.throws(()=>check(f));e.requests[1].completedAt--;assert.equal(check(f).effectiveAccount.otherTokens,14200);
});
test('daily reservation includes old6000 + distinct8000 + new8000, denies one token past remaining budget',()=>{
 const f=fixture(),h=f.snapshot.capacityProof.ledger.retainedHolds[0];h.tokens=186000;for(const p of [f.snapshot.account,f.snapshot.account.project])p.otherTokens=186000;assert.equal(check(f).effectiveAccount.otherTokens,192000);h.tokens++;for(const p of [f.snapshot.account,f.snapshot.account.project])p.otherTokens++;assert.throws(()=>check(f),/remaining_capacity|token_budget/);
});
test('separate input/output limits are still enforced for derived evidence',()=>{const f=fixture();f.snapshot.account.splitApplicability='applicable';f.snapshot.account.splitTokens={itpm:5000,otpm:2999,otherInput:0,otherOutput:0};assert.throws(()=>check(f),/otpm_capacity/);});
test('disarmed authenticated preflight reads actual store and checks SHA, without claiming, reserving or calling Groq',async()=>{
 const f=live(fixture()),b=blob(f),r=response();await H.create({env:env(),clock:()=>f.now,loadBlob:()=>b,comparisonRun:()=>assert.fail('no inference')})({method:'POST',headers:{'x-urenavi-execution-secret':'synthetic-secret'},body:{action:'preflight-free-calibration',snapshot:f.snapshot}},r);
 assert.equal(r.code,200);assert.equal(r.body.inferenceCalls,0);assert.equal(r.body.status,'preflight_passed_not_send_permission');assert.equal(r.body.capacityBasis.providerRemainingObserved,false);assert.equal(b.writes.length,0);
});
test('preflight rejects reused claim, wrong secret, and old SHA without creating a new claim',async()=>{
 for(const mode of ['claimed','wrong-secret','old-sha']){const f=live(fixture()),b=blob(f),r=response();if(mode==='claimed')await Store.create(b).claim(f.snapshot,{prior:f.prior,receipt:f.receipt});if(mode==='old-sha')f.snapshot.grant.approvedExecutionSha='b'.repeat(40);const before=b.writes.length;await H.create({env:env(),clock:()=>f.now,loadBlob:()=>b,comparisonRun:()=>assert.fail('no inference')})({method:'POST',headers:{'x-urenavi-execution-secret':mode==='wrong-secret'?'wrong':'synthetic-secret'},body:{action:'preflight-free-calibration',snapshot:f.snapshot}},r);assert.equal(r.code,mode==='claimed'?409:mode==='wrong-secret'?403:412);assert.equal(b.writes.length,before);}
});
test('preflight may check complete facts before approval, but the execute route still refuses even a posted readOnly flag',async()=>{
 const f=live(fixture()),b=blob(f);Object.assign(f.snapshot.grant,{explicitUserApproval:false,approvalReference:null,expiresAt:null,approvedExecutionSha:null,estimatedInputAccepted:false,providerCountMayExceedReservationAccepted:false,noMinuteHeadroomAccepted:false,residualRiskApprovalReference:null});
 const request=action=>({method:'POST',headers:{'x-urenavi-execution-secret':'synthetic-secret'},body:{action,snapshot:f.snapshot,readOnlyFacts:true}}),a=response(),c=response();
 await H.create({env:env(),clock:()=>f.now,loadBlob:()=>b,comparisonRun:()=>assert.fail('no inference')})(request('preflight-free-calibration'),a);assert.equal(a.code,200);assert.equal(a.body.executionApprovalStillRequired,true);assert.equal(b.writes.length,0);
 await H.create({env:env(true),clock:()=>f.now,loadBlob:()=>b,comparisonRun:()=>assert.fail('no inference')})(request('execute-free-calibration'),c);assert.equal(c.code,412);assert.equal(b.writes.length,0);
});
test('preflight without approval still rejects incomplete caller inventory instead of requiring prior execution approval',async()=>{
 const f=live(fixture()),b=blob(f),r=response();Object.assign(f.snapshot.grant,{explicitUserApproval:false,approvalReference:null,expiresAt:null,approvedExecutionSha:null,estimatedInputAccepted:false,providerCountMayExceedReservationAccepted:false,noMinuteHeadroomAccepted:false,residualRiskApprovalReference:null});f.snapshot.capacityProof.ledger=null;
 await H.create({env:env(),clock:()=>f.now,loadBlob:()=>b,comparisonRun:()=>assert.fail('no inference')})({method:'POST',headers:{'x-urenavi-execution-secret':'synthetic-secret'},body:{action:'preflight-free-calibration',snapshot:f.snapshot}},r);assert.equal(r.code,412);assert.equal(r.body.reason,'exclusive_ledger_evidence_unverified');assert.equal(b.writes.length,0);
});
test('armed API still claims once across concurrent invocations and persists the derived basis',async()=>{
 const f=live(fixture()),b=blob(f);let calls=0;const handler=H.create({env:env(true),clock:()=>f.now,loadBlob:()=>b,comparisonRun:async()=>{calls++;return {publication:false,copyable:false};}}),req={method:'POST',headers:{'x-urenavi-execution-secret':'synthetic-secret'},body:{action:'execute-free-calibration',snapshot:f.snapshot}},a=response(),c=response();await Promise.all([handler(req,a),handler(req,c)]);assert.deepEqual([a.code,c.code].sort(),[200,409]);assert.equal(calls,1);const claim=JSON.parse(b.data.get(P.PREFIX+'/claimed.json').body);assert.equal(claim.capacityBasis.providerRemainingObserved,false);assert.equal(claim.reservation,8000);
});
test('claim persistence failure cannot reach transport under the new evidence path',async()=>{
 const f=live(fixture()),b=blob(f),r=response();b.put=async()=>{throw Error('synthetic write failure');};await H.create({env:env(true),clock:()=>f.now,loadBlob:()=>b,comparisonRun:()=>assert.fail('no inference')})({method:'POST',headers:{'x-urenavi-execution-secret':'synthetic-secret'},body:{action:'execute-free-calibration',snapshot:f.snapshot}},r);assert.equal(r.code,409);assert.equal(r.body.copyable,false);
});
test('private audit uses a whitelist and omits extra reasoning/secret-shaped properties',()=>{
 const f=fixture(),e=f.snapshot.capacityProof.ledger;e.reasoning='MUST NOT PERSIST';e.requests[0].reasoning='MUST NOT PERSIST';const v=check(f);assert.ok(!JSON.stringify(v.capacityBasis).includes('MUST NOT PERSIST'));assert.equal(v.capacityBasis.requestAudit[0].usage.total_tokens,3729);
});
for(const status of [200,400,429])test('existing runner/transport with derived evidence HTTP'+status+' keeps private output and one-call stop',async t=>{
 const f=fixture(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'urenavi-ledger-evidence-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));let calls=0;
 const x={...f,directory,clock:()=>f.now,http:async()=>{calls++;return {status,headers:{get:()=>null},json:async()=>{if(status===429)assert.fail('do not wait for429 body');return status===200?{model:C.MODEL,choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(candidate)}}],usage:{prompt_tokens:2729,completion_tokens:1500,total_tokens:4229}}:{error:{code:'json_validate_failed'},usage:{prompt_tokens:2729,completion_tokens:3000,total_tokens:5729}};}};}};
 if(status===200){const r=await Run.run(x);assert.equal(r.publication,false);assert.equal(r.candidate,undefined);}else await assert.rejects(Run.run(x));await assert.rejects(Run.run(x));assert.equal(calls,1);const l=JSON.parse(fs.readFileSync(path.join(directory,'calibration.json')));assert.equal(l.capacityBasis.providerRemainingObserved,false);if(status!==200){assert.equal(l.reserved,8000);assert.equal(l.evaluation,undefined);}
});
