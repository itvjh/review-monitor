// Read-only Agoda collector (Partner Portal, https://portal.agoda.com). Properties come from the property search page, reviews from each
// property's "Guest reviews" page: newest first, 20 per page, and every review carries Agoda's own booking id (BID), so the review
// identity is that id (no content guessing as with Tripadvisor).
const { CodedError, clean } = require('./errors');
const { hashReview } = require('./reviewUtils');
const { parseScore, starsFromScore, bidOf, parseReviewedDate } = require('./agodaParse');

const PORTAL = 'https://portal.agoda.com/mldc/en-us/app';
exports.PORTAL = PORTAL;
exports.reviewsUrl = (propertyId) => `${PORTAL}/setting/review/${propertyId}`;
const MAX_PAGES = 30; // safety stop per property
const CARD = '[data-testid="review-card"]';
const BLOCKED = /Access is temporarily restricted|Access Denied|unusual traffic/i;

const pause = (page) => page.waitForTimeout(1500 + Math.floor(Math.random() * 1000)); // be gentle: a few seconds between pages

async function checkSession(page) {
  const body = (await page.locator('body').innerText().catch(() => '')).normalize('NFC');
  if (BLOCKED.test(body)) throw new CodedError('AUTH_REQUIRED', 'Agoda đang chặn truy cập. Dừng lại, thử lại sau vài giờ.');
  if ((await page.locator('input[type=password]').count()) || /login|signin|sso/i.test(new URL(page.url()).pathname)) throw new CodedError('AUTH_REQUIRED', 'Chưa đăng nhập Agoda: chạy npm run login -- agoda');
}
exports.checkSession = checkSession;

exports.listBusinesses = async (page) => {
  await page.goto(`${PORTAL}/iam/propertysearch`, { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector('[data-testid="property-search-table-row"]', { timeout: 30000 }); } catch (e) {
    await checkSession(page);
    throw new CodedError('SELECTOR_CHANGED', 'không thấy danh sách cơ sở trên Agoda Partner Portal');
  }
  await page.waitForTimeout(1500);
  const found = new Map();
  for (let p = 0; p < 20; p++) {
    const rows = await page.$$eval('[data-testid="property-search-table-row"]', (trs) => trs.map((tr) => tr.innerText.split('\n').map((s) => s.normalize('NFC').replace(/\s+/g, ' ').trim()).filter(Boolean)));
    for (const lines of rows) { // [name, status, "<id> · <city>, <country>", revenue, ...]
      const idLine = lines.find((l) => /^\d{5,}\s*·/.test(l));
      if (!idLine || lines[1] !== 'Active') continue;
      const id = idLine.match(/^(\d+)/)[1];
      if (!found.has(id)) found.set(id, { business_name: lines[0], business_identifier: id, address: idLine.replace(/^\d+\s*·\s*/, ''), business_profile_url: `${PORTAL}/reporting/dashboard/${id}` });
    }
    const next = page.locator('button[aria-label="Go to next page"]:not([disabled])');
    if (!(await next.count())) break;
    await next.first().click();
    await page.waitForTimeout(1500);
  }
  if (!found.size) throw new CodedError('SELECTOR_CHANGED', 'no active properties on the Agoda property list');
  const collected_at = new Date().toISOString();
  return [...found.values()].map((b) => ({ ...b, status: 'active', collected_at }));
};

// The cards on screen (tagged data-ag-card=<index> so callers can click inside them).
exports.readCards = (page) => page.$$eval(CARD, (els) => {
  const squash = (s) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
  const q = (c, id) => { const e = c.querySelector('[data-testid="' + id + '"]'); return e ? squash(e.innerText) : ''; };
  return els.map((c, i) => {
    c.setAttribute('data-ag-card', String(i));
    return {
      index: i,
      bid: (squash(c.innerText).match(/BID:\s*(\d+)/) || [])[1] || '',
      score: q(c, 'review-score'), name: q(c, 'reviewer-name'), country: q(c, 'reviewer-country-name'),
      title: q(c, 'review-title'), text: q(c, 'review-text'), reply: q(c, 'review-reply'),
      replied: [...c.querySelectorAll('button')].some((b) => squash(b.innerText) === 'Edit reply') || !!c.querySelector('[data-testid="review-reply"]'),
    };
  });
});

// Opens a card's detail dialog: it shows the review date ("Reviewed October 28, 2026"), which the list does not.
exports.openDetails = async (page, index) => {
  await page.locator(`[data-ag-card="${index}"] [data-testid="review-details-link"]`).click();
  await page.waitForTimeout(1200);
  const dialog = page.locator('[role=dialog], [aria-modal=true]').last();
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  return dialog;
};
exports.closeDetails = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(600); };

// Next page of reviews; false on the last page.
exports.nextPage = async (page) => {
  const first = () => page.locator(CARD).first().innerText().catch(() => '');
  const before = await first();
  const next = page.locator('[data-element-name="ycs-review-pagination"] button[aria-label="Go to next page"]:not([disabled])');
  if (!(await next.count())) return false;
  await next.first().click();
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(500); if ((await first()) !== before) return true; }
  return false;
};

// Opens a property's reviews. -> false when it has none.
exports.openReviews = async (page, propertyId) => {
  await page.goto(exports.reviewsUrl(propertyId), { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector(CARD, { timeout: 30000 }); } catch (e) {
    await checkSession(page);
    if (/Based on 0 reviews|No reviews/i.test((await page.locator('body').innerText()).normalize('NFC'))) return false;
    throw new CodedError('SELECTOR_CHANGED', 'không thấy danh sách đánh giá trên Agoda');
  }
  await page.waitForTimeout(1500);
  return true;
};

// Up to `limit` reviews NOT in `known`, newest first; stops after `stopAfterKnown` known reviews in a row.
async function readProperty(page, biz, { limit, stopAfterKnown, known }) {
  const reviews = [];
  if (!(await exports.openReviews(page, biz.business_identifier))) return reviews;
  let knownRun = 0;
  for (let p = 0; p < MAX_PAGES; p++) {
    for (const c of await exports.readCards(page)) {
      if (!c.bid || !c.score) throw new CodedError('SELECTOR_CHANGED', `unreadable Agoda review card in ${biz.business_name}`);
      const review = { platform: 'agoda', business_identifier: biz.business_identifier, review_id: c.bid };
      const hash = hashReview(review);
      if (known.has(hash)) { if (++knownRun >= stopAfterKnown) return reviews; continue; }
      knownRun = 0;

      const dialog = await exports.openDetails(page, c.index);
      const text = (await dialog.innerText()).normalize('NFC');
      await exports.closeDetails(page);
      const reviewed = (text.match(/Reviewed\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})/) || [])[1];
      reviews.push({
        ...review,
        reviewer_name: c.name + (c.country ? ` (${c.country})` : ''),
        rating: starsFromScore(parseScore(c.score)),
        review_text: [c.title, c.text].filter(Boolean).join('\n'),
        review_date_text: reviewed || '',
        review_date: parseReviewedDate(reviewed),
        owner_reply: c.reply,
        has_owner_reply: c.replied,
        review_url: exports.reviewsUrl(biz.business_identifier),
        review_hash: hash,
        raw_score: parseScore(c.score), // Agoda's own 0-10 score
      });
      if (reviews.length >= limit) return reviews;
    }
    await pause(page);
    if (!(await exports.nextPage(page))) break;
  }
  return reviews;
}

// One browser session: every property in turn. A failing property is reported in `errors` and does not stop the others.
exports.read = async (page, { limit, stopAfterKnown = 10, known }) => {
  const knownSet = new Set(known);
  const businesses = await exports.listBusinesses(page);
  const reviews = [];
  const errors = [];
  for (const biz of businesses) {
    try { reviews.push(...(await readProperty(page, biz, { limit, stopAfterKnown, known: knownSet }))); } catch (e) {
      if (e.code === 'AUTH_REQUIRED') throw e; // blocked or logged out: stop everything, do not keep hitting the site
      errors.push({ business: biz.business_identifier, error_code: e.code || 'UNKNOWN_ERROR', error_message: `${biz.business_name}: ${clean(e.message)}` });
    }
    await pause(page);
  }
  return { scanned: reviews.length, reviews, errors };
};
