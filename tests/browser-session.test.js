const { test } = require('node:test');
const assert = require('node:assert/strict');
const { endpoint, createSessions } = require('../collector/models/browserSession');

test('personal Chrome discovery accepts only a local browser socket', () => {
  assert.equal(endpoint('profile', () => '9222\r\n/devtools/browser/abc-123\r\n'), 'ws://127.0.0.1:9222/devtools/browser/abc-123');
  for (const file of ['0\n/devtools/browser/abc', '65536\n/devtools/browser/abc', '9222junk\n/devtools/browser/abc', '9222\n//remote.example', '9222\n/devtools/page/abc']) {
    assert.throws(() => endpoint('profile', () => file), { code: 'AUTH_REQUIRED' });
  }
  assert.throws(() => endpoint('profile', () => { throw new Error('missing'); }), { code: 'AUTH_REQUIRED' });
});

test('personal jobs reuse the connection, close only their own tabs, reconnect after disconnect', async () => {
  let connects = 0, launches = 0, closes = 0, pageCloses = 0, disconnected;
  const existingPage = { close() { throw new Error('must not close a personal tab'); } };
  const ctx = {
    pages: () => [existingPage],
    newPage: async () => ({ close: async () => { pageCloses++; } }),
    close() { throw new Error('must not close personal context'); },
  };
  const browser = { contexts: () => [ctx], on(event, cb) { disconnected = cb; }, close: async () => { closes++; disconnected(); } };
  const sessions = createSessions({
    async connectOverCDP() { connects++; return browser; },
    async launchPersistentContext() { launches++; throw new Error('must not launch another Chrome'); },
  }, { BROWSER_MODE: 'personal' }, () => 'ws://127.0.0.1:9222/devtools/browser/abc');
  for (let i = 0; i < 2; i++) { const job = await sessions.open(); assert.notEqual(job.page, existingPage); await job.close(); }
  assert.equal(connects, 1);
  assert.equal(launches, 0);
  assert.equal(pageCloses, 2);
  assert.equal(closes, 0);
  disconnected();
  await (await sessions.open()).close();
  assert.equal(connects, 2);
  await sessions.disconnect();
  assert.equal(closes, 1);
});

test('failed personal connection is recoverable and never falls back to another profile', async () => {
  let attempts = 0;
  const sessions = createSessions({
    async connectOverCDP() { attempts++; throw new Error('denied'); },
    async launchPersistentContext() { assert.fail('unexpected fallback'); },
  }, { BROWSER_MODE: 'personal' }, () => 'ws://127.0.0.1:9222/devtools/browser/abc');
  await assert.rejects(sessions.open(), { code: 'AUTH_REQUIRED' });
  await assert.rejects(sessions.open(), { code: 'AUTH_REQUIRED' });
  assert.equal(attempts, 2);
});

test('persistent mode still owns and closes its own context', async () => {
  let closed = false;
  const page = {};
  const sessions = createSessions({ async launchPersistentContext() { return { pages: () => [page], close: async () => { closed = true; } }; } }, { BROWSER_MODE: 'persistent' });
  const job = await sessions.open();
  assert.equal(job.page, page);
  await job.close();
  assert.equal(closed, true);
});
