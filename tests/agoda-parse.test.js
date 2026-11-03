// Agoda helpers: scores, booking ids, review dates, reply-language labels. Pure functions, no browser.
const assert = require('assert');
const { parseScore, starsFromScore, bidOf, parseReviewedDate, languageLabel } = require('../collector/models/agodaParse');

assert.strictEqual(parseScore('10.0'), 10);
assert.strictEqual(parseScore('8,4 '), 8.4);
assert.strictEqual(parseScore(''), 0);
// Agoda's 0-10 score -> 1-5 stars (the alert rule "2 stars or less" becomes "below 5.0")
assert.deepStrictEqual([10, 9.2, 8.4, 6.9, 5, 4.9, 3, 1, 0].map(starsFromScore), [5, 5, 4, 3, 3, 2, 2, 1, 1]);
assert.strictEqual(starsFromScore(NaN), 1);

assert.strictEqual(bidOf('Standard Twin Room | October 2026 (1 night) | BID: 1775304101 | Tuyệt vời'), '1775304101');
assert.strictEqual(bidOf('no id here'), '');

assert.strictEqual(parseReviewedDate('Reviewed October 28, 2026'), '2026-10-28');
assert.strictEqual(parseReviewedDate('September 4, 2026'), '2026-09-04');
assert.strictEqual(parseReviewedDate('October 2026 (1 night)'), '2026-10-01'); // stay month only
assert.strictEqual(parseReviewedDate('hôm qua'), null);
assert.strictEqual(parseReviewedDate(undefined), null);

assert.strictEqual(languageLabel('vi'), 'Tiếng Việt');
assert.strictEqual(languageLabel('en'), 'English');
assert.strictEqual(languageLabel('EN_us'), 'English'); // region suffix, any case
assert.strictEqual(languageLabel('zh'), '简体中文');
assert.strictEqual(languageLabel('zh-TW'), '繁體中文 (台灣)');
assert.strictEqual(languageLabel('unknown'), ''); // no match: the dropdown is left on its default
assert.strictEqual(languageLabel(''), '');
console.log('agoda-parse ok');

// An empty page is never read as a block (it used to start a 6 hour pause): only Agoda's own "access restricted" text does.
const cooldown = require('../collector/models/cooldown');
const Agoda = require('../collector/models/agodaModel');
(async () => {
  const trips = [];
  cooldown.trip = (site) => trips.push(site);
  const fake = (text) => ({ frames: () => [{ evaluate: async () => text }], waitForTimeout: async () => {}, locator: () => ({ count: async () => 0 }), url: () => 'https://portal.agoda.com/x' });
  await assert.rejects(Agoda.checkSession(fake('')), { code: 'NETWORK_ERROR' });
  assert.deepStrictEqual(trips, []);
  await assert.rejects(Agoda.checkSession(fake('Access is temporarily restricted')), { code: 'AUTH_REQUIRED' });
  assert.deepStrictEqual(trips, ['agoda']);
})();
