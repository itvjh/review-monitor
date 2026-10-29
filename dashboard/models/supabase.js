// Supabase REST client (data access layer). Server-side only: the secret key never reaches the browser.
const env = require('../../config/env');

// Transport errors ("fetch failed") happen occasionally: GET is retried, writes are not (a PATCH may have landed).
async function request(method, query, body) {
  const headers = { apikey: env.SUPABASE_KEY };
  if (body !== undefined) Object.assign(headers, { 'content-type': 'application/json', Prefer: 'return=representation' });
  for (let i = 1; ; i++) {
    let r;
    try {
      r = await fetch(`${env.SUPABASE_URL}/rest/v1/${query}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    } catch (e) {
      if (method === 'GET' && i < 3) { await new Promise((ok) => setTimeout(ok, 400 * i)); continue; }
      throw new Error(`network error (${(e.cause && (e.cause.code || e.cause.message)) || e.message})`);
    }
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.json();
  }
}

// Exact number of rows matching `query` (a filter, e.g. "reviews?reply_status=eq.posted"), counted by the database: no row cap, no payload.
async function count(query) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${query}${query.includes('?') ? '&' : '?'}select=id`, { method: 'HEAD', headers: { apikey: env.SUPABASE_KEY, Prefer: 'count=exact' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return Number((r.headers.get('content-range') || '').split('/')[1]) || 0;
}

module.exports = { get: (query) => request('GET', query), patch: (query, body) => request('PATCH', query, body), count };
