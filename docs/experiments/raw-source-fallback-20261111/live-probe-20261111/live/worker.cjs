'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root='/vercel/raw-source',base='/vercel/raw-acquisition-20261111-final-v6',dir=base+'/live-probe-20261111';
const A=require(root+'/lib/room-writer-raw/acquisition'),S=require(root+'/lib/room-writer-raw/source'),R=require(root+'/lib/room-writer-raw/route'),AU=require(root+'/lib/room-writer-raw/audit'),Safety=require(root+'/lib/room-writer-raw/safety');
function once(name,value){const file=dir+'/'+name,fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const d=fs.openSync(dir,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
const read=n=>JSON.parse(fs.readFileSync(n,'utf8'));let calls=0;
(async()=>{
 assert(process.env.GROQ_API_KEY,'server_key_missing');const claim=fs.openSync(dir+'/worker.once','wx',0o600);fs.closeSync(claim);
 const evidence=read(base+'/candidate-evidence.json'),consent=read(dir+'/user-approval.json'),sha=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 assert.equal(sha,evidence.executionSha);assert.equal(cp.execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),'');
 const capture=read(base+'/capture.json').captures[1];assert(A.verify(capture));const prepared=await R.prepareFallback({item:capture.originalItem,assessLocal:()=>evidence.quality});assert.equal(prepared.status,'fallback_prepared_not_authorized');assert.equal(prepared.bundle.requestHash,consent.requestHash);assert.equal(S.hash(prepared.quality),consent.qualityHash);assert.equal(consent.executionSha,sha);assert.equal(consent.authorized,true);assert.equal(consent.acceptUnknownCapacity,true);assert(Date.now()<consent.expiresAt);
 const audit=AU.open({directory:evidence.directory});assert.deepEqual(audit.state(),evidence.state);
 once('ready.json',{ready:true,executionSha:sha,requestHash:prepared.bundle.requestHash,sourceHash:prepared.bundle.envelope.sourceHash,keyConfigured:true,keyWrittenToFile:false,providerCalls:0,at:Date.now()});
 const waitUntil=Math.min(consent.expiresAt,Date.now()+600000);while(!fs.existsSync(dir+'/dispatch-permit.json')){if(Date.now()>=waitUntil)throw Error('dispatch_permit_wait_expired');await new Promise(r=>setTimeout(r,250));}
 const permit=read(dir+'/dispatch-permit.json');assert.equal(permit.requestHash,prepared.bundle.requestHash);assert.equal(permit.source,'owner_console_observation');assert.equal(permit.networkPolicy,'api.groq.com_only');assert(permit.limits.observedAt<=Date.now()&&Date.now()-permit.limits.observedAt<60000);assert(Date.now()<consent.expiresAt);
 const state=audit.state();assert.equal(state.attemptsTotal,0);assert.equal(state.unresolved,false);assert.equal(state.halt,false);
 // The fresh zero observation covers only this independent ledger. Global history/balances remain unknown and were explicitly accepted.
 const now=Date.now(),approval={...evidence.target.template,authorized:true,acceptUnknownCapacity:true,expiresAt:Math.min(consent.expiresAt,permit.limits.observedAt+60000)};
 const capacity={remainingMinuteTokens:null,remainingDailyTokens:null,remainingDailyRequests:null,observedAt:now,noUnknownConsumption:!state.unresolved,exclusive:true};
 const observedUsage={source:'independent_audit',coverage:'partial',window:'minute',periodStart:now-1000,periodEnd:now,observedAt:now,calls:state.minuteRequests,promptTokens:0,completionTokens:0,totalTokens:state.minuteTokens};assert.equal(observedUsage.totalTokens,0);
 const gate=Safety.admit({bundle:prepared.bundle,quality:prepared.quality,approval,limits:permit.limits,capacity,observedUsage,state,executionSha:sha,now});
 once('admission.json',{gate,approval,userConsent:consent,scope:{noUnknownConsumption:'only this independent ledger; not a global usage assertion',exclusive:'this ledger worker.once and permanent audit lock',globalUsage:null,globalBalances:null}});assert(gate.allow,gate.holds.join(','));
 let provider=null;
 const transport=R.createTransport({apiKey:process.env.GROQ_API_KEY,fetchImpl:async(url,options)=>{
  assert.equal(calls,0);assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(S.hash(JSON.parse(options.body)),consent.requestHash);assert(Date.now()<consent.expiresAt);calls++;
  const start=Date.now(),res=await fetch(url,options);let body=null;try{body=await res.clone().json();}catch{}
  const serialized=JSON.stringify(body);const containsSecret=serialized.includes(process.env.GROQ_API_KEY);
  provider={status:res.status,latencyMs:Date.now()-start,headers:Object.fromEntries(['x-request-id','x-groq-request-id','x-ratelimit-limit-requests','x-ratelimit-limit-tokens','x-ratelimit-remaining-requests','x-ratelimit-remaining-tokens','x-ratelimit-reset-requests','x-ratelimit-reset-tokens','retry-after'].map(k=>[k,res.headers.get(k)])),body:containsSecret?null:body,bodyHash:crypto.createHash('sha256').update(serialized).digest('hex'),secretEchoHeld:containsSecret};
  if(containsSecret)throw Error('provider_credential_echo_hold');return res;
 }});
 const result=await R.execute({prepared,approval,limits:permit.limits,capacity,observedUsage,audit,executionSha:sha,transport});
 once('outcome.json',{executionSha:sha,result,provider,actualTransportInvocations:calls,automaticRetries:0,finishedAt:Date.now(),state:audit.state()});
 console.log(JSON.stringify({completed:true,calls,status:result.status,reason:result.reason||null,usage:result.usage||null}));
})().catch(()=>{try{once('worker-held.json',{status:'held_do_not_retry',actualTransportInvocations:calls,at:Date.now(),detailsSuppressed:true});}catch{}console.log(JSON.stringify({held:true,calls,doNotRetry:true}));process.exitCode=1;});
