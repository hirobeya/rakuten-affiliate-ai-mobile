'use strict';
// Contract test for the free-search / paid-generation split.
// Intentionally red until an authenticated, rate-limited free-search
// authorization path is implemented. Do not remove subscription checks
// from the shared billing.authorize() used by paid endpoints.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('search uses independent verified identity and atomic quota', () => {
  const source = fs.readFileSync(path.join(__dirname, '../api/search.js'), 'utf8');
  assert.match(source, /const\s+authorizeFn\s*=\s*deps\.authorize\s*\|\|\s*authenticateSearchUser\s*;/);
  assert.match(source, /rpc\/urenavi_claim_search_daily/);
  assert.match(source, /if\(!allowed\) return res\.status\(429\)/);
});

test('free search identity verifier is distinct from paid authorization', () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/billing.js'), 'utf8');
  assert.match(source, /async function authenticateSearchUser\(req\)/);
  assert.match(source, /rpc\/urenavi_session_valid/);
  assert.match(source, /authenticateSearchUser,authorizePro/);
});

test('paid subscription authorization remains enforced independently', () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/billing.js'), 'utf8');
  assert.match(source, /async function authorizePro\(req\)/);
  assert.match(source, /result\.plan==='owner'\s*\|\|\s*result\.plan==='pro'/);
});
