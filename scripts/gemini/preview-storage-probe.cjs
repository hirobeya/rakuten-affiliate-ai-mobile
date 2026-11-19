'use strict';
if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='experiment/urenavi-gemini-comparison-20261113'){
 console.log(JSON.stringify({geminiStorageProbe:'skipped',providerCalls:0}));
}else{
 // This preparation phase reuses the accepted proof with read-only access.
 // No new mock or live claim is created merely because another build ran.
 const policy=require('../../docs/experiments/gemini-comparison-20261113/preparation-policy.json');
 const {create}=require('../../lib/room-writer-raw/gemini-attempt-store');
 const {sdk}=require('../../lib/room-writer-raw/gemini-blob');
 create(sdk()).readProbe(policy.acceptedStorageProofSha).then(proof=>{
  if(proof?.passed!==true||proof.version!==2||proof.executionSha!==policy.acceptedStorageProofSha)throw Error('accepted_storage_proof_unavailable');
  console.log(JSON.stringify({geminiStorageProbe:'accepted_baseline_read_only',sourceSha:proof.executionSha,currentSha:process.env.VERCEL_GIT_COMMIT_SHA,providerCalls:0,newClaims:0}));
 }).catch(()=>console.log(JSON.stringify({geminiStorageProbe:'accepted_baseline_read_unavailable',providerCalls:0,newClaims:0})));
}
