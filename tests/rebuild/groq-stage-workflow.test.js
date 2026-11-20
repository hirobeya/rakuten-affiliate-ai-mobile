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
test('preflight is fail-closed when environment secrets or explicit acknowledgement are missing',()=>{
 const preparation=fs.readFileSync(path.join(__dirname,
  '../../scripts/rebuild/prepare-groq-stage.cjs'),'utf8');
 const operator=fs.readFileSync(path.join(__dirname,
  '../../scripts/rebuild/run-paired-comparison.cjs'),'utf8');
 assert.match(preparation,/manual_groq_authorization_missing/);
 assert.match(preparation,/URENAVI_MEASURE_MODE/);
 assert.match(preparation,/URENAVI_MEASURE_PROVIDER_APPROVAL/);
 assert.match(preparation,/URENAVI_APPROVAL_PRIVATE_PEM_B64/);
 assert.match(preparation,/URENAVI_EVIDENCE_PRIVATE_PEM_B64/);
 assert.match(preparation,/URENAVI_FROZEN_INPUTS_B64/);
 assert.doesNotMatch(preparation,/https:\/\/api\.groq\.com/);
 assert.match(operator,/isolated_operator_execution_disabled/);
 assert.match(operator,/remote_comparison_requires_persistent_journal_and_operator_gate/);
 assert.match(operator,/comparison_credential_mismatch/);
});

test('signed preflight scope exactly matches self-ledger runner and excludes legacy mode',()=>{
 const {signedStageScope}=require('../../scripts/rebuild/prepare-groq-stage.cjs');
 const {expectedApproval}=require('../../lib/urenavi-core/paired-comparison-runner');
 const {hash}=require('../../lib/urenavi-core/generation-comparison');
 const account={organization:'Personal',project:'Default Project',credentialSha256:'c'.repeat(64)};
 const sha='a'.repeat(40),tenant='11111111-1111-4111-8111-111111111111';
 const prepared=signedStageScope(sha,tenant,account);
 const expected=expectedApproval(sha,tenant,account,undefined,'self_ledger');
 assert.equal(prepared.budgetSource,'self_ledger');
 assert.equal(hash(prepared),hash(expected));
 assert.notEqual(hash(prepared),hash(expectedApproval(sha,tenant,account)));
 assert.equal(prepared.executionSha,sha);
 assert.equal(prepared.tenant,tenant);
 assert.ok(prepared.slots.length>0);
});
