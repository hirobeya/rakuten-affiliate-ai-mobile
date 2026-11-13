'use strict';
if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='experiment/urenavi-gemini-comparison-20261113'){
 console.log(JSON.stringify({geminiStorageProbe:'skipped',providerCalls:0}));
}else{
 const {probe}=require('../../lib/room-writer-raw/gemini-storage-probe');
 const previousSha=require('../../docs/experiments/gemini-comparison-20261113/storage-probe-predecessor.json').sha;
 probe({sha:process.env.VERCEL_GIT_COMMIT_SHA,context:'build',previousSha}).then(result=>console.log(JSON.stringify({geminiStorageProbe:result}))).catch(error=>{
  // Missing credentials/permission is a diagnostic hold, never a generation grant.
  console.log(JSON.stringify({geminiStorageProbe:'failed_or_unavailable',reason:/^gemini_[a-z_]+$/.test(error.message||'')?error.message:'storage_probe_unavailable',storageOperation:error.storageOperation||null,storageErrorName:error.storageErrorName||null,providerCalls:0,executionSha:process.env.VERCEL_GIT_COMMIT_SHA}));
 });
}
