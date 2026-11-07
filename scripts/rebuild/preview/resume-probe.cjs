'use strict';
const fs=require('node:fs'),C=require('../../../lib/urenavi-core/contracts'),CP=require('../../../lib/urenavi-core/comparison-policy'),N=require('../../../lib/urenavi-core/provider-limited-calibration'),Resume=require('../../../lib/urenavi-core/comparison-resume'),Run=require('../../../lib/urenavi-core/comparison-runner'),Dispatch=require('../../../lib/urenavi-core/comparison-dispatch'),D=require('../../../lib/urenavi-core/comparison-diagnostics'),Caps=require('../../../lib/urenavi-core/connection-probe-capability'),Store=require('./comparison-persistence'),{assertDisarmed}=require('./blob-roundtrip-probe.cjs');
async function probe({blob,env=process.env,id,scenario='success',clock=Date.now}){
 assertDisarmed(env);const cap=Caps.create(id,scenario),actual=Store.create(blob),before={...await actual.prior(),comparison:await actual.inspect(),resume:await actual.inspectResume()},prefix='urenavi-resume-probes/'+id;
 // This read-only assessment MUST pass for the actual fixed incident, even when
 // the subsequent runner exercise uses mock responses and synthetic capacity.
 const actualContext=Resume.assess({namespace:before.comparison,audit:before.resume,prior:before.prior,receipt:before.receipt});
 const map=k=>k.startsWith(CP.PREFIX+'/')?prefix+k.slice(CP.PREFIX.length):k;
 const isolated={get:(k,o)=>blob.get(map(k),o),head:k=>blob.head(map(k)),async put(k,v,o){const key=map(k);if(!key.startsWith(prefix+'/'))throw Error('probe_write_scope');if(scenario==='save-failure'&&key.endsWith('/calibration.json')||scenario==='audit-failure'&&key.endsWith('/handoff.json')||scenario==='http-save-failure'&&key.endsWith('/http/transport.json'))throw Error('synthetic_save_failure');return blob.put(key,v,o);}};
 // Seed the exact preserved permanent claim, create-only. Never create a new
 // experiment ID or write to the actual comparison namespace.
 await isolated.put(CP.PREFIX+'/claimed.json',JSON.stringify(before.comparison.claim.value),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:60});
 const store=Store.create(isolated,{directory:cap.directory}),evidence=await store.prior(),managedNamespace=await store.inspect(),resumeContext=Resume.assess({namespace:managedNamespace,audit:await store.inspectResume(),...evidence,probe:cap}),now=clock(),sha=env.VERCEL_GIT_COMMIT_SHA;
 const accountEvidence={source:'authenticated Groq Console read-only',organization:'Personal',project:'Default Project',plan:'Free',model:C.MODEL,rpm:30,rpd:1000,tpm:8000,tpd:200000,projectCustomLimits:false,splitApplicability:'unknown',observedAt:now,validUntil:now+60000,reference:'SYNTHETIC CONNECTION PROBE; NOT LIVE ACCOUNT EVIDENCE',synthetic:true};
 const snapshot=N.build({template:require('../../../docs/rebuild-20261028/p3-free-calibration-ready-20261106/approval-pending.json').snapshot,...evidence,namespace:managedNamespace,accountEvidence,now,executionSha:sha,prefix:CP.PREFIX,wireHash:CP.WIRE_HASH,experimentId:CP.EXPERIMENT_ID,runtimeMode:'offline',resumeContext});
 Object.assign(snapshot.grant,{explicitUserApproval:true,approvalReference:'SYNTHETIC OFFLINE ONLY',expiresAt:now+55000,approvedExecutionSha:sha,estimatedInputAccepted:true,providerCountMayExceedReservationAccepted:true,noMinuteHeadroomAccepted:true,residualRiskApprovalReference:'SYNTHETIC OFFLINE ONLY',providerLimitRejectionAccepted:true,unmanagedUsageUnknownAccepted:true,capacityPolicyApprovalReference:'SYNTHETIC OFFLINE ONLY',resumeApproved:true});
 const options={estimateProfileEnabled:true,executionSha:sha,managedNamespace,resumeContext,timeoutMs:scenario==='timeout'?20:5000},facts=CP.validate({snapshot,...evidence,...options,now,runtimeMode:'offline',directory:cap.directory}),stages=[];
 const args={store,comparisonRun:Run.run,snapshot,evidence,facts,options,clock,runtimeMode:'offline',directory:cap.directory,http:cap.http,nonInferenceProbe:cap,resumeContext,onStage:s=>stages.push(s)};let result=null,error=null,duplicate=null,concurrent=null;
 try{
  if(scenario==='concurrent'){const values=await Promise.allSettled([Dispatch.dispatch(args),Dispatch.dispatch({...args,store:Store.create(isolated,{directory:cap.directory})})]);concurrent={fulfilled:values.filter(x=>x.status==='fulfilled').length,rejected:values.filter(x=>x.status==='rejected').length};result=values.find(x=>x.status==='fulfilled')?.value;if(!result)throw Error('concurrent_failed');}
  else result=await Dispatch.dispatch(args);
 }catch(e){error=D.summary(e);}
 // Every outcome, including a pre-transport save failure, is burned forever.
 try{await Dispatch.dispatch(args);}catch(e){duplicate=D.summary(e);}
 const journals=await store.inspect(),audit=await store.inspectResume(),after={...await actual.prior(),comparison:await actual.inspect(),resume:await actual.inspectResume()};
 if(C.hash(before)!==C.hash(after)||C.hash(journals.claim.value)!==actualContext.claimHash)throw Error('protected_records_changed');
 fs.rmSync(cap.directory,{recursive:true,force:true});const l=journals.calibration.value;
 return {status:'non_inference_resume_observed',sourceSha:sha,scenario,probePrefix:prefix,nonInference:true,syntheticFacts:true,inferenceCalls:0,mockCalls:cap.calls(),stages,resultStatus:result?.status??null,error,duplicate,concurrent,claimHash:actualContext.claimHash,claimUnchanged:true,calibrationExists:journals.calibration.exists,transportExists:journals.transport.exists,resumeCount:audit.attempt.value?.resumeCount??null,resumeAttempt:audit.attempt.exists,resumeHandoff:audit.handoff.exists,resumeTerminal:audit.terminal.value?.state??null,additionalReservation:audit.attempt.value?.additionalReservation??null,reserved:l?.reserved??null,spent:l?.spent??null,publication:false,copyable:false,actualResumeAuditCreated:false,actualEvidenceAccepted:true,actualEvidenceHash:actualContext.evidenceHash,protectedRecordsUnchanged:true,protectedRecordsHash:C.hash(before)};
}
module.exports={probe};
