'use strict';
// Only the fixed comparison namespace is writable; old evidence is read-only.
const fs=require('node:fs'),path=require('node:path'),C=require('../../../lib/urenavi-core/contracts'),CP=require('../../../lib/urenavi-core/comparison-policy'),R=require('../../../lib/urenavi-core/failed-calibration-reconciliation'),Old=require('./persistence');
const D=require('../../../lib/urenavi-core/comparison-diagnostics'),Resume=require('../../../lib/urenavi-core/comparison-resume');
function fail(){throw Error('comparison_persistence_hold');}
function create(blob,{directory=CP.STATE_DIRECTORY}={}){
 const versions=new Map();
 async function read(name){const r=await blob.get(name,{access:'private',useCache:false});if(!r||r.statusCode!==200||!r.stream)fail();return {value:JSON.parse(await new Response(r.stream).text()),etag:r.blob?.etag};}
 async function put(name,value,overwrite=false){
  const claim=name.endsWith('/claimed.json'),stage=claim?'claim_readback':'reservation_save',etag=overwrite?versions.get(name):null;let r,before,confirmed,after;
  try{r=await blob.put(name,JSON.stringify(value),{access:'private',addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{}),contentType:'application/json',cacheControlMaxAge:60});}catch{throw D.persistence(claim?'claim_write':'reservation_save','write_failed');}
  // GET's response validator is not the stored object version. Real private
  // Blob GET and PUT returned different ETags even for identical JSON. Use the
  // metadata API's version, bracketing the uncached content read to detect races.
  try{before=await blob.head(name);confirmed=await read(name);after=await blob.head(name);}catch{throw D.persistence(stage,'read_failed');}
  if(typeof r?.etag!=='string'||!r.etag||typeof before?.etag!=='string'||!before.etag||typeof after?.etag!=='string'||!after.etag)throw D.persistence(stage,'version_missing');
  if(before.etag!==r.etag||after.etag!==r.etag)throw D.persistence(stage,'version_mismatch');
  if(C.hash(confirmed.value)!==C.hash(value))throw D.persistence(stage,'body_mismatch');
  versions.set(name,r.etag);
 }
 async function prior(){const journals=await Old.create(blob).inspect();const {value:receipt}=await read(Old.PREFIX+'/reconciliation-v1.json');R.verifyReceipt(receipt,journals);return {prior:journals,receipt};}
 async function claim(snapshot,evidence,{capacityBasis=null}={}){
  if(snapshot?.grant?.experimentId!==CP.EXPERIMENT_ID||snapshot.grant.wireHash!==CP.WIRE_HASH||C.hash(evidence.receipt)!==snapshot.grant.receiptHash)fail();
  const current=await prior();if(C.hash(current)!==C.hash(evidence))fail();
  const namespace=await inspect();if(Object.values(namespace).some(x=>x.exists))throw D.persistence('claim_write','existing_claim');
  if(snapshot.capacityProof?.kind==='provider-limited-one-shot-v1'&&snapshot.capacityProof.namespaceHash!==C.hash(namespace))fail();
  await put(CP.PREFIX+'/claimed.json',{version:1,experimentId:CP.EXPERIMENT_ID,wireHash:CP.WIRE_HASH,snapshotHash:C.hash(snapshot),evidenceHashes:Object.fromEntries(['grant','inputProof','capacityProof','isolation'].map(k=>[k,C.hash(snapshot[k])])),capacityBasis,profile:snapshot.grant.profile||'provider-certified-comparison',inputReservationKind:snapshot.inputProof?.kind==='fixed-wire-input-estimate'?'estimate':'provider-upper-bound',providerBoundCertified:snapshot.inputProof?.kind==='provider-input-upper-bound',verifiedInputUpper:snapshot.inputProof?.kind==='provider-input-upper-bound'?snapshot.inputProof.upperTokens:null,...(snapshot.inputProof?.manifestHash?{inputManifestHash:snapshot.inputProof.manifestHash}: {}),reservationInput:5000,reservationOutput:3000,receiptHash:C.hash(current.receipt),reservation:8000,state:'claimed_hold',publication:false});
 }
 async function save(file,value){const relative=path.relative(directory,file);if(!['calibration.json',path.join('http','transport.json')].includes(relative))fail();await put(CP.PREFIX+'/'+relative.split(path.sep).join('/'),value,true);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.tmp',fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);}
 async function inspect(){const result={};for(const [key,file]of [['claim','claimed.json'],['calibration','calibration.json'],['transport','http/transport.json']]){const r=await blob.get(CP.PREFIX+'/'+file,{access:'private',useCache:false});if(!r){result[key]={exists:false};continue;}if(r.statusCode!==200||!r.stream)fail();result[key]={exists:true,value:JSON.parse(await new Response(r.stream).text())};}return result;}
 async function inspectResume(){const result={};for(const [key,file]of [['attempt','attempt.json'],['handoff','handoff.json'],['terminal','terminal.json']]){const r=await blob.get(CP.PREFIX+'/resume-v1/'+file,{access:'private',useCache:false});if(!r){result[key]={exists:false};continue;}if(r.statusCode!==200||!r.stream)fail();result[key]={exists:true,value:JSON.parse(await new Response(r.stream).text())};}return result;}
 async function acquireResume(context,snapshot,now){
  const namespace=await inspect(),current=await prior();Resume.requireValid(context,namespace);
  if(!Resume.unused(await inspectResume())||context.receiptHash!==C.hash(current.receipt))throw D.persistence('resume_acquire','resume_already_consumed');
  // Create-only forever: even a readback failure or crash burns this one resume.
  if(context.phase!=='evidence_ready')throw D.persistence('resume_acquire','resume_already_consumed');
  const record={version:1,kind:Resume.KIND,state:'resume_acquired',resumeCount:1,maxResumes:1,experimentId:CP.EXPERIMENT_ID,wireHash:CP.WIRE_HASH,claimHash:context.claimHash,evidenceHash:context.evidenceHash,evidence:context.proof,nonInference:context.nonInference,executionSha:snapshot.grant.approvedExecutionSha,snapshotHash:C.hash(snapshot),acquiredAt:now,reservation:8000,additionalReservation:0,reservationDisposition:'carry_forward_existing_claim',publication:false,copyable:false};
  await put(CP.PREFIX+'/resume-v1/attempt.json',record);return record;
 }
 async function resumeHandoff(attempt,now){const record={version:1,state:'runner_handoff',resumeCount:1,attemptHash:C.hash(attempt),claimHash:attempt.claimHash,at:now,publication:false};await put(CP.PREFIX+'/resume-v1/handoff.json',record);return record;}
 async function resumeTerminal(attempt,{status,diagnostic=null},now){await put(CP.PREFIX+'/resume-v1/terminal.json',{version:1,state:status==='captured_unreviewed'?'completed_private':'stopped_do_not_retry',resumeCount:1,attemptHash:C.hash(attempt),claimHash:attempt.claimHash,at:now,diagnostic,publication:false,copyable:false});}
 return {prior,claim,save,inspect,inspectResume,acquireResume,resumeHandoff,resumeTerminal};

}
module.exports={create};
