const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLogin, loginOrigin } = require('../collector/models/expediaLogin');

function fixture({ passwordFirst = false, fail = false, challenge = false, typingError = false, email = 'test@example.test' } = {}) {
  let stage = passwordFirst ? 'password' : 'email';
  const actions = [];
  const loc = (kind) => ({
    waitFor: async () => {},
    count: async () => kind === stage || kind === 'email' && stage === 'password' || kind === 'next' && stage !== 'done' || kind === 'remember' && stage === 'password' ? 1 : 0,
    inputValue: async () => email,
    innerText: async () => challenge ? 'Enter verification code' : 'Sign in',
    fill: async (value) => actions.push([kind, 'fill', value]),
    pressSequentially: async (value) => { actions.push([kind, 'type', value]); if (typingError) throw new Error('secret in Playwright log'); },
    check: async () => actions.push(['remember', 'check']),
    click: async () => { actions.push(['submit', stage]); if (stage === 'email') stage = 'password'; else if (!fail) stage = 'done'; },
  });
  return { actions, page: {
    url: () => stage === 'done' ? 'https://apps.expediapartnercentral.com/manageproperty/ManageProperty' : stage === 'email' ? 'https://www.expediapartnercentral.com/Account/Logon' : 'https://accounts.expediagroup.com/partner/password',
    locator: (s) => loc(s.includes('password') ? 'password' : s.includes('remember') ? 'remember' : 'body'),
    getByRole: (role, opts) => loc(role === 'textbox' ? 'email' : opts.name.test('Tiếp') ? 'next' : 'missing'),
    waitForTimeout: async () => {},
  } };
}

test('Expedia only types credentials on exact HTTPS login origins', async () => {
  assert.equal(loginOrigin('https://accounts.expediagroup.com/partner/password'), true);
  for (const url of ['http://accounts.expediagroup.com/partner/password', 'https://accounts.expediagroup.com.evil.test/partner/password', 'https://evil.test/Account/Logon', 'https://apps.expediapartnercentral.com/supply/home']) assert.equal(loginOrigin(url), false);
  const run = createLogin(() => { throw new Error('must not load'); });
  assert.equal(await run({ url: () => 'https://evil.test/partner/password' }), false);
});

test('Expedia submits email then types password without pasting, once', async () => {
  const f = fixture();
  assert.equal(await createLogin(async () => ({ username: 'test@example.test', password: 'test-password' }))(f.page), true);
  assert.deepEqual(f.actions.filter(a => a[0] === 'password'), [['password', 'fill', ''], ['password', 'type', 'test-password']]);
  assert.deepEqual(f.actions.filter(a => a[0] === 'submit'), [['submit', 'email'], ['submit', 'password']]);
});

test('Expedia resumes password step, stops repeated failures and redacts browser errors', async () => {
  for (const options of [{ passwordFirst: true, fail: true }, { passwordFirst: true, typingError: true }]) {
    const f = fixture(options); let loads = 0;
    const login = createLogin(async () => { loads++; return { username: 'test@example.test', password: 'secret in Playwright log' }; });
    await assert.rejects(login(f.page), e => e.code === 'AUTH_REQUIRED' && !e.message.includes('secret'));
    await assert.rejects(login(f.page), { code: 'AUTH_REQUIRED' });
    assert.equal(loads, 1);
    assert.ok(f.actions.filter(a => a[0] === 'submit').length <= 1);
  }
});

test('Expedia verification challenge never loads or types saved credentials', async () => {
  const f = fixture({ challenge: true });
  await assert.rejects(createLogin(() => { throw new Error('must not load'); })(f.page), { code: 'AUTH_REQUIRED' });
  assert.deepEqual(f.actions, []);
});

test('Expedia never types the password into another account form', async () => {
  const f = fixture({ passwordFirst: true, email: 'other@example.test' });
  await assert.rejects(createLogin(async () => ({ username: 'test@example.test', password: 'test-password' }))(f.page), { code: 'AUTH_REQUIRED' });
  assert.deepEqual(f.actions, []);
});
