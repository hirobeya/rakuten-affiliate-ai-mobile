'use strict';
// Only an isolated operator process may run this command. No app/API route
// imports it. Kept separate from the network-disabled comparison reader.
const fs=require('node:fs/promises');
const {createHash,verify}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {parseArgs}=require('node:util');
const {importOfficialEvidence,matchesOfficialArtifact,officialEvidenceBlockers,selfLedgerEvidenceBlockers}=require('../../lib/urenavi-core/official-capacity-evidence');
const {createIsolatedComparisonSupabase}=require('./isolated-comparison-supabase.cjs');
const {createComparisonJournal}=require('../../lib/urenavi-core/comparison-journal');
const {createGroqComparisonTransport,createPairedComparisonRunner,expectedApproval}
 =require('../../lib/urenavi-core/paired-comparison-runner');
const {values}=parseArgs({options:{
 action:{type:'string'},tenant:{type:'string'},organization:{type:'string'},project:{type:'string'},'budget-source':{type:'string'},
 'credential-sha256':{type:'string'},inputs:{type:'string'},journal:{type:'string'},approval:{type:'string'},evidence:{type:'string'},
 artifact:{type:'string'},observation:{type:'string'},estimate:{type:'string'},'approval-key':{type:'string'},'evidence-key':{type:'string'},item:{type:'string'},arm:{type:'string'},stage:{type:'string'}
}});
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const groqKey=process.env.URENAVI_COMPARISON_GROQ_KEY;
const keyFingerprint=groqKey?createHash('sha256').update(groqKey).digest('hex'):null;
const account={organization:values.organization,project:values.project,
 credentialSha256:values['credential-sha256']||keyFingerprint};
const budgetSource=values['budget-source']||'official';
const root=require('node:path').resolve(__dirname,'../..');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
async function run(){
 if(!['official','self_ledger'].includes(budgetSource))throw Error('unsupported_budget_source');
 if(values.action==='import-evidence'){
  const observation=await json(values.observation);
  return importOfficialEvidence(observation,await fs.readFile(values.artifact));
 }
 if(!account.organization||!account.project||!/^([a-f0-9]{64})$/.test(account.credentialSha256||''))throw Error('comparison_account_required');
 if(values.action==='check-evidence'){
  const estimate=Number(values.estimate);
  if(!Number.isSafeInteger(estimate)||estimate<1||estimate>1000000000)
   throw Error('evidence_check_estimate_required');
  const [envelope,artifact,key]=await Promise.all([
   json(values.evidence),fs.readFile(values.artifact),fs.readFile(values['evidence-key'])
  ]);
  let verified=false;
  try{
   verified=!!envelope?.payload&&typeof envelope.signature==='string'&&
    verify(null,Buffer.from(JSON.stringify(envelope.payload)),key,Buffer.from(envelope.signature,'base64'));
  }catch{}
  const blockers=!verified?['evidence_signature_invalid']:
   !matchesOfficialArtifact(envelope.payload,artifact)?['evidence_artifact_mismatch']:
   (budgetSource==='self_ledger'?selfLedgerEvidenceBlockers(envelope.payload,account,Date.now()):
    officialEvidenceBlockers(envelope.payload,account,Date.now(),estimate,10000));
  return {status:blockers.length?'stopped':'verified',blockers};
 }
 const executionSha=git('rev-parse','HEAD');
 if(values.action==='scope'){
  if(!values.tenant)throw Error('owner_tenant_required');
  return expectedApproval(executionSha,values.tenant,account,undefined,budgetSource);
 }
 if(!['run','recover'].includes(values.action)||process.env.URENAVI_ISOLATED_COMPARISON!=='operator-enabled'||process.env.VERCEL)
  throw Error('isolated_operator_execution_disabled');
 if(values.action==='run'&&keyFingerprint!==account.credentialSha256)throw Error('comparison_credential_mismatch');
 if(git('status','--porcelain'))throw Error('clean_checkout_required');
 const {db,authorize}=createIsolatedComparisonSupabase({
  url:process.env.URENAVI_COMPARISON_LOCAL_SUPABASE,
  serviceKey:process.env.URENAVI_COMPARISON_LOCAL_SERVICE_KEY,
  ownerJwt:process.env.URENAVI_COMPARISON_LOCAL_OWNER_JWT
 });
 const [inputs,approvalKey,evidenceKey]=await Promise.all([
  json(values.inputs),fs.readFile(values['approval-key']),fs.readFile(values['evidence-key'])
 ]);
 const readVerifiedEvidence=async()=>{
  const [envelope,artifact]=await Promise.all([json(values.evidence),fs.readFile(values.artifact)]);
  return matchesOfficialArtifact(envelope?.payload,artifact)?envelope:null;
 };
 const transport=values.action==='run'?createGroqComparisonTransport({apiKey:groqKey}):
  async()=>{throw Error('no_transport_in_recovery');};
 const runner=createPairedComparisonRunner({inputs,environment:'isolated',executionSha,account,db,authorize,budgetSource,
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
