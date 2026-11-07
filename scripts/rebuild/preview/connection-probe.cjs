'use strict';
// Private storage is real. All model responses are closed local fixtures. The
// capability cannot be posted/serialized and never grants live authorization.
const fs=require('node:fs'),C=require('../../../lib/urenavi-core/contracts'),CP=require('../../../lib/urenavi-core/comparison-policy'),N=require('../../../lib/urenavi-core/provider-limited-calibration'),Run=require('../../../lib/urenavi-core/comparison-runner'),Dispatch=require('../../../lib/urenavi-core/comparison-dispatch'),D=require('../../../lib/urenavi-core/comparison-diagnostics'),Caps=require('../../../lib/urenavi-core/connection-probe-capability'),Store=require('./comparison-persistence'),{assertDisarmed}=require('./blob-roundtrip-probe.cjs');
async function probe({blob,env=process.env,id,scenario='success',clock=Date.now}){
 assertDisarmed(env);const cap=Caps.create(id,scenario),actual=Store.create(blob),before={...await actual.prior(),comparison:await actual.inspect()},prefix='urenavi-connection-probes/'+id;
 const map=k=>k.startsWith(CP.PREFIX+'/')?prefix+k.slice(CP.PREFIX.length):k;
 const isolated={get:(k,o)=>blob.get(map(k),o),head:k=>blob.head(map(k)),async put(k,v,o){const key=map(k);if(!key.startsWith(prefix+'/'))throw Error('probe_write_scope');if(scenario==='save-failure'&&key.endsWith('/calibration.json'))throw Error('synthetic_save_failure');return blob.put(key,v,o);}};
 const store=Store.create(isolated,{directory:cap.directory}),evidence=await store.prior(),managedNamespace=await store.inspect(),now=clock(),sha=env.VERCEL_GIT_COMMIT_SHA;
 const accountEvidence={source:'authenticated Groq Console read-only',organization:'Personal',project:'Default Project',plan:'Free',model:C.MODEL,rpm:30,rpd:1000,tpm:8000,tpd:200000,projectCustomLimits:false,splitApplicability:'unknown',observedAt:now,validUntil:now+60000,reference:'SYNTHETIC CONNECTION PROBE; NOT LIVE ACCOUNT EVIDENCE',synthetic:true};
 const snapshot=N.build({template:require('../../../docs/rebuild-20261028/p3-free-calibration-ready-20261106/approval-pending.json').snapshot,...evidence,namespace:managedNamespace,accountEvidence,now,executionSha:sha,prefix:CP.PREFIX,wireHash:CP.WIRE_HASH,experimentId:CP.EXPERIMENT_ID,runtimeMode:'offline'});
 Object.assign(snapshot.grant,{explicitUserApproval:true,approvalReference:'SYNTHETIC OFFLINE ONLY',expiresAt:now+55000,approvedExecutionSha:sha,estimatedInputAccepted:true,providerCountMayExceedReservationAccepted:true,noMinuteHeadroomAccepted:true,residualRiskApprovalReference:'SYNTHETIC OFFLINE ONLY',providerLimitRejectionAccepted:true,unmanagedUsageUnknownAccepted:true,capacityPolicyApprovalReference:'SYNTHETIC OFFLINE ONLY'});
 const options={estimateProfileEnabled:true,executionSha:sha,managedNamespace,timeoutMs:scenario==='timeout'?20:5000},facts=CP.validate({snapshot,...evidence,...options,now,runtimeMode:'offline',directory:cap.directory}),stages=[];
 const args={store,comparisonRun:Run.run,snapshot,evidence,facts,options,clock,runtimeMode:'offline',directory:cap.directory,http:cap.http,nonInferenceProbe:cap,onStage:s=>stages.push(s)};let result=null,error=null,duplicate=null;
 try{result=await Dispatch.dispatch(args);if(scenario==='duplicate')try{await Dispatch.dispatch(args);}catch(e){duplicate=D.summary(e);}}catch(e){error=D.summary(e);}
 const journals=await store.inspect(),after={...await actual.prior(),comparison:await actual.inspect()};
 if(C.hash(before)!==C.hash(after))throw Error('protected_records_changed');
 fs.rmSync(cap.directory,{recursive:true,force:true});
 const l=journals.calibration.value,t=journals.transport.value;
 return {status:'non_inference_connection_observed',sourceSha:sha,scenario,probePrefix:prefix,nonInference:true,syntheticFacts:true,inferenceCalls:0,mockCalls:cap.calls(),stages,resultStatus:result?.status??null,error,duplicate,claimExists:journals.claim.exists,calibrationExists:journals.calibration.exists,transportExists:journals.transport.exists,reserved:l?.reserved??null,spent:l?.spent??null,halt:l?.halt??null,transportHalt:t?.halt??null,publication:false,copyable:false,protectedRecordsUnchanged:true,protectedRecordsHash:C.hash(before),existingClaimHash:before.comparison.claim.exists?C.hash(before.comparison.claim.value):null,existingClaimReservation:before.comparison.claim.value?.reservation??null};
}
module.exports={probe};
