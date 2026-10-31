const Directory = require('./businessDirectory');
// Reads the all-locations reviews feed (newest first) and turns cards into normalized review records.
const SEL = require('./selectors');
const { CodedError } = require('./errors');
const { isAuthPage, setMaxRows } = require('./browser');
const { normalizeDate, hashReview } = require('./reviewUtils');

async function readCards(page) {
  // No click on "Thêm"/"More": the full text of a long review is already in the card (hidden span), and Google re-renders the text while expanding it, so a read right after the click could see it empty.
  return page.$$eval(SEL.card, (els, S) => els.map((r) => {
    let c = r; // climb to the card: the widest ancestor that still holds exactly one review
    while (c.parentElement && c.parentElement.querySelectorAll(S.card).length === 1) c = c.parentElement;
    const txt = (q, full) => {
      const e = (full && c.querySelector(full)) || c.querySelector(q); if (!e) return '';
      const clone = e.cloneNode(true); clone.querySelectorAll('.fjB0Xb, a[role=button], i').forEach(n=>n.remove()); clone.querySelectorAll('br').forEach(n=>n.replaceWith('\n'));
      return clone.textContent.trim();
    };
    const bizHref = (c.querySelector(S.biz) || {}).href || '';
    const stars = [...c.querySelectorAll(S.stars)];
    return {
      review_id: r.getAttribute('data-review-id'),
      business_identifier: (bizHref.match(/\/n\/(\d+)/) || [])[1] || (r.getAttribute('data-listing-id') ? BigInt.asUintN(64, BigInt(r.getAttribute('data-listing-id'))).toString() : ''), // the listing id is the same number, signed
      reviewer_name: txt(S.reviewer),
      star_count: c.querySelector(S.scoreLabel) ? 5 : stars.length,
      rating: c.querySelector(S.scoreLabel) ? Number((c.querySelector(S.scoreLabel).getAttribute('aria-label').match(/^([1-5])\/5/) || [])[1]) : stars.filter((s) => s.classList.contains(S.starFilled)).length,
      date_text: txt(S.date),
      text: txt(S.text, S.fullText),
      owner_reply: txt(S.reply, S.fullReply),
    };
  }), SEL.inPage);
}

exports.readCards = readCards;
// The first page of the feed (the newest 50 reviews of every location) is the same for every business, and n8n asks for one business at a time:
// read it once per crawl and serve the other businesses from memory instead of opening the page again. /businesses (the start of a crawl) clears it.
const FEED_TTL = 30 * 60 * 1000;
let feed;
exports.forgetFeed = () => { feed = undefined; };
exports.hasFeed = () => Boolean(feed) && Date.now() - feed.at < FEED_TTL;

async function loadFeed(page) {
  await page.goto(SEL.reviewsUrl, { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector(SEL.card); } catch (e) {
    if (await isAuthPage(page)) throw new CodedError('AUTH_REQUIRED');
    if (SEL.emptyText.test(await page.innerText('body'))) return [];
    throw new CodedError('SELECTOR_CHANGED', 'no review cards on reviews page');
  }
  await setMaxRows(page);
  // A card with no text at all (even a rating-only one carries Google's "left a rating" line) has not finished rendering: wait, then refuse rather than store it as rating-only.
  let cards = await readCards(page);
  if (cards.some((c) => !c.text)) { await page.waitForTimeout(3000); cards = await readCards(page); }
  const blank = cards.find((c) => !c.text);
  if (blank) throw new CodedError('SELECTOR_CHANGED', `review card without text ${blank.review_id}`);
  return cards;
}

async function readProperty(page, { limit, known }, business) {
  const knownSet = new Set(known);
  if (!exports.hasFeed()) feed = { at: Date.now(), cards: await loadFeed(page) };
  // Reviews already stored (known hashes) are skipped.
  const reviews = [];
  const seen = new Set();
  for (const c of feed.cards) {
    if (!c.business_identifier || !c.reviewer_name || c.star_count !== 5 || c.rating < 1) {
      throw new CodedError('SELECTOR_CHANGED', `unreadable review card ${c.review_id}`);
    }
    if (seen.has(c.review_id) || c.business_identifier !== business.business_identifier) continue; // the feed mixes every location
    seen.add(c.review_id);
    const r = {
      review_id: c.review_id,
      business_identifier: c.business_identifier,
      reviewer_name: c.reviewer_name,
      rating: c.rating,
      review_text: SEL.ratingOnlyText.test(c.text) ? '' : c.text,
      review_date_text: c.date_text,
      review_date: normalizeDate(c.date_text),
      owner_reply: c.owner_reply,
      has_owner_reply: Boolean(c.owner_reply),
      source_locator: { property_id: c.business_identifier, review_id: c.review_id, page: 0, kind: 'native' },
      review_url: `https://business.google.com/n/${c.business_identifier}/reviews`,
    };
    r.review_hash = hashReview(r);
    if (!knownSet.has(r.review_hash) && reviews.length < limit) reviews.push(r);
  }
  return { scanned: reviews.length, reviews };
}

exports.read = async (page, opts) => {
  const businesses = opts.businesses || await Directory.get('google', () => require('./businessModel').list(page));
  const reviews = [], errors = [];
  for (const business of businesses) {
    try { const out = await readProperty(page, opts, business); reviews.push(...out.reviews); }
    catch (e) { if(e.code === 'AUTH_REQUIRED') throw e; errors.push({business: business.business_identifier, error_code: e.code || 'UNKNOWN_ERROR', error_message: e.message}); }
  }
  reviews.sort((a,b) => Directory.compareIds(a.business_identifier,b.business_identifier) || Directory.compareIds(a.review_id,b.review_id));
  return {scanned: reviews.length, reviews, errors};
};
