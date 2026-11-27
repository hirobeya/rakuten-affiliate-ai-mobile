import catalog from './api/catalog.js';

const branch = 'feature/urenavi-free-20261127';
const workerName = 'urenavi-free-qa-191';
const jsonHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff'
};

function asQuery(url) {
  const query = Object.create(null);
  for (const [name, value] of url.searchParams) {
    query[name] = Object.hasOwn(query, name) ? null : value;
  }
  return query;
}

async function parseBody(request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json' || !request.body) {
    throw new Error('invalid-body');
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) throw new Error('body-too-large');
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function deployment(url, env) {
  const version = env.WORKER_VERSION;
  const host = new RegExp('^verify-' + workerName + '\\.[a-z0-9-]+\\.workers\\.dev$');
  const [ref, sha] = (version?.tag ?? '').split(':');
  return {
    sha,
    isIsolatedPreview: ref === branch && host.test(url.hostname) &&
      Boolean(version?.id) &&
      url.origin === env.URENAVI_FREE_RAKUTEN_ORIGIN
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/catalog') {
      if (url.pathname.startsWith('/api/')) return new Response(null, { status: 404, headers: jsonHeaders });
      return env.ASSETS.fetch(request);
    }
    let body;
    if (request.method === 'POST') {
      try {
        body = await parseBody(request);
      } catch {
        return Response.json({}, { status: 400, headers: jsonHeaders });
      }
    }
    const headers = new Headers(jsonHeaders);
    const handler = catalog.makeHandler(env, { preview: deployment(url, env) });
    return handler({
      method: request.method,
      query: asQuery(url),
      body,
      clientIp: request.headers.get('CF-Connecting-IP')
    }, {
      setHeader: (name, value) => headers.set(name, value),
      status: status => ({ json: data => Response.json(data, { status, headers }) })
    });
  }
};
