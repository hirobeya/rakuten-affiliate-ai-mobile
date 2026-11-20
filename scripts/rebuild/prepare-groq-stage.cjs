'use strict';
// Explicitly isolated GitHub Actions operator preflight. Creates signed inputs
// only in RUNNER_TEMP; never calls Groq, Vercel or a database.
const fs=require('node:fs');
const path=require('node:path');
const {createHash,createPrivateKey,createPublicKey,randomUUID,sign}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {expectedApproval}=require('../../lib/urenavi-core/paired-comparison-runner');
const {importOfficialEvidence}=require('../../lib/urenavi-core/official-capacity-evidence');
const {fixedInputs,MODEL}=require('../../lib/urenavi-core/generation-comparison');
const manifest=require('../../docs/evaluations/20261120-multi-sentence/frozen-index.json');

const env=process.env;
const required=name=>{
 const value=env[name];
 if(!value)throw Error('isolated_stage_preflight_missing_'+name);
 return value;
};
function run(){
 const mode=required('URENAVI_MEASURE_MODE');
 if(!['preflight','send'].includes(mode)||
    required('URENAVI_MEASURE_ACK')!=='I_CHECKED_GROQ_FREE_NO_BILLING'||
    (mode==='send'&&
     required('URENAVI_MEASURE_PROVIDER_APPROVAL')!=='I_AUTHORIZE_GROQ_LIMITED_MEASUREMENT'))
  throw Error('manual_groq_authorization_missing');
 const stage=required('URENAVI_MEASURE_STAGE');
 const arm=required('URENAVI_MEASURE_ARM');
 const maxCalls=Number(required('URENAVI_MEASURE_MAX_CALLS'));
 if(!['generate','verify'].includes(stage)||!['B','C'].includes(arm)||
    !Number.isSafeInteger(maxCalls)||maxCalls<1||maxCalls>2)
  throw Error('invalid_stage_or_batch_size');
 const folder=path.join(required('RUNNER_TEMP'),'urenavi-isolated-stage');
 fs.mkdirSync(folder,{recursive:true,mode:0o700});
 const privateApproval=createPrivateKey(Buffer.from(required('URENAVI_APPROVAL_PRIVATE_PEM_B64'),'base64'));
 const privateEvidence=createPrivateKey(Buffer.from(required('URENAVI_EVIDENCE_PRIVATE_PEM_B64'),'base64'));
 const groqKey=required('URENAVI_COMPARISON_GROQ_KEY');
 const account={
  organization:required('URENAVI_GROQ_ORGANIZATION'),
  project:required('URENAVI_GROQ_PROJECT'),
  credentialSha256:createHash('sha256').update(groqKey).digest('hex')
 };
 const tenant=required('URENAVI_ISOLATED_OWNER_ID');
 if(!/^[0-9a-f-]{36}$/i.test(tenant))throw Error('invalid_isolated_owner_identity');
 const executionSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const scope=expectedApproval(executionSha,tenant,account);
 const targets=scope.slots.filter(s=>s.arm===arm).slice(0,maxCalls).map(s=>({
  itemCode:s.itemCode,arm,stage
 }));
 if(targets.length!==maxCalls)throw Error('fixed_stage_targets_missing');
 const inputs=Buffer.from(required('URENAVI_FROZEN_INPUTS_B64'),'base64').toString('utf8');
 fixedInputs(manifest,JSON.parse(inputs));
 const at=Date.now();
 const expiry=new Date(at+600000).toISOString();
 const signed=(payload,privateKey)=>({
  payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),privateKey).toString('base64')
 });
 const approval=signed({
  approvalId:createHash('sha256').update(randomUUID()+executionSha+JSON.stringify(targets)).digest('hex'),
  expiresAt:expiry,scope,targets,maxCalls
 },privateApproval);
 const artifact=Buffer.from(JSON.stringify({
  kind:'administrator-declaration',
  declaredAt:new Date(at).toISOString(),
  declaredNonbillableFree:true,
  organization:account.organization,project:account.project,
  credentialSha256:account.credentialSha256
 }));
 const declaration=importOfficialEvidence({
  source:'administrator_declaration',verifiedAt:new Date(at).toISOString(),
  expiresAt:expiry,model:MODEL,account,
  plan:'free',billable:false,exclusiveWindow:false,unresolvedSends:null,counters:{}
 },artifact);
 const evidence=signed(declaration,privateEvidence);
 const files={
  'approval.json':JSON.stringify(approval),
  'evidence.json':JSON.stringify(evidence),
  'artifact.json':artifact,
  'inputs.json':inputs,
  'approval-public.pem':createPublicKey(privateApproval).export({format:'pem',type:'spki'}),
  'evidence-public.pem':createPublicKey(privateEvidence).export({format:'pem',type:'spki'})
 };
 for(const [name,data] of Object.entries(files))
  fs.writeFileSync(path.join(folder,name),data,{mode:0o600,flag:'wx'});
 process.stdout.write(JSON.stringify({
  status:'signed-stage-prepared',stage,arm,maxCalls,executionSha,
  targetItemCodes:targets.map(t=>t.itemCode),folder
 })+'\n');
}
try{run();}catch{
 // Deliberately do not reveal missing secret values, private key or raw inputs.
 process.stderr.write('isolated signed-stage preflight failed (no provider send)\n');
 process.exitCode=1;
}
