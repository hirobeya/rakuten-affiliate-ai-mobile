'use strict';
// One draft through the EXISTING request contract and shared transport. No new generator or retry loop.
const fs=require('node:fs'),path=require('node:path'),C=require('./contracts'),A=require('./admission'),P=require('./comparison-policy'),T=require('./isolated-transport'),R=require('./calibration-runner'),O=require('./error-observation');
const Probe=require('./connection-probe-capability'),D=require('./comparison-diagnostics'),Resume=require('./comparison-resume');
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.tmp';const fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);}
async function run({directory=P.STATE_DIRECTORY,snapshot,prior,receipt,clock=Date.now,runtimeMode='offline',http,liveAuthorization=null,save=atomic,transportSave=undefined,timeoutMs=30000,estimateProfileEnabled=false,executionSha=null,managedNamespace=null,nonInferenceProbe=null,resumeContext=null}){
 const guarded=Object.keys(require.cache).some(p=>p.endsWith('/scripts/rebuild/offline-guard.cjs'));
 const probing=Probe.valid(nonInferenceProbe,directory,http);
 if(nonInferenceProbe&&(!probing||runtimeMode!=='offline'||liveAuthorization!==null)||runtimeMode==='offline'&&(!guarded&&!probing||liveAuthorization!==null)||!['offline','live'].includes(runtimeMode)||runtimeMode==='live'&&(typeof liveAuthorization!=='function'||!guarded&&http!==undefined))throw Error('comparison_runtime_configuration');
 const context={snapshot,prior,receipt,clock,runtimeMode,estimateProfileEnabled,executionSha,managedNamespace,resumeContext},check=()=>P.validate({...context,now:clock(),directory});
 if(resumeContext)Resume.requireAcquired(resumeContext,managedNamespace);
 const facts=check();if(!path.isAbsolute(directory))throw Error('absolute_directory_required');fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const lock=path.join(directory,'comparison.lock'),file=path.join(directory,'calibration.json');let fd;try{fd=fs.openSync(lock,'wx',0o600);}catch{throw Error('comparison_locked');}
 let ledger,durable=false,phase='reservation';
 try{
  if(fs.existsSync(file))throw Error('comparison_already_consumed');
  ledger={version:1,wireHash:P.WIRE_HASH,attemptId:P.EXPERIMENT_ID,experimentId:P.EXPERIMENT_ID,runtimeMode:'live-comparison',status:'preparing',spent:0,reserved:0,requests:0,events:[],lastClock:0,halt:null,publication:false,copyable:false,receiptHash:facts.receiptHash,retainedOldDaily:6000,snapshotHash:C.hash(snapshot),capacityBasis:facts.capacityBasis,profile:facts.profile,inputReservationKind:facts.inputReservationKind,providerBoundCertified:facts.providerBoundCertified,...(facts.manifestHash?{inputManifestHash:facts.manifestHash}: {})};
  A.single(facts.effectiveAccount,ledger,5000,ledger.attemptId,clock(),3000,facts.effectiveAccount.mode);
  if(resumeContext)Object.assign(ledger,{resumeCount:1,originalClaimHash:resumeContext.claimHash,resumeEvidenceHash:resumeContext.evidenceHash,reservationDisposition:'carry_forward_existing_claim',additionalReservation:0});
  if(probing)Object.assign(ledger,{nonInference:true,probeId:nonInferenceProbe.id});
  ledger.status='sent_unknown';phase='reservation_save';await save(file,ledger);durable=true;check();
  phase='transport_setup';const transport=T.create({directory:path.join(directory,'http'),http,timeoutMs,save:transportSave,journalMode:'usage-only',calibrationProfile:'comparison-3000',liveAuthorization:runtimeMode==='live'?liveAuthorization:null,comparisonContext:context,nonInferenceProbe});
  phase='transport';
  const response=await transport(C.request('draft',P.SOURCE),{stage:'draft',attemptId:P.EXPERIMENT_ID});
  if(response.usage.prompt_tokens>5000||response.usage.completion_tokens>3000||response.usage.total_tokens>8000)throw Error('usage_exceeded_reservation');
  phase='reconciliation';R.reconcile(ledger,JSON.parse(fs.readFileSync(path.join(directory,'http/transport.json'),'utf8')),response);
  if(!C.validSchema(response.raw,C.WRITE_SCHEMA))throw Error('comparison_candidate_invalid');
  const candidate=O.sanitizeCandidate(response.raw,C.WRITE_SCHEMA,[]);if(!C.validSchema(candidate,C.WRITE_SCHEMA))throw Error('comparison_candidate_invalid');
  A.settle(ledger,ledger.attemptId,response.usage,clock());ledger.spent=response.usage.total_tokens;ledger.reserved=8000-ledger.spent;ledger.status='captured_unreviewed';ledger.halt='comparison_complete_hold';ledger.usage=response.usage;
  ledger.evaluation={status:'unreviewed',candidate,originalPreserved:false,publication:false,copyable:false,sourceHash:C.hash(P.SOURCE),wireHash:P.WIRE_HASH};
  A.validateEvents(ledger);phase='final_save';durable=false;await save(file,ledger);durable=true;
  // Candidate lives only in the private journal; HTTP result contains no copy text.
  return {status:ledger.status,experimentId:P.EXPERIMENT_ID,wireHash:P.WIRE_HASH,calls:1,usage:response.usage,publication:false,copyable:false};
 }catch(e){
  if(ledger){ledger.status='unreconciled';ledger.halt='comparison_stopped_hold';try{await save(file,ledger);durable=true;}catch{durable=false;}}
  const diagnostic=D.summary(e,phase);throw D.attach(Error('comparison_stopped_do_not_retry'),diagnostic.phase,diagnostic.reason);
 }finally{fs.closeSync(fd);if(durable)fs.unlinkSync(lock);}
}
module.exports={run};
