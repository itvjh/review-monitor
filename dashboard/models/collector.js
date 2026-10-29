// Client for the collector service (the only thing that can write to Google, and only through its own posting gate).
const env = require('../../config/env');
const { HttpError } = require('./httpError');

const URL_BASE = env.COLLECTOR_URL || 'http://127.0.0.1:3010';

// { up, busy }: is the collector answering, and is it already running a job (a crawl, another reply)? Used by the queue so a post
// never waits behind a long crawl (it would time out) and an attempt is never spent on a collector that is down.
exports.status = async () => {
  try {
    const j = await (await fetch(`${URL_BASE}/health`, { signal: AbortSignal.timeout(3000) })).json();
    return { up: true, busy: Number(j.busy) > 0 };
  } catch (e) { return { up: false, busy: false }; }
};

// platform: 'google' (/reply) or any other registered platform (/<platform>/reply)
exports.postReply = async (payload, platform = 'google') => {
  const res = await fetch(`${URL_BASE}${platform === 'google' ? '' : '/' + platform}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180000), // opening Chrome, paging to the review and confirming the post can take a minute
  }).catch((e) => { throw new HttpError(502, `Không nhận được phản hồi từ collector (${e.name}). Collector đang chạy chưa (npm run start:collector)? Nếu đang đăng thật, phản hồi CÓ THỂ đã được đăng: hãy kiểm tra trên Google trước khi thử lại.`); });
  return res.json();
};
