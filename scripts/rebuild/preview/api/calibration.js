'use strict';
// Isolated deployment root: no existing product, DB, billing, or login routes are deployed.
const crypto=require('node:crypto');
const R=require('../../../../lib/urenavi-core/calibration-runner'),A=require('../../../../lib/urenavi-core/admission'),L=require('../../../../lib/urenavi-core/live-calibration');
const P=require('../persistence'),CP=require('../../../../lib/urenavi-core/comparison-policy'),CR=require('../../../../lib/urenavi-core/comparison-runner'),Store=require('../comparison-persistence');
const F=require('../../../../lib/urenavi-core/free-calibration-profile');
const source=require('../../../../docs/rebuild-20261028/p3-first-call-gate/first-call-plan.json').selected.source;
function secretEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||!a)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function create({env=process.env,loadBlob=()=>require('@vercel/blob'),run=R.run,comparisonRun=CR.run,clock=Date.now}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const reply=(code,value)=>res.status(code).json(value);
  const isolated=env.VERCEL_ENV==='preview'&&env.URENAVI_CALIBRATION_ISOLATED_PREVIEW==='1'&&env.VERCEL_GIT_COMMIT_REF==='rebuild/urenavi-core-20261028';
  if(!isolated)return reply(403,{status:'isolated_preview_required',inferenceEnabled:false});
  const storageConnected=!!env.BLOB_STORE_ID||!!env.BLOB_READ_WRITE_TOKEN;
  const armed=env.URENAVI_CALIBRATION_LIVE==='approved-one-call'&&!!env.URENAVI_CALIBRATION_EXECUTION_SECRET;
  const comparisonArmed=env.URENAVI_COMPARISON_LIVE==='approved-one-call'&&!!env.URENAVI_CALIBRATION_EXECUTION_SECRET;
  const freeArmed=env.URENAVI_FREE_CALIBRATION_LIVE==='approved-one-call'&&!!env.URENAVI_CALIBRATION_EXECUTION_SECRET;
  if(req.method==='GET')return reply(200,{status:'preparation',sourceSha:env.VERCEL_GIT_COMMIT_SHA||null,wireHash:L.WIRE_HASH,model:'openai/gpt-oss-120b',maxCompletionTokens:1000,maxRequests:1,groqCredentialPresent:!!env.GROQ_API_KEY,storageConnected,inferenceEnabled:armed||comparisonArmed||freeArmed,publication:false,comparison:{implemented:true,experimentId:CP.EXPERIMENT_ID,wireHash:CP.WIRE_HASH,maxCompletionTokens:3000,inputReservation:5000,inferenceEnabled:comparisonArmed},freeCalibration:{implemented:true,profile:F.NAME,manifestHash:F.MANIFEST_HASH,inputReservationKind:'estimate',providerBoundCertified:false,inputSizeCapBytes:9791,inputReservation:5000,outputLimit:3000,maxRequests:1,explicitRiskApprovalRequired:true,inferenceEnabled:freeArmed}});
  if(req.method!=='POST')return reply(405,{status:'method_not_allowed'});
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>65536)return reply(400,{status:'invalid_request'});
  if(body.action==='storage-probe'){
   if(!storageConnected)return reply(503,{status:'private_storage_not_connected',inferenceEnabled:false});
   try{return reply(200,{...await P.create(loadBlob()).probe(body.probeId),inferenceCalls:0});}catch{return reply(409,{status:'storage_probe_hold',inferenceCalls:0});}
  }
  // Authenticated inspection is read-only, including after execution is disarmed.
  if(body.action==='inspect'){
   if(!secretEqual(req.headers?.['x-urenavi-execution-secret'],env.URENAVI_CALIBRATION_EXECUTION_SECRET))return reply(403,{status:'execution_permission_required'});
   if(!storageConnected)return reply(503,{status:'private_storage_not_connected'});
   try{return reply(200,{status:'inspection',publication:false,journals:await P.create(loadBlob()).inspect()});}catch{return reply(409,{status:'inspection_unavailable_do_not_retry_execution'});}
  }
  if(body.action==='reconcile-failed-call'){
   if(!secretEqual(req.headers?.['x-urenavi-execution-secret'],env.URENAVI_CALIBRATION_EXECUTION_SECRET))return reply(403,{status:'execution_permission_required'});
   if(armed||comparisonArmed||freeArmed||!storageConnected)return reply(423,{status:'reconciliation_requires_disarmed_connected_preview',publication:false});
   try{const receipt=await P.create(loadBlob()).recordReconciliation(body.evidence);return reply(200,{status:'accounted_failure_originals_preserved',receipt,inferenceCalls:0,publication:false});}
   catch{return reply(409,{status:'reconciliation_hold_originals_preserved',inferenceCalls:0,publication:false});}
  }
  if(body.action==='inspect-comparison'){
   if(!secretEqual(req.headers?.['x-urenavi-execution-secret'],env.URENAVI_CALIBRATION_EXECUTION_SECRET))return reply(403,{status:'execution_permission_required'});
   if(!storageConnected)return reply(503,{status:'private_storage_not_connected'});
   try{return reply(200,{status:'private_comparison_inspection',publication:false,journals:await Store.create(loadBlob()).inspect()});}catch{return reply(409,{status:'comparison_inspection_hold'});}
  }
  // Same operator authentication, read-only verification. Works while all inference
  // flags are disabled; never creates a claim/reservation or reads the Groq key.
  if(body.action==='preflight-free-calibration'){
   if(!secretEqual(req.headers?.['x-urenavi-execution-secret'],env.URENAVI_CALIBRATION_EXECUTION_SECRET))return reply(403,{status:'execution_permission_required'});
   if(armed||comparisonArmed||freeArmed||!storageConnected)return reply(423,{status:'preflight_requires_disarmed_connected_preview',inferenceCalls:0});
   try{
    const store=Store.create(loadBlob()),evidence=await store.prior(),existing=await store.inspect();
    if(Object.values(existing).some(x=>x.exists))return reply(409,{status:'comparison_already_claimed_hold',inferenceCalls:0});
    const facts=CP.validate({snapshot:body.snapshot,...evidence,estimateProfileEnabled:true,executionSha:env.VERCEL_GIT_COMMIT_SHA||null,now:clock(),readOnlyFacts:true});
    return reply(200,{status:'preflight_passed_not_send_permission',executionApprovalStillRequired:true,sourceSha:env.VERCEL_GIT_COMMIT_SHA,wireHash:CP.WIRE_HASH,reservation:facts.reservation,capacityBasis:facts.capacityBasis,oldRetainedDaily:facts.retainedDaily,expiresAt:facts.expiry,inferenceCalls:0,publication:false});
   }catch(e){const reason=['exclusive_ledger_evidence_unverified','comparison_one_call_permission_required','free_estimate_evidence_invalid','free_input_envelope_mismatch','comparison_account_scope_unverified','comparison_capacity_evidence_unverified','comparison_exclusivity_unverified','comparison_remaining_capacity'].includes(e?.message)?e.message:'evidence_unverified';return reply(412,{status:'comparison_facts_unverified',reason,inferenceCalls:0,publication:false});}
  }
  if(body.action==='execute-comparison'||body.action==='execute-free-calibration'){
   const free=body.action==='execute-free-calibration';
   if(!(free?freeArmed:comparisonArmed))return reply(423,{status:free?'free_calibration_not_armed':'comparison_not_armed',inferenceEnabled:false,publication:false});
   if(armed||(free?comparisonArmed:freeArmed)||!secretEqual(req.headers?.['x-urenavi-execution-secret'],env.URENAVI_CALIBRATION_EXECUTION_SECRET))return reply(403,{status:'exclusive_comparison_permission_required'});
   if(!storageConnected||!env.GROQ_API_KEY)return reply(503,{status:'runtime_connection_incomplete'});
   const store=Store.create(loadBlob());let evidence,facts;
   const options={estimateProfileEnabled:free,executionSha:env.VERCEL_GIT_COMMIT_SHA||null};
   try{evidence=await store.prior();facts=CP.validate({snapshot:body.snapshot,...evidence,...options,now:clock()});}catch{return reply(412,{status:'comparison_facts_unverified',publication:false});}
   try{
    await store.claim(body.snapshot,evidence,{capacityBasis:facts.capacityBasis});
    const result=await comparisonRun({directory:CP.STATE_DIRECTORY,snapshot:body.snapshot,...evidence,...options,runtimeMode:'live',liveAuthorization:L.authorizationFromEnvironment,clock,save:store.save,transportSave:store.save});
    return reply(200,result);
   }catch{return reply(409,{status:'comparison_hold_do_not_retry',publication:false,copyable:false});}
  }
  if(comparisonArmed||freeArmed)return reply(423,{status:'old_experiment_disabled_during_comparison',publication:false});
  // Neither query flags nor posted permission can enable a send.
  if(!armed)return reply(423,{status:'not_armed',inferenceEnabled:false,publication:false});
  if(body.action!=='execute'||!secretEqual(req.headers?.['x-urenavi-execution-secret'],env.URENAVI_CALIBRATION_EXECUTION_SECRET))return reply(403,{status:'execution_permission_required'});
  if(!storageConnected||!env.GROQ_API_KEY)return reply(503,{status:'runtime_connection_incomplete'});
  const f=body.snapshot;
  try{
   if(!f||Object.keys(f).some(k=>!['grant','evidence','account','isolation'].includes(k)))throw Error('snapshot_contract');
   L.validate({...f,directory:L.STATE_DIRECTORY,wireHash:L.WIRE_HASH,now:clock(),calibrationProfile:'first-call-1000',liveAuthorization:L.authorizationFromEnvironment,mockAuthentication:null});
   A.single(f.account,{spent:0,reserved:0,requests:0,events:[],lastClock:0,halt:null},5000,'preflight',clock(),1000,'live-calibration');
  }catch{return reply(412,{status:'launch_facts_unverified',publication:false});}
  const persistence=P.create(loadBlob());
  try{
   // Never expire or delete the remote claim. Crash/redeploy/unknown state cannot reopen the experiment.
   await persistence.claim(f);
   const result=await run({...f,directory:L.STATE_DIRECTORY,item:source,runtimeMode:'live-calibration',calibrationProfile:'first-call-1000',liveAuthorization:L.authorizationFromEnvironment,clock,save:persistence.save,transportSave:persistence.save,evaluationCapture:true});
   return reply(200,result);
  }catch{return reply(409,{status:'calibration_hold_do_not_retry',publication:false});}
 };
}
module.exports=create();module.exports.create=create;
