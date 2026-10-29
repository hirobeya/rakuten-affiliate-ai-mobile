'use strict';
// One calibration only. Live mode is restricted by frozen wire and explicit verified snapshots.
const fs=require('node:fs'),path=require('node:path'),C=require('./contracts'),A=require('./admission'),W=require('./chat-wire'),T=require('./isolated-transport'),L=require('./live-calibration');
function fail(code){throw Object.assign(Error(code),{code});}
function atomic(file,value){const f=file+'.tmp',fd=fs.openSync(f,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(f,file);const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
function reconcile(ledger,journal,response){
 A.validateEvents(ledger);
 if(ledger.status!=='sent_unknown'||ledger.requests!==1||ledger.events.length!==1||ledger.events[0].id!==ledger.attemptId||ledger.events[0].status!=='pending'||ledger.spent!==0||ledger.reserved!==ledger.events[0].tokens)fail('calibration_journal_mismatch');
 if(!journal||journal.version!==1||journal.halt!==null||!journal.attempts||Object.keys(journal.attempts).length!==1)fail('calibration_journal_mismatch');
 const a=journal.attempts[ledger.attemptId];
 if(!a||a.stage!=='draft'||a.status!=='received'||a.requestHash!==ledger.wireHash||C.hash(a.usage)!==C.hash(response.usage)||a.response?.model!==C.MODEL||a.response?.contentHash!==C.hash(response.raw))fail('calibration_journal_mismatch');
 if(!a.reportedUsage||['prompt_tokens','completion_tokens','total_tokens'].some(k=>a.reportedUsage[k]!==response.usage[k]))fail('calibration_journal_mismatch');
 return true;
}
async function run({directory,item,grant,evidence,account,isolation,http,clock=Date.now,save=atomic,timeoutMs=30000,mockAuthentication=null,calibrationProfile=null,runtimeMode='offline',liveAuthorization=null,transportSave=undefined}){
 const guarded=Object.keys(require.cache).some(p=>p.endsWith('/scripts/rebuild/offline-guard.cjs'));
 const live=runtimeMode==='live-calibration';
 if(!live&&runtimeMode!=='offline')fail('runtime_mode_unknown');
 if(!live&&!guarded)fail('offline_guard_required');
 if(!live&&liveAuthorization!==null)fail('live_authentication_forbidden');
 if(live&&!guarded&&http!==undefined)fail('live_http_override_forbidden');
 if(!path.isAbsolute(directory))fail('absolute_directory_required');
 if(calibrationProfile!==null&&calibrationProfile!=='first-call-1000')fail('calibration_profile_unknown');
 const req=C.request('draft',C.source(item)),wire=calibrationProfile?W.compileCalibration1000(req):W.compileRequest(req),wireHash=C.hash(wire.body),now=clock();
 if(live)L.validate({directory,wireHash,grant,evidence,account,isolation,now,calibrationProfile,liveAuthorization,mockAuthentication});
 if(!grant||grant.mode!==(live?'live-one-call':'offline-test-only')||grant.maxRequests!==1||grant.stage!=='draft'||grant.model!==C.MODEL||grant.wireHash!==wireHash||!Number.isSafeInteger(grant.expiresAt)||grant.expiresAt<=now)fail('one_call_permission_required');
 const estimated=calibrationProfile==='first-call-1000';
 if(!evidence||evidence.wireHash!==wireHash||!Number.isSafeInteger(estimated?evidence.inputReservation:evidence.inputUpper)||(estimated?evidence.inputReservation:evidence.inputUpper)<0)fail('input_bound_unverified');
 if(estimated?(evidence.kind!=='limited-experiment-estimate'||evidence.inputReservation!==5000||evidence.providerBoundCertified!==false||evidence.uncertaintyAcknowledged!==true||grant.experimentKind!=='limited-calibration'):evidence.kind!=='synthetic-bound')fail('input_bound_unverified');
 if(!isolation||isolation.mode!==(live?'live-calibration':'offline-synthetic')||isolation.allCallersPaused!==true||!Number.isSafeInteger(isolation.exclusiveUntil)||isolation.exclusiveUntil<=now||typeof isolation.coverage!=='string'||!isolation.coverage)fail('shared_consumption_unknown');
 // In the rehearsal, caller-provided account/permission values are synthetic, never real account proof.
 A.validate(account,live?'live-calibration':'offline-synthetic');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const lock=path.join(directory,'calibration.lock'),file=path.join(directory,'calibration.json');
 let fd;try{fd=fs.openSync(lock,'wx',0o600);}catch{fail('calibration_locked');}
 let durable=false,ledger;
 try{
  if(fs.existsSync(file))fail('calibration_already_consumed');
  const attemptId=C.hash({purpose:'first-call-calibration',wireHash,account:account.id});
  ledger={version:1,spent:0,reserved:0,requests:0,events:[],lastClock:0,halt:null,wireHash,attemptId,status:'preparing',publication:false,snapshotHashes:{grant:C.hash(grant),evidence:C.hash(evidence),account:C.hash(account),isolation:C.hash(isolation)}};
  ledger.runtimeMode=runtimeMode;ledger.calibrationProfile=calibrationProfile;ledger.providerBoundCertified=false;
  const n=A.single(account,ledger,estimated?evidence.inputReservation:evidence.inputUpper,attemptId,now,estimated?1000:C.MAX_OUTPUT,live?'live-calibration':'offline-synthetic');
  ledger.status='sent_unknown';await save(file,ledger);durable=true;
  // Recheck expiration after durable writes, immediately before invoking transport.
  const sendAt=clock();if(sendAt<now||sendAt>=Math.min(grant.expiresAt,account.validUntil,isolation.exclusiveUntil))fail('snapshot_expired_before_send');
  const transport=T.create({directory:path.join(directory,'http'),http,timeoutMs,journalMode:'usage-only',save:transportSave,mockAuthentication,calibrationProfile,liveAuthorization:live?liveAuthorization:null,liveContext:live?{grant,evidence,account,isolation,clock}:null});
  const response=await transport(req,{stage:'draft',attemptId});
  if(response.usage.prompt_tokens>n.input||response.usage.completion_tokens>n.output||response.usage.total_tokens>n.total)fail('usage_exceeded_reservation');
  reconcile(ledger,JSON.parse(fs.readFileSync(path.join(directory,'http/transport.json'),'utf8')),response);
  A.settle(ledger,attemptId,response.usage,clock());ledger.spent=response.usage.total_tokens;ledger.reserved=n.total-ledger.spent;
  const received=JSON.parse(fs.readFileSync(path.join(directory,'http/transport.json'),'utf8')).attempts[attemptId];
  ledger.httpStatus=response.status;ledger.reportedUsage=received.reportedUsage;if(live)ledger.rateLimits=received.rateLimits;ledger.usage=response.usage;ledger.status='calibrated_not_published';ledger.halt='calibration_complete_hold';A.validateEvents(ledger);
  // Keep unspent reservation and halt until explicit reconciliation; no next stage, cache or output.
  durable=false;await save(file,ledger);durable=true;
  return {status:ledger.status,wireHash,attemptId,usage:ledger.reportedUsage,httpStatus:ledger.httpStatus,...(live?{rateLimits:ledger.rateLimits}:{}),calls:1,publication:false};
 }catch(e){
  if(ledger){ledger.halt='calibration_stopped_hold';ledger.status='unreconciled';try{await save(file,ledger);durable=true;}catch{durable=false;}}
  // Do not echo exception messages, response headers, authorization or environment values.
  fail('calibration_stopped');
 }finally{fs.closeSync(fd);if(durable)fs.unlinkSync(lock);}
}
module.exports={run,reconcile};
