'use strict';
// Own, new filesystem only. No imports of old claims, journals, Blob or DB.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {hash}=require('./source');
const VERSION='raw-source-fallback-audit-v2',DIRECTORY_NAME='raw-source-fallback-v2';
function writeOnce(file,data){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(data,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
function open({directory,create=false,budgetTokens=0}={}){
 if(!path.isAbsolute(directory||'')||path.basename(directory)!==DIRECTORY_NAME)throw Error('new_raw_audit_directory_required');
 if(create){
  if(!Number.isSafeInteger(budgetTokens)||budgetTokens<=0||budgetTokens>150000)throw Error('experiment_budget_invalid');
  fs.mkdirSync(directory,{mode:0o700});writeOnce(path.join(directory,'manifest.json'),{version:VERSION,budgetTokens,experimentId:crypto.randomUUID(),auditId:hash(directory)});
 }
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
 if(manifest.version!==VERSION||!Number.isSafeInteger(manifest.budgetTokens)||manifest.budgetTokens<=0||manifest.budgetTokens>150000||typeof manifest.experimentId!=='string'||manifest.auditId!==hash(directory))throw Error('raw_audit_manifest_invalid');
 const state=()=>{
  const names=fs.readdirSync(directory);
  if(names.some(n=>!(/^[a-f0-9]{64}\.(?:attempt|result|review)\.json$/.test(n)||['manifest.json','halt.json','run.lock','initial.once.json'].includes(n))||fs.lstatSync(path.join(directory,n)).isSymbolicLink()))throw Error('raw_audit_unrecognized_entry');
  const initialUsed=names.includes('initial.once.json');if(initialUsed){const used=JSON.parse(fs.readFileSync(path.join(directory,'initial.once.json'),'utf8'));if(used.version!==VERSION||used.experimentId!==manifest.experimentId)throw Error('initial_marker_invalid');}
  const attempts=names.filter(n=>/^[a-f0-9]{64}\.attempt\.json$/.test(n));let spentTokens=0,unresolved=false,minuteRequests=0,minuteTokens=0;const now=Date.now();
  if(initialUsed&&attempts.length!==1)unresolved=true;
  if(names.filter(n=>n.endsWith('.result.json')).some(n=>!names.includes(n.replace('.result.json','.attempt.json'))))throw Error('raw_audit_orphan_result');
  if(names.filter(n=>n.endsWith('.review.json')).some(n=>!names.includes(n.replace('.review.json','.result.json'))))throw Error('raw_audit_orphan_review');
  for(const n of attempts){
   const a=JSON.parse(fs.readFileSync(path.join(directory,n),'utf8'));if(a.version!==VERSION||a.state!=='attempt_started'||hash(a.itemCode)!==n.slice(0,64)||!Number.isSafeInteger(a.sentAtMs))throw Error('raw_audit_attempt_invalid');
   if(a.sentAtMs>now)unresolved=true;const inMinute=now-a.sentAtMs<60000;if(inMinute)minuteRequests++;
   const result=n.replace('.attempt.json','.result.json'),file=path.join(directory,result);if(!fs.existsSync(file)){unresolved=true;continue;}
   const r=JSON.parse(fs.readFileSync(file,'utf8'));
   if(r.sourceHash!==a.sourceHash||r.requestHash!==a.requestHash||!Number.isSafeInteger(r.tokens)||r.tokens<0||!r.usage||r.tokens!==r.usage.total_tokens||r.tokens!==r.usage.prompt_tokens+r.usage.completion_tokens)unresolved=true;else {spentTokens+=r.tokens;if(inMinute)minuteTokens+=r.tokens;}
   const reviewFile=path.join(directory,n.replace('.attempt.json','.review.json'));
   if(fs.existsSync(reviewFile)){const v=JSON.parse(fs.readFileSync(reviewFile,'utf8'));if(v.sourceHash!==a.sourceHash||v.draftHash!==hash(r.raw)||v.verdict?.publication!==false||v.verdict?.copyable!==false)unresolved=true;}
  }
  return {version:VERSION,experimentId:manifest.experimentId,auditId:manifest.auditId,attemptsTotal:attempts.length,initialUsed,budgetTokens:manifest.budgetTokens,spentTokens,minuteRequests,minuteTokens,unresolved,halt:initialUsed||fs.existsSync(path.join(directory,'halt.json'))||fs.existsSync(path.join(directory,'run.lock'))};
 };
 let lockFd=null;
 return {state,
  begin(bundle,execution){
   const before=state();if(before.halt||before.unresolved)throw Error('raw_audit_held');
   if(execution?.admissionKind==='initial_unknown'&&(before.attemptsTotal!==0||before.initialUsed))throw Error('initial_one_call_already_used');
   const key=hash(bundle.envelope.source.itemCode),file=path.join(directory,key+'.attempt.json');
   if(fs.existsSync(file))throw Error('product_already_attempted');
   lockFd=fs.openSync(path.join(directory,'run.lock'),'wx',0o600);
   try{
    if(execution?.admissionKind==='initial_unknown')writeOnce(path.join(directory,'initial.once.json'),{version:VERSION,experimentId:manifest.experimentId,sourceHash:bundle.envelope.sourceHash,requestHash:bundle.requestHash,approvalHash:execution.approvalHash});
    writeOnce(file,{version:VERSION,itemCode:bundle.envelope.source.itemCode,source:bundle.envelope.source,sourceHash:bundle.envelope.sourceHash,fieldHashes:bundle.envelope.fieldHashes,formattingHistory:bundle.envelope.formattingHistory,
    requestHash:bundle.requestHash,inputHash:bundle.inputHash,reservation:bundle.reservation,state:'attempt_started',sentAtMs:Date.now(),executionSha:execution?.executionSha||null,approvalHash:execution?.approvalHash||null,observedLimits:execution?.limits||null,admissionKind:execution?.admissionKind||'observed',capacityEvidence:execution?.capacityEvidence||null,observedUsage:execution?.observedUsage||null});}
   catch(e){fs.closeSync(lockFd);lockFd=null;throw e;} // lock file remains after write failure
   return key;
  },
  finish(key,record){
   if(lockFd===null)throw Error('raw_audit_lock_required');
   writeOnce(path.join(directory,key+'.result.json'),record);
   if(record.stop){writeOnce(path.join(directory,'halt.json'),{version:VERSION,reason:record.stop});fs.closeSync(lockFd);lockFd=null;return;}
   // Keep the global lock until the independent review status is saved too.
  },
  recordReview(key,record){
   if(lockFd===null)throw Error('raw_audit_lock_required');
   writeOnce(path.join(directory,key+'.review.json'),record);
   const attempt=JSON.parse(fs.readFileSync(path.join(directory,key+'.attempt.json'),'utf8'));
   if(attempt.admissionKind==='initial_unknown'){writeOnce(path.join(directory,'halt.json'),{version:VERSION,reason:'initial_probe_complete_review_required'});fs.closeSync(lockFd);lockFd=null;return;}
   fs.closeSync(lockFd);lockFd=null;fs.unlinkSync(path.join(directory,'run.lock'));
  }
 };
}
module.exports={VERSION,DIRECTORY_NAME,open};
