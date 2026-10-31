const Directory = require('./businessDirectory');
const { CodedError, clean } = require('./errors');
const cooldown = require('./cooldown');
const { visibleText } = require('./util');
const { hashReview } = require('./reviewUtils');
const { parseDate, identity, stars } = require('./travelokaParse');
const PROPERTY_URL = 'https://tera.traveloka.com/vi-vn/user/property/';
const REVIEWS_URL = 'https://tera.traveloka.com/vi-vn/guest-review/';
const PROPERTY_CARD = '[data-testid^="property-card-"]';
exports.PROPERTY_URL = PROPERTY_URL;
exports.REVIEWS_URL = REVIEWS_URL;
// A count taken while the page is navigating throws (an expired session goes /logout/ -> /login/ in about 15 s): treat it as "not there yet".
const count = (locator) => locator.count().catch(() => 0);
async function checkSession(page) {
  const text = await visibleText(page);
  if (/access denied|unusual activity|temporarily restricted|verify you are human|captcha/i.test(text)) {
    cooldown.trip('traveloka');
    throw new CodedError('AUTH_REQUIRED', 'Traveloka yêu cầu xác minh hoặc chặn truy cập. Hệ thống đã tạm dừng.');
  }
  if (/login|sign-in|signin/i.test(new URL(page.url()).pathname) || await count(page.locator('input[type=password]'))) throw new CodedError('AUTH_REQUIRED', 'Đăng nhập Traveloka trong Chrome cá nhân: npm run login -- traveloka');
}
exports.checkSession = checkSession;
const LOGIN_PATH = /login|sign-in|signin/i;
let loginFailedAt = 0; // a failed auto-login is not retried for 10 minutes: repeated wrong attempts can lock the account
const leftLogin = (page, timeout) => page.waitForURL((url) => !LOGIN_PATH.test(url.pathname), { timeout }).then(() => true, () => false);
// "Sign in with Google": the account chooser may open in a popup. An account is picked only when exactly one is offered; a password, 2-step prompt or captcha is left to the person.
async function googleLogin(page) {
  const google = page.getByText(/Sign in with Google/i).first();
  if (!await google.count()) return false;
  const popup = page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await google.click();
  const target = await popup || page;
  try {
    const accounts = target.locator('[data-identifier]');
    for (let i = 0; i < 20 && !await accounts.count() && LOGIN_PATH.test(new URL(page.url()).pathname); i++) await page.waitForTimeout(500);
    if (await accounts.count() === 1) await accounts.click();
  } catch { /* the popup closed by itself: the sign-in went through, or it did not and the check below says so */ }
  return leftLogin(page, 30000);
}
// Login page with the password already filled in by Chrome's password manager: press "Đăng nhập" (twice at most), then "Sign in with Google". We never type or read credentials.
async function autoLogin(page) {
  if (!LOGIN_PATH.test(new URL(page.url()).pathname) || Date.now() - loginFailedAt < 10 * 60000) return false;
  const password = page.locator('input[type=password]').first(), button = page.getByRole('button', { name: /^(Đăng nhập|Log ?in|Sign ?in)$/i });
  const filled = () => password.evaluate((e) => e.value !== '' || e.matches(':-webkit-autofill')).catch(() => false);
  for (let i = 0; i < 10 && !await filled(); i++) await page.waitForTimeout(500);
  if (!await filled() || await button.count() !== 1) return false;
  for (let attempt = 0; attempt < 2 && await button.count() === 1; attempt++) {
    await button.click();
    if (await leftLogin(page, 15000)) return true;
  }
  if (await googleLogin(page)) return true;
  loginFailedAt = Date.now();
  return false;
}
exports.autoLogin = autoLogin;
async function openProperties(page) {
  cooldown.check('traveloka', 'Traveloka');
  await page.goto(PROPERTY_URL, { waitUntil: 'domcontentloaded' });
  const cards = page.locator(PROPERTY_CARD), password = page.locator('input[type=password]');
  for (let i = 0; i < 60 && !await count(cards) && !await count(password); i++) await page.waitForTimeout(500); // cards or a login form, whichever comes first
  if (await autoLogin(page)) await page.goto(PROPERTY_URL, { waitUntil: 'domcontentloaded' });
  else if (await count(password)) await checkSession(page); // still on the login form: report it now instead of after 30 s
  try { await cards.first().waitFor({ state: 'visible', timeout: 30000 }); }
  catch { await checkSession(page); throw new CodedError('SELECTOR_CHANGED', 'Không thấy danh sách cơ sở Traveloka.'); }
}
const propertyCards = (page) => page.$$eval(PROPERTY_CARD, (cards) => cards.map((c) => {
  const address = c.querySelector('[data-testid="property-address"]');
  const names = address ? [...address.parentElement.children].filter((e) => e.tagName === 'SPAN') : [];
  return { id: c.getAttribute('data-testid').replace('property-card-', ''), name: names[0]?.innerText.trim() || '', address: address?.innerText.trim() || '', active: /Hoạt động/.test(c.innerText) };
}));
async function nextProperties(page) {
  const next = page.getByRole('button', { name: 'Next', exact: true });
  if (!await next.count() || await next.isDisabled()) return false;
  const before = await page.locator(PROPERTY_CARD).first().getAttribute('data-testid');
  await next.click();
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    if (await page.locator(PROPERTY_CARD).first().getAttribute('data-testid') !== before) return true;
  }
  throw new CodedError('SELECTOR_CHANGED', 'Danh sách cơ sở Traveloka không chuyển trang.');
}
exports.listBusinesses = async (page) => {
  await openProperties(page);
  const found = new Map();
  for (let n = 0; n < 30; n++) {
    for (const c of await propertyCards(page)) if (c.active && /^\d+$/.test(c.id) && c.name) found.set(c.id, { business_identifier: c.id, business_name: c.name, address: c.address, business_profile_url: PROPERTY_URL, status: 'active', collected_at: new Date().toISOString() });
    if (!await nextProperties(page)) {
      if (!found.size) throw new CodedError('BUSINESS_NOT_FOUND', 'Không có cơ sở Traveloka hoạt động.');
      return [...found.values()];
    }
  }
  throw new CodedError('SELECTOR_CHANGED', 'Quá 30 trang cơ sở Traveloka, dừng để tránh lấy thiếu.');
};
exports.verifyProperty = async (page, id) => {
  if ((await page.getByTestId('active-property-id').innerText()).trim() !== String(id)) throw new CodedError('REPLY_MISMATCH', 'Traveloka đang hiển thị cơ sở khác. Dừng để tránh đọc hoặc đăng nhầm.');
};
async function waitReviews(page) {
  for (let i = 0; i < 60; i++) {
    if (await page.locator('.reviewContent').count()) return true;
    if (/Chưa có đánh giá để hiển thị/.test(await page.locator('body').innerText())) return false;
    await page.waitForTimeout(500);
  }
  await checkSession(page);
  throw new CodedError('SELECTOR_CHANGED', 'Không thấy thẻ đánh giá Traveloka.');
}
async function expandReviews(page) {
  for (const card of await page.locator('.reviewContent__customer').all()) {
    const more = card.getByText('Xem thêm', { exact: true });
    if (await more.count() === 1 && await more.isVisible()) await more.click();
  }
}
exports.openReviews = async (page, id) => {
  await openProperties(page);
  let found = false;
  for (let n = 0; n < 30; n++) {
    const card = page.getByTestId(`property-card-${id}`);
    if (await card.count()) { await card.click(); found = true; break; }
    if (!await nextProperties(page)) break;
  }
  if (!found) throw new CodedError('BUSINESS_NOT_FOUND', 'Không tìm thấy cơ sở Traveloka.');
  await page.waitForURL((url) => url.pathname === '/vi-vn/');
  await page.getByTestId('active-property-id').waitFor({ state: 'visible' });
  await exports.verifyProperty(page, id);
  await page.goto(REVIEWS_URL, { waitUntil: 'domcontentloaded' });
  const filter = page.locator('input[name="filter,type"]').locator('..');
  try { await filter.locator('.select-placeholder').waitFor({ state: 'visible' }); }
  catch { await checkSession(page); throw new CodedError('SELECTOR_CHANGED', 'Không thấy bộ lọc Traveloka.'); }
  if ((await filter.locator('.select-placeholder').innerText()).trim() !== 'Tất cả đánh giá') {
    await filter.locator('.select-control').click();
    await page.getByText('Tất cả đánh giá', { exact: true }).click();
  }
  if ((await filter.locator('.select-placeholder').innerText()).trim() !== 'Tất cả đánh giá') throw new CodedError('SELECTOR_CHANGED', 'Không đặt được bộ lọc tất cả đánh giá.');
  const sort = page.locator('input[name="filter,sort"]').locator('..');
  if ((await sort.locator('.select-placeholder').innerText()).trim() !== 'Mới nhất') {
    await sort.locator('.select-control').click();
    await page.getByText('Mới nhất', { exact: true }).click();
  }
  if ((await sort.locator('.select-placeholder').innerText()).trim() !== 'Mới nhất') throw new CodedError('SELECTOR_CHANGED', 'Không đặt được thứ tự mới nhất.');
  // Filtering replaces the default unanswered feed asynchronously.
  await page.waitForTimeout(2000);
  await exports.verifyProperty(page, id);
  const hasReviews = await waitReviews(page);
  if (hasReviews) await expandReviews(page);
  return hasReviews;
};
exports.readCards = (page) => page.$$eval('.reviewContent', (contents) => contents.map((c, index) => {
  c.setAttribute('data-tvl-card', String(index));
  const info = c.parentElement.querySelector('.reviewInfo'), customer = c.querySelector('.reviewContent__customer');
  const buttons = [...c.querySelectorAll('button')];
  return {
    index, name: info?.querySelector('p')?.innerText.trim() || '', stay: info?.querySelectorAll('p')[1]?.innerText.trim() || '',
    score: Number(info?.querySelector('.ratingBadge span:last-child')?.innerText.trim()),
    date: [...(customer?.querySelectorAll(':scope > p') || [])].find((p) => /Đã gửi đánh giá vào/.test(p.innerText))?.innerText.trim() || '',
    text: customer?.firstElementChild?.tagName === 'DIV' ? [...customer.firstElementChild.querySelectorAll('p')].map((p) => p.innerText).join('\n').trim() : '', reply: c.querySelector('.reviewContent__partner__content')?.innerText.trim() || '',
    replied: buttons.some((b) => /^(Đã gửi|Xem câu trả lời|Đóng câu trả lời)$/.test(b.innerText.trim())) || Boolean(c.querySelector('.reviewContent__partner')),
    allowed: buttons.some((b) => b.innerText.trim() === 'Trả lời' && !b.disabled),
  };
}));
exports.nextPage = async (page) => {
  const next = page.getByRole('link', { name: 'Next', exact: true });
  if (!await next.count()) return false;
  const disabled = await next.evaluate((e) => e.getAttribute('aria-disabled') === 'true' || /disabled/.test(e.className + ' ' + e.parentElement.className));
  if (disabled) return false;
  const before = JSON.stringify((await exports.readCards(page)).map((r) => [r.name, r.date, r.text]));
  await next.click();
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    if (JSON.stringify((await exports.readCards(page)).map((r) => [r.name, r.date, r.text])) !== before && await page.locator('.reviewContent').count()) { await expandReviews(page); return true; }
  }
  throw new CodedError('SELECTOR_CHANGED', 'Trang đánh giá Traveloka không chuyển sau khi bấm Next.');
};
exports.read = async (page, { limit, stopAfterKnown = 10, known, businesses: supplied }) => {
  const businesses = supplied || await Directory.get('traveloka', () => exports.listBusinesses(page)), knownSet = new Set(known), reviews = [], errors = [];
  for (const biz of businesses) {
    try {
      if (!await exports.openReviews(page, biz.business_identifier)) continue;
      let count = 0, knownRun = 0;
      property: for (let p = 0; p < 30; p++) {
        for (const row of await exports.readCards(page)) {
          if (!row.name || !parseDate(row.date) || !(row.score > 0 && row.score <= 10)) throw new CodedError('SELECTOR_CHANGED', 'Thẻ Traveloka thiếu tên, ngày hoặc điểm.');
          const review_id = identity(biz.business_identifier, row), key = { platform: 'traveloka', business_identifier: biz.business_identifier, review_id };
          const review_hash = hashReview(key);
          if (knownSet.has(review_hash)) { if (++knownRun >= stopAfterKnown) break property; continue; }
          knownRun = 0;
          let nativeReviewId = null;
          if (row.allowed && !row.replied) {
            const card = page.locator(`[data-tvl-card="${row.index}"]`);
            await card.getByRole('button', { name: 'Trả lời', exact: true }).click();
            const name = await card.locator('textarea[name^="reply,"]').getAttribute('name');
            nativeReviewId = (name.match(/^reply,(\d+)$/) || [])[1] || null;
            await card.getByRole('button', { name: 'Huỷ', exact: true }).click();
            if (!nativeReviewId) throw new CodedError('SELECTOR_CHANGED', 'Không đọc được ID review gốc của Traveloka.');
          }
          if (row.replied) {
            const card = page.locator(`[data-tvl-card="${row.index}"]`), show = card.getByRole('button', { name: 'Xem câu trả lời', exact: true });
            if (await show.count()) { await show.click(); row.reply = await card.locator('.reviewContent__partner__content').innerText(); }
          }
          await exports.verifyProperty(page, biz.business_identifier);
          reviews.push({ ...key, review_hash, source_locator: { property_id: biz.business_identifier, review_id, native_review_id: nativeReviewId, page: p, kind: nativeReviewId ? 'native' : 'content' }, reviewer_name: row.name, rating: stars(row.score), raw_score: row.score, review_text: row.text, review_date: parseDate(row.date), review_date_text: row.date, owner_reply: row.reply, has_owner_reply: row.replied, reply_allowed: row.allowed || row.replied, review_url: REVIEWS_URL });
          knownSet.add(review_hash);
          if (++count >= limit) break property;
        }
        if (!await exports.nextPage(page)) break;
        if (p === 29) throw new CodedError('SELECTOR_CHANGED', 'Đã đạt giới hạn 30 trang Traveloka.');
      }
    } catch (e) {
      if (e.code === 'AUTH_REQUIRED') throw e;
      errors.push({ business: biz.business_identifier, error_code: e.code || 'UNKNOWN_ERROR', error_message: clean(e.message) });
    }
  }
  reviews.sort((a,b) => Directory.compareIds(a.business_identifier,b.business_identifier) || Directory.compareIds(a.review_id || a.review_hash,b.review_id || b.review_hash));
  return { scanned: reviews.length, reviews, errors };
};
