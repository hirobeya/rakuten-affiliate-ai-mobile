import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = process.env;
const origin = 'https://verify-urenavi-free-qa-191.hirobeya.workers.dev';
const redis = 'https://chief-panda-222800.upstash.io';
const password = env.URENAVI_FREE_PREVIEW_PASSWORD;
const token = env.URENAVI_FREE_REDIS_TOKEN;
function requireCondition(ok, label) { if (!ok) throw new Error(label); }
async function main() {
  requireCondition(typeof password === 'string' && password.length >= 32, 'QA_PASSWORD_MISSING');
  requireCondition(typeof token === 'string' && token.length > 0, 'REDIS_TOKEN_MISSING');
  let endpoint;
  try { endpoint = new URL(env.URENAVI_FREE_REDIS_URL); } catch { throw new Error('REDIS_ENDPOINT_INVALID'); }
  requireCondition(endpoint.href === redis + '/', 'REDIS_ENDPOINT_MISMATCH');
  console.log('QA_CONFIG_OK');
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const sha = git.stdout?.trim();
  requireCondition(git.status === 0 && /^[a-f0-9]{40}$/.test(sha), 'GIT_SHA_INVALID');
  // Test the dedicated Redis credentials with a single non-mutating command.
  let response;
  try { response = await fetch(redis, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(['PING']), redirect: 'error', signal: AbortSignal.timeout(5000)
  }); } catch { throw new Error('REDIS_NETWORK_FAILED'); }
  if (!response.ok) throw new Error('REDIS_HTTP_' + response.status);
  let body;
  try { body = await response.json(); } catch { throw new Error('REDIS_RESPONSE_INVALID'); }
  requireCondition(body.result === 'PONG', 'REDIS_PING_FAILED');
  console.log('QA_REDIS_PING_OK (one command; no Rakuten request)');
  const dir = mkdtempSync(join(tmpdir(), 'urenavi-qa-'));
  try {
    const file = join(dir, 'secrets.json');
    writeFileSync(file, JSON.stringify({ URENAVI_FREE_PREVIEW_PASSWORD: password, URENAVI_FREE_REDIS_TOKEN: token }), { mode: 0o600 });
    const result = spawnSync('npx', ['--yes', 'wrangler@4.168.0', 'versions', 'upload',
      '--preview-alias', 'verify', '--tag', 'feature/urenavi-free-20261127:' + sha,
      '--var', 'URENAVI_FREE_RAKUTEN_ORIGIN:' + origin,
      '--var', 'URENAVI_FREE_REDIS_URL:' + redis, '--secrets-file', file], { stdio: 'inherit' });
    requireCondition(result.status === 0, 'QA_UPLOAD_FAILED');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  console.log('QA_UPLOAD_OK ' + sha);
}
main().catch(error => {
  const code = error instanceof Error ? error.message : '';
  const allowed = /^(QA_PASSWORD_MISSING|REDIS_TOKEN_MISSING|REDIS_ENDPOINT_INVALID|REDIS_ENDPOINT_MISMATCH|GIT_SHA_INVALID|REDIS_NETWORK_FAILED|REDIS_HTTP_[1-5][0-9]{2}|REDIS_RESPONSE_INVALID|REDIS_PING_FAILED|QA_UPLOAD_FAILED)$/;
  console.error('QA_DEPLOY_STOPPED: ' + (allowed.test(code) ? code : 'UNEXPECTED_FAILURE'));
  process.exitCode = 1;
});
