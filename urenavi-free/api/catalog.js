'use strict';

const { createHmac, randomUUID, timingSafeEqual } = require('node:crypto');
const { isIP } = require('node:net');
const { parseQuery, orderProducts, risingProducts } = require('../lib/catalog');
const { createRakuten } = require('../lib/rakuten');
const { createState } = require('../lib/state');

function liveAllowed(env, preview) {
  const sha = preview ? preview.sha : env.VERCEL_GIT_COMMIT_SHA;
  const isPreview = preview ? preview.isIsolatedPreview :
    env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === 'feature/urenavi-free-20261127';
  const deadline = Date.parse(env.URENAVI_FREE_APPROVED_UNTIL);
  if (preview?.isPublic) {
    return env.URENAVI_FREE_PUBLIC_ENABLED === 'true' && /^[a-f0-9]{40}$/.test(sha || '') &&
      sha === env.URENAVI_FREE_PUBLIC_SHA;
  }
  if (preview?.isIsolatedPreview) {
    const start = Date.parse(env.URENAVI_FREE_APPROVED_FROM);
    if (!Number.isFinite(start) || start > Date.now() || deadline - start !== 30 * 60 * 1000 ||
        env.URENAVI_FREE_APPROVAL_LIMIT !== '3') return false;
  }
  return isPreview &&
    /^[a-f0-9]{40}$/.test(sha || '') && sha === env.URENAVI_FREE_APPROVED_SHA &&
    Number.isFinite(deadline) && Date.now() < deadline;
}

function sign(secret, value) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function makeHandler(env = process.env, deps = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    function send(status, data) {
      return res.status(status).json(data);
    }

    if (req.method !== 'GET' && req.method !== 'POST') return send(405, { message: 'この操作は利用できません。' });
    if (req.method === 'GET' && req.query?.mode === 'capabilities') {
      return send(200, { rising: deps.preview?.isPublic === true && liveAllowed(env, deps.preview) &&
        env.URENAVI_FREE_CACHE_APPROVED === 'true' && env.URENAVI_FREE_RANK_HISTORY_APPROVED === 'true' });
    }
    const query = req.method === 'GET' ? parseQuery(req.query ?? {}) : null;
    if (req.method === 'GET' && !query) return send(400, { message: '検索語や価格の入力を確認してください。' });
    const closed = { message: '現在、楽天市場の商品データ取得を停止しています。' };
    if (!liveAllowed(env, deps.preview)) return send(503, closed);
    const publicMode = deps.preview?.isPublic === true;
    const trial = deps.preview?.isIsolatedPreview === true;
    if (publicMode && (query?.mode === 'rising' &&
        (env.URENAVI_FREE_CACHE_APPROVED !== 'true' || env.URENAVI_FREE_RANK_HISTORY_APPROVED !== 'true'))) return send(404, closed);
    if (trial && query && !(
      (query.mode === 'search' && query.keyword === '折りたたみ傘' && !query.genre && !query.maxPrice) ||
      (query.mode === 'ranking' && !query.genre) || query.mode === 'detail'
    )) return send(403, { message: '今回の検証枠の対象外です。' });

    const provider = (deps.createRakuten ?? createRakuten)(env);
    const state = (deps.createState ?? createState)(env, undefined, { publicMode, trial });
    const ip = deps.preview ? req.clientIp : req.headers['x-vercel-forwarded-for'];
    if (!provider || !state || typeof ip !== 'string' || !isIP(ip)) return send(503, closed);
    const secret = env.URENAVI_FREE_EVENT_SECRET;
    const client = sign(secret, ip);

    try {
      if (req.method === 'POST') {
        const { code, event, expires, token } = req.body ?? {};
        if (typeof code !== 'string' || !/^[\w-]{1,64}:[\w-]{1,80}$/.test(code) ||
            !['view', 'click'].includes(event) || !Number.isSafeInteger(expires) ||
            expires <= Date.now() || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return send(400, {});
        const valid = timingSafeEqual(Buffer.from(token), Buffer.from(sign(secret, [client, code, expires, event].join('|'))));
        if (!valid) return send(400, {});
        await state.record(code, event, client);
        return send(200, {});
      }

      const nonce = randomUUID();
      const sourceQuery = query.mode === 'rising' ? { ...query, mode: 'realtime' } : query;
      const [action, cached, last, older] = await state.claim(sourceQuery, client, nonce);
      let result;
      if (action === 'cached') {
        result = JSON.parse(cached);
      } else if (action === 'send') {
        // A crash, unknown response or failure leaves the durable pending flag in place.
        if (!liveAllowed(env, deps.preview)) return send(503, closed);
        result = await provider.get(sourceQuery);
        if (await state.finish(sourceQuery, nonce, result) !== 1) return send(503, closed);
      } else {
        return send(action === 'busy' || action === 'limited' ? 429 : 503,
          action === 'busy' || action === 'limited' ? { message: '検索が集中しています。時間をおいてお試しください。' } : closed);
      }

      const expires = Date.now() + 30 * 60 * 1000;
      if (result.inputRejected) return send(400, { message: '楽天市場で検索できるキーワードに変更してください。' });
      const snapshots = query.mode === 'rising' ?
        [last, older].filter(Boolean).map(snapshot => JSON.parse(snapshot)) : [];
      const previous = snapshots.find(snapshot => Date.parse(result.updatedAt) - snapshot.timestamp >= 300000);
      const matched = query.mode === 'rising' ? risingProducts(result, previous) : orderProducts(result.products, query.mode);
      const products = matched.map(product => {
        const token = event => sign(secret, [client, product.code, expires, event].join('|'));
        return { ...product, expires, viewToken: token('view'), clickToken: product.affiliateUrl ? token('click') : null };
      });
      return send(200, { ...result, products });
    } catch {
      return send(503, closed);
    }
  };
}

module.exports = makeHandler();
module.exports.makeHandler = makeHandler;
