'use strict';
// Calls ONLY the authenticated mock-only API. No execute action or live grant.
const C=require('../../../lib/urenavi-core/contracts'),{assertDisarmed}=require('./blob-roundtrip-probe.cjs');
async function verify({env=process.env,endpoint,fetchImpl=global.fetch}){
 assertDisarmed(env);const url=new URL(endpoint),sha=env.VERCEL_GIT_COMMIT_SHA;
 if(url.protocol!=='https:'||!/^rakuten-affiliate-ai-mobile-[a-z0-9]+-hirobeya-6572\.vercel\.app$/.test(url.hostname)||url.pathname!=='/api/calibration'||url.port||url.search||url.hash||url.username||url.password||!env.VERCEL_OIDC_TOKEN||!env.URENAVI_CALIBRATION_EXECUTION_SECRET||!/^[a-f0-9]{32}$/.test(env.URENAVI_CONNECTION_PROBE_ID||''))throw Error('invalid_connection_target');
 const headers={'x-vercel-trusted-oidc-idp-token':env.VERCEL_OIDC_TOKEN},request=o=>fetchImpl(url.href,{redirect:'manual',signal:AbortSignal.timeout(55000),...o});
 const g=await request({headers}),info=await g.json();if(g.status!==200||info.sourceSha!==sha||info.inferenceEnabled!==false)throw Error('connection_source_mismatch');
 async function post(body,authenticated=true){const r=await request({method:'POST',headers:{...headers,'Content-Type':'application/json','x-urenavi-execution-secret':authenticated?env.URENAVI_CALIBRATION_EXECUTION_SECRET:'invalid-probe-secret'},body:JSON.stringify(body)});return {code:r.status,body:await r.json()};}
 const invalid=await post({action:'probe-comparison-connection',probeId:'0'.repeat(32)},false);if(invalid.code!==403)throw Error('probe_authentication_failed');
 const results=[];let protectedHash=null;
 for(const scenario of ['success','400','429','timeout','save-failure','duplicate']){
  const r=await post({action:'probe-comparison-connection',probeId:C.hash({id:env.URENAVI_CONNECTION_PROBE_ID,scenario}).slice(0,32),scenario}),b=r.body;
  if(r.code!==200||b.nonInference!==true||b.inferenceCalls!==0||b.syntheticFacts!==true||b.sourceSha!==sha||b.protectedRecordsUnchanged!==true||b.claimExists!==true||b.existingClaimReservation!==8000||b.mockCalls!==(scenario==='save-failure'?0:1)||b.publication!==false||b.copyable!==false)throw Error('connection_scenario_failed_'+scenario);
  if(protectedHash&&protectedHash!==b.protectedRecordsHash)throw Error('protected_records_changed');protectedHash=b.protectedRecordsHash;
  if(['success','duplicate'].includes(scenario)){if(b.resultStatus!=='captured_unreviewed'||b.spent!==3729||b.reserved!==4271)throw Error('mock_success_not_captured');}else if(!b.error)throw Error('mock_failure_not_stopped');
  if(scenario==='duplicate'&&b.duplicate?.reason!=='existing_claim')throw Error('duplicate_not_stopped');
  if(b.calibrationExists!==(scenario!=='save-failure')||b.transportExists!==(scenario!=='save-failure'))throw Error('journal_path_incomplete');
  results.push(b);
 }
 return {status:'authenticated_api_runner_blob_verified',sourceSha:sha,targetInferenceEnabled:false,wrongSecret:invalid.code,results,inferenceCalls:0};
}
module.exports={verify};
if(require.main===module){const endpoint=process.env.URENAVI_CONNECTION_API_TARGET;if(!endpoint)process.stdout.write(JSON.stringify({status:'connection_http_not_requested',inferenceCalls:0})+'\n');else verify({endpoint}).then(r=>process.stdout.write(JSON.stringify(r)+'\n')).catch(e=>{process.stderr.write(JSON.stringify({status:'connection_http_hold',reason:/^(connection_scenario_failed_|mock_|journal_|duplicate_|protected_|connection_source|probe_auth)/.test(e.message)?e.message:'connection_verification_failed',inferenceCalls:0})+'\n');process.exitCode=1;});}
