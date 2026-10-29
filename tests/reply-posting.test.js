// Gate and input validation for posting replies to Google. No browser, no network: only paths that stop before any I/O.
const assert = require('assert');
const http = require('http');
const { policy, sameName } = require('../collector/models/replyPolicy');
const collectorReply = require('../collector/controllers/replyController');
const view = require('../collector/views/json');
const { handle } = require('../dashboard/routes');

// off by default; dry-run never posts; a request can ask for a dry run in live mode but never the other way round
assert.deepStrictEqual(policy('off', false), { allowed: false, dryRun: true });
assert.deepStrictEqual(policy(undefined, false), { allowed: false, dryRun: true });
assert.deepStrictEqual(policy('dry-run', false), { allowed: true, dryRun: true });
assert.deepStrictEqual(policy('live', false), { allowed: true, dryRun: false });
assert.deepStrictEqual(policy('live', true), { allowed: true, dryRun: true });
assert.deepStrictEqual(policy('live', 'yes'), { allowed: true, dryRun: false }); // only the boolean true counts as a dry-run request
assert.ok(sameName(' Mai  Đặng ', 'mai đặng'));
assert.ok(!sameName('Mai Đặng', 'Mai Dang'));

const serve = (handler) => new Promise((ok) => { const s = http.createServer(handler).listen(0, '127.0.0.1', () => ok(s)); });
const send = (s, path, body, headers = { 'content-type': 'application/json' }) => new Promise((ok) => {
  const r = http.request({ host: '127.0.0.1', port: s.address().port, method: 'POST', path, headers }, (res) => { let t = ''; res.on('data', (d) => (t += d)); res.on('end', () => ok({ code: res.statusCode, text: t })); });
  r.end(body);
});

(async () => {
  // collector /reply rejects malformed requests before touching the gate or the browser
  const col = await serve(async (req, res) => {
    const body = await new Promise((r) => { let s = ''; req.on('data', (d) => (s += d)); req.on('end', () => r(s)); });
    try { await collectorReply.post(req, res, body); } catch (e) { view.fail(res, e); }
  });
  const good = { review_id: 'abc', business_identifier: '1168900475916071895', reviewer_name: 'Mai Đặng', text: 'x'.repeat(30) };
  for (const bad of ['{nope', '{}', JSON.stringify({ ...good, text: 'ngắn' }), JSON.stringify({ ...good, text: 'x'.repeat(4001) }), JSON.stringify({ ...good, business_identifier: 'abc' }), JSON.stringify({ ...good, review_id: '' }), JSON.stringify({ ...good, reviewer_name: ' ' })]) {
    assert.strictEqual((await send(col, '/reply', bad)).code, 400, bad.slice(0, 40));
  }
  col.close();

  // collector /tripadvisor/reply: same early rejection (no browser, no gate)
  const taCol = await serve(async (req, res) => {
    const body = await new Promise((r) => { let t = ''; req.on('data', (d) => (t += d)); req.on('end', () => r(t)); });
    try { await require('../collector/controllers/tripadvisorController').reply(req, res, body); } catch (e) { view.fail(res, e); }
  });
  const ta = { business_identifier: '34666891', reviewer_name: 'Sithikham', title: 'Khách sạn tốt', rating: 5, text: 'x'.repeat(30) };
  for (const bad of ['{nope', '{}', JSON.stringify({ ...ta, text: 'ngắn' }), JSON.stringify({ ...ta, rating: 7 }), JSON.stringify({ ...ta, rating: '5' }), JSON.stringify({ ...ta, title: '' }), JSON.stringify({ ...ta, business_identifier: 'abc' })]) {
    assert.strictEqual((await send(taCol, '/tripadvisor/reply', bad)).code, 400, bad.slice(0, 40));
  }
  taCol.close();

  // dashboard /api/replies/post validates the id before any database or collector call
  const dash = await serve(handle);
  assert.strictEqual((await send(dash, '/api/replies/post', '{"id":"1 or 1=1"}')).code, 400);
  assert.strictEqual((await send(dash, '/api/replies/post', '{}')).code, 400);
  assert.strictEqual((await send(dash, '/api/replies/post', '{"id":"x"}', { 'content-type': 'text/plain' })).code, 415);
  dash.close();
  console.log('reply posting ok');
})().catch((e) => { console.error(e); process.exit(1); });

// a posting request that waited in the queue past its deadline is refused before any browser is opened
(async () => {
  const cfg = require('../collector/config');
  if (cfg.REPLY_MODE === 'off') return; // gate would answer first; nothing more to prove
  const out = await new Promise((ok) => {
    const res = { writeHead(code) { this.code = code; }, end(t) { ok({ code: this.code, body: JSON.parse(t) }); } };
    collectorReply.post({}, res, JSON.stringify({ review_id: 'abc', business_identifier: '1168900475916071895', reviewer_name: 'Mai', text: 'x'.repeat(30), deadline: Date.now() - 1000 }))
      .catch((e) => view.fail(res, e));
  });
  assert.strictEqual(out.body.error_code, 'BROWSER_TIMEOUT');
  console.log('expired deadline refused');
})().catch((e) => { console.error(e); process.exit(1); });
