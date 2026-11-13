'use strict';
// Storage-only mock records. This module never imports a generation transport.
const {hash}=require('./source');const {create,PREFIX}=require('./gemini-attempt-store');const {sdk}=require('./gemini-blob');
function probeId(sha,context){return context==='build'?sha:hash(['runtime',sha]).slice(0,40);}
async function probe({sha,context='runtime',previousSha=null,blob=sdk(),clock=Date.now}={}){
 if(!/^[a-f0-9]{40}$/.test(sha||'')||!['build','runtime'].includes(context))throw Error('gemini_probe_scope_invalid');
 const started=clock(),namespace=PREFIX+'/storage-probes/'+probeId(sha,context);
 const make=()=>create(blob,{namespace});const prior=await make().readProof();
 if(prior){if(prior.executionSha!==sha||prior.context!==context||prior.passed!==true)throw Error('gemini_probe_previous_incomplete');return {...prior,recovered:true};}
 const scope={itemCode:'storage-probe:mock-only',model:'no-provider',requestHash:hash('storage-only-mock-v1')};
 const record={...scope,executionSha:sha,context,noProviderRequest:true,tokens:null};
 const competitors=await Promise.allSettled([make().begin(record),make().begin({...record,contender:2})]);
 const successes=competitors.filter(x=>x.status==='fulfilled');
 if(successes.length!==1)throw Error('gemini_probe_exclusion_failed');
 const state=await make().state(scope);if(!state.claim)throw Error('gemini_probe_readback_failed');
 const mockResult={status:'mock_completed_no_provider',scope,noProviderRequest:true,tokens:null};
 await make().finish(scope,mockResult);
 const recovered=await make().state(scope);if(hash(recovered.result)!==hash(mockResult))throw Error('gemini_probe_result_readback_failed');
 const repeated=await Promise.allSettled([make().begin(record)]);if(repeated[0].status!=='rejected')throw Error('gemini_probe_duplicate_allowed');
 let privateStatus=null;const url=successes[0].value?.url;
 if(url){const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(5000)});privateStatus=r.status;if(![401,403,404].includes(r.status))throw Error('gemini_probe_private_access_unproven');}
 else throw Error('gemini_probe_private_url_missing');
 let crossDeployment=null;
 if(previousSha){const previous=await make().readProbe(previousSha);crossDeployment=!!previous?.passed&&previous.executionSha===previousSha&&previous.noProviderRequest===true;if(!crossDeployment)throw Error('gemini_probe_cross_deployment_failed');}
 const proof={version:1,passed:true,executionSha:sha,context,at:new Date().toISOString(),noProviderRequest:true,providerCalls:0,privateAnonymousStatus:privateStatus,competingCreates:2,successfulCreates:1,independentWorkerReadback:true,resultRecovered:true,duplicateRejected:true,previousSha,crossDeployment,elapsedMs:clock()-started};
 await make().saveProof(proof);
 if(hash(await make().readProof())!==hash(proof))throw Error('gemini_probe_proof_readback_failed');
 return proof;
}
module.exports={probe,probeId};
