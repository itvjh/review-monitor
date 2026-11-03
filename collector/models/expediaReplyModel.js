// Posts ONE approved reply to ONE Expedia review. Safety, in order: the reply may not contain the guest's name or contact details (the sheet makes us
// declare that), the card is found by its booking id and must be the expected reviewer and still unanswered, the sheet must show the same guest,
// and in live mode the post is confirmed from a fresh load. One click on "Gửi", never retried.
const E = require('./expediaModel');
const { parseCard, mentionsName } = require('./expediaParse');
const { CodedError } = require('./errors');
const { squash, sameReply, screenshot } = require('./util');

const RESPOND = '[data-testid="supply-reviews-button--REVIEWS_RESPOND_SHEET"]';
const SEND = { name: 'Gửi', exact: true };

// Opens the property's reviews and scrolls until the card of booking `reviewId` is on the page. -> a locator for the card, or null.
async function locate(page, property, reviewId) {
  if (!await E.openReviews(page, property)) return null;
  const card = page.locator(E.CARD).filter({ has: page.locator(`a[href*="bookingItemId=${reviewId}"]`) });
  for (let batch = 0; batch < E.MAX_BATCHES; batch++) {
    const n = await card.count();
    if (n > 1) throw new CodedError('REPLY_MISMATCH', 'Có nhiều thẻ Expedia trùng mã đặt phòng. Không đăng.');
    if (n === 1) return card;
    if (!await E.loadMore(page)) return null;
  }
  return null;
}

const read = async (card) => parseCard((await card.innerText()).split('\n'));

exports.post = async (page, { property, reviewId, reviewer, text, dryRun }) => {
  if (mentionsName(text, reviewer)) throw new CodedError('REPLY_MISMATCH', 'Phản hồi Expedia không được chứa tên khách. Không đăng.');
  if (/https?:\/\/|www\.|@|\d{7,}/i.test(text)) throw new CodedError('REPLY_MISMATCH', 'Phản hồi Expedia không được chứa liên kết, email hay số điện thoại. Không đăng.');

  const card = await locate(page, property, reviewId);
  if (!card) throw new CodedError('REVIEW_NOT_FOUND', 'Không tìm thấy nhận xét này trên Expedia.');
  const found = await read(card);
  if (!found || found.bookingId !== String(reviewId) || squash(found.name).toLowerCase() !== squash(reviewer).toLowerCase()) throw new CodedError('REPLY_MISMATCH', `Thẻ Expedia không khớp (${found ? found.bookingId + ' / ' + found.name : 'không đọc được'}). Không đăng.`);
  if (found.moderation === 'pending') return { posted: true, dry_run: false, verified: true, already: true, pending_approval: true }; // sent, and Expedia is still checking it
  if (found.reply) {
    if (sameReply(found.reply, text)) return { posted: true, dry_run: false, verified: true, already: true }; // idempotent: a retry recognises its own reply
    throw new CodedError('ALREADY_REPLIED', `Nhận xét này đã có phản hồi khác trên Expedia. Không đăng. Phản hồi hiện có: "${squash(found.reply).slice(0, 80)}"`);
  }

  const open = card.locator(RESPOND);
  if (await open.count() !== 1) throw new CodedError('POSTING_DISABLED', 'Expedia không cho trả lời nhận xét này (không có nút Phản hồi).');
  await card.scrollIntoViewIfNeeded();
  await open.click();

  const area = page.locator('textarea:visible');
  await area.first().waitFor({ state: 'visible' });
  if (await area.count() !== 1) throw new CodedError('SELECTOR_CHANGED', 'Có nhiều hơn một ô soạn phản hồi Expedia.');
  // The sheet is the container that holds the textarea and the send button; it repeats the guest and the review, so check it is the right one.
  const sheet = page.locator('div').filter({ has: area }).filter({ has: page.getByRole('button', SEND) }).last();
  if (!squash(await sheet.innerText()).includes(squash(reviewer))) throw new CodedError('REPLY_MISMATCH', 'Khung phản hồi Expedia hiện khách khác. Không đăng.');
  await area.fill(text);
  if (await area.inputValue() !== text) throw new CodedError('REPLY_MISMATCH', 'Nội dung trong ô soạn khác nội dung đã duyệt. Không đăng.');
  const declaration = sheet.getByRole('checkbox');
  if (await declaration.count() !== 1) throw new CodedError('SELECTOR_CHANGED', 'Không thấy đúng một ô xác nhận "không cung cấp thông tin cá nhân của khách".');
  await declaration.check(); // true: the name and contact checks above passed

  if (dryRun) {
    const shot = await screenshot(page, 'expedia-dryrun');
    await declaration.uncheck(); await area.fill('');
    await page.keyboard.press('Escape');
    return { posted: false, dry_run: true, screenshot: shot };
  }

  const send = sheet.getByRole('button', SEND);
  if (await send.count() !== 1 || await send.isDisabled()) throw new CodedError('SELECTOR_CHANGED', 'Không thấy đúng một nút Gửi đang bật trong khung phản hồi Expedia.');
  await send.click(); // exactly one submission

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForTimeout(4000 + attempt * 3000);
    const again = await locate(page, property, reviewId).catch(() => null);
    const now = again && await read(again).catch(() => null);
    if (now && now.moderation === 'pending') return { posted: true, dry_run: false, verified: true, pending_approval: true }; // Expedia shows a reply only after it approves it
    if (now && now.reply && sameReply(now.reply, text)) return { posted: true, dry_run: false, verified: true };
  }
  const shot = await screenshot(page, 'expedia-unverified');
  throw Object.assign(new CodedError('UNKNOWN_ERROR', 'Đã bấm Gửi nhưng chưa xác nhận được phản hồi đã hiện trên Expedia. KHÔNG đăng lại: hãy kiểm tra trên Expedia rồi bấm "Đăng lên" để đồng bộ trạng thái.'), { screenshot: shot });
};
