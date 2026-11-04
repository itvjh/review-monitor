const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLogin, loginPage } = require('../collector/models/agodaLogin');

function fixture({ choices = 1, email = 'ops@example.com', renew = true, challenge = false, origin = 'https://accounts.google.com' } = {}) {
  let stage = 'choice', done = false, closed = false;
  const actions = [];
  const loc = (kind) => ({
    waitFor: async () => {},
    filter() { return this; },
    count: async () => kind === 'choice' ? stage === 'choice' ? choices : 0 : kind === 'heading' ? stage === 'consent' && renew ? 1 : 0 : 1,
    innerText: async () => kind === 'body' ? challenge ? 'Enter verification code' : 'Google' : 'I T ' + email,
    check: async () => actions.push('remember'),
    click: async () => { actions.push(kind); if (kind === 'choice') stage = 'consent'; if (kind === 'next') done = true; },
  });
  const popup = {
    url: () => origin + '/signin/oauth/id', isClosed: () => closed,
    locator: s => loc(s === 'body' ? 'body' : 'choice'),
    getByRole: role => loc(role === 'link' ? 'choice' : role === 'heading' ? 'heading' : 'next'),
    close: async () => { closed = true; },
  };
  const page = {
    url: () => 'https://portal.agoda.com/mldc/en-us/' + (done ? 'app/iam/propertysearch' : 'public/login'),
    frameLocator: () => ({ getByText: () => loc('google'), getByRole: () => loc('remember') }),
    waitForEvent: async () => popup, waitForTimeout: async () => {},
  };
  return { page, actions };
}

test('Agoda Google login chooses configured account and renews existing sign-in', async () => {
  const f = fixture();
  assert.equal(await createLogin('ops@example.com')(f.page), true);
  assert.deepEqual(f.actions, ['remember', 'google', 'choice', 'next']);
});

test('Agoda refuses wrong/ambiguous accounts, new consent and verification without repeated login attempts', async () => {
  for (const opts of [{ email: 'other@example.test' }, { choices: 2 }, { renew: false }, { challenge: true }, { origin: 'https://evil.test' }]) {
    const f = fixture(opts), login = createLogin('ops@example.com');
    await assert.rejects(login(f.page), { code: 'AUTH_REQUIRED' });
    assert.equal(f.actions.includes('next'), false);
    const before = f.actions.length;
    await assert.rejects(login(f.page), { code: 'AUTH_REQUIRED' });
    assert.equal(f.actions.length, before);
    if (opts.email || opts.challenge || opts.origin || opts.choices) assert.equal(f.actions.includes('choice'), false);
  }
});

test('Agoda never starts Google sign-in on a different origin or an authenticated page', async () => {
  for (const url of ['https://portal.agoda.com.evil.test/mldc/en-us/public/login', 'http://portal.agoda.com/mldc/en-us/public/login', 'https://portal.agoda.com/mldc/en-us/app/iam/propertysearch']) {
    assert.equal(loginPage(url), false);
    assert.equal(await createLogin()( { url: () => url } ), false);
  }
});
