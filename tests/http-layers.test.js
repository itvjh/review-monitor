// Routing / validation tests for dashboard and collector. No browser, no network: they only hit paths that never reach a model.
const assert = require('assert');
const http = require('http');
const { handle } = require('../dashboard/routes');
const reviewController = require('../collector/controllers/reviewController');
const view = require('../collector/views/json');

const serve = (handler) => new Promise((ok) => {
  const s = http.createServer(handler).listen(0, '127.0.0.1', () => ok(s));
});
const call = (s, method, path, body) => fetch(`http://127.0.0.1:${s.address().port}${path}`, { method, body }).then(async (r) => ({ code: r.status, text: await r.text() }));

(async () => {
  const dash = await serve(handle);
  assert.strictEqual((await call(dash, 'GET', '/')).code, 200);
  assert.ok((await call(dash, 'GET', '/style.css')).text.includes('--primary'));
  assert.ok((await call(dash, 'GET', '/vendor/chart.js')).text.includes('Chart'));
  assert.ok((await call(dash, 'GET', '/vendor/icons.svg')).text.includes('<symbol id="star"'));
  assert.strictEqual((await call(dash, 'GET', '/app.js')).code, 200);
  assert.strictEqual((await call(dash, 'GET', '/nope')).code, 404);
  assert.strictEqual((await call(dash, 'GET', '/../.env')).code, 404); // only whitelisted files are served
  assert.strictEqual((await call(dash, 'GET', '/replies')).code, 200);
  assert.strictEqual((await call(dash, 'GET', '/replies.js')).code, 200);

  // state-changing endpoints: JSON only, same origin only, validated input (all rejected before any database call)
  const raw = (method, path, headers, body) => new Promise((ok) => {
    const r = http.request({ host: '127.0.0.1', port: dash.address().port, method, path, headers }, (res) => { let t = ''; res.on('data', (d) => (t += d)); res.on('end', () => ok({ code: res.statusCode, text: t })); });
    r.end(body);
  });
  const json = { 'content-type': 'application/json' };
  assert.strictEqual((await raw('POST', '/api/replies/action', { 'content-type': 'text/plain' }, '{}')).code, 415);
  assert.strictEqual((await raw('POST', '/api/replies/action', { ...json, origin: 'http://evil.example' }, '{}')).code, 403);
  assert.strictEqual((await raw('GET', '/api/data', { host: 'evil.example' })).code, 403); // DNS rebinding
  assert.strictEqual((await raw('POST', '/api/replies/action', json, '{"id":"1 or 1=1","action":"approve","text":"x"}')).code, 400);
  assert.strictEqual((await raw('POST', '/api/replies/action', json, '{bad')).code, 400);
  assert.strictEqual((await raw('POST', '/api/replies/generate', json, '{"id":"../../x"}')).code, 400);
  assert.strictEqual((await raw('GET', '/api/replies?status=bogus', {})).code, 400);
  const lint = await raw('POST', '/api/replies/lint', json, JSON.stringify({ text: 'Mail us at a@b.co for a refund, thank you.' }));
  assert.strictEqual(lint.code, 200);
  assert.ok(JSON.parse(lint.text).warnings.length >= 2);
  dash.close();

  // collector: input validation happens before any browser is started
  const col = await serve(async (req, res) => {
    const body = await new Promise((r) => { let s = ''; req.on('data', (d) => (s += d)); req.on('end', () => r(s)); });
    try { await reviewController.index(req, res, body); } catch (e) { view.fail(res, e); }
  });
  const bad1 = await call(col, 'POST', '/reviews', '{not json');
  assert.strictEqual(bad1.code, 400);
  const bad2 = await call(col, 'POST', '/reviews', JSON.stringify({ known: 'x' }));
  assert.strictEqual(bad2.code, 400);
  const bad3 = await call(col, 'POST', '/reviews', JSON.stringify({ known: [1, 2] }));
  assert.strictEqual(bad3.code, 400);
  col.close();
  console.log('http layers ok');
})().catch((e) => { console.error(e); process.exit(1); });

// the collector refuses anything a web page could send: foreign Host, any Origin, writes that are not declared JSON
const guard = require('../collector/models/requestGuard');
const req = (over) => ({ method: 'POST', headers: { host: '127.0.0.1:3010', 'content-type': 'application/json' }, ...over });
assert.strictEqual(guard.check(req({})), null);
assert.strictEqual(guard.check(req({ method: 'GET', headers: { host: 'localhost:3010' } })), null);
assert.strictEqual(guard.check(req({ headers: { host: 'evil.example.com', 'content-type': 'application/json' } })).code, 403); // DNS rebinding
assert.strictEqual(guard.check(req({ headers: { host: '127.0.0.1:3010', origin: 'https://evil.example.com', 'content-type': 'application/json' } })).code, 403); // cross-site
assert.strictEqual(guard.check(req({ headers: { host: '127.0.0.1:3010', 'content-type': 'text/plain' } })).code, 415); // the "simple request" trick
assert.strictEqual(guard.check(req({ headers: { host: '127.0.0.1:3010' } })).code, 415);
