'use strict';
// Only staged in a dedicated, account-protected Preview build with no API functions.
// Reads the existing Rakuten credentials in that server; never exports credentials.
const fs=require('node:fs'),path=require('node:path'),A=require('../../lib/room-writer-raw/acquisition'),S=require('../../lib/room-writer-raw/source');
async function main(){
 const manifest=JSON.parse(fs.readFileSync('capture-manifest.json','utf8'));
 if(process.env.VERCEL_ENV!=='preview'||manifest.branch!=='experiment/urenavi-groq-raw-source-fallback-20261111'||!/^[a-f0-9]{40}$/.test(manifest.executionSha))throw Error('isolated_preview_required');
 if(!Array.isArray(manifest.itemCodes)||manifest.itemCodes.length<1||manifest.itemCodes.length>6||new Set(manifest.itemCodes).size!==manifest.itemCodes.length)throw Error('acquisition_scope_invalid');
 for(const [file,hash]of Object.entries(manifest.fileHashes))if(S.hash(fs.readFileSync(file,'utf8'))!==hash)throw Error('staged_code_hash_mismatch');
 const out=path.resolve('capture-output');fs.mkdirSync(out,{recursive:false});
 fs.writeFileSync(path.join(out,'attempts.json'),JSON.stringify({executionSha:manifest.executionSha,requestsPlanned:manifest.itemCodes,generationCalls:0}),{flag:'wx'});
 const credentials={appId:process.env.RAKUTEN_APP_ID,accessKey:process.env.RAKUTEN_ACCESS_KEY};
 const report={version:A.VERSION,runId:manifest.runId,executionSha:manifest.executionSha,branch:manifest.branch,environment:'preview',fileHashes:manifest.fileHashes,
  captureCalls:0,generationCalls:0,automaticRetries:0,credentialValuesExported:false,captures:[],stopped:null};
 for(const [i,itemCode]of manifest.itemCodes.entries()){
  if(i)await new Promise(resolve=>setTimeout(resolve,1100));
  fs.writeFileSync(path.join(out,`attempt-${i+1}.json`),JSON.stringify({itemCode,state:'started',observedAt:new Date().toISOString()}),{flag:'wx'});
  report.captureCalls++;
  try{const record=await A.fetchItem({itemCode,credentials,executionSha:manifest.executionSha});report.captures.push(record);}
  catch(e){report.stopped={itemCode,code:/^[a-z0-9_]+$/.test(e.message)?e.message:'acquisition_failed_safe'};break;}
 }
 fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><title>Urenavi isolated source acquisition</title><p>Read-only Rakuten source capture. No AI requests.</p>');
 console.log(JSON.stringify({status:report.stopped?'held':'captured',captureCalls:report.captureCalls,generationCalls:0}));
}
main().catch(()=>{console.error('raw_source_capture_build_held_no_secret_details');process.exitCode=1;});
