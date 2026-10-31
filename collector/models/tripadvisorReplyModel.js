const Locator = require('./reviewLocator');
// Posts ONE approved reply to ONE Tripadvisor review through the owner's Management Center ("Đánh giá > Tất cả đánh giá").
// Same safety rules as the Google flow (replyModel.js): find the row, refuse anything ambiguous or already answered,
// no retry on the post itself, and in live mode confirm from a fresh page load that the reply really is there.
// The Management Center rows carry no review id and show the member's handle, not always the public display name
// ("Phạm Tuấn Minh" appears as "tuanminh_1996"), so a row is matched by title + stars + the start of the text and must be unique.
// The reviewer name only breaks a tie between rows that are otherwise identical.
const { CodedError } = require('./errors');
const { sameReply, screenshot } = require('./util');
const Mc = require('./tripadvisorMc');
const { matchRow } = require('./tripadvisorParse');

const TAG = 'data-ta-target';
const SUBMIT = /^G.{1,3}i$/; // "Gửi" (also matches the decomposed spelling Tripadvisor sometimes sends)
const MAX_PAGES = 4; // 30 reviews per page: a reply is only ever needed for recent reviews

// Tags the row button of the wanted review. -> { count (rows that match), replied, pending } for the page on screen.
async function tagRow(page, want) {
  await page.evaluate((tag) => document.querySelectorAll('[' + tag + ']').forEach((e) => e.removeAttribute(tag)), TAG);
  const hits = matchRow(await Mc.readRows(page), want);
  if (hits.length === 1) await page.locator('[data-mc-row="' + hits[0].index + '"]').evaluate((e, tag) => e.setAttribute(tag, '1'), TAG);
  return { count: hits.length, replied: hits.length === 1 && hits[0].replied, pending: hits.length === 1 && hits[0].pending };
}

// Loads the Management Center list fresh and pages until the row is found. -> { count, replied } (count 0 = not found).
async function locate(page, want, maxPages, sourceLocator) {
  return await Locator.seek({maxPages,hint:Locator.pageHint(sourceLocator,want.locationId,sourceLocator?.review_id,maxPages),
    open:()=>Mc.openList(page,want.locationId),next:()=>Mc.nextPage(page),
    find:async()=>{const found=await tagRow(page,want);return found.count?found:null;},
  }) || {count:0,replied:false};
}

// retry: true when an earlier attempt for this reply already ran (its answer may have been lost after the post went through).
exports.post = async (page, { businessIdentifier, reviewerName, title, body, rating, text, retry, dryRun, sourceLocator }) => {
  const want = { locationId: businessIdentifier, name: reviewerName, title, body, rating };
  const found = await locate(page, want, MAX_PAGES, sourceLocator);
  if (found.count === 0) throw new CodedError('REVIEW_NOT_FOUND', `Không tìm thấy review này trong ${MAX_PAGES * 30} đánh giá mới nhất của Tripadvisor (có thể bị xóa hoặc quá cũ).`);
  if (found.count > 1) throw new CodedError('REPLY_MISMATCH', 'Có nhiều hơn một review trùng tiêu đề, nội dung và số sao. Không đăng, hãy đăng tay.');

  // A reply that is waiting for Tripadvisor's moderation can only come from a post made moments ago, i.e. ours (an earlier attempt
  // whose answer was lost). Its text is not shown, so it cannot be compared; treat it as done instead of failing on it.
  if (found.replied && found.pending) return { posted: true, dry_run: false, verified: true, already: true, pending: true };
  // Published already, and this is a retry: the earlier attempt very likely posted it and only its answer was lost (the text is not
  // shown, so it cannot be compared). Treat it as done instead of failing forever on our own reply. A FIRST attempt still refuses.
  if (found.replied && retry) return { posted: true, dry_run: false, verified: true, already: true, assumed: true };

  const row = page.locator(`[${TAG}="1"]`);
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await page.waitForTimeout(1500);

  if (found.replied) {
    // Idempotent: a retry after an unconfirmed post recognises our own reply. Someone else's reply is never touched.
    if (sameReply(await page.locator('body').innerText(), text)) return { posted: true, dry_run: false, verified: true, already: true };
    throw new CodedError('ALREADY_REPLIED', 'Review này đã có phản hồi khác của chủ sở hữu trên Tripadvisor. Không đăng.');
  }

  const area = page.locator('textarea:visible');
  await area.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => { throw new CodedError('SELECTOR_CHANGED', 'không thấy ô soạn phản hồi sau khi mở review'); });
  if ((await area.count()) !== 1) throw new CodedError('SELECTOR_CHANGED', 'có nhiều hơn một ô soạn phản hồi');
  await area.fill(text);
  if ((await area.inputValue()) !== text) throw new CodedError('REPLY_MISMATCH', 'Nội dung trong ô soạn khác nội dung đã duyệt. Không đăng.');

  if (dryRun) {
    const shot = await screenshot(page, 'tripadvisor-dryrun');
    await area.fill(''); // leave nothing behind in the box; the page is discarded right after
    return { posted: false, dry_run: true, screenshot: shot };
  }

  const submit = page.locator('button:visible').filter({ hasText: SUBMIT });
  if ((await submit.count()) !== 1) throw new CodedError('SELECTOR_CHANGED', 'không tìm thấy đúng một nút Gửi');
  if (await submit.first().isDisabled()) throw new CodedError('SELECTOR_CHANGED', 'nút Gửi đang bị khóa');
  await submit.first().click();

  // Confirm from a fresh load: the row must now read "Đã đăng phản hồi".
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForTimeout(4000 + attempt * 2000);
    const again = await locate(page, want, MAX_PAGES).catch(() => null);
    if (again && again.count === 1 && again.replied) return { posted: true, dry_run: false, verified: true };
  }
  const shot = await screenshot(page, 'tripadvisor-unverified');
  throw Object.assign(new CodedError('UNKNOWN_ERROR', 'Đã bấm Gửi nhưng chưa xác nhận được phản hồi đã hiện. KHÔNG đăng lại: hãy kiểm tra trên Tripadvisor, rồi bấm "Đã đăng tay" để đồng bộ.'), { screenshot: shot });
};
