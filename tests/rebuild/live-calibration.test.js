'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=require('../../lib/urenavi-core/calibration-runner'),L=require('../../lib/urenavi-core/live-calibration'),A=require('../../lib/urenavi-core/admission'),C=require('../../lib/urenavi-core/contracts'),W=require('../../lib/urenavi-core/chat-wire');
const frozen=require('../../docs/rebuild-20261028/p3-first-call-gate/first-call-plan.json');
const T=require('../../lib/urenavi-core/isolated-transport');
function args(){
 const usage={prompt_tokens:2700,completion_tokens:1000,total_tokens:3700,completion_tokens_details:{reasoning_tokens:950}};
 return {runtimeMode:'live-calibration',directory:L.STATE_DIRECTORY,item:frozen.selected.source,clock:()=>100,calibrationProfile:'first-call-1000',mockAuthentication:null,liveAuthorization:()=> 'Bearer private-test-canary',grant:{mode:'live-one-call',maxRequests:1,stage:'draft',model:C.MODEL,wireHash:L.WIRE_HASH,expiresAt:1000,experimentKind:'limited-calibration',approvalReference:'synthetic offline test, not real permission',uncertainConsumptionAccepted:true},evidence:{kind:'limited-experiment-estimate',wireHash:L.WIRE_HASH,inputReservation:5000,providerBoundCertified:false,uncertaintyAcknowledged:true},account:{mode:'live-calibration',organization:'Personal',projectName:'Default Project',id:'synthetic-account',day:'synthetic-day',context:131072,input:128072,output:3000,perRequest:8000,rpm:30,tpm:8000,dailyTokens:200000,dailyRequests:1000,otherTokens:0,otherRequests:0,otherWindowTokens:0,otherWindowRequests:0,validUntil:1000,stageInputs:{draft:5000,review:5000,rewrite:5000,rereview:5000},splitApplicability:'not-applicable',verification:{observedAt:90,confirmedBy:'synthetic test operator',source:'synthetic snapshot',resetDescription:'synthetic reset',unresolvedRequests:0,unresolvedReservations:0},project:{rpm:30,tpm:8000,dailyTokens:200000,dailyRequests:1000,otherTokens:0,otherRequests:0,otherWindowTokens:0,otherWindowRequests:0}},isolation:{mode:'live-calibration',allCallersPaused:true,observedAt:90,exclusiveUntil:1000,coverage:'synthetic callers only',confirmedBy:'synthetic operator',holdUntilReconciled:true,callers:Object.fromEntries(L.CALLERS.map(k=>[k,{paused:true,evidence:'synthetic paused'}]))},http:async(url,o)=>{assert.equal(url,W.ENDPOINT);assert.equal(o.redirect,'error');assert.equal(o.headers.Authorization,'Bearer private-test-canary');assert.equal(C.hash(JSON.parse(o.body)),L.WIRE_HASH);return {url,status:200,json:async()=>({model:C.MODEL,choices:[{finish_reason:'stop',message:{role:'assistant',content:'{}'}}],usage})};}};
}
test('live mode validation refuses unknown facts before state creation or credential access',async()=>{
 const cases={split:a=>delete a.account.splitApplicability,splitValues:a=>{a.account.splitApplicability='applicable';a.account.splitTokens={itpm:null};},remaining:a=>delete a.account.otherTokens,project:a=>delete a.account.project,organization:a=>a.account.organization='other',unresolved:a=>a.account.verification.unresolvedRequests=1,noReset:a=>delete a.account.verification.resetDescription,future:a=>a.account.verification.observedAt=101,expiry:a=>a.account.validUntil=100,hold:a=>a.isolation.holdUntilReconciled=false,permission:a=>delete a.grant.approvalReference,risk:a=>a.grant.uncertainConsumptionAccepted=false,wire:a=>a.grant.wireHash='wrong',source:a=>a.item={...a.item,catchcopy:'changed'},directory:a=>a.directory='/tmp/other-live-ledger'};
 for(const k of L.CALLERS)cases[k]=a=>a.isolation.callers[k].paused=false;
 for(const [name,change]of Object.entries(cases)){
  const a=args();change(a);let calls=0,auth=0;a.http=async()=>{calls++;};a.liveAuthorization=()=>{auth++;return 'Bearer private-test-canary';};
  await assert.rejects(R.run(a),undefined,name);assert.equal(calls,0,name);assert.equal(auth,0,name);
 }
 assert.throws(()=>A.validate(args().account),/capacity_unverified/); // Ordinary engine remains offline-only.
});
test('offline-guarded simulated live round trips enforce one-shot journals and protect credential',async()=>{
 // Never overwrite any real attempt: reserve the real fixed path only when it is absent.
 assert.equal(fs.existsSync(L.STATE_DIRECTORY),false,'live state exists: tests must not touch it');
 const scenarios=['success','429','timeout','unknownUsage','overInput','unfinished','secretError','authError','saveFailure'];
 for(const mode of scenarios){
  const a=args(),http=a.http;let calls=0,auth=0;
  a.liveAuthorization=()=>{auth++;if(mode==='authError')throw Error('private-test-canary');return 'Bearer private-test-canary';};
  a.timeoutMs=5;
  a.http=async(...v)=>{calls++;assert.ok(fs.existsSync(path.join(a.directory,'calibration.json')));assert.ok(fs.existsSync(path.join(a.directory,'http/transport.json')));if(mode==='timeout')return new Promise(()=>{});if(mode==='secretError')throw Error('private-test-canary');if(mode==='429')return {status:429,url:W.ENDPOINT};const r=await http(...v),b=await r.json();if(mode==='unknownUsage')delete b.usage;if(mode==='overInput')b.usage={prompt_tokens:5001,completion_tokens:100,total_tokens:5101};if(mode==='unfinished')b.choices[0].finish_reason='length';return {...r,headers:{get:k=>({'x-ratelimit-remaining-tokens':'4300','x-ratelimit-reset-tokens':'12.5s','x-ratelimit-limit-requests':'private-test-canary','x-ratelimit-reset-requests':'private-test-canary'}[k]??null)},json:async()=>b};};
  if(mode==='saveFailure')a.save=()=>{throw Error('private-test-canary');};
  try{
   if(mode==='success'){
    const result=await R.run(a);assert.equal(result.publication,false);assert.equal(result.output,undefined);assert.equal(result.httpStatus,200);assert.equal(result.usage.reasoning_tokens,950);assert.equal(result.rateLimits.tokenRemaining,4300);assert.equal(result.rateLimits.tokenReset,'12.5s');assert.equal(result.rateLimits.requestLimit,null);assert.equal(result.rateLimits.requestReset,null);
    const l=JSON.parse(fs.readFileSync(path.join(a.directory,'calibration.json')));assert.equal(l.spent+l.reserved,6000);assert.equal(l.halt,'calibration_complete_hold');A.validateEvents(l);
   }else await assert.rejects(R.run(a),/calibration_stopped/);
   await assert.rejects(R.run(a));assert.equal(calls,['authError','saveFailure'].includes(mode)?0:1,mode);assert.ok(auth<=1);
   for(const f of ['calibration.json','http/transport.json'])if(fs.existsSync(path.join(a.directory,f))){const s=fs.readFileSync(path.join(a.directory,f),'utf8');assert.ok(!s.includes('private-test-canary'));assert.ok(!s.includes('Authorization'));}
   if(mode==='unfinished'){const j=JSON.parse(fs.readFileSync(path.join(a.directory,'http/transport.json')));assert.equal(Object.values(j.attempts)[0].reportedUsage.reasoning_tokens,950);assert.equal(Object.values(j.attempts)[0].httpStatus,200);}
  }finally{fs.rmSync(L.STATE_DIRECTORY,{recursive:true,force:true});}
 }
});
test('direct live transport cannot omit the verified runner context',()=>{
 assert.throws(()=>T.create({directory:path.join(L.STATE_DIRECTORY,'http'),calibrationProfile:'first-call-1000',journalMode:'usage-only',liveAuthorization:()=> 'Bearer private-test-canary'}),/live_transport_context_required/);
});
test('tampered durable capacity journal blocks credential access and HTTP',async()=>{
 assert.equal(fs.existsSync(L.STATE_DIRECTORY),false,'must not overwrite a real attempt');
 const a=args();let calls=0,auth=0;
 a.liveAuthorization=()=>{auth++;return 'Bearer private-test-canary';};a.http=async()=>{calls++;};
 a.save=(file,value)=>{fs.writeFileSync(file,JSON.stringify({...value,reserved:5999}));};
 try{await assert.rejects(R.run(a),/calibration_stopped/);assert.equal(calls,0);assert.equal(auth,0);}finally{fs.rmSync(L.STATE_DIRECTORY,{recursive:true,force:true});}
});
