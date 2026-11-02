// Posting queue: spacing rule, one-at-a-time worker and bulk approval filter. Everything is faked: no database, no browser.
const assert = require('assert');
const http = require('http');
const { waitMs, eta, etaCapped } = require('../dashboard/models/queueRules');
const { createQueue } = require('../dashboard/models/queue');
const rules = require('../dashboard/models/replyRules');
const { handle } = require('../dashboard/routes');

const GAP = 5 * 60000;
const NOW = Date.parse('2026-10-24T10:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();

// spacing: measured from the latest attempt; never negative; no history means go now
assert.strictEqual(waitMs(null, GAP, NOW), 0);
assert.strictEqual(waitMs(ago(2 * 60000), GAP, NOW), 3 * 60000);
assert.strictEqual(waitMs(ago(5 * 60000), GAP, NOW), 0);
assert.strictEqual(waitMs(ago(60 * 60000), GAP, NOW), 0);
// expected times: item n is posted n gaps after the first one
assert.strictEqual(eta(0, null, GAP, NOW), NOW);
assert.strictEqual(eta(2, null, GAP, NOW), NOW + 2 * GAP);
assert.strictEqual(eta(0, ago(60000), GAP, NOW), NOW + 4 * 60000);
assert.strictEqual(eta(1, ago(60000), GAP, NOW), NOW + 9 * 60000);

// the daily limit: with the day's quota used up, a queued reply waits for tomorrow (local midnight), `limit` per day
const day = new Date(NOW);
day.setHours(24, 0, 0, 0);
const MID = day.getTime();
assert.strictEqual(etaCapped(0, null, GAP, 0, 10, NOW), NOW); // quota free: same as eta
assert.strictEqual(etaCapped(2, null, GAP, 8, 10, NOW), MID); // 2 left today (index 0, 1): the 3rd goes to tomorrow
assert.strictEqual(etaCapped(0, null, GAP, 10, 10, NOW), MID); // all used
assert.strictEqual(etaCapped(1, null, GAP, 10, 10, NOW), MID + GAP);
assert.strictEqual(etaCapped(10, null, GAP, 10, 10, NOW), MID + 86400000); // the 11th waiting goes to the day after tomorrow
assert.strictEqual(etaCapped(0, null, GAP, 12, 10, NOW), MID); // more posted than the limit (limit lowered): still no negative quota

// bulk approval: only clean replies go through; anything flagged is left for a person
const good = 'Cảm ơn quý khách đã lựa chọn chúng tôi, hẹn gặp lại quý khách trong thời gian tới.';
const bulk = rules.classifyBulk([
  { id: 'a', text: good },
  { id: 'b', text: 'Chúng tôi sẽ hoàn tiền cho quý khách trong thời gian sớm nhất.' },
  { id: 'c', text: '' },
  { id: 'd', text: 'Xem https://example.com để biết thêm chi tiết nhé quý khách.' },
  { id: 'a', text: good }, // duplicate id is ignored
]);
assert.deepStrictEqual(bulk.ok.map((i) => i.id), ['a']);
assert.deepStrictEqual(bulk.skipped.map((i) => i.id).sort(), ['b', 'c', 'd']);
assert.ok(rules.nextStatus('approved', 'retry') === 'approved');

// worker
const make = (over = {}) => {
  const log = [];
  const db = { last: null, posted: 0, due: { id: 'r1', reply_attempts: 0 }, claim: true, ...over.db };
  const reply = {
    lastAttemptAt: async () => db.last,
    postedSince: async () => db.posted,
    nextDue: async () => db.due,
    markAttempt: async (row) => { log.push('mark ' + row.id); if (db.claim) db.last = new Date(NOW).toISOString(); return db.claim ? row : null; },
    setError: async (id, msg, attempts) => { log.push(`error ${id}: ${msg}${attempts === undefined ? '' : ' stall ' + attempts}`); },
  };
  const pub = { mode: () => 'live', startOfToday: () => ago(0), DAILY_LIMIT: 10, publish: async (id) => { log.push('post ' + id); if (over.fail) throw Object.assign(new Error('boom'), { stall: over.stall }); return { result: 'posted' }; }, ...over.pub };
  const col = { status: async () => ({ up: true, busy: false, ...over.col }) };
  return { log, db, q: createQueue({ reply, pub, col, now: () => NOW, gapMs: GAP, maxAttempts: 3 }) };
};

(async () => {
  let t = make({ pub: { mode: () => 'dry-run' } });
  assert.strictEqual(await t.q.tick(), 'off'); // dry-run and off never post on their own
  assert.deepStrictEqual(t.log, []);

  t = make({ db: { last: ago(2 * 60000) } });
  assert.strictEqual(await t.q.tick(), 'wait');
  assert.deepStrictEqual(t.log, []);

  t = make({ db: { posted: 10 } });
  assert.strictEqual(await t.q.tick(), 'cap');
  t = make({ db: { due: null } });
  assert.strictEqual(await t.q.tick(), 'empty');
  // a collector that is down or busy (a crawl is running) costs no attempt: the item keeps its place and waits
  t = make({ col: { up: false } });
  assert.strictEqual(await t.q.tick(), 'collector-down');
  assert.deepStrictEqual(t.log, []);
  t = make({ col: { busy: true } });
  assert.strictEqual(await t.q.tick(), 'collector-busy');
  assert.deepStrictEqual(t.log, []); // no 'mark': the attempt counter did not move

  t = make({ db: { claim: false } });
  assert.strictEqual(await t.q.tick(), 'raced');
  assert.deepStrictEqual(t.log, ['mark r1']); // lost the claim: nothing is posted

  t = make();
  assert.strictEqual(await t.q.tick(), 'posted');
  assert.deepStrictEqual(t.log, ['mark r1', 'post r1']); // the attempt is recorded BEFORE Google is touched
  assert.strictEqual(await t.q.tick(), 'wait'); // right after a post the next one has to wait the full gap

  t = make({ fail: true });
  assert.strictEqual(await t.q.tick(), 'failed');
  assert.deepStrictEqual(t.log, ['mark r1', 'post r1', 'error r1: boom']);
  assert.strictEqual(await t.q.tick(), 'wait'); // a failure also counts as touching Google: no tight retry loop

  // a post that may have gone through (UNKNOWN_ERROR) stops the item at the maximum attempts: only a person retries it
  t = make({ fail: true, stall: true });
  assert.strictEqual(await t.q.tick(), 'failed');
  assert.deepStrictEqual(t.log, ['mark r1', 'post r1', 'error r1: boom stall 3']);

  t = make();
  const [first, second] = await Promise.all([t.q.tick(), t.q.tick()]); // two ticks at once never post twice
  assert.deepStrictEqual([first, second].sort(), ['busy', 'posted']);

  // bulk endpoint input checks run before the database
  const dash = await new Promise((ok) => { const s = http.createServer(handle).listen(0, '127.0.0.1', () => ok(s)); });
  const send = (body) => new Promise((ok) => {
    const r = http.request({ host: '127.0.0.1', port: dash.address().port, method: 'POST', path: '/api/replies/bulk', headers: { 'content-type': 'application/json' } }, (res) => { res.resume(); res.on('end', () => ok(res.statusCode)); });
    r.end(body);
  });
  assert.strictEqual(await send('{"action":"delete","items":[]}'), 400);
  assert.strictEqual(await send('{"action":"approve","items":[]}'), 400);
  assert.strictEqual(await send('{"action":"approve"}'), 400);
  assert.strictEqual(await send(JSON.stringify({ action: 'approve', items: [{ id: '1 or 1=1', text: good }] })), 400);
  assert.strictEqual(await send(JSON.stringify({ action: 'approve', items: Array.from({ length: 101 }, () => ({ id: '11111111-1111-1111-1111-111111111111', text: good })) })), 400);
  dash.close();
  console.log('reply queue ok');
})().catch((e) => { console.error(e); process.exit(1); });

// 1-3 stars: a bulk (strict) approval is refused before anything is written; a person approves it one by one
const Reply = require('../dashboard/models/reply');
Reply.find = async () => ({ id: 'low', rating: 3, reply_status: 'pending', businesses: null });
Reply.act('low', 'approve', good, { strict: true }).then(() => assert.fail('must refuse'), (e) => assert.strictEqual(e.status, 422));
