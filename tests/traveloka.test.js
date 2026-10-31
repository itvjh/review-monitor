const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseDate, identity, stars } = require('../collector/models/travelokaParse');
const Reply = require('../collector/models/travelokaReplyModel');
const Traveloka = require('../collector/models/travelokaModel');
const controller = require('../collector/controllers/travelokaController');
const response = () => ({ code: null, body: '', writeHead(code) { this.code = code; }, end(body) { this.body = body; } });
test('Traveloka request validation rejects malformed IDs and input before browser access', async () => {
  for (const body of ['null', '[]', '{bad', '{}', '{"business_identifier":"20105109","reviewer_name":"Guest","text":"Thank you for your review.","review_id":"../../x"}']) {
    const res = response(); await controller.reply({}, res, body); assert.equal(res.code, 400);
  }
  for (const body of ['null', '[]', '{bad', '{"known":[1]}']) {
    const res = response(); await controller.reviews({}, res, body); assert.equal(res.code, 400);
  }
});
test('Traveloka dates and 10 point scores preserve valid review dates', () => {
  assert.equal(parseDate('Đã gửi đánh giá vào 26 Oct 2026'), '2026-10-26');
  assert.equal(parseDate('Đã gửi đánh giá vào 9 thg 10 2026'), '2026-10-09');
  assert.equal(parseDate('31 Feb 2026'), null);
  assert.equal(parseDate('unknown'), null);
  assert.equal(stars(10), 5); assert.equal(stars(8.5), 4); assert.equal(stars(5), 3); assert.equal(stars(2), 1);
});
test('Traveloka identity survives formatting and reply changes but distinguishes stay/property', () => {
  const row = { name: 'Guest', date: '26 Oct 2026', stay: '25 Oct - 26 Oct 2026', score: 9.1, text: 'Phòng đẹp' };
  const id = identity('20105109', row);
  assert.equal(id, identity('20105109', { ...row, replied: true, reply: 'Thanks', text: ' Phòng   đẹp ' }));
  assert.notEqual(id, identity('20057470', row));
  assert.notEqual(id, identity('20105109', { ...row, stay: '24 Oct - 26 Oct 2026' }));
});
// A page on the login form. filled: Chrome pre-filled the password. results: what each wait for "left /login" returns, in order
// (login clicks first, then the Google sign-in). accounts: how many Google accounts the chooser offers.
const loginPage = ({ path = '/vi-vn/login/', filled = true, buttons = 1, results = [true], google = true, accounts = 1 } = {}) => {
  const page = { clicks: 0, google: 0, picked: 0, url: () => 'https://tera.traveloka.com' + path, waitForTimeout: async () => {},
    locator: (sel) => sel.includes('data-identifier') ? { count: async () => accounts, click: async () => { page.picked++; } } : { first: () => ({ evaluate: async () => filled }) },
    getByRole: () => ({ count: async () => buttons, click: async () => { page.clicks++; } }),
    getByText: () => ({ first: () => ({ count: async () => (google ? 1 : 0), click: async () => { page.google++; } }) }),
    context: () => ({ waitForEvent: async () => { throw new Error('no popup'); } }),
    waitForURL: async () => { if (!results.shift()) throw new Error('timeout'); } };
  return page;
};
test('Traveloka presses the login button only when Chrome pre-filled the password', async () => {
  const ok = loginPage(); assert.equal(await Traveloka.autoLogin(ok), true); assert.equal(ok.clicks, 1); assert.equal(ok.google, 0);
  for (const page of [loginPage({ path: '/vi-vn/user/property/' }), loginPage({ filled: false }), loginPage({ buttons: 2 })]) {
    assert.equal(await Traveloka.autoLogin(page), false); assert.equal(page.clicks + page.google, 0);
  }
});
test('Traveloka falls back to Sign in with Google after two failed login clicks, then stops for 10 minutes', async () => {
  const viaGoogle = loginPage({ results: [false, false, true] });
  assert.equal(await Traveloka.autoLogin(viaGoogle), true); assert.equal(viaGoogle.clicks, 2); assert.equal(viaGoogle.google, 1); assert.equal(viaGoogle.picked, 1);
  const many = loginPage({ results: [true, false, false, false], accounts: 2 }); // second login click works here, so no Google
  assert.equal(await Traveloka.autoLogin(many), true); assert.equal(many.google, 0);
  const bad = loginPage({ results: [false, false, false] }); // nothing works: nobody is picked when two accounts are offered
  bad.locator = ((l) => (sel) => sel.includes('data-identifier') ? { count: async () => 2, click: async () => { bad.picked++; } } : l(sel))(bad.locator);
  assert.equal(await Traveloka.autoLogin(bad), false); assert.equal(bad.picked, 0);
  const again = loginPage(); assert.equal(await Traveloka.autoLogin(again), false); assert.equal(again.clicks, 0);
});
test('Traveloka posting refuses ambiguous review identities before opening a form', async () => {
  const open = Traveloka.openReviews, cards = Traveloka.readCards;
  const row = { name: 'Guest', date: '26 Oct 2026', stay: '25 Oct - 26 Oct 2026', score: 9.1, text: 'Good' };
  Traveloka.openReviews = async () => true; Traveloka.readCards = async () => [row, row];
  try { await assert.rejects(Reply.post({}, { property: '20105109', reviewId: identity('20105109', row), reviewer: 'Guest', text: 'Thanks', dryRun: true }), { code: 'REPLY_MISMATCH' }); }
  finally { Traveloka.openReviews = open; Traveloka.readCards = cards; }
});
