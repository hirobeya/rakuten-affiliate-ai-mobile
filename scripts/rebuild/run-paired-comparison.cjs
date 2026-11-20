'use strict';
// Only an isolated operator process may run this command. No app/API route
// imports it. Kept separate from the network-disabled comparison reader.
const fs=require('node:fs/promises');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {parseArgs}=require('node:util');
const {importOfficialEvidence,matchesOfficialArtifact}=require('../../lib/urenavi-core/official-capacity-evidence');
const {createComparisonJournal}=require('../../lib/urenavi-core/comparison-journal');
const {createGroqComparisonTransport,createPairedComparisonRunner,expectedApproval}
 =require('../../lib/urenavi-core/paired-comparison-runner');
const {values}=parseArgs({options:{
 action:{type:'string'},tenant:{type:'string'},organization:{type:'string'},project:{type:'string'},
 'credential-sha256':{type:'string'},inputs:{type:'string'},journal:{type:'string'},approval:{type:'string'},evidence:{type:'string'},
 artifact:{type:'string'},observation:{type:'string'},'approval-key':{type:'string'},'evidence-key':{type:'string'},item:{type:'string'},arm:{type:'string'},stage:{type:'string'}
}});
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const groqKey=process.env.URENAVI_COMPARISON_GROQ_KEY;
const keyFingerprint=groqKey?createHash('sha256').update(groqKey).digest('hex'):null;
const account={organization:values.organization,project:values.project,
 credentialSha256:values['credential-sha256']||keyFingerprint};
const root=require('node:path').resolve(__dirname,'../..');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
async function run(){
 if(values.action==='import-evidence'){
  const observation=await json(values.observation);
  return importOfficialEvidence(observation,await fs.readFile(values.artifact));
 }
 if(!account.organization||!account.project||!/^([a-f0-9]{64})$/.test(account.credentialSha256||''))throw Error('comparison_account_required');
 const executionSha=git('rev-parse','HEAD');
 if(values.action==='scope'){
  if(!values.tenant)throw Error('owner_tenant_required');
  return expectedApproval(executionSha,values.tenant,account);
 }
 if(!['run','recover'].includes(values.action)||process.env.URENAVI_ISOLATED_COMPARISON!=='operator-enabled'||process.env.VERCEL)
  throw Error('isolated_operator_execution_disabled');
 if(values.action==='run'&&keyFingerprint!==account.credentialSha256)throw Error('comparison_credential_mismatch');
 if(git('status','--porcelain'))throw Error('clean_checkout_required');
 const local=new URL(process.env.URENAVI_COMPARISON_LOCAL_SUPABASE||'http://127.0.0.1:54321');
 if(local.protocol!=='http:'||local.hostname!=='127.0.0.1'||local.username||local.password||
    local.pathname!=='/'||local.search||local.hash)throw Error('loopback_supabase_required');
 const serviceKey=process.env.URENAVI_COMPARISON_LOCAL_SERVICE_KEY;
 const ownerJwt=process.env.URENAVI_COMPARISON_LOCAL_OWNER_JWT;
 if(!serviceKey||!ownerJwt)throw Error('isolated_supabase_credentials_required');
 const isolatedFetch=(pathname,options)=>fetch(local.origin+pathname,{
  ...options,redirect:'error',signal:AbortSignal.timeout(4000)
 });
 const db=async(path,options)=>{
  const response=await isolatedFetch('/rest/v1/'+path,{...options,headers:{
   apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'
  }});
  if(!response.ok)throw Error('isolated_capacity_db_unavailable');
  return response.json();
 };
 const authorize=async()=>{
  const response=await isolatedFetch('/auth/v1/user',{headers:{apikey:serviceKey,Authorization:'Bearer '+ownerJwt}});
  if(!response.ok)return {ok:false};
  const user=await response.json();
  return {ok:user.app_metadata?.urenavi_role==='owner',plan:'owner',user:{id:user.id,email:user.email}};
 };
 const [inputs,approvalKey,evidenceKey]=await Promise.all([
  json(values.inputs),fs.readFile(values['approval-key']),fs.readFile(values['evidence-key'])
 ]);
 const readVerifiedEvidence=async()=>{
  const [envelope,artifact]=await Promise.all([json(values.evidence),fs.readFile(values.artifact)]);
  return matchesOfficialArtifact(envelope?.payload,artifact)?envelope:null;
 };
 const transport=values.action==='run'?createGroqComparisonTransport({apiKey:groqKey}):
  async()=>{throw Error('no_transport_in_recovery');};
 const runner=createPairedComparisonRunner({inputs,environment:'isolated',executionSha,account,db,authorize,
  journal:createComparisonJournal(values.journal),approvalKey,evidenceKey,
  readEvidence:readVerifiedEvidence,transport});
 if(values.action==='recover')return runner.recover({recoveryEnvelope:await readVerifiedEvidence()});
 return runner.run({approvalEnvelope:await json(values.approval),itemCode:values.item,arm:values.arm,stage:values.stage});
}
run().then(result=>{
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(result.status==='stopped')process.exitCode=1;
}).catch(()=>{
 // Keep keys, signed artifacts, inputs and raw upstream errors out of logs.
 process.stderr.write('comparison operator command stopped before receiving a usable result\n');
 process.exitCode=1;
});
