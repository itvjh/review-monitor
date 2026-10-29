// Shared access to the Tripadvisor owner's Management Center review list ("Đánh giá > Tất cả đánh giá"):
// newest first, every language, 30 rows per page, exact reply state. Used to read new reviews and to post replies.
const { CodedError } = require('./errors');

const MC_URL = (locationId) => `https://www.tripadvisor.com.vn/reviews?locationId=${locationId}&screen=allreviews`;
const BUBBLES = 'svg[data-automation="bubbleRatingImage"]';
const BLOCKED = /Access is temporarily restricted|Quyền truy cập .{0,30}bị hạn chế/i;
const EMPTY = /0 trong số 0 đánh giá|Chưa có đánh giá|chưa có đánh giá/;

async function checkSession(page) {
  const body = await page.locator('body').innerText().catch(() => '');
  if (BLOCKED.test(body)) throw new CodedError('AUTH_REQUIRED', 'Tripadvisor đang chặn truy cập tạm thời. Dừng lại, thử lại sau vài giờ.');
  if ((await page.locator('input[type=password]').count()) || /login|registration/i.test(page.url())) throw new CodedError('AUTH_REQUIRED', 'Chưa đăng nhập Tripadvisor: chạy npm run login -- tripadvisor');
}

// Opens a property's list. -> false when the property has no reviews at all.
async function openList(page, locationId) {
  await page.goto(MC_URL(locationId), { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector(BUBBLES, { timeout: 25000 }); } catch (e) {
    await checkSession(page);
    if (EMPTY.test((await page.locator('body').innerText()).normalize('NFC'))) return false;
    throw new CodedError('SELECTOR_CHANGED', 'không thấy danh sách đánh giá trong Tripadvisor Management Center');
  }
  await page.waitForTimeout(1500);
  return true;
}

// The rows on screen, each tagged data-mc-row=<index> so callers can click them. Row text lines:
// [reviewer, date, (property name: attractions only), title, excerpt (cut with an ellipsis), "Đã đăng phản hồi" / "Phản hồi đang chờ xử lý" when answered],
// so the title and the excerpt are the last two lines once the "answered" marker is dropped.
const readRows = (page) => page.evaluate((bubbles) => {
  const squash = (s) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
  return [...document.querySelectorAll('button')].filter((b) => b.querySelector(bubbles)).map((b, i) => {
    b.setAttribute('data-mc-row', String(i));
    const lines = b.innerText.split('\n').map(squash).filter(Boolean);
    const t = b.querySelector(bubbles + ' title');
    const m = squash((t && t.textContent) || '').match(/(\d)/);
    const isStatus = (l) => /^(đã đăng phản hồi|phản hồi đang chờ xử lý)$/i.test(l); // answered, or our reply waits for Tripadvisor's moderation
    const replied = lines.some(isStatus);
    const pending = lines.some((l) => /^phản hồi đang chờ xử lý$/i.test(l));
    const content = lines.slice(2).filter((l) => !isStatus(l));
    const two = content.length >= 2;
    return { index: i, name: lines[0] || '', date_text: lines[1] || '', title: (two ? content[content.length - 2] : content[0]) || '', excerpt: two ? content[content.length - 1] : '', rating: m ? Number(m[1]) : 0, replied, pending };
  });
}, BUBBLES);

// Clicks "next page" and waits for the list to change. False on the last page.
async function nextPage(page) {
  const first = () => page.locator(`button:has(${BUBBLES})`).first().innerText().catch(() => '');
  const before = await first();
  const clicked = await page.evaluate(() => {
    const e = [...document.querySelectorAll('a, button')].find((x) => (x.getAttribute('aria-label') || x.innerText || '').normalize('NFC').trim() === 'Trang tiếp theo');
    if (!e || e.getAttribute('aria-disabled') === 'true' || e.disabled) return false;
    e.click();
    return true;
  });
  if (!clicked) return false;
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(500); if ((await first()) !== before) return true; }
  return false;
}

module.exports = { MC_URL, BUBBLES, checkSession, openList, readRows, nextPage };
