'use strict';
// Runtime adapter to the EXISTING authenticated API. No generator, retry loop,
// arming operation or claim release. Default is no operation. The grant is
// supplied only after a new explicit approval for this source SHA and policy.
const C=require('../../../lib/urenavi-core/contracts'),P=require('../../../lib/urenavi-core/comparison-policy'),N=require('../../../lib/urenavi-core/provider-limited-calibration'),Store=require('./comparison-persistence'),H=require('./api/calibration');
const template=require('../../../docs/rebuild-20261028/p3-free-calibration-ready-20261106/approval-pending.json').snapshot;
function fail(){throw Error('approved_comparison_hold_do_not_retry');}
async function invoke({env=process.env,loadBlob=()=>require('@vercel/blob'),clock=Date.now,handlerFactory=H.create}={}){
 const raw=env.URENAVI_APPROVED_COMPARISON_GRANT;
 if(!raw)return {status:'approved_comparison_not_requested',inferenceCalls:0};
 if(env.VERCEL_ENV!=='preview'||env.URENAVI_CALIBRATION_ISOLATED_PREVIEW!=='1'||env.VERCEL_GIT_COMMIT_REF!=='rebuild/urenavi-core-20261028'||env.URENAVI_FREE_CALIBRATION_LIVE!=='approved-one-call'||['URENAVI_CALIBRATION_LIVE','URENAVI_COMPARISON_LIVE'].some(k=>env[k]==='approved-one-call')||!env.URENAVI_CALIBRATION_EXECUTION_SECRET||!env.GROQ_API_KEY||typeof raw!=='string'||Buffer.byteLength(raw)>8192)fail();
 const grant=JSON.parse(raw),now=clock();
 if(grant?.mode!=='live-one-call'||grant.explicitUserApproval!==true||grant.approvedExecutionSha!==env.VERCEL_GIT_COMMIT_SHA||!/^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA||'')||grant.capacityPolicy!==N.KIND||grant.providerLimitRejectionAccepted!==true||grant.unmanagedUsageUnknownAccepted!==true||!Number.isSafeInteger(grant.expiresAt)||grant.expiresAt<=now)fail();
 const blob=loadBlob(),store=Store.create(blob),evidence=await store.prior(),namespace=await store.inspect();
 if(!N.empty(namespace))fail();
 const accountEvidence=env.URENAVI_GROQ_LIMIT_OBSERVATION?JSON.parse(env.URENAVI_GROQ_LIMIT_OBSERVATION):require('../../../docs/rebuild-20261028/provider-limited-account.json');
 const snapshot=N.build({template,...evidence,namespace,accountEvidence,now,executionSha:env.VERCEL_GIT_COMMIT_SHA,prefix:P.PREFIX,wireHash:P.WIRE_HASH,experimentId:P.EXPERIMENT_ID});
 Object.assign(snapshot.grant,grant);
 // Full permission, fixed-wire, estimate, policy, capacity and receipt validation
 // occurs here AND again in the API, runner and transport before the sole send.
 P.validate({snapshot,...evidence,managedNamespace:namespace,now,estimateProfileEnabled:true,executionSha:env.VERCEL_GIT_COMMIT_SHA});
 let httpStatus,body;
 const res={setHeader(){},status(code){httpStatus=code;return this;},json(value){body=value;return this;}};
 await handlerFactory({env,loadBlob:()=>blob,clock})({method:'POST',headers:{'x-urenavi-execution-secret':env.URENAVI_CALIBRATION_EXECUTION_SECRET},body:{action:'execute-free-calibration',snapshot}},res);
 let privateReview;
 if(httpStatus===200&&env.URENAVI_PRIVATE_CALIBRATION_REVIEW==='include-unreviewed-candidate'){
  const records=await store.inspect(),evaluation=records.calibration?.value?.evaluation;
  if(evaluation?.status!=='unreviewed'||evaluation.publication!==false||!C.validSchema(evaluation.candidate,C.WRITE_SCHEMA))fail();
  privateReview={status:'unreviewed',candidate:evaluation.candidate,publication:false,copyable:false};
 }
 // A failed API response may mean zero or one inference: never guess/retry.
 return {status:httpStatus===200?'approved_comparison_completed_private':'approved_comparison_hold_do_not_retry',apiStatus:httpStatus??null,sourceSha:env.VERCEL_GIT_COMMIT_SHA,experimentId:P.EXPERIMENT_ID,wireHash:P.WIRE_HASH,inferenceCalls:httpStatus===200&&body?.calls===1?1:null,publication:false,copyable:false,requestResultHash:body?C.hash(body):null,...(privateReview?{privateReview}: {})};
}
module.exports={invoke};
if(require.main===module)invoke().then(r=>process.stdout.write(JSON.stringify(r)+'\n')).catch(()=>{process.stderr.write(JSON.stringify({status:'approved_comparison_hold_do_not_retry',inferenceCalls:null,publication:false})+'\n');process.exitCode=1;});
