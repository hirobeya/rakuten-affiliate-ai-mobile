'use strict';
// Storage-only mock records. This module never imports a generation transport.
const {hash}=require('./source');const {create,PREFIX}=require('./gemini-attempt-store');const {sdk}=require('./gemini-blob');
function probeId(sha,context){return context==='build'?sha:hash(['runtime',sha]).slice(0,40);}
async function probe({sha,context='runtime',previousSha=require('../../docs/experiments/gemini-comparison-20261113/storage-probe-predecessor.json').sha,blob=sdk(),clock=Date.now,anonymousGet=fetch}={}){
 if(!/^[a-f0-9]{40}$/.test(sha||'')||!['build','runtime'].includes(context))throw Error('gemini_probe_scope_invalid');
 const started=clock(),namespace=PREFIX+'/storage-probes/'+probeId(sha,context);
 const make=()=>create(blob,{namespace});const prior=await make().readProof();
 if(prior){if(prior.executionSha!==sha||prior.context!==context||prior.passed!==true||prior.version!==2)throw Error('gemini_probe_previous_incomplete');return {...prior,recovered:true};}
 const scope={itemCode:'storage-probe:mock-only',model:'no-provider',requestHash:hash('storage-only-mock-v1')};
 const record={...scope,executionSha:sha,context,noProviderRequest:true,tokens:null};
 const competitors=await Promise.allSettled([make().begin(record),make().begin({...record,contender:2})]);
 const successes=competitors.filter(x=>x.status==='fulfilled');
 if(successes.length!==1||competitors.some(x=>x.status==='rejected'&&x.reason?.message!=='gemini_already_exists'))throw Error('gemini_probe_exclusion_failed');
 const state=await make().state(scope);if(!state.claim)throw Error('gemini_probe_readback_failed');
 const mockResult={status:'mock_completed_no_provider',scope,noProviderRequest:true,tokens:null};
 await make().finish(scope,mockResult);
 const recovered=await make().state(scope);if(hash(recovered.result)!==hash(mockResult))throw Error('gemini_probe_result_readback_failed');
 const repeated=await Promise.allSettled([make().begin(record)]);if(repeated[0].status!=='rejected'||repeated[0].reason?.message!=='gemini_already_exists')throw Error('gemini_probe_duplicate_allowed');
 let privateStatus=null;const url=successes[0].value?.url;
 if(url){const r=await anonymousGet(url,{redirect:'manual',signal:AbortSignal.timeout(5000)});privateStatus=r.status;if(![401,403,404].includes(r.status))throw Error('gemini_probe_private_access_unproven');}
 else throw Error('gemini_probe_private_url_missing');
 let crossDeployment=null;
 if(previousSha){const previous=await make().readProbe(previousSha);crossDeployment=!!previous?.passed&&previous.executionSha===previousSha&&previous.noProviderRequest===true;if(!crossDeployment)throw Error('gemini_probe_cross_deployment_failed');}
 // Inject failures around real, independent private mock-record writes. These
 // namespaces cannot consume the real generation approval.
 async function failureProbe(kind){
  const faultNamespace=PREFIX+'/storage-probes/'+hash([sha,context,kind]).slice(0,40);
  let faultInjected=false;
  const faulty={put:async(k,v,o)=>{if(kind==='result-save'&&k.endsWith('/result.json')){faultInjected=true;throw Error('gemini_probe_injected_failure');}return blob.put(k,v,o);},
   get:async(k,o)=>{if(kind==='claim-readback'&&!faultInjected){faultInjected=true;throw Error('gemini_probe_injected_failure');}return blob.get(k,o);}};
  const broken=create(faulty,{namespace:faultNamespace});
  let refused=false;
  try{await broken.begin(record);if(kind==='result-save')await broken.finish(scope,mockResult);}catch{refused=true;}
  if(!faultInjected||!refused)throw Error('gemini_probe_failure_not_observed');
  const independent=create(blob,{namespace:faultNamespace});const state=await independent.state(scope);
  if(!state.approvalClaim||state.result)throw Error('gemini_probe_failure_state_invalid');
  try{await independent.begin(record);throw Error('gemini_probe_failure_resend_allowed');}catch(e){if(e.message!=='gemini_already_exists')throw e;}
  return true;
 }
 const claimReadbackFailureBlocksResend=await failureProbe('claim-readback');
 const resultSaveFailureBlocksResend=await failureProbe('result-save');
 const proof={version:2,claimReadbackFailureBlocksResend,resultSaveFailureBlocksResend,passed:true,executionSha:sha,context,at:new Date().toISOString(),noProviderRequest:true,providerCalls:0,privateAnonymousStatus:privateStatus,competingCreates:2,successfulCreates:1,independentWorkerReadback:true,resultRecovered:true,duplicateRejected:true,previousSha,crossDeployment,elapsedMs:clock()-started};
 await make().saveProof(proof);
 if(hash(await make().readProof())!==hash(proof))throw Error('gemini_probe_proof_readback_failed');
 return proof;
}
module.exports={probe,probeId};
