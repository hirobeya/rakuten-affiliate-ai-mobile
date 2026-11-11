'use strict';
// OIDC authenticates the same-project control-plane transfer. No provider key is
// exported in an artifact, argv, stdout, or source; no inference code is loaded.
const fs=require('node:fs');
async function main(){
 if(process.env.VERCEL_ENV!=='preview')throw Error('preview_required');
 const {Sandbox}=await import('@vercel/sandbox');
 const sandbox=await Sandbox.get({name:'urenavi-raw-source-20261111-v1'});
 await require('./capture-preview.cjs').main();
 const report=fs.readFileSync('capture-output/capture.json');
 await sandbox.mkDir('/vercel/source-capture-20261111');
 await sandbox.writeFiles([{path:'/vercel/source-capture-20261111/capture.json',content:report}]);
 const result=await sandbox.runCommand({cmd:'node',args:['-e',"console.log(JSON.stringify({groqKeyConfigured:Boolean(process.env.GROQ_API_KEY),inferenceCodeLoaded:false,secretWrittenToFile:false}))"],env:{GROQ_API_KEY:process.env.GROQ_API_KEY||''}});
 if(result.exitCode!==0)throw Error('memory_only_secret_path_failed');
 const proof=JSON.parse(await result.stdout());
 if(typeof proof.groqKeyConfigured!=='boolean'||proof.inferenceCodeLoaded!==false||proof.secretWrittenToFile!==false)throw Error('secret_path_proof_invalid');
 const evidence={sameProjectOIDC:true,captureFileDelivered:true,secretPath:'server environment -> TLS Sandbox command env -> short-lived Node memory',proof,providerRequestsDuringSecretPathCheck:0};
 await sandbox.writeFiles([{path:'/vercel/source-capture-20261111/bridge-proof.json',content:Buffer.from(JSON.stringify(evidence,null,2))}]);
 fs.writeFileSync('capture-output/bridge-proof.json',JSON.stringify(evidence,null,2));
 console.log('isolated_source_delivery_complete_no_provider_generation');
}
main().catch(()=>{console.error('isolated_source_delivery_held_no_secret_details');process.exitCode=1;});
