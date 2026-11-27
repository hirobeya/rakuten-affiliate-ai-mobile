'use strict';

const { createHash } = require('node:crypto');
const { commission } = require('./catalog');

const origin = 'https://openapi.rakuten.co.jp';
const endpoints = {
  search: '/ichibams/api/IchibaItem/Search/20260701',
  ranking: '/ichibaranking/api/IchibaItem/Ranking/20220601'
};

function httpsUrl(value, host) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || url.port) return null;
    return url;
  } catch {
    return null;
  }
}

function affiliateLink(value, destination) {
  const url = httpsUrl(value, 'hb.afl.rakuten.co.jp');
  if (!url || !/^\/hgc\/[\w.-]+(?:\/[\w.-]*)?\/?$/.test(url.pathname)) return null;
  const targets = url.searchParams.getAll('pc');
  const mobile = url.searchParams.getAll('m');
  if (targets.length !== 1 || mobile.length > 1) return null;
  if (![...targets, ...mobile].every(target => httpsUrl(target, 'item.rakuten.co.jp')?.href === destination.href)) return null;
  return value;
}

function numberIn(value, min, max) {
  if ((typeof value !== 'number' && typeof value !== 'string') || !String(value).trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function itemDestination(value) {
  const direct = httpsUrl(value, 'item.rakuten.co.jp');
  if (direct) return direct;
  const wrapped = httpsUrl(value, 'hb.afl.rakuten.co.jp')?.searchParams.getAll('pc');
  return wrapped?.length === 1 ? httpsUrl(wrapped[0], 'item.rakuten.co.jp') : null;
}

function normalize(item, ranked) {
  const destination = itemDestination(item.itemUrl);
  const price = numberIn(item.itemPrice, 1, Number.MAX_SAFE_INTEGER);
  if (!destination || !Number.isInteger(price) || typeof item.itemName !== 'string' ||
      !item.itemName.trim() || !/^[\w-]{1,64}:[\w-]{1,80}$/.test(item.itemCode || '')) return null;
  const [shop] = item.itemCode.split(':');
  // Rakuten item codes and shop-managed URL slugs can differ.
  if (destination.pathname.split('/')[1] !== shop || !destination.pathname.split('/')[2]) return null;
  const rank = ranked ? numberIn(item.rank, 1, 1000) : null;
  if (ranked && !Number.isInteger(rank)) return null;
  const rate = numberIn(item.affiliateRate, 0, 100);
  return {
    source: 'rakuten',
    code: item.itemCode,
    title: item.itemName,
    description: typeof item.itemCaption === 'string' ? item.itemCaption.replace(/<[^>]*>/g, ' ').trim() : '',
    shop: typeof item.shopName === 'string' ? item.shopName : shop,
    price,
    rate,
    estimatedCommission: commission(price, rate),
    reviews: numberIn(item.reviewCount, 0, Number.MAX_SAFE_INTEGER),
    rating: numberIn(item.reviewAverage, 0, 5),
    rank,
    affiliateUrl: affiliateLink(item.affiliateUrl, destination)
  };
}

function createRakuten(env, send = fetch) {
  const id = env.URENAVI_FREE_RAKUTEN_AFFILIATE_ID;
  const app = env.URENAVI_FREE_RAKUTEN_APP_ID;
  const access = env.URENAVI_FREE_RAKUTEN_ACCESS_KEY;
  const site = env.URENAVI_FREE_RAKUTEN_ORIGIN;
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(site || '')) return null;
  if (!app || !access || !/^[\w.-]+$/.test(id || '') ||
      createHash('sha256').update(id).digest('hex') !== env.URENAVI_FREE_APPROVED_AFFILIATE_HASH) return null;

  return {
    async get(query) {
      const ranked = query.mode === 'ranking' || query.mode === 'realtime';
      const url = new URL(ranked ? endpoints.ranking : endpoints.search, origin);
      const params = new URLSearchParams({ applicationId: app, affiliateId: id, format: 'json', formatVersion: '2' });
      if (query.genre) params.set('genreId', query.genre);
      if (ranked) {
        if (query.mode === 'realtime') params.set('period', 'realtime');
      } else {
        if (query.code) params.set('itemCode', query.code);
        if (query.keyword) params.set('keyword', query.keyword);
        if (query.maxPrice) params.set('maxPrice', query.maxPrice);
        params.set('hits', '30');
        params.set('availability', '1');
        const sort = { budget: '+itemPrice', commission: '-affiliateRate' };
        params.set('sort', sort[query.mode] || 'standard');
      }
      url.search = params;
      const response = await send(url, { headers: { accessKey: access, Origin: site, Referer: site + '/' }, signal: AbortSignal.timeout(7000), redirect: 'error' });
      if ([400, 404].includes(response.status)) {
        const body = await response.json();
        if (response.status === 404 && body.error === 'not_found') {
          return { products: [], updatedAt: null, fetchedAt: new Date().toISOString() };
        }
        if (response.status === 400 && body.error === 'wrong_parameter' && query.keyword) {
          return { products: [], updatedAt: null, fetchedAt: new Date().toISOString(), inputRejected: true };
        }
      }
      if (!response.ok) throw new Error(response.status === 429 ? 'rate-limited' : 'upstream-failed');
      const data = await response.json();
      const items = data.Items ?? data.items;
      if (!Array.isArray(items)) throw new Error('invalid-upstream');
      const products = new Map();
      for (const entry of items.slice(0, 30)) {
        if (!entry || typeof entry !== 'object') continue;
        const item = normalize(entry.Item ?? entry, ranked);
        if (item && (!query.code || item.code === query.code) && !products.has(item.code)) products.set(item.code, item);
      }
      if (items.length && !products.size && !query.code) throw new Error('invalid-upstream-products');
      const updated = typeof data.lastBuildDate === 'string' ? Date.parse(data.lastBuildDate) : NaN;
      return {
        products: Array.from(products.values()),
        updatedAt: Number.isFinite(updated) ? new Date(updated).toISOString() : null,
        fetchedAt: new Date().toISOString()
      };
    }
  };
}

module.exports = { createRakuten, affiliateLink };
