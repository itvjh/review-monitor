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
  return page.$$eval(SEL.card, (els, S) => els.map((r) => {
    let c = r; // climb to the card: the widest ancestor that still holds exactly one review
    while (c.parentElement && c.parentElement.querySelectorAll(S.card).length === 1) c = c.parentElement;
    const txt = (q) => { const e = c.querySelector(q); return e ? e.innerText.trim() : ''; };
    const bizHref = (c.querySelector(S.biz) || {}).href || '';
    const stars = [...c.querySelectorAll(S.stars)];
    return {
      review_id: r.getAttribute('data-review-id'),
      business_identifier: (bizHref.match(/\/n\/(\d+)/) || [])[1] || '',
      reviewer_name: txt(S.reviewer),
      star_count: stars.length,
      rating: stars.filter((s) => s.classList.contains(S.starFilled)).length,
      date_text: txt(S.date),
      text: txt(S.text),
      owner_reply: txt(S.reply),
    };
  }), SEL.inPage);
}

exports.read = async (page, { limit, stopAfterKnown, known }) => {
  const knownSet = new Set(known);
  await page.goto(SEL.reviewsUrl, { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector(SEL.card); } catch (e) {
    if (await isAuthPage(page)) throw new CodedError('AUTH_REQUIRED');
    if (SEL.emptyText.test(await page.innerText('body'))) return { scanned: 0, reviews: [] };
    throw new CodedError('SELECTOR_CHANGED', 'no review cards on reviews page');
  }
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
        review_url: `https://business.google.com/n/${c.business_identifier}/reviews`,
      };
      r.review_hash = hashReview(r);
      reviews.push(r);
      knownRun = knownSet.has(r.review_hash) ? knownRun + 1 : 0;
      if (knownRun >= stopAfterKnown || reviews.length >= limit) return { scanned: reviews.length, reviews };
    }
    if (!(await goNext(page, cards[0].review_id, () => page.locator(SEL.card).first().getAttribute('data-review-id')))) break;
  }
  return { scanned: reviews.length, reviews };
};
