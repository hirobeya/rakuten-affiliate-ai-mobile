'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { parseQuery, orderProducts, risingProducts } = require('../lib/catalog');
const { createRakuten } = require('../lib/rakuten');
const { createState } = require('../lib/state');
const { makeHandler } = require('../api/catalog');

const sha = 'a'.repeat(40);
const id = 'fixture-id';
const env = {
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: 'feature/urenavi-free-20261127',
  VERCEL_GIT_COMMIT_SHA: sha,
  URENAVI_FREE_APPROVED_SHA: sha,
  URENAVI_FREE_APPROVED_UNTIL: new Date(Date.now() + 3600000).toISOString(),
  URENAVI_FREE_EVENT_SECRET: 'fixture-secret'.repeat(3),
  URENAVI_FREE_RAKUTEN_AFFILIATE_ID: id,
  URENAVI_FREE_APPROVED_AFFILIATE_HASH: createHash('sha256').update(id).digest('hex'),
  URENAVI_FREE_RAKUTEN_ORIGIN: 'https://example.test',
  URENAVI_FREE_RAKUTEN_APP_ID: 'test-app',
  URENAVI_FREE_RAKUTEN_ACCESS_KEY: 'test-access',
  URENAVI_FREE_REDIS_URL: 'https://fixture.upstash.io',
  URENAVI_FREE_REDIS_TOKEN: 'fixture',
  URENAVI_FREE_DAILY_LIMIT: '4',
  URENAVI_FREE_APPROVAL_LIMIT: '4'
};
const headers = { 'x-vercel-forwarded-for': '192.0.2.1' };
const itemUrl = 'https://item.rakuten.co.jp/fixture/123/';
const affiliateUrl = 'https://hb.afl.rakuten.co.jp/hgc/provider-reported-id/?pc=' + encodeURIComponent(itemUrl);
const sample = { itemCode: 'fixture:123', itemName: 'テスト商品', itemPrice: 3000, itemUrl, affiliateUrl, affiliateRate: 8 };
const query = { keyword: '砂糖' };

async function request(handler, options = {}) {
  const res = {
    setHeader() {},
    status(code) { this.code = code; return this; },
    json(data) { return { code: this.code, data }; }
  };
  return handler({ method: 'GET', headers, query, ...options }, res);
}

test('normalizes input and rejects repeated parameters and invalid prices', () => {
  assert.deepEqual(parseQuery({ keyword: ' ＵＳＢ　ハブ ' }), { mode: 'search', keyword: 'USB ハブ', genre: '', maxPrice: '' });
  assert.equal(parseQuery({ keyword: ['a', 'b'] }), null);
  assert.equal(parseQuery({ keyword: '本', maxPrice: '1e3' }), null);
});

test('source links retain provider attribution and reject an unrelated product', async () => {
  const provider = createRakuten(env, async (url, options) => {
    assert.equal(url.pathname, '/ichibams/api/IchibaItem/Search/20260701');
    assert.equal(url.searchParams.get('affiliateId'), id);
    assert.equal(options.headers.accessKey, 'test-access');
    assert.equal(url.searchParams.has('accessKey'), false);
    return Response.json({ Items: [sample, { ...sample, itemCode: 'fixture:124',
      itemUrl: 'https://item.rakuten.co.jp/fixture/124/' }] });
  });
  const { products } = await provider.get({ ...query, mode: 'search' });
  assert.equal(products[0].affiliateUrl, affiliateUrl);
  assert.equal(products[1].affiliateUrl, null);
  assert.equal(products[0].estimatedCommission, 240);
  assert.equal(createRakuten({ ...env, URENAVI_FREE_APPROVED_AFFILIATE_HASH: '' }), null);
});

test('ranking uses the official rank and realtime parameter', async () => {
  const provider = createRakuten(env, async url => {
    assert.equal(url.pathname, '/ichibaranking/api/IchibaItem/Ranking/20220601');
    assert.equal(url.searchParams.get('period'), 'realtime');
    return Response.json({ lastBuildDate: '2026-11-27T00:30:00Z', items: [{ ...sample, rank: 7 }] });
  });
  const { products, updatedAt } = await provider.get({ mode: 'realtime' });
  assert.equal(products[0].rank, 7);
  assert.equal(updatedAt, '2026-11-27T00:30:00.000Z');
  const current = { products, updatedAt };
  assert.equal(risingProducts(current, { updatedAt: '2026-11-27T00:20:00Z', ranks: [['fixture:123', 12]] })[0].rankGain, 5);
  assert.deepEqual(risingProducts(current, null), []);
  assert.deepEqual(risingProducts(current, { updatedAt, ranks: [['fixture:123', 12]] }), []);
});

test('budget and commission use actual values from the returned candidates', () => {
  const products = [{ price: 10000, estimatedCommission: null }, { price: 2000, estimatedCommission: 80 }];
  assert.deepEqual(orderProducts(products, 'budget'), [products[1], products[0]]);
  assert.deepEqual(orderProducts(products, 'commission'), [products[1]]);
});

test('approval is bound to the exact Preview commit and expiry', async () => {
  for (const override of [
    { VERCEL_ENV: 'production' },
    { VERCEL_GIT_COMMIT_REF: 'main' },
    { URENAVI_FREE_APPROVED_SHA: 'b'.repeat(40) },
    { URENAVI_FREE_APPROVED_UNTIL: new Date(0).toISOString() }
  ]) {
    const handler = makeHandler({ ...env, ...override }, {
      createState: () => assert.fail('no state access'),
      createRakuten: () => assert.fail('no provider access')
    });
    assert.equal((await request(handler)).code, 503);
  }
});

test('429 and uncertain responses leave the reservation untouched and never retry', async () => {
  for (const status of [429, 500, null]) {
    let sent = 0;
    let pending = false;
    const handler = makeHandler(env, {
      createRakuten: () => createRakuten(env, async () => {
        sent++;
        if (status === null) throw new Error('timeout');
        return new Response('', { status });
      }),
      createState: () => ({
        claim() {
          if (pending) return ['stopped'];
          pending = true;
          return ['send'];
        },
        finish: () => assert.fail('uncertain send must retain the pending marker')
      })
    });
    assert.equal((await request(handler)).code, 503);
    assert.equal((await request(handler)).code, 503);
    assert.equal(sent, 1);
  }
});

test('cached reads skip the provider and analytics require the matching event proof', async () => {
  const calls = [];
  const handler = makeHandler(env, {
    createRakuten: () => ({ get: () => assert.fail('cache hit must not send') }),
    createState: () => ({
      claim: () => ['cached', JSON.stringify({ products: [{ code: sample.itemCode, affiliateUrl }] })],
      record: (...args) => calls.push(args)
    })
  });
  const { data } = await request(handler);
  const [product] = data.products;
  const body = { code: product.code, event: 'click', token: product.clickToken, expires: product.expires };
  assert.equal((await request(handler, { method: 'POST', body })).code, 200);
  assert.equal((await request(handler, { method: 'POST', body: { ...body, event: 'view' } })).code, 400);
  assert.equal(calls.length, 1);
});

test('shared cache is opt-in and missing state credentials close live requests', async () => {
  for (const enabled of ['', 'true']) {
    const store = createState({ ...env, URENAVI_FREE_CACHE_APPROVED: enabled }, async (_, init) => {
      const [verb, script, keyCount, ...args] = JSON.parse(init.body);
      assert.equal(verb, 'EVAL');
      assert.match(script, /EXISTS.+KEYS\[2\]/);
      assert.equal(args[keyCount + 2], enabled ? 60 : 0);
      return Response.json({ result: ['limited'] });
    });
    assert.deepEqual(await store.claim(parseQuery(query), 'client', 'nonce'), ['limited']);
  }
  assert.equal(createState({ ...env, URENAVI_FREE_REDIS_TOKEN: '' }), null);
});
