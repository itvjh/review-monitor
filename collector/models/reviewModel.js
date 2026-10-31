const Directory = require('./businessDirectory');
// Reads the all-locations reviews feed (newest first) and turns cards into normalized review records.
const SEL = require('./selectors');
const { CodedError } = require('./errors');
const { isAuthPage, setMaxRows, goNext } = require('./browser');
const { normalizeDate, hashReview } = require('./reviewUtils');

async function readCards(page) {
  // Long reviews are collapsed behind a "Thêm"/"More" link; expand them in place before reading.
  await page.$$eval(SEL.card, (els, S) => {
    for (const r of els) {
      let c = r;
      while (c.parentElement && c.parentElement.querySelectorAll(S.card).length === 1) c = c.parentElement;
      c.querySelectorAll(`${S.text} *`).forEach((e) => {
        if (!e.children.length && /^(Thêm|More)$/i.test(e.innerText.trim())) e.click();
      });
    }
  }, SEL.inPage);
  const propertyId = (new URL(page.url()).pathname.match(/\/n\/(\d+)\/reviews/) || [])[1] || '';
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
      business_identifier: r.getAttribute('data-listing-id') || (bizHref.match(/\/n\/(\d+)/) || [])[1] || S.propertyId || '',
      reviewer_name: txt(S.reviewer),
      star_count: c.querySelector(S.scoreLabel) ? 5 : stars.length,
      rating: c.querySelector(S.scoreLabel) ? Number((c.querySelector(S.scoreLabel).getAttribute('aria-label').match(/^([1-5])\/5/) || [])[1]) : stars.filter((s) => s.classList.contains(S.starFilled)).length,
      date_text: txt(S.date),
      text: txt(S.text, S.fullText),
      owner_reply: txt(S.reply, S.fullReply),
    };
  }), { ...SEL.inPage, propertyId });
}

exports.readCards = readCards;
async function readProperty(page, { limit, stopAfterKnown, known }, business) {
  const knownSet = new Set(known);
  await page.goto(SEL.propertyReviewsUrl(business.business_identifier), { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector(SEL.card); } catch (e) {
    if (await isAuthPage(page)) throw new CodedError('AUTH_REQUIRED');
    if (SEL.emptyText.test(await page.innerText('body'))) return { scanned: 0, reviews: [] };
    throw new CodedError('SELECTOR_CHANGED', 'no review cards on reviews page');
  }
  if (!new URL(page.url()).pathname.startsWith(`/local/business/${business.business_identifier}/`)) throw new CodedError('REPLY_MISMATCH', 'Google không mở đúng ID cơ sở.');
  await setMaxRows(page);

  const reviews = [];
  const seen = new Set();
  let knownRun = 0; // feed is newest first: stop after N consecutive reviews we already stored
  for (let p = 0; p < 200; p++) {
    const cards = await readCards(page);
    for (const c of cards) {
      if (!c.business_identifier || !c.reviewer_name || c.star_count !== 5 || c.rating < 1) {
        throw new CodedError('SELECTOR_CHANGED', `unreadable review card ${c.review_id}`);
      }
      if (seen.has(c.review_id)) continue;
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
        source_locator: { property_id: c.business_identifier, review_id: c.review_id, page: p, kind: 'native' },
        review_url: `https://business.google.com/n/${c.business_identifier}/reviews`,
      };
      r.review_hash = hashReview(r);
      if (r.business_identifier !== business.business_identifier) throw new CodedError('REPLY_MISMATCH', 'Google trả về đánh giá của cơ sở khác.');
      const exists = knownSet.has(r.review_hash);
      if (!exists) reviews.push(r);
      knownRun = exists ? knownRun + 1 : 0;
      if (knownRun >= stopAfterKnown || reviews.length >= limit) return { scanned: reviews.length, reviews };
    }
    if (!await require('./googlePaging').next(page)) break;
  }
  return { scanned: reviews.length, reviews };
};

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
