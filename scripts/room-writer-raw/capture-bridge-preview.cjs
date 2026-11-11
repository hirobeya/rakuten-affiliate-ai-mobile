'use strict';
// OIDC authenticates the same-project control-plane transfer. No provider key is
// exported in an artifact, argv, stdout, or source; no inference code is loaded.
const fs=require('node:fs');
let stage='initial';
async function deliver({sandbox,report,key}){
 const parsed=JSON.parse(report.toString('utf8'));
 if(!/^[a-z0-9-]{1,100}$/.test(parsed.runId)||!/^[a-f0-9]{40}$/.test(parsed.executionSha))throw Error('delivery_identity_invalid');
 const directory='/vercel/'+parsed.runId;
 stage='create_unique_archive';await sandbox.mkDir(directory);
 stage='write_capture';await sandbox.writeFiles([{path:directory+'/capture.json',content:report}]);
 stage='check_memory_secret_path';
 const result=await sandbox.runCommand({cmd:'node',args:['-e',"console.log(JSON.stringify({groqKeyConfigured:Boolean(process.env.GROQ_API_KEY),inferenceCodeLoaded:false,secretWrittenToFile:false}))"],env:{GROQ_API_KEY:key||''}});
 if(result.exitCode!==0)throw Error('memory_only_secret_path_failed');
 const proof=JSON.parse(await result.stdout());
 if(typeof proof.groqKeyConfigured!=='boolean'||proof.inferenceCodeLoaded!==false||proof.secretWrittenToFile!==false)throw Error('secret_path_proof_invalid');
 const evidence={executionSha:parsed.executionSha,runId:parsed.runId,directory,sameProjectOIDC:true,captureFileDelivered:true,secretPath:'server environment -> TLS Sandbox command env -> short-lived Node memory',proof,providerRequestsDuringSecretPathCheck:0};
 stage='write_proof';await sandbox.writeFiles([{path:directory+'/bridge-proof.json',content:Buffer.from(JSON.stringify(evidence,null,2))}]);
 return evidence;
}
async function main(){
 if(process.env.VERCEL_ENV!=='preview')throw Error('preview_required');
 const {Sandbox}=await import('@vercel/sandbox');
 stage='sandbox_get';const sandbox=await Sandbox.get({name:'urenavi-raw-source-20261111-v1'});
 stage='acquire';
 await require('./capture-preview.cjs').main();
 const report=fs.readFileSync('capture-output/capture.json');
 const evidence=await deliver({sandbox,report,key:process.env.GROQ_API_KEY});
 fs.writeFileSync('capture-output/bridge-proof.json',JSON.stringify(evidence,null,2));
 console.log('isolated_source_delivery_complete_no_provider_generation');
}
module.exports={deliver};
if(require.main===module)main().catch(()=>{console.error(JSON.stringify({code:'isolated_source_delivery_held',stage,secretDetailsSuppressed:true}));process.exitCode=1;});
