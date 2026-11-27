import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';

test('Cloudflare serves assets and does not expose unapproved catalog data', async () => {
  const origin = 'https://verify-urenavi-free-qa-191.fixture.workers.dev';
  const env = {
    ASSETS: { fetch: () => new Response('static') },
    WORKER_VERSION: { id: 'abcdef12-3456-7890-1234-567890123456' },
    URENAVI_FREE_RAKUTEN_ORIGIN: origin
  };
  assert.equal((await worker.fetch(new Request(origin), env)).status, 503);
  env.URENAVI_FREE_PREVIEW_PASSWORD = 'test-fixture-password'.repeat(2);
  const options = { headers: { Authorization: 'Basic ' + Buffer.from('urenavi:' + env.URENAVI_FREE_PREVIEW_PASSWORD).toString('base64') } };
  assert.equal((await worker.fetch(new Request(origin), env)).status, 401);
  assert.equal(await (await worker.fetch(new Request(origin, options), env)).text(), 'static');
  const result = await worker.fetch(new Request(origin + '/api/catalog?keyword=傘', options), env);
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal((await worker.fetch(new Request(origin + '/api/other', options), env)).status, 404);
  assert.equal((await worker.fetch(new Request(origin + '/api/catalog?keyword=傘&keyword=靴', options), env)).status, 400);
});

test('Cloudflare rejects oversized analytics bodies and an unapproved live hostname', async () => {
  const env = {
    WORKER_VERSION: {
      id: 'abcdef12-3456-7890-1234-567890123456',
      tag: 'feature/urenavi-free-20261127:' + 'a'.repeat(40)
    },
    URENAVI_FREE_APPROVED_SHA: 'a'.repeat(40),
    URENAVI_FREE_APPROVED_UNTIL: new Date(Date.now() + 60000).toISOString(),
    URENAVI_FREE_RAKUTEN_ORIGIN: 'https://verify-urenavi-free-qa-191.fixture.workers.dev'
  };
  const wrongOrigin = 'https://wrong-urenavi-free-qa-191.fixture.workers.dev/api/catalog';
  assert.equal((await worker.fetch(new Request(wrongOrigin + '?keyword=傘'), env)).status, 503);
  const oversized = new Request(wrongOrigin, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: 'x'.repeat(4096) })
  });
  assert.equal((await worker.fetch(oversized, env)).status, 400);
});

test('Cloudflare verification URL requires authentication before static files or APIs', async () => {
  const origin = 'https://verify-urenavi-free-qa-191.fixture.workers.dev';
  const env = {
    ASSETS: { fetch: () => new Response('static') },
    WORKER_VERSION: { id: 'fixture', tag: 'feature/urenavi-free-20261127:' + 'a'.repeat(40) },
    URENAVI_FREE_RAKUTEN_ORIGIN: origin,
    URENAVI_FREE_PREVIEW_PASSWORD: 'test-fixture-password'.repeat(2)
  };
  assert.equal((await worker.fetch(new Request(origin), env)).status, 401);
  assert.equal((await worker.fetch(new Request(origin + '/api/catalog?mode=ranking'), env)).status, 401);
  const authorized = { headers: { Authorization: 'Basic ' +
    Buffer.from('urenavi:' + env.URENAVI_FREE_PREVIEW_PASSWORD).toString('base64') } };
  assert.equal((await worker.fetch(new Request(origin, authorized), env)).status, 200);
  assert.equal((await worker.fetch(new Request(origin + '/api/catalog?mode=ranking', authorized), env)).status, 503);
});

 test('QA alias is protected even without origin or version bindings', async () => {
  const origin = 'https://verify-urenavi-free-qa-191.fixture.workers.dev';
  const env = { ASSETS: { fetch: () => { throw new Error('must not serve assets'); } } };
  assert.equal((await worker.fetch(new Request(origin), env)).status, 503);
  env.URENAVI_FREE_PREVIEW_PASSWORD = 'test-fixture-password'.repeat(2);
  assert.equal((await worker.fetch(new Request(origin), env)).status, 401);
  assert.equal((await worker.fetch(new Request(origin + '/api/catalog'), env)).status, 401);
});

test('QA Redis probe is POST-only, requires authorization, and is not a public route', async () => {
  const origin = 'https://verify-urenavi-free-qa-191.fixture.workers.dev';
  const env = { URENAVI_FREE_PREVIEW_PASSWORD: 'test-fixture-password'.repeat(2) };
  const headers = { Authorization: 'Basic ' + Buffer.from('urenavi:' + env.URENAVI_FREE_PREVIEW_PASSWORD).toString('base64') };
  assert.equal((await worker.fetch(new Request(origin + '/api/qa-redis', { method: 'POST' }), env)).status, 401);
  assert.equal((await worker.fetch(new Request(origin + '/api/qa-redis', { headers }), env)).status, 405);
  assert.equal((await worker.fetch(new Request(origin + '/api/qa-redis', { method: 'POST', headers }), env)).status, 503);
  assert.equal((await worker.fetch(new Request('https://urenavi-free-public.fixture.workers.dev/api/qa-redis', { method: 'POST', headers }), env)).status, 404);
});
