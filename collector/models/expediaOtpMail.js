const { CodedError } = require('./errors');
const { chooseCode } = require('./expediaOtpParse');
const SEARCH_URL = 'https://mail.google.com/mail/u/0/#search/Expedia+Group+Partner+Central';

const accountOf = async (page, email) => {
  if (new URL(page.url()).origin !== 'https://mail.google.com') return false;
  return page.$$eval('[aria-label]', (els, expected) => els.some(e => {
    const label = e.getAttribute('aria-label') || '';
    return /Google Account|Tài khoản Google/i.test(label) && label.replace(/\s+/g, '').toLowerCase().includes(`(${expected.toLowerCase()})`);
  }), email);
};
const rows = (page) => page.$$eval('[role="main"] tr[role="row"]', els => els.filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map(e => ({
  id: e.querySelector('[data-legacy-last-message-id]')?.getAttribute('data-legacy-last-message-id') || '',
  subject: e.querySelector('.bog')?.textContent || '',
  senders: [...e.querySelectorAll('[email]')].map(n => n.getAttribute('email')),
  date: e.querySelector('.xW [title]')?.getAttribute('title') || '',
})));

// Runs within the existing Chrome context. No Gmail password/token is copied or stored.
exports.readCode = async (sourcePage, email, requestCode) => {
  let mail, stage = 'OPEN_MAIL';
  try {
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) throw new Error();
    mail = await sourcePage.context().newPage();
    mail.setDefaultTimeout(10000);
    await mail.bringToFront(); // activate only this tab in the tool's own Chrome so Gmail paints current row times
    // Read only the subject/time rows from the same search used by the operator; never open message bodies.
    await mail.goto(SEARCH_URL, { waitUntil: 'domcontentloaded' });
    stage = 'WAIT_SEARCH_FIELD';
    await mail.locator('input[name="q"]').waitFor({ state: 'visible', timeout: 30000 });
    stage = 'CHECK_MAIL_ACCOUNT';
    for (let i = 0; !await accountOf(mail, email); i++) {
      if (i === 19) throw new Error();
      await mail.waitForTimeout(500);
    }
    stage = 'WAIT_SEARCH_RESULTS';
    for (let i = 0; i < 40; i++) {
      // Direct search links can render the right results while Gmail's input value is blank or has trailing spaces.
      if (await accountOf(mail, email) && await mail.locator('[role="main"]:visible').count()) break;
      if (i === 39) throw new Error();
      await mail.waitForTimeout(500);
    }
    // Finish the initial search before capturing IDs; loading another query can leave hidden inbox rows in the DOM.
    await mail.waitForTimeout(1500);
    const baseline = new Set((await rows(mail)).map(r => r.id));
    const offsetMinutes = await mail.evaluate(() => new Date().getTimezoneOffset());
    const requestedAt = Date.now();
    stage = 'REQUEST_CODE';
    await requestCode(); // exactly one request, after the mailbox is ready
    stage = 'WAIT_NEW_CODE';
    for (let poll = 0; poll < 24; poll++) {
      if (!await accountOf(mail, email)) throw new Error();
      const fresh = chooseCode(await rows(mail), { baseline, requestedAt, offsetMinutes });
      if (fresh) return fresh.code;
      await mail.waitForTimeout(5000);
      const refresh = mail.getByRole('button', { name: /^(Làm mới|Refresh)$/i });
      stage = 'REFRESH_SEARCH';
      if (await refresh.count() !== 1) throw new Error();
      await refresh.click({ timeout: 8000 });
      await mail.bringToFront();
      await mail.waitForTimeout(1000);
      stage = 'WAIT_NEW_CODE';
    }
    throw new Error();
  } catch {
    // Browser call logs may contain the email subject/code. Return a fixed message only.
    throw new CodedError('AUTH_REQUIRED', `Không lấy được mã Expedia mới trong Gmail (bước ${stage}). Đăng nhập đúng hộp thư trong Chrome riêng hoặc xác minh Expedia thủ công.`);
  } finally { if (mail) await mail.close().catch(() => {}); }
};
