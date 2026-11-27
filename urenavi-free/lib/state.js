'use strict';

const { createHash } = require('node:crypto');

const claim = `
local minute = redis.call('INCR', KEYS[1])
if minute == 1 then redis.call('EXPIRE', KEYS[1], 60) end
if minute > 8 then return {'limited'} end
if redis.call('EXISTS', KEYS[2]) == 1 then return {'stopped'} end
local cached = redis.call('GET', KEYS[3])
local previous = redis.call('GET', KEYS[6]) or ''
if cached and tonumber(ARGV[3]) > 0 then return {'cached', cached, previous, redis.call('GET', KEYS[7]) or ''} end
if redis.call('EXISTS', KEYS[5]) == 1 then return {'busy'} end
local day = math.floor(tonumber(redis.call('TIME')[1]) / 86400)
local bucket = KEYS[4] .. ':' .. tostring(day)
local used = tonumber(redis.call('GET', bucket) or 0)
local approved = tonumber(redis.call('GET', KEYS[8]) or 0)
if used >= tonumber(ARGV[2]) or approved >= tonumber(ARGV[4]) then return {'limited'} end
redis.call('SET', KEYS[2], ARGV[1])
redis.call('SET', KEYS[5], '1', 'EX', 2)
redis.call('INCR', bucket)
redis.call('INCR', KEYS[8])
redis.call('EXPIRE', bucket, 172800)
return {'send', '', previous, redis.call('GET', KEYS[7]) or ''}
`;

const finish = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if tonumber(ARGV[2]) > 0 then redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[2]) end
if tonumber(ARGV[2]) > 0 and ARGV[4] ~= '' then
  local snapshot = cjson.decode(ARGV[4])
  local prior = redis.call('GET', KEYS[3])
  if not prior then
    redis.call('SET', KEYS[3], ARGV[4], 'EX', 3600)
  elseif snapshot.timestamp - cjson.decode(prior).timestamp >= 300000 then
    redis.call('SET', KEYS[4], prior, 'EX', 3600)
    redis.call('SET', KEYS[3], ARGV[4], 'EX', 3600)
  end
end
redis.call('DEL', KEYS[1])
return 1
`;

const record = `
local requests = redis.call('INCR', KEYS[1])
if requests == 1 then redis.call('EXPIRE', KEYS[1], 60) end
if requests > 40 then return 0 end
if not redis.call('SET', KEYS[2], '1', 'EX', 1800, 'NX') then return 0 end
if redis.call('INCR', KEYS[3]) == 1 then redis.call('EXPIRE', KEYS[3], 7776000) end
return 1
`;

const key = value => createHash('sha256').update(value).digest('hex');

function createState(env, send = fetch) {
  let endpoint;
  try {
    endpoint = new URL(env.URENAVI_FREE_REDIS_URL);
    if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.upstash.io') ||
        endpoint.username || endpoint.password || endpoint.port || endpoint.pathname !== '/' ||
        endpoint.search || endpoint.hash) return null;
  } catch {
    return null;
  }
  const token = env.URENAVI_FREE_REDIS_TOKEN;
  const secret = env.URENAVI_FREE_EVENT_SECRET;
  const daily = Number(env.URENAVI_FREE_DAILY_LIMIT);
  const total = Number(env.URENAVI_FREE_APPROVAL_LIMIT);
  if (!Number.isInteger(total) || total < 1 || total > 1000 ||
      !/^[a-f0-9]{40}$/.test(env.URENAVI_FREE_APPROVED_SHA || '')) return null;
  if (!token || !secret || secret.length < 32 || !Number.isInteger(daily) || daily < 1 || daily > 1000) return null;

  const namespace = 'urenavi:free:v1:';
  const ttl = env.URENAVI_FREE_CACHE_APPROVED === 'true' ? 60 : 0;
  async function command(script, keys, args) {
    const response = await send(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EVAL', script, keys.length, ...keys.map(value => namespace + value), ...args]),
      redirect: 'error',
      signal: AbortSignal.timeout(2500)
    });
    if (!response.ok) throw new Error('state-unavailable');
    const body = await response.json();
    if (body.error || body.result === undefined) throw new Error('state-unavailable');
    return body.result;
  }
  const cacheKey = query => 'cache:' + key(JSON.stringify(query) + env.URENAVI_FREE_APPROVED_AFFILIATE_HASH);

  return {
    claim(query, client, nonce) {
      const cache = cacheKey(query);
      return command(claim, ['search:' + client, 'pending', cache, 'used', 'spacing', cache + ':current', cache + ':previous', 'approved:' + env.URENAVI_FREE_APPROVED_SHA], [nonce, daily, ttl, total]);
    },
    finish(query, nonce, result) {
      const cache = cacheKey(query);
      const snapshot = query.mode === 'realtime' && result.updatedAt && result.products.length ? JSON.stringify({
        timestamp: Date.parse(result.updatedAt),
        updatedAt: result.updatedAt,
        ranks: result.products.map(({ code, rank }) => [code, rank])
      }) : '';
      return command(finish, ['pending', cache, cache + ':current', cache + ':previous'],
        [nonce, ttl, JSON.stringify(result), snapshot]);
    },
    record(code, event, client) {
      const date = new Date().toISOString().slice(0, 10);
      return command(record, [
        'event:' + client, 'seen:' + key(client + ':' + event + ':' + code),
        'metric:' + date + ':' + event + ':rakuten:' + key(code)
      ], []);
    }
  };
}

module.exports = { createState };
