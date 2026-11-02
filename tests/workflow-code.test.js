// Unit tests for the n8n Code-node bodies in workflows/code/. They run with mocked n8n globals ($, $input, $json).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const code = (name) => fs.readFileSync(path.join(__dirname, '..', 'workflows', 'code', `${name}.js`), 'utf8');
const run = (name, ctx) => new AsyncFunction('$', '$input', '$json', code(name))(ctx.$, ctx.$input, ctx.$json);
const items = (...a) => a.map((json) => ({ json }));

(async () => {
  // Flatten Reviews: one unknown business, one failed upsert
  const nodes = {
    'Split Businesses': items({ business_identifier: '111111', business_name: 'A' }, { business_identifier: '222222', business_name: 'B' }),
    'Upsert Business': items({ id: 'uuid-a', external_business_id: '111111' }, { error: { message: 'boom' } }),
  };
  const $ = (n) => ({ all: () => nodes[n], first: () => nodes[n][0] });
  const resp = { status: 'OK', scanned: 2, reviews: [{ business_identifier: '111111', review_hash: 'h1', rating: 5 }, { business_identifier: '999999', review_hash: 'h2', rating: 1 }] };
  let out = await run('flatten-reviews', { $, $input: { first: () => ({ json: resp }) }, $json: resp });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].json.business_id, 'uuid-a');
  assert.strictEqual(out[0].json.business_name, 'A');
  assert.deepStrictEqual(out[0].json._stats.errors.map((e) => e.error_code).sort(), ['BUSINESS_NOT_FOUND', 'DATABASE_ERROR']);

  // Flatten Reviews: collected_at strictly decreases along the (newest-first) feed
  const two = { status: 'OK', scanned: 2, reviews: [{ business_identifier: '111111', review_hash: 'n1', rating: 5 }, { business_identifier: '111111', review_hash: 'n2', rating: 4 }] };
  const ordered = await run('flatten-reviews', { $, $input: { first: () => ({ json: two }) }, $json: two });
  assert.ok(new Date(ordered[0].json.collected_at) > new Date(ordered[1].json.collected_at));

  // Flatten Reviews: collector failure -> sentinel + fatal
  const bad = { status: 'AUTH_REQUIRED', error_code: 'AUTH_REQUIRED', error_message: 'AUTH_REQUIRED' };
  out = await run('flatten-reviews', { $, $input: { first: () => ({ json: bad }) }, $json: bad });
  assert.ok(out[0].json._sentinel && out[0].json._stats.fatal);

  // Validate AI: priority floor from rating, unknown category dropped, numbers clamped
  const review = { rating: 2, review_text: 'dirty', business_name: 'A' };
  const $2 = () => ({ item: { json: review } });
  const gem = (text) => ({ candidates: [{ content: { parts: [{ text }] } }] });
  const ai = gem(JSON.stringify({ sentiment: 'negative', sentiment_score: -300, category: ['ROOM', 'NOPE'], priority: 'low', requires_attention: false, summary: 's', key_points: [], suggested_action: 'x', language: 'en', ai_confidence: 7 }));
  let v = await run('validate-ai', { $: $2, $input: null, $json: ai });
  assert.strictEqual(v.json.priority, 'high');
  assert.deepStrictEqual(v.json.category, ['ROOM']);
  assert.strictEqual(v.json.sentiment_score, -100);
  assert.strictEqual(v.json.ai_confidence, 1);
  assert.strictEqual(v.json.reply_draft, '');
  const locked = await run('validate-ai', { $: () => ({ item: { json: { ...review, reply_allowed: false } } }), $input: null, $json: gem(JSON.stringify({ sentiment: 'positive', priority: 'low', reply_draft: 'Must not generate for locked reviews' })) });
  assert.strictEqual(locked.json.reply_draft, '');
  const withDraft = gem(JSON.stringify({ sentiment: 'positive', priority: 'low', reply_draft: '  Cảm ơn quý khách!  ' }));
  assert.strictEqual((await run('validate-ai', { $: $2, $input: null, $json: withDraft })).json.reply_draft, ''); // 1-3 stars: no automatic draft
  const $three = () => ({ item: { json: { ...review, rating: 3 } } });
  assert.strictEqual((await run('validate-ai', { $: $three, $input: null, $json: withDraft })).json.reply_draft, '');
  const $four = () => ({ item: { json: { ...review, rating: 4 } } });
  assert.strictEqual((await run('validate-ai', { $: $four, $input: null, $json: withDraft })).json.reply_draft, 'Cảm ơn quý khách!');
  const $replied = () => ({ item: { json: { ...review, has_owner_reply: true } } });
  assert.strictEqual((await run('validate-ai', { $: $replied, $input: null, $json: withDraft })).json.reply_draft, ''); // already answered: no draft
  assert.strictEqual((await run('validate-ai', { $: $2, $input: null, $json: gem('not json') })).json.ai_ok, false);
  assert.strictEqual((await run('validate-ai', { $: $2, $input: null, $json: { error: { message: 'rate limit' } } })).json.ai_ok, false);

  // Run Summary: counts, status and first error code
  const flat = { _stats: { businesses: 10, scanned: 3, errors: [], fatal: false } };
  const $3 = (n) => ({ first: () => ({ json: n === 'Flatten Reviews' ? flat : { startedAt: 't0' } }) });
  const loop = items({ id: 1, sentiment: 'positive', priority: 'low' }, { id: 2, sentiment: 'negative', priority: 'urgent' }, { exists: true }, { ai_ok: false });
  const s = (await run('run-summary', { $: $3, $input: { all: () => loop }, $json: {} }))[0].json;
  assert.strictEqual(s.summary.new_reviews, 2);
  assert.strictEqual(s.summary.urgent_reviews, 1);
  assert.strictEqual(s.summary.negative_reviews, 1);
  assert.strictEqual(s.status, 'PARTIAL');
  assert.strictEqual(s.error_code, 'AI_ERROR');

  // Auth Summary
  const a = (await run('auth-summary', { $: $3, $input: null, $json: { status: 'AUTH_REQUIRED' } }))[0].json;
  assert.strictEqual(a.error_code, 'AUTH_REQUIRED');
  assert.strictEqual(a.status, 'FAILED');
  console.log('workflow code ok');
})().catch((e) => { console.error(e); process.exit(1); });
