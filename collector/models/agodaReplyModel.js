// Posts ONE approved reply to ONE Agoda review through the Partner Portal ("Guest reviews" > Reply). Same safety rules as the other
// platforms: find the review by its booking id (BID, exact), refuse if it is not found, already answered or if the dialog that opens
// is for another booking, never retry the submit, and confirm from a fresh page load.
const { CodedError } = require('./errors');
const { squash, screenshot } = require('./util');
const Agoda = require('./agodaModel');
const { languageLabel } = require('./agodaParse');

const MAX_PAGES = 3; // 20 reviews per page: a reply is only ever needed for recent reviews
const DROPDOWN = '[data-element-name="ycs-review-detail-reply-language-dropdown"]';
const TEXTAREA = '[data-element-name="ycs-review-detail-write-reply-text-area"]';
const SUBMIT = '[data-element-name="ycs-review-detail-submit-reply-button"]';

// Loads the property's reviews fresh and pages until the card with this booking id is found.
// -> { index, replied, reply } (index = card tag), or null.
async function locate(page, propertyId, bid, maxPages) {
  if (!(await Agoda.openReviews(page, propertyId))) return null;
  for (let p = 0; p < maxPages; p++) {
    const hits = (await Agoda.readCards(page)).filter((c) => c.bid === bid); // exact id, not a prefix
    if (hits.length > 1) throw new CodedError('REPLY_MISMATCH', `Có nhiều thẻ review trùng mã đặt phòng ${bid}. Không đăng.`);
    if (hits.length === 1) return { index: hits[0].index, replied: hits[0].replied, reply: hits[0].reply };
    if (!(await Agoda.nextPage(page))) break;
  }
  return null;
}

// retry: true when an earlier attempt for this reply already ran (its answer may have been lost after the post went through).
exports.post = async (page, { propertyId, bid, language, text, retry, dryRun }) => {
  const head = squash(text).slice(0, 30);
  const found = await locate(page, propertyId, bid, MAX_PAGES);
  if (!found) throw new CodedError('REVIEW_NOT_FOUND', `Không tìm thấy review (mã đặt phòng ${bid}) trong ${MAX_PAGES * 20} đánh giá mới nhất của Agoda.`);
  if (found.replied) {
    // Idempotent: a retry after an unconfirmed post recognises our own reply. Someone else's reply is never touched.
    if (squash(found.reply).includes(head) || retry) return { posted: true, dry_run: false, verified: true, already: true };
    throw new CodedError('ALREADY_REPLIED', 'Review này đã có phản hồi khác của chủ sở hữu trên Agoda. Không đăng.');
  }

  const dialog = await Agoda.openDetails(page, found.index);
  // the dialog must be for the booking we mean: a click that landed on a neighbouring card must never post there
  if (!(await dialog.innerText()).includes(`BID: ${bid}`)) throw new CodedError('REPLY_MISMATCH', 'Hộp thoại mở ra không phải của review cần trả lời. Không đăng.');

  const label = languageLabel(language); // the dropdown starts on English; leave it alone when we do not know the language
  if (label) {
    await dialog.locator(DROPDOWN).click();
    await page.waitForTimeout(800);
    const option = page.locator('li').filter({ hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') });
    if ((await option.count()) !== 1) throw new CodedError('SELECTOR_CHANGED', `không chọn được ngôn ngữ trả lời "${label}"`);
    await option.first().click();
    await page.waitForTimeout(500);
  }

  const area = dialog.locator(TEXTAREA);
  if ((await area.count()) !== 1) throw new CodedError('SELECTOR_CHANGED', 'không thấy đúng một ô soạn phản hồi');
  await area.fill(text);
  if ((await area.inputValue()) !== text) throw new CodedError('REPLY_MISMATCH', 'Nội dung trong ô soạn khác nội dung đã duyệt. Không đăng.');

  if (dryRun) {
    const shot = await screenshot(page, 'agoda-dryrun');
    await area.fill('');
    await Agoda.closeDetails(page);
    return { posted: false, dry_run: true, screenshot: shot };
  }

  const submit = dialog.locator(SUBMIT);
  if ((await submit.count()) !== 1) throw new CodedError('SELECTOR_CHANGED', 'không tìm thấy đúng một nút gửi phản hồi');
  if (await submit.isDisabled()) throw new CodedError('SELECTOR_CHANGED', 'nút gửi phản hồi đang bị khóa');
  await submit.click();

  // Confirm from a fresh load: the card must now carry a reply.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForTimeout(4000 + attempt * 2000);
    const again = await locate(page, propertyId, bid, MAX_PAGES).catch(() => null);
    if (again && again.replied) return { posted: true, dry_run: false, verified: true };
  }
  const shot = await screenshot(page, 'agoda-unverified');
  throw Object.assign(new CodedError('UNKNOWN_ERROR', 'Đã bấm gửi nhưng chưa xác nhận được phản hồi đã hiện. KHÔNG đăng lại: hãy kiểm tra trên Agoda, rồi bấm "Đã đăng tay" để đồng bộ.'), { screenshot: shot });
};
