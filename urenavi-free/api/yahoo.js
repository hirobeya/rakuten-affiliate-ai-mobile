'use strict';
const { randomUUID } = require('node:crypto');
const { createYahoo } = require('../lib/yahoo');
const reserve = "if redis.call('EXISTS',KEYS[1])==1 then return 0 end; if redis.call('EXISTS',KEYS[2])==1 then return 0 end; if tonumber(redis.call('GET',KEYS[3]) or '0')>=tonumber(ARGV[2]) then return 0 end; redis.call('SET',KEYS[1],ARGV[1]); redis.call('SET',KEYS[2],'1','EX',2); redis.call('INCR',KEYS[3]); redis.call('EXPIRE',KEYS[3],172800); return 1";
const finish = "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end; redis.call('DEL',KEYS[1]); return 1";
function allowed(env, preview, now) {
  const start = Date.parse(env.URENAVI_FREE_YAHOO_FROM), end = Date.parse(env.URENAVI_FREE_YAHOO_UNTIL);
  return preview?.isIsolatedPreview === true && /^[a-f0-9]{40}$/.test(preview.sha || '') &&
    preview.sha === env.URENAVI_FREE_YAHOO_SHA && Number.isFinite(start) &&
    end - start === 1800000 && now >= start && now < end;
}
async function handleYahoo(env, preview, query, deps = {}) {
  const closed = { status: 503, data: { message: 'Yahoo!の商品取得は現在停止中です。' } };
  const now = deps.now || Date.now;
  if (!allowed(env, preview, now())) return closed;
  if (Object.keys(query).some(k => !['keyword','mode','maxPrice'].includes(k)) ||
      typeof query.keyword !== 'string' || !query.keyword.trim() || query.keyword.length > 128 ||
      !['search','budget'].includes(query.mode) ||
      (query.maxPrice !== undefined && query.maxPrice !== '' && (typeof query.maxPrice !== 'string' || !/^[1-9][0-9]{0,8}$/.test(query.maxPrice)))) return {status:400,data:{message:'検索条件を確認してください。'}};
  const provider = createYahoo(env, deps.providerFetch);
  if (!provider || env.URENAVI_FREE_REDIS_URL !== 'https://chief-panda-222800.upstash.io' || !env.URENAVI_FREE_REDIS_TOKEN) return closed;
  const send = deps.redisFetch || fetch;
  const nonce = randomUUID();
  const prefix = 'urenavi:free:yahoo:v1:';
  const pending = prefix + 'pending';
  const day = Math.floor(now()/86400000);
  const keys = [pending,prefix+'spacing',prefix+'used:'+day];
  async function evalCommand(script, keys, args) {
    const response = await send(env.URENAVI_FREE_REDIS_URL, {method:'POST', headers:{Authorization:'Bearer '+env.URENAVI_FREE_REDIS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',script,keys.length,...keys,...args]),redirect:'manual',signal:AbortSignal.timeout(2500)});
    if (!response.ok) throw new Error('redis');
    const body = await response.json();
    if (body.error) throw new Error('redis');
    return body.result;
  }
  try {
    if (await evalCommand(reserve,keys,[nonce,3]) !== 1) return {status:429,data:{message:'Yahoo!の検証枠は停止中または上限に達しました。'}};
    if (!allowed(env,preview,now())) return closed;
    const data = await provider.search(query);
    if (await evalCommand(finish,[pending],[nonce]) !== 1) return closed;
    return {status:200,data};
  } catch { return closed; }
}
module.exports = { handleYahoo, allowed };
