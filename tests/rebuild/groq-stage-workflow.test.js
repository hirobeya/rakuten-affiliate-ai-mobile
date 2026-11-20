'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');

test('manual stage workflow is default-off and requires both an environment reviewer gate and distinct send approval',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/measure-groq-stage.yml'),'utf8');
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/default: preflight/);
 assert.match(workflow,/environment: groq-measure/);
 assert.match(workflow,/cancel-in-progress: false/);
 assert.match(workflow,/GROQ_MEASURE_ENV_REVIEWERS_CONFIRMED/);
 assert.match(workflow,/configured-and-reviewed/);
 assert.match(workflow,/I_AUTHORIZE_GROQ_LIMITED_MEASUREMENT/);
 assert.match(workflow,/if: \$\{\{ inputs\.mode == 'send' \}\}/);
 assert.match(workflow,/--action run-batch --journal-backend supabase --budget-source self_ledger/);
 assert.doesNotMatch(workflow,/schedule:/,'no scheduled transport is authorized');
});
test('preflight with missing GitHub environment secrets stops before generating approval or transport',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'groq-preflight-negative-'));
 try{
  const r=spawnSync(process.execPath,['scripts/rebuild/prepare-groq-stage.cjs'],{
   cwd:path.resolve(__dirname,'../..'),encoding:'utf8',
   env:{PATH:process.env.PATH,RUNNER_TEMP:folder,
    URENAVI_MEASURE_MODE:'preflight',
    URENAVI_MEASURE_ACK:'I_CHECKED_GROQ_FREE_NO_BILLING',
    URENAVI_MEASURE_STAGE:'generate',URENAVI_MEASURE_ARM:'B',
    URENAVI_MEASURE_MAX_CALLS:'1'}
  });
  assert.equal(r.status,1);
  assert.match(r.stderr,/preflight failed \(no provider send\)/);
  assert.equal(fs.readdirSync(folder).length,1,'no public approval or credentials written');
  assert.deepEqual(fs.readdirSync(path.join(folder,'urenavi-isolated-stage')),[]);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('Groq batch operator remains disabled even if CLI arguments are supplied',()=>{
 const r=spawnSync(process.execPath,['scripts/rebuild/run-paired-comparison.cjs',
  '--action','run-batch','--budget-source','self_ledger',
  '--organization','test','--project','test','--credential-sha256','c'.repeat(64)],{
   cwd:path.resolve(__dirname,'../..'),encoding:'utf8',
   env:{PATH:process.env.PATH}
  });
 assert.equal(r.status,1);
 assert.match(r.stderr,/stopped before receiving a usable result/);
});
