// Reads the managed-locations list from Google Business Profile (read-only).
const SEL = require('./selectors');
const { CodedError } = require('./errors');
const { isAuthPage, setMaxRows, goNext } = require('./browser');

exports.list = async (page) => {
  await page.goto(SEL.locationsUrl, { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector(SEL.profileLink); } catch (e) {
    if (await isAuthPage(page)) throw new CodedError('AUTH_REQUIRED');
    throw new CodedError('SELECTOR_CHANGED', 'no location links found');
  }
  if (await isAuthPage(page)) throw new CodedError('AUTH_REQUIRED');
  await setMaxRows(page);

  const found = new Map();
  for (let p = 0; p < 50; p++) {
    const anchors = await page.$$eval(SEL.profileLink, (as) => as.map((a) => ({
      href: a.href,
      lines: (a.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean),
    })));
    for (const a of anchors) {
      const m = a.href.match(/\/n\/(\d{6,})\/profile/);
      if (m && a.lines[0] && !found.has(m[1])) {
        found.set(m[1], {
          business_name: a.lines[0],
          business_identifier: m[1],
          address: a.lines[1] || '',
          business_profile_url: `https://business.google.com/n/${m[1]}/profile`,
        });
      }
    }
    const first = anchors[0] && anchors[0].href;
    if (!(await goNext(page, first, () => page.locator(SEL.profileLink).first().getAttribute('href')))) break;
  }
  if (!found.size) throw new CodedError('SELECTOR_CHANGED', 'no named location links');
  const collected_at = new Date().toISOString();
  return [...found.values()].map((b) => ({ ...b, status: 'active', collected_at }));
};
