const Locator = require('./reviewLocator');
const Traveloka = require('./travelokaModel');
const { identity } = require('./travelokaParse');
const { CodedError } = require('./errors');
const { squash, screenshot } = require('./util');
async function locate(page, property, reviewId, sourceLocator) {
  return Locator.seek({ maxPages: 5, hint: Locator.pageHint(sourceLocator, property, reviewId, 5),
    open: () => Traveloka.openReviews(page, property), next: () => Traveloka.nextPage(page),
    find: async (sourcePage) => {
      const matches = (await Traveloka.readCards(page)).filter(r => identity(property, r) === reviewId);
      if (matches.length > 1) throw new CodedError('REPLY_MISMATCH', 'Có nhiều review Traveloka trùng thông tin. Không đăng.');
      return matches[0] ? { ...matches[0], sourcePage } : null;
    },
  });
}

exports.post = async (page, { property, reviewId, reviewer, text, dryRun, sourceLocator }) => {
  const row = await locate(page, property, reviewId, sourceLocator);
  if (!row) throw new CodedError('REVIEW_NOT_FOUND', 'Không tìm thấy đánh giá trong 50 bài Traveloka mới nhất.');
  if (squash(row.name) !== squash(reviewer)) throw new CodedError('REPLY_MISMATCH', 'Tên khách Traveloka không khớp.');
  const card = page.locator(`[data-tvl-card="${row.index}"]`);
  if (row.replied) {
    const show = card.getByRole('button', { name: 'Xem câu trả lời', exact: true });
    if (await show.count()) await show.click();
    const existing = await card.locator('.reviewContent__partner__content').innerText().catch(() => '');
    if (squash(existing) === squash(text)) return { posted: true, verified: true, already: true, dry_run: false };
    throw new CodedError('ALREADY_REPLIED', 'Traveloka đã có phản hồi khác hoặc đang chờ duyệt. Không đăng lại.');
  }
  if (!row.allowed) throw new CodedError('POSTING_DISABLED', 'Traveloka không cho trả lời đánh giá này.');
  await card.getByRole('button', { name: 'Trả lời', exact: true }).click();
  const area = card.locator('textarea[name^="reply,"]');
  if (await area.count() !== 1 || !/^reply,\d+$/.test(await area.getAttribute('name'))) throw new CodedError('REPLY_MISMATCH', 'Ô trả lời Traveloka không có đúng một mã review.');
  if (sourceLocator?.native_review_id && await area.getAttribute('name') !== 'reply,' + sourceLocator.native_review_id) throw new CodedError('REPLY_MISMATCH', 'ID review gốc Traveloka không khớp.');
  await area.fill(text);
  await Traveloka.verifyProperty(page, property);
  const fresh = (await Traveloka.readCards(page)).find((r) => r.index === row.index);
  if (!fresh || identity(property, fresh) !== reviewId || await area.inputValue() !== text) throw new CodedError('REPLY_MISMATCH', 'Review hoặc nội dung đã đổi trước khi gửi.');
  if (dryRun) {
    const shot = await screenshot(page, 'traveloka-dryrun');
    const source_locator = { property_id: property, review_id: reviewId, native_review_id: (await area.getAttribute('name')).slice(6), page: row.sourcePage, kind: 'native' };
    await area.fill(''); await card.getByRole('button', { name: 'Huỷ', exact: true }).click();
    return { posted: false, dry_run: true, screenshot: shot, source_locator };
  }
  const send = card.getByRole('button', { name: 'Gửi', exact: true });
  if (await send.count() !== 1 || await send.isDisabled()) throw new CodedError('SELECTOR_CHANGED', 'Không thấy đúng một nút gửi Traveloka đang bật.');
  await send.click(); // exactly one submission
  await page.waitForTimeout(3000);
  const again = await locate(page, property, reviewId);
  if (again?.replied) {
    const againCard = page.locator(`[data-tvl-card="${again.index}"]`), show = againCard.getByRole('button', { name: 'Xem câu trả lời', exact: true });
    if (await show.count()) await show.click();
    const saved = await againCard.locator('.reviewContent__partner__content').innerText().catch(() => '');
    if (squash(saved) === squash(text)) return { posted: true, verified: true, dry_run: false };
  }
  throw new CodedError('UNKNOWN_ERROR', 'Đã gửi Traveloka nhưng chưa xác nhận được nội dung. Kiểm tra trên Traveloka trước khi thử lại.');
};
