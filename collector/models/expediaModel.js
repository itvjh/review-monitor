// Expedia Partner Central (Expedia, Hotels.com and Vrbo guest reviews): property list and review reader. Read-only; no reply poster yet.
const Directory = require('./businessDirectory');
const { CodedError, clean } = require('./errors');
const cooldown = require('./cooldown');
const { visibleText } = require('./util');
const { hashReview } = require('./reviewUtils');
const { parseCard, parseDate, propertyIdOf, starsFromScore } = require('./expediaParse');

const PORTAL = 'https://apps.expediapartnercentral.com';
exports.LIST_URL = `${PORTAL}/manageproperty/ManageProperty`;
exports.reviewsUrl = (propertyId) => `${PORTAL}/supply/reviews/post-stay-reviews?propertyId=${propertyId}`;
const CARD = '[data-testid="review-card"]';
const FILTER_CHIP = /^(Xoá|Xóa|Clear|Remove) /; // the page opens on "Cần phản hồi" (needs a reply); that chip has to be cleared to see every review
const BLOCKED = /Access (is )?(temporarily )?(denied|restricted)|unusual (traffic|activity)|verify you are human|captcha/i;
exports.CARD = CARD;
const MAX_BATCHES = 40; // the list loads 30 reviews per scroll: a safety stop per property

const count = (locator) => locator.count().catch(() => 0); // a count taken while the page navigates throws: "not there yet"

async function checkSession(page) {
  let text = await visibleText(page);
  if (!text.trim()) { await page.waitForTimeout(3000); text = await visibleText(page); } // an empty page is a page still loading, not proof of a block
  if (BLOCKED.test(text)) {
    cooldown.trip('expedia');
    throw new CodedError('AUTH_REQUIRED', 'Expedia yêu cầu xác minh hoặc chặn truy cập. Hệ thống tạm dừng vài giờ, không thử lại liên tục.');
  }
  const url = new URL(page.url());
  if (!/(^|\.)expediapartnercentral\.com$/.test(url.hostname) || /logon|login|signin|sso|identity/i.test(url.pathname) || await count(page.locator('input[type=password]'))) {
    throw new CodedError('AUTH_REQUIRED', 'Chưa đăng nhập Expedia: chạy npm run login -- expedia');
  }
  if (!text.trim()) throw new CodedError('NETWORK_ERROR', 'Trang Expedia trống, thử lại.');
}
exports.checkSession = checkSession;

exports.listBusinesses = async (page) => {
  cooldown.check('expedia', 'Expedia');
  await page.goto(exports.LIST_URL, { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector('li a.landing-page', { timeout: 30000 }); } catch (e) {
    await checkSession(page);
    throw new CodedError('SELECTOR_CHANGED', 'không thấy danh sách nơi lưu trú trên Expedia Partner Central');
  }
  const rows = await page.$$eval('li a.landing-page', (links) => links.map((a) => {
    const t = (q) => (a.querySelector(q) ? a.querySelector(q).innerText.replace(/\s+/g, ' ').trim() : '');
    return { href: a.href, name: t('.hotel-name'), address: [t('.hotel-address'), t('.hotel-region')].filter(Boolean).join(', ') };
  }));
  const found = new Map();
  for (const r of rows) {
    const id = propertyIdOf(r.href);
    if (id && r.name) found.set(id, { business_identifier: id, business_name: r.name, address: r.address, business_profile_url: r.href, status: 'active', collected_at: new Date().toISOString() });
  }
  if (!found.size) throw new CodedError('SELECTOR_CHANGED', 'Không đọc được nơi lưu trú nào trên Expedia.');
  return [...found.values()];
};

// Opens a property's reviews with the "needs a reply" filter cleared. -> false when it has none.
exports.openReviews = async (page, propertyId) => {
  cooldown.check('expedia', 'Expedia');
  await page.goto(exports.reviewsUrl(propertyId), { waitUntil: 'domcontentloaded' });
  const chip = page.getByRole('button', { name: FILTER_CHIP });
  for (let i = 0; i < 60 && !await count(page.locator(CARD)) && !await count(chip); i++) await page.waitForTimeout(500);
  if (await count(chip)) {
    await chip.first().click();
    for (let i = 0; i < 40 && await count(chip); i++) await page.waitForTimeout(500);
    await page.waitForTimeout(2500); // the list reloads without the filter
  }
  for (let i = 0; i < 30 && !await count(page.locator(CARD)); i++) await page.waitForTimeout(500);
  if (await count(page.locator(CARD))) return true;
  await checkSession(page);
  if (/không có nhận xét/i.test(await visibleText(page))) return false;
  throw new CodedError('SELECTOR_CHANGED', 'không thấy danh sách nhận xét trên Expedia');
};

exports.MAX_BATCHES = MAX_BATCHES;
const readCards = (page) => page.$$eval(CARD, (els) => els.map((e) => ({
  lines: e.innerText.split('\n'),
  canReply: Boolean(e.querySelector('[data-testid="supply-reviews-button--REVIEWS_RESPOND_SHEET"]')),
})));

// Scrolls the list down; -> true when more reviews were added.
exports.readCards = readCards;
exports.loadMore = loadMore;
async function loadMore(page) {
  const before = await count(page.locator(CARD));
  await page.evaluate(() => { const s = document.querySelector('[data-testid="scroll-container"]') || document.scrollingElement; s.scrollTo(0, s.scrollHeight); window.scrollTo(0, document.body.scrollHeight); });
  for (let i = 0; i < 16; i++) { await page.waitForTimeout(500); if (await count(page.locator(CARD)) > before) return true; }
  return false;
}

const valid = (c) => Boolean(c && c.name && parseDate(c.dateText) && c.score > 0 && c.score <= 10);

// Up to `limit` reviews NOT in `known`, newest first; stops after `stopAfterKnown` known reviews in a row.
async function readProperty(page, biz, { limit, stopAfterKnown, known }) {
  const out = [], seen = new Set();
  if (!await exports.openReviews(page, biz.business_identifier)) return out;
  let done = 0, knownRun = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    let cards = await readCards(page);
    if (cards.slice(done).some((raw) => !valid(parseCard(raw.lines)))) { await page.waitForTimeout(2500); cards = await readCards(page); } // a card still drawing itself
    for (const raw of cards.slice(done)) {
      const c = parseCard(raw.lines);
      if (!valid(c)) throw new CodedError('SELECTOR_CHANGED', `Thẻ Expedia thiếu tên, ngày hoặc điểm: ${JSON.stringify(raw.lines).slice(0, 200)}`);
      if (seen.has(c.bookingId)) continue;
      seen.add(c.bookingId);
      const review_hash = hashReview({ platform: 'expedia', business_identifier: biz.business_identifier, review_id: c.bookingId });
      if (known.has(review_hash)) { if (++knownRun >= stopAfterKnown) return out; continue; }
      knownRun = 0;
      out.push({
        platform: 'expedia', business_identifier: biz.business_identifier, review_id: c.bookingId, review_hash,
        source_locator: { property_id: biz.business_identifier, review_id: c.bookingId, page: batch, kind: 'native' },
        reviewer_name: c.name, rating: starsFromScore(c.score), raw_score: c.score, review_text: c.text,
        review_date: parseDate(c.dateText), review_date_text: c.dateText, owner_reply: c.reply, has_owner_reply: Boolean(c.reply) || c.moderation === 'pending',
        reply_allowed: raw.canReply || Boolean(c.reply) || c.moderation === 'pending', review_url: exports.reviewsUrl(biz.business_identifier),
      });
      if (out.length >= limit) return out;
    }
    done = cards.length;
    if (!await loadMore(page)) break;
  }
  return out;
}

exports.read = async (page, { limit, stopAfterKnown = 10, known, businesses: supplied }) => {
  const businesses = supplied || await Directory.get('expedia', () => exports.listBusinesses(page)), knownSet = new Set(known), reviews = [], errors = [];
  for (const biz of businesses) {
    try { reviews.push(...await readProperty(page, biz, { limit, stopAfterKnown, known: knownSet })); }
    catch (e) {
      if (e.code === 'AUTH_REQUIRED') throw e;
      errors.push({ business: biz.business_identifier, error_code: e.code || 'UNKNOWN_ERROR', error_message: clean(e.message) });
    }
  }
  reviews.sort((a, b) => Directory.compareIds(a.business_identifier, b.business_identifier) || Directory.compareIds(a.review_id, b.review_id));
  return { scanned: reviews.length, reviews, errors };
};
