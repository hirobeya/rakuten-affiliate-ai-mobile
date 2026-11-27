'use strict';
const { createHash } = require('node:crypto');
const endpoint = 'https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch';
function normalize(hit) {
  if (!hit || typeof hit.code !== 'string' || !hit.code || typeof hit.name !== 'string' || !hit.name.trim() ||
      !Number.isSafeInteger(hit.price) || hit.price < 0) return null;
  let url;
  try { url = new URL(hit.url); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !['store.shopping.yahoo.co.jp','shopping.yahoo.co.jp','lohaco.yahoo.co.jp'].includes(url.hostname)) return null;
  const rating = hit.review?.rate;
  const reviews = hit.review?.count;
  return {
    source: 'yahoo', code: 'yahoo:' + createHash('sha256').update(hit.code).digest('hex'),
    sourceCode: hit.code, title: hit.name, price: hit.price, shop: typeof hit.seller?.name === 'string' ? hit.seller.name : '',
    rating: typeof rating === 'number' && rating >= 0 && rating <= 5 ? rating : null,
    reviews: Number.isSafeInteger(reviews) && reviews >= 0 ? reviews : null,
    productUrl: url.href, affiliateUrl: null, estimatedCommission: null, rank: null
  };
}
function createYahoo(env, send = fetch) {
  if (env.URENAVI_FREE_YAHOO_TERMS_CONFIRMED !== 'true' || !env.URENAVI_FREE_YAHOO_APP_ID) return null;
  return {
    async search(query) {
      if (typeof query.keyword !== 'string' || !query.keyword.trim() || query.keyword.length > 128 ||
          !['search','budget'].includes(query.mode) ||
          (query.maxPrice && !/^[1-9][0-9]{0,8}$/.test(query.maxPrice))) throw new Error('invalid-query');
      const url = new URL(endpoint);
      url.searchParams.set('appid', env.URENAVI_FREE_YAHOO_APP_ID);
      url.searchParams.set('query', query.keyword.trim());
      url.searchParams.set('results', '20');
      if (query.maxPrice) url.searchParams.set('price_to', query.maxPrice);
      if (query.mode === 'budget') url.searchParams.set('sort', '+price');
      const response = await send(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('yahoo-unavailable');
      const data = await response.json();
      if (!Array.isArray(data.hits)) throw new Error('yahoo-invalid-response');
      const products = data.hits.map(normalize).filter(Boolean).filter(p => !query.maxPrice || p.price <= Number(query.maxPrice));
      return { source: 'yahoo', fetchedAt: new Date().toISOString(), products };
    }
  };
}
module.exports = { createYahoo, normalize };
