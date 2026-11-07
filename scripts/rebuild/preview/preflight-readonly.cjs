'use strict';
// Deployment-time HTTP verification only. Uses existing runtime credentials in
// place, never returns them, never arms inference and has no execute action.
const C=require('../../../lib/urenavi-core/contracts');
const baseline=require('../../../docs/rebuild-20261028/p3-first-live-20261106/journals-readback.json').journals;
const template=require('../../../docs/rebuild-20261028/p3-free-calibration-ready-20261106/approval-pending.json');
const receipt=require('../../../docs/rebuild-20261028/p3-reconciliation-20261106/receipt-candidate.json').receipt;
function fail(){throw Error('runtime_preflight_unavailable_no_inference');}
async function verify({env=process.env,endpoint,fetchImpl=global.fetch}){
 if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!=='rebuild/urenavi-core-20261028'||!/^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA||'')||['URENAVI_CALIBRATION_LIVE','URENAVI_COMPARISON_LIVE','URENAVI_FREE_CALIBRATION_LIVE'].some(k=>env[k]==='approved-one-call'))fail();
 const url=new URL(endpoint);
 if(url.protocol!=='https:'||!/^rakuten-affiliate-ai-mobile-[a-z0-9]+-hirobeya-6572\.vercel\.app$/.test(url.hostname)||url.pathname!=='/api/calibration'||url.port||url.search||url.hash||url.username||url.password)fail();
 if(!env.VERCEL_OIDC_TOKEN||!env.URENAVI_CALIBRATION_EXECUTION_SECRET)fail();
 const protection={'x-vercel-trusted-oidc-idp-token':env.VERCEL_OIDC_TOKEN};
 const request=(options={})=>fetchImpl(url.href,{redirect:'manual',signal:AbortSignal.timeout(15000),...options});
 const statusResponse=await request({headers:protection});
 if(statusResponse.status!==200)fail();
 const status=await statusResponse.json();
 if(status.sourceSha!==env.VERCEL_GIT_COMMIT_SHA||status.inferenceEnabled!==false||status.comparison?.wireHash!=='ab9f962665d02755d3e2fc683969472466e2da2964e7ce0cb7a13aa3d872d053')fail();
 async function post(action,extra={},authenticated=true){
  if(!['inspect','inspect-comparison','preflight-free-calibration'].includes(action))fail();
  const r=await request({method:'POST',headers:{...protection,'Content-Type':'application/json','x-urenavi-execution-secret':authenticated?env.URENAVI_CALIBRATION_EXECUTION_SECRET:'invalid-preflight-test'},body:JSON.stringify({...extra,action})});
  let body=null;try{body=await r.json();}catch{}
  return {code:r.status,body};
 }
 const old=await post('inspect'),before=await post('inspect-comparison');
 if(old.code!==200||before.code!==200||C.hash(old.body?.journals)!==C.hash(baseline))fail();
 // Fixed input envelope is known; organization inventory and isolation remain
 // absent. Never fabricate administrator attestations or a live approval.
 const snapshot=structuredClone(template.snapshot),now=Date.now();
 snapshot.grant.receiptHash=C.hash(receipt);
 Object.assign(snapshot.inputProof,{receiptHash:C.hash(receipt),observedAt:now,validUntil:now+30000});
 snapshot.capacityProof={kind:'exclusive-ledger-window-v1',ledger:null,validUntil:now+30000};
 const invalid=await post('preflight-free-calibration',{snapshot},false);
 const incomplete=await post('preflight-free-calibration',{snapshot});
 const limited=await post('preflight-free-calibration',{capacityMode:'provider-limited-one-shot-v1'});
 const after=await post('inspect-comparison'),oldAfter=await post('inspect');
 if(invalid.code!==403||incomplete.code!==412||incomplete.body?.status!=='comparison_facts_unverified'||incomplete.body?.reason!=='exclusive_ledger_evidence_unverified'||limited.code!==200||limited.body?.status!=='preflight_passed_not_send_permission'||limited.body.capacityBasis?.organizationCapacityGuaranteed!==false||limited.body.capacityBasis?.unmanagedUsage?.minuteTokens!==null||limited.body.snapshot?.grant?.explicitUserApproval!==false||oldAfter.code!==200||after.code!==200||C.hash(oldAfter.body.journals)!==C.hash(old.body.journals)||C.hash(before.body.journals)!==C.hash(after.body.journals))fail();
 return {status:'authenticated_http_preflight_verified',sourceSha:status.sourceSha,targetInferenceEnabled:false,authenticatedInspection:old.code,wrongSecret:invalid.code,missingFacts:incomplete.code,limitedPreflightHttp:limited.code,controlledAttemptReady:true,organizationCapacityGuaranteed:false,unmanagedUsage:limited.body.capacityBasis.unmanagedUsage,executionApprovalStillRequired:true,oldJournalsUnchanged:true,oldPermanentClaim:old.body.journals.claim.exists,oldReserved:old.body.journals.calibration.value.reserved,comparisonClaimExists:after.body.journals.claim.exists,comparisonCalibrationExists:after.body.journals.calibration.exists,comparisonTransportExists:after.body.journals.transport.exists,inferenceCalls:0};
}
module.exports={verify};
if(require.main===module){const endpoint=process.argv[2]||process.env.URENAVI_PREFLIGHT_TARGET;if(!endpoint)process.stdout.write(JSON.stringify({status:'readonly_http_preflight_not_requested',inferenceCalls:0})+'\n');else verify({endpoint}).then(r=>process.stdout.write(JSON.stringify(r)+'\n')).catch(()=>{process.stderr.write(JSON.stringify({status:'runtime_preflight_unavailable_no_inference',inferenceCalls:0})+'\n');process.exitCode=1;});}
