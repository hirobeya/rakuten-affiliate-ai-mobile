'use strict';
// Authenticated HTTP verification; only read-only preflight and fixed mock route.
const C=require('../../../lib/urenavi-core/contracts'),Resume=require('../../../lib/urenavi-core/comparison-resume'),{assertDisarmed}=require('./blob-roundtrip-probe.cjs');
async function verify({env=process.env,endpoint,fetchImpl=global.fetch,emit=()=>{}}){
 assertDisarmed(env);const url=new URL(endpoint),sha=env.VERCEL_GIT_COMMIT_SHA,id=env.URENAVI_RESUME_PROBE_ID;
 if(url.protocol!=='https:'||!/^rakuten-affiliate-ai-mobile-[a-z0-9]+-hirobeya-6572\.vercel\.app$/.test(url.hostname)||url.pathname!=='/api/calibration'||url.port||url.search||url.hash||url.username||url.password||!env.VERCEL_OIDC_TOKEN||!env.URENAVI_CALIBRATION_EXECUTION_SECRET||!/^[a-f0-9]{32}$/.test(id||''))throw Error('invalid_resume_target');
 const headers={'x-vercel-trusted-oidc-idp-token':env.VERCEL_OIDC_TOKEN},request=o=>fetchImpl(url.href,{redirect:'manual',signal:AbortSignal.timeout(55000),...o});
 const g=await request({headers}),info=await g.json();if(g.status!==200||info.sourceSha!==sha||info.inferenceEnabled!==false)throw Error('resume_source_mismatch');
 async function post(body,auth=true){const r=await request({method:'POST',headers:{...headers,'Content-Type':'application/json','x-urenavi-execution-secret':auth?env.URENAVI_CALIBRATION_EXECUTION_SECRET:'invalid-probe-secret'},body:JSON.stringify(body)});return {code:r.status,body:await r.json()};}
 const invalid=await post({action:'probe-resume-connection',probeId:'0'.repeat(32)},false);if(invalid.code!==403)throw Error('resume_authentication_failed');
 const f=await post({action:'preflight-resume-free-calibration'}),b=f.body;
 if(f.code!==200||b.executionApprovalStillRequired!==true||b.resumeAuditCreated!==false||b.resumeClaimHash!==Resume.MANIFEST.claimHash||b.resumeEvidenceHash!==C.hash(Resume.MANIFEST)||b.snapshot?.grant?.resumeApproved!==false||b.snapshot?.grant?.explicitUserApproval!==false||b.capacityBasis?.additionalReservation!==0||b.reservation?.total!==8000)throw Error('resume_actual_evidence_not_ready');
 emit({status:'actual_resume_preflight_verified',http:f.code,sourceSha:sha,claimHash:b.resumeClaimHash,evidenceHash:b.resumeEvidenceHash,additionalReservation:0,reservation:8000,oldRetainedDaily:b.oldRetainedDaily,resumeAuditCreated:false,executionApprovalStillRequired:true,inferenceCalls:0});
 let protectedHash=null;const results=[];
 for(const scenario of ['success','duplicate','concurrent','save-failure','audit-failure','http-save-failure','400','429','timeout']){
  const r=await post({action:'probe-resume-connection',probeId:C.hash({id,scenario}).slice(0,32),scenario}),b=r.body,noCall=['save-failure','audit-failure','http-save-failure'].includes(scenario),success=['success','duplicate','concurrent'].includes(scenario);
  if(r.code!==200||b.nonInference!==true||b.inferenceCalls!==0||b.sourceSha!==sha||b.protectedRecordsUnchanged!==true||b.claimUnchanged!==true||b.claimHash!==Resume.MANIFEST.claimHash||b.actualEvidenceAccepted!==true||b.actualResumeAuditCreated!==false||b.actualEvidenceHash!==C.hash(Resume.MANIFEST)||b.mockCalls!==(noCall?0:1)||b.resumeCount!==1||b.resumeAttempt!==true||b.additionalReservation!==0||!b.duplicate||b.publication!==false||b.copyable!==false)throw Error('resume_scenario_failed_'+scenario);
  if(protectedHash&&protectedHash!==b.protectedRecordsHash)throw Error('resume_protected_changed');protectedHash=b.protectedRecordsHash;
  if(success){if(b.resultStatus!=='captured_unreviewed'||b.spent!==3729||b.reserved!==4271||b.resumeTerminal!=='completed_private')throw Error('resume_mock_success_failed');}else if(!b.error||b.resumeTerminal!=='stopped_do_not_retry')throw Error('resume_failure_not_stopped');
  if(scenario==='concurrent'&&(b.concurrent?.fulfilled!==1||b.concurrent?.rejected!==1))throw Error('resume_concurrency_failed');
  if(b.transportExists!==!noCall||b.calibrationExists!==!['save-failure','audit-failure'].includes(scenario)||b.resumeHandoff!==(scenario!=='audit-failure'))throw Error('resume_journals_failed');
  const summary={status:'resume_connection_case_verified',scenario,http:r.code,mockCalls:b.mockCalls,inferenceCalls:0,resumeCount:b.resumeCount,additionalReservation:b.additionalReservation,claimUnchanged:b.claimUnchanged,protectedRecordsUnchanged:b.protectedRecordsUnchanged,calibrationExists:b.calibrationExists,transportExists:b.transportExists,resumeTerminal:b.resumeTerminal,error:b.error,duplicate:b.duplicate,concurrent:b.concurrent};emit(summary);results.push(summary);
 }
 const after=await post({action:'preflight-resume-free-calibration'});if(after.code!==200||after.body.resumeAuditCreated!==false||after.body.resumeClaimHash!==Resume.MANIFEST.claimHash)throw Error('resume_actual_state_changed');
 return {status:'authenticated_resume_api_runner_blob_verified',sourceSha:sha,cases:results.length,wrongSecret:invalid.code,actualPreflightHttp:f.code,actualResumeAuditCreated:false,protectedRecordsHash:protectedHash,evidenceHash:C.hash(Resume.MANIFEST),inferenceCalls:0};
}
module.exports={verify};
if(require.main===module){const endpoint=process.env.URENAVI_RESUME_API_TARGET;if(!endpoint)process.stdout.write(JSON.stringify({status:'resume_http_not_requested',inferenceCalls:0})+'\n');else verify({endpoint,emit:r=>process.stdout.write(JSON.stringify(r)+'\n')}).then(r=>process.stdout.write(JSON.stringify(r)+'\n')).catch(e=>{process.stderr.write(JSON.stringify({status:'resume_http_hold',reason:/^resume_/.test(e.message)?e.message:'resume_verification_failed',inferenceCalls:0})+'\n');process.exitCode=1;});}
