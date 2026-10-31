const Locator = require('./reviewLocator');
// Posts ONE approved reply to ONE review through the Google UI. The only write the collector can do; see replyPolicy.js for the gate.
// Safety: find the card by Google's own review id, check it is the expected business + reviewer and still unanswered,
// refuse anything ambiguous, and in live mode confirm after a page RELOAD that the reply really is on Google.
const SEL = require('./selectors');
const { CodedError } = require('./errors');
const { isAuthPage, setMaxRows, goNext } = require('./browser');
const { sameName } = require('./replyPolicy');
const { sameReply, screenshot } = require('./util');

const TAG = 'data-gbp-target';

// Marks the card of review `id` with a temporary attribute and describes it; null when it is not on this page.
const tagCard = (page, id) => page.$$eval(SEL.card, (els, a) => {
  document.querySelectorAll(`[${a.tag}]`).forEach((e) => e.removeAttribute(a.tag));
  const r = els.find((e) => e.getAttribute('data-review-id') === a.id);
  if (!r) return null;
  let c = r;
  while (c.parentElement && c.parentElement.querySelectorAll(a.card).length === 1) c = c.parentElement;
  c.setAttribute(a.tag, '1');
  const bizHref = (c.querySelector(a.biz) || {}).href || '';
  const who = c.querySelector(a.reviewer);
  const reply = c.querySelector(a.fullReply) || c.querySelector(a.reply);
  return {
    business_identifier: r.getAttribute('data-listing-id') || (bizHref.match(/\/n\/(\d+)/) || [])[1] || a.propertyId,
    reviewer_name: who ? who.innerText.replace(/open_in_new/g, '').trim() : '',
    has_reply: Boolean(reply),
    reply_text: reply ? reply.textContent : '',
  };
}, { id, propertyId: (new URL(page.url()).pathname.match(/\/n\/(\d+)\/reviews/) || [])[1] || '', tag: TAG, card: SEL.card, biz: SEL.inPage.biz, reviewer: SEL.inPage.reviewer, reply: SEL.inPage.reply, fullReply: SEL.inPage.fullReply });

// Loads the feed fresh (the page does not refresh itself after a post) and pages through it until the card shows up.
// -> { card, pageIndex } or null. The card gets the TAG attribute so callers can click inside it.
async function locate(page, reviewId, maxPages, businessIdentifier, sourceLocator) {
  return Locator.seek({
    hint: Locator.pageHint(sourceLocator, businessIdentifier, reviewId, maxPages), maxPages,
    open: async () => {
      await page.goto(SEL.propertyReviewsUrl(businessIdentifier), { waitUntil: 'domcontentloaded' });
      try { await page.waitForSelector(SEL.card); } catch (e) {
        if (await isAuthPage(page)) throw new CodedError('AUTH_REQUIRED');
        throw new CodedError('SELECTOR_CHANGED', 'no review cards on property reviews page');
      }
      await setMaxRows(page); return true;
    },
    find: async (pageIndex) => { const card = await tagCard(page, reviewId); return card ? {card, pageIndex} : null; },
    next: () => require('./googlePaging').next(page),
  });
}

// The send button sits in the same container as the textarea and its Hủy button. "Trả lời" also opens the editor on other cards, so never search the whole page.
const sendButton = (page, area) => page.locator('div').filter({ has: area }).filter({ has: page.locator('button').filter({ hasText: SEL.replyCancel }) }).last()
  .locator('button').filter({ hasText: SEL.replySubmit });
exports.sendButton = sendButton;

const shot = (page, label) => screenshot(page, 'reply-' + label);

exports.post = async (page, { reviewId, businessIdentifier, reviewerName, text, dryRun, sourceLocator }) => {
  const loc = await locate(page, reviewId, 20, businessIdentifier, sourceLocator); // newest first; ~1000 reviews at most
  if (!loc) throw new CodedError('REVIEW_NOT_FOUND', 'Không tìm thấy review này trên Google (có thể đã bị xóa hoặc quá cũ).');
  const { card: found } = loc;
  if (found.business_identifier !== String(businessIdentifier) || !sameName(found.reviewer_name, reviewerName)) {
    throw new CodedError('REPLY_MISMATCH', `Thẻ review không khớp (${found.business_identifier} / ${found.reviewer_name}). Không đăng.`);
  }
  if (found.has_reply) {
    // Idempotent: a retry after an unconfirmed post just recognises our own reply and reports success. Someone else's reply is never touched.
    if (sameReply(found.reply_text, text)) return { posted: true, dry_run: false, verified: true, already: true };
    throw new CodedError('ALREADY_REPLIED', 'Review này đã có phản hồi khác của chủ sở hữu trên Google. Không đăng.');
  }

  const card = page.locator(`[${TAG}="1"]`);
  await card.scrollIntoViewIfNeeded();
  const open = card.locator('button').filter({ hasText: SEL.replyButton });
  if ((await open.count()) !== 1) throw new CodedError('SELECTOR_CHANGED', 'không tìm thấy đúng một nút Trả lời trong thẻ review');
  await open.first().click();

  const area = page.locator('textarea:visible');
  await area.first().waitFor({ state: 'visible' });
  if ((await area.count()) !== 1) throw new CodedError('SELECTOR_CHANGED', 'có nhiều hơn một ô soạn trả lời');
  await area.fill(text);
  if ((await area.inputValue()) !== text) throw new CodedError('REPLY_MISMATCH', 'Nội dung trong ô soạn khác nội dung đã duyệt. Không đăng.');

  if (dryRun) {
    const screenshot = await shot(page, 'dryrun');
    await page.locator('button').filter({ hasText: SEL.replyCancel }).first().click().catch(() => {});
    return { posted: false, dry_run: true, screenshot };
  }

  const submit = sendButton(page, area);
  if ((await submit.count()) !== 1) throw new CodedError('SELECTOR_CHANGED', 'không tìm thấy đúng một nút gửi trả lời trong ô soạn');
  if (await submit.isDisabled()) throw new CodedError('SELECTOR_CHANGED', 'nút Đăng trả lời đang bị khóa');
  await submit.click();

  // Confirm from a fresh load: Google does not show the new reply on the open page, only after a reload.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForTimeout(4000 + attempt * 2000);
    const again = await locate(page, reviewId, loc.pageIndex + 2, businessIdentifier, sourceLocator).catch(() => null);
    if (again && again.card.has_reply && sameReply(again.card.reply_text, text)) return { posted: true, dry_run: false, verified: true };
  }
  const screenshot = await shot(page, 'unverified');
  throw Object.assign(new CodedError('UNKNOWN_ERROR', 'Đã bấm Đăng nhưng chưa xác nhận được phản hồi đã hiện. KHÔNG đăng lại: hãy kiểm tra trên Google, rồi bấm "Đăng lên Google" để đồng bộ trạng thái.'), { screenshot });
};
