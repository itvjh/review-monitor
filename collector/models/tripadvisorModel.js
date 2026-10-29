// Read-only Tripadvisor collector. Properties come from the owner page (Owners), reviews from each property's Management Center
// list (tripadvisorMc.js): newest first, every language, nothing hidden. A row has no review id, so a review is identified by
// its content (tripadvisorParse.contentHash) and opened (expanded) only when it is new.
const { CodedError, clean } = require('./errors');
const Mc = require('./tripadvisorMc');
const { parseDate, contentHash, parseOpened } = require('./tripadvisorParse');

const OWNERS_URL = 'https://www.tripadvisor.com.vn/Owners';
const PROPERTY = /\/(?:Hotel|Restaurant|Attraction|VacationRentalReview)_Review-g\d+-d(\d+)-Reviews-([^.]+)\.html/;
const MAX_PAGES = 30; // safety stop per property

const pause = (page) => page.waitForTimeout(1500 + Math.floor(Math.random() * 1000)); // be gentle: a few seconds between pages

exports.listBusinesses = async (page) => {
  await page.goto(OWNERS_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await Mc.checkSession(page);
  const anchors = await page.$$eval('a', (as) => as.map((a) => ({ href: a.href, name: (a.innerText || '').trim() })));
  const found = new Map();
  for (const a of anchors) {
    const m = a.href.match(PROPERTY);
    if (m && a.name && !found.has(m[1])) {
      found.set(m[1], {
        business_name: a.name,
        business_identifier: m[1],
        address: m[2].split('-').pop().replace(/_/g, ' '),
        business_profile_url: a.href.split('#')[0],
      });
    }
  }
  if (!found.size) throw new CodedError('SELECTOR_CHANGED', 'no Tripadvisor properties on the Owners page');
  const collected_at = new Date().toISOString();
  return [...found.values()].map((b) => ({ ...b, status: 'active', collected_at }));
};

// Opens one row and returns the text lines of its opened card. An opened row stops being a <button>: it becomes a <div> card that
// starts with the reviewer name and holds exactly one "Đánh giá từ <date>" line, and the buttons after it shift up by one. So the row
// is found again by reviewer + title + date (not by index), and the card is the smallest <div> that looks like that.
async function openRow(page, row) {
  const rows = await Mc.readRows(page); // tags the buttons currently on screen
  const now = rows.find((r) => r.name === row.name && r.title === row.title && r.date_text === row.date_text);
  if (!now) throw new CodedError('SELECTOR_CHANGED', 'không tìm lại được dòng review để mở');
  const button = page.locator('[data-mc-row="' + now.index + '"]');
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await page.waitForTimeout(1200);
  return page.evaluate((name) => {
    const squash = (t) => t.normalize('NFC').replace(/\s+/g, ' ').trim();
    const cards = [...document.querySelectorAll('div')].map((d) => ({ d, lines: d.innerText.split('\n').map(squash).filter(Boolean) }))
      .filter((c) => c.lines[0] === name && c.lines.filter((l) => /^Đánh giá từ /.test(l)).length === 1);
    cards.sort((x, y) => x.lines.length - y.lines.length);
    return cards.length ? cards[0].lines : null;
  }, row.name);
}

// Up to `limit` reviews NOT in `known`, newest first. Stops when a whole page holds nothing new.
async function readProperty(page, biz, limit, known, problems) {
  const reviews = [];
  if (!(await Mc.openList(page, biz.business_identifier))) return reviews;
  const seen = new Set();
  for (let p = 0; p < MAX_PAGES && reviews.length < limit; p++) {
    let fresh = 0;
    for (const row of await Mc.readRows(page)) {
      if (!row.title || !row.rating) throw new CodedError('SELECTOR_CHANGED', `unreadable Tripadvisor row in ${biz.business_name}`);
      const hash = contentHash({ business: biz.business_identifier, title: row.title, rating: row.rating, body: row.excerpt });
      if (known.has(hash)) continue;
      fresh++;
      if (seen.has(hash) || reviews.length >= limit) continue; // identical title+stars+text start: counted once
      seen.add(hash);
      const lines = await openRow(page, row);
      const opened = lines && parseOpened(lines, row.title);
      const cut = row.excerpt.replace(/(…|\.{3})$/, '').trim();
      if (!opened || opened.review_text.length < cut.length) { // never save a half-read review: it is read again next run
        problems.push(biz.business_name + ': không đọc được đủ nội dung của review "' + row.title.slice(0, 40) + '", sẽ thử lại lần sau');
        seen.delete(hash);
        continue;
      }
      const date_text = opened.date_text || row.date_text;
      reviews.push({
        platform: 'tripadvisor',
        review_id: '',
        business_identifier: biz.business_identifier,
        reviewer_name: row.name,
        rating: row.rating,
        review_text: [row.title, opened.review_text].filter(Boolean).join('\n'),
        review_date_text: date_text,
        review_date: parseDate(date_text),
        owner_reply: '',
        has_owner_reply: row.replied,
        review_url: Mc.MC_URL(biz.business_identifier),
        review_hash: hash,
      });
    }
    if (!fresh || reviews.length >= limit) break; // nothing new on this page: older pages hold nothing newer
    await pause(page);
    if (!(await Mc.nextPage(page))) break;
  }
  return reviews;
}

// One browser session: every property in turn, up to `limit` NEW reviews EACH. A failing property is reported in `errors`
// and does not stop the others.
exports.read = async (page, { limit, known }) => {
  const knownSet = new Set(known);
  const businesses = await exports.listBusinesses(page);
  const reviews = [];
  const errors = [];
  for (const biz of businesses) {
    const problems = []; // reviews that could not be read completely: reported as REVIEWS_PARTIAL, not saved half-read
    try {
      reviews.push(...(await readProperty(page, biz, limit, knownSet, problems)));
      for (const msg of problems) errors.push({ business: biz.business_identifier, error_code: 'REVIEWS_PARTIAL', error_message: msg });
    } catch (e) {
      if (e.code === 'AUTH_REQUIRED') throw e; // blocked or logged out: stop everything, do not keep hitting the site
      errors.push({ business: biz.business_identifier, error_code: e.code || 'UNKNOWN_ERROR', error_message: `${biz.business_name}: ${clean(e.message)}` });
    }
    await pause(page);
  }
  return { scanned: reviews.length, reviews, errors };
};
