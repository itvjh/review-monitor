const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mailTime, chooseCode } = require('../collector/models/expediaOtpParse');
const { complete, isMfaPage } = require('../collector/models/expediaEmailMfa');
const { createLogin } = require('../collector/models/expediaLogin');
const { readCode } = require('../collector/models/expediaOtpMail');

const requestedAt = Date.parse('2026-11-04T02:50:10Z');
const validRow = (id = '1a1234567890abcd') => ({ id, senders: ['admin@expediapartnercentral.com'], subject: 'Mã truy cập Partner Central của quý vị: 123456 (KHÔNG CHIA SẺ)', date: '09:50 Thứ 4, 4 thg 11, 2026' });
const opts = () => ({ requestedAt, now: requestedAt + 10000, baseline: new Set(), offsetMinutes: -420 });

test('Expedia OTP dates support visible Vietnamese/English Gmail timestamps with browser timezone', () => {
  assert.equal(mailTime('09:50 Thứ 4, 4 thg 11, 2026', -420), Date.parse('2026-11-04T02:50:00Z'));
  assert.equal(mailTime('Wed, Nov 4, 2026, 9:50 AM', -420), Date.parse('2026-11-04T02:50:00Z'));
  assert.ok(Number.isNaN(mailTime('Yesterday', -420)));
});

test('Expedia OTP accepts one fresh exact-sender subject and excludes existing, stale or ambiguous emails', () => {
  assert.equal(chooseCode([validRow()], opts()).code, '123456');
  const en = { ...validRow(), subject: 'Your access code for Partner Central: 654321 (DO NOT SHARE)' };
  assert.equal(chooseCode([en], opts()).code, '654321');
  const old = opts(); old.baseline.add(validRow().id);
  assert.equal(chooseCode([validRow()], old), null);
  for (const change of [
    { senders: ['admin@expediapartnercentral.com.evil.test'] },
    { subject: 'Your security code is 123456' },
    { subject: 'Your access code for Partner Central: 123456 654321 (DO NOT SHARE)' },
    { date: '09:49 Thứ 4, 4 thg 11, 2026' },
    { date: '10:50 Thứ 4, 4 thg 11, 2026' },
    { date: 'yesterday' }, { id: '' },
  ]) assert.equal(chooseCode([{ ...validRow(), ...change }], opts()), null);
  assert.throws(() => chooseCode([validRow(), validRow('1aabcdef12345678')], opts()), /Ambiguous/);
});

function mfaFixture({ resumed = false, recipient = 'ops@example.com', stayOnMfa = false } = {}) {
  let stage = resumed ? 'code' : 'choice';
  const actions = [];
  const input = {
    count: async () => stage === 'code' ? 1 : 0, waitFor: async () => {}, first() { return this; },
    fill: async v => actions.push(['clear', v]),
    pressSequentially: async v => actions.push(['type', v]),
  };
  const page = {
    url: () => stage === 'done' ? 'https://apps.expediapartnercentral.com/manageproperty/ManageProperty' : 'https://www.expediapartnercentral.com/account/mfa/initiate',
    waitForTimeout: async () => {},
    goto: async () => { actions.push(['check portal']); stage = 'done'; },
    locator: s => s === 'body' ? { innerText: async () => 'Check email ' + recipient } : input,
    getByRole: (role, options) => ({
      count: async () => options.name.test('Tiếp tục bằng email') ? stage === 'choice' ? 1 : 0 : stage === 'code' ? 1 : 0,
      click: async () => { if (options.name.test('Tiếp tục bằng email')) { actions.push(['request']); stage = 'code'; } else { actions.push(['verify']); if (!stayOnMfa) stage = 'done'; } },
    }),
    getByText: () => ({ count: async () => 1, click: async () => actions.push(['resend']) }),
  };
  return { page, actions };
}

test('Expedia email MFA prepares mailbox before requesting one new code and verifies once', async () => {
  for (const resumed of [false, true]) {
    const f = mfaFixture({ resumed });
    const read = async (page, email, send) => { assert.equal(email, 'ops@example.com'); f.actions.push(['mailbox ready']); await send(); return '123456'; };
    assert.equal(await complete(f.page, 'ops@example.com', read, true), true);
    assert.deepEqual(f.actions, [['mailbox ready'], [resumed ? 'resend' : 'request'], ['clear', ''], ['type', '123456'], ['verify']]);
  }
});

test('Expedia email MFA refuses a different recipient and redacts failed mail/browser details', async () => {
  const f = mfaFixture({ resumed: true, recipient: 'other@example.test' });
  await assert.rejects(complete(f.page, 'ops@example.com', async (page, email, send) => { await send(); return '123456'; }, true), { code: 'AUTH_REQUIRED' });
  assert.deepEqual(f.actions, []);
  await assert.rejects(complete(mfaFixture().page, 'ops@example.com', async () => { throw new Error('secret OTP 123456'); }, true), e => e.code === 'AUTH_REQUIRED' && !e.message.includes('123456'));
});

test('Expedia verifies the protected portal when a successful code submission does not redirect', async () => {
  const f = mfaFixture({ stayOnMfa: true });
  assert.equal(await complete(f.page, 'ops@example.com', async (page, email, send) => { await send(); return '123456'; }, true), true);
  assert.equal(f.actions.filter(a => a[0] === 'verify').length, 1);
  assert.equal(f.actions.filter(a => a[0] === 'check portal').length, 1);
});

test('Expedia login can resume email MFA directly; other origins never receive the code', async () => {
  let calls = 0;
  const p = mfaFixture().page;
  assert.equal(await createLogin(async () => ({ username: 'ops@example.com', password: 'test' }), Date.now, async (page, email) => { calls++; assert.equal(email, 'ops@example.com'); return true; })(p), true);
  assert.equal(calls, 1);
  assert.equal(isMfaPage('https://www.expediapartnercentral.com.evil.test/account/mfa/initiate'), false);
  assert.equal(await complete({ url: () => 'https://evil.test/account/mfa/initiate' }, 'ops@example.com', () => { throw new Error(); }, true), false);
});

test('Gmail direct search reads title/time without depending on its input value, closes only its own tab', async () => {
  const local = new Date(Date.now() + 420 * 60000);
  const stamp = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')} Thứ 4, ${local.getUTCDate()} thg ${local.getUTCMonth() + 1}, ${local.getUTCFullYear()}`;
  let requested = 0, refreshed = 0, closed = 0, opened = '';
  const mail = {
    bringToFront: async () => {},
    setDefaultTimeout: () => {}, goto: async u => { opened = u; }, url: () => opened,
    locator: () => ({ waitFor: async () => {}, inputValue: async () => { throw new Error('Do not inspect the search field value'); }, count: async () => 1 }),
    $$eval: async selector => selector === '[aria-label]' ? true : [
      { ...validRow('1a11111111111111'), date: stamp },
      ...(refreshed ? [{ ...validRow('1a22222222222222'), date: stamp }] : []),
    ],
    evaluate: async () => -420, waitForTimeout: async () => {},
    getByRole: () => ({ count: async () => 1, click: async () => { refreshed++; } }),
    close: async () => { closed++; },
  };
  assert.equal(await readCode({ context: () => ({ newPage: async () => mail }) }, 'ops@example.com', async () => { requested++; }), '123456');
  assert.equal(opened, 'https://mail.google.com/mail/u/0/#search/Expedia+Group+Partner+Central');
  assert.equal(requested, 1); assert.equal(refreshed, 1); assert.equal(closed, 1);
});
