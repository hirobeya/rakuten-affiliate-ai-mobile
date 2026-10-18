'use strict';
// Contract test for the free-search / paid-generation split.
// Intentionally red until an authenticated, rate-limited free-search
// authorization path is implemented. Do not remove subscription checks
// from the shared billing.authorize() used by paid endpoints.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test.todo('search must not reuse paid subscription authorization', () => {
  const source = fs.readFileSync(path.join(__dirname, '../api/search.js'), 'utf8');
  assert.doesNotMatch(source, /const\s+authorizeFn\s*=\s*deps\.authorize\s*\|\|\s*authorize\s*;/,
    'Free search still defaults to subscription-only billing.authorize; add a separate authenticated, rate-limited search policy');
});

test('paid subscription authorization remains enforced independently', () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/billing.js'), 'utf8');
  assert.match(source, /async function authorizePro\(req\)/);
  assert.match(source, /result\.plan==='owner'\s*\|\|\s*result\.plan==='pro'/);
});
