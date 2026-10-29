'use strict';
// Isolated deployment root: no existing product, DB, billing, or login routes are deployed.
const crypto=require('node:crypto');
const R=require('../../../../lib/urenavi-core/calibration-runner'),A=require('../../../../lib/urenavi-core/admission'),L=require('../../../../lib/urenavi-core/live-calibration');
const P=require('../persistence');
const source=require('../../../../docs/rebuild-20261028/p3-first-call-gate/first-call-plan.json').selected.source;
function secretEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||!a)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function create({env=process.env,loadBlob=()=>require('@vercel/blob'),run=R.run,clock=Date.now}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const reply=(code,value)=>res.status(code).json(value);
  const isolated=env.VERCEL_ENV==='preview'&&env.URENAVI_CALIBRATION_ISOLATED_PREVIEW==='1'&&env.VERCEL_GIT_COMMIT_REF==='rebuild/urenavi-core-20261028';
  if(!isolated)return reply(403,{status:'isolated_preview_required',inferenceEnabled:false});
  const storageConnected=!!env.BLOB_STORE_ID||!!env.BLOB_READ_WRITE_TOKEN;
  const armed=env.URENAVI_CALIBRATION_LIVE==='approved-one-call'&&!!env.URENAVI_CALIBRATION_EXECUTION_SECRET;
  if(req.method==='GET')return reply(200,{status:'preparation',wireHash:L.WIRE_HASH,model:'openai/gpt-oss-120b',maxCompletionTokens:1000,maxRequests:1,groqCredentialPresent:!!env.GROQ_API_KEY,storageConnected,inferenceEnabled:armed,publication:false});
  if(req.method!=='POST')return reply(405,{status:'method_not_allowed'});
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>65536)return reply(400,{status:'invalid_request'});
  if(body.action==='storage-probe'){
   if(!storageConnected)return reply(503,{status:'private_storage_not_connected',inferenceEnabled:false});
   try{return reply(200,{...await P.create(loadBlob()).probe(body.probeId),inferenceCalls:0});}catch{return reply(409,{status:'storage_probe_hold',inferenceCalls:0});}
  }
  // Today no arming env/secret is created; neither query flags nor posted permission can enable a send.
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
   const result=await run({...f,directory:L.STATE_DIRECTORY,item:source,runtimeMode:'live-calibration',calibrationProfile:'first-call-1000',liveAuthorization:L.authorizationFromEnvironment,clock,save:persistence.save,transportSave:persistence.save});
   return reply(200,result);
  }catch{return reply(409,{status:'calibration_hold_do_not_retry',publication:false});}
 };
}
module.exports=create();module.exports.create=create;
