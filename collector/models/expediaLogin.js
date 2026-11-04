const { CodedError } = require('./errors');
const Credential = require('./expediaCredential');
const EmailMfa = require('./expediaEmailMfa');

const PORTAL = 'https://apps.expediapartnercentral.com';
const NEXT = /^(Next|Continue|Tiếp|Tiếp tục|Tiếp theo)$/i;
const STOP = /captcha|verify you are human|unusual (traffic|activity)|access (is )?(temporarily )?(denied|restricted)|verification|verify your identit|one.time (code|password)|mã (xác minh|truy cập)|xác minh danh tính/i;
const portalPage = (url) => { const u = new URL(url); return u.origin === PORTAL && /^\/(manageproperty|supply)\//i.test(u.pathname); };
function loginOrigin(url) {
  const u = new URL(url);
  return u.protocol === 'https:' && (
    u.hostname === 'accounts.expediagroup.com' && u.pathname.startsWith('/partner/') ||
    ['www.expediapartnercentral.com', 'apps.expediapartnercentral.com'].includes(u.hostname) && /^\/Account\/Logon\/?$/i.test(u.pathname));
}
const count = (loc) => loc.count().catch(() => 0);
function createLogin(load = Credential.load, now = Date.now, verifyEmail = EmailMfa.complete) {
  let nextAttempt = 0;
  return async (page) => {
    if (!loginOrigin(page.url()) && !EmailMfa.isMfaPage(page.url())) return false;
    if (now() < nextAttempt) throw new CodedError('AUTH_REQUIRED', 'Expedia đăng nhập chưa thành công; chờ 10 phút hoặc đăng nhập tay trong Chrome riêng.');
    const safe = async () => {
      if (!loginOrigin(page.url()) || STOP.test(await page.locator('body').innerText())) throw new Error();
    };
    let credentials, stage = 'FORM';
    try {
      if (EmailMfa.isMfaPage(page.url())) {
        stage = 'EMAIL_OTP';
        credentials = await load();
        if (!credentials) return false;
        nextAttempt = now() + 10 * 60000;
        if (!await verifyEmail(page, credentials.username)) throw new Error();
        nextAttempt = 0;
        return true;
      }
      await safe();
      stage = 'COOKIE_NOTICE';
      const cookies = page.locator('#onetrust-reject-all-handler:visible');
      if (await count(cookies) === 1) await cookies.click({ timeout: 8000 });
      stage = 'CREDENTIALS';
      credentials = await load();
      if (!credentials) return false;
      // Reserve the attempt before sending anything, including when Chrome closes mid-login.
      nextAttempt = now() + 10 * 60000;
      const password = page.locator('input[type="password"]:visible');
      stage = 'WAIT_FORM';
      if (new URL(page.url()).hostname === 'accounts.expediagroup.com') await password.waitFor({ state: 'visible', timeout: 15000 });
      else await page.getByRole('textbox', { name: 'Email', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
      for (let step = 0; step < 2; step++) {
        await safe();
        if (await count(password)) break;
        const email = page.getByRole('textbox', { name: 'Email', exact: true });
        stage = 'EMAIL';
        if (await count(email) !== 1) throw new Error();
        await email.fill(credentials.username, { timeout: 8000 });
        await safe();
        const next = page.getByRole('button', { name: NEXT });
        if (await count(next) !== 1) throw new Error();
        await next.click({ timeout: 8000 });
        stage = 'WAIT_PASSWORD';
        for (let i = 0; i < 40 && !await count(password); i++) {
          await page.waitForTimeout(500);
          if (portalPage(page.url())) { nextAttempt = 0; return true; }
          if (EmailMfa.isMfaPage(page.url())) {
            stage = 'EMAIL_OTP';
            if (!await verifyEmail(page, credentials.username)) throw new Error();
            nextAttempt = 0; return true;
          }
        }
      }
      await safe();
      stage = 'CHECK_ACCOUNT';
      if (await count(password) !== 1) throw new Error();
      const account = page.getByRole('textbox', { name: 'Email', exact: true });
      if (await count(account) !== 1 || (await account.inputValue({ timeout: 8000 })).trim().toLowerCase() !== credentials.username.trim().toLowerCase()) throw new Error();
      // Keyboard events, never clipboard/paste; Expedia rejects pasted passwords.
      await password.fill('', { timeout: 8000 });
      stage = 'PASSWORD';
      await password.pressSequentially(credentials.password, { delay: 100, timeout: 15000 });
      await safe();
      const remember = page.locator('#remember-me-input');
      if (await count(remember)) await remember.check({ timeout: 8000 });
      const submit = page.getByRole('button', { name: NEXT });
      stage = 'SUBMIT';
      if (await count(submit) !== 1) throw new Error();
      await submit.click({ timeout: 10000 });
      stage = 'WAIT_REDIRECT';
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(500);
        if (portalPage(page.url()) && !await count(password)) { nextAttempt = 0; return true; }
        if (EmailMfa.isMfaPage(page.url())) {
          stage = 'EMAIL_OTP';
          if (!await verifyEmail(page, credentials.username)) throw new Error();
          nextAttempt = 0; return true;
        }
        if (STOP.test(await page.locator('body').innerText().catch(() => ''))) break;
      }
      throw new Error();
    } catch (err) {
      // Playwright errors can include the typed password. Never forward their text or call log.
      nextAttempt = now() + 10 * 60000;
      if (err instanceof CodedError) throw err;
      throw new CodedError('AUTH_REQUIRED', `Expedia chưa đăng nhập được hoặc cần xác minh (bước ${stage}). Đăng nhập trong Chrome riêng; tự động thử lại sau 10 phút.`);
    } finally { credentials = null; }
  };
}

module.exports = { createLogin, autoLogin: createLogin(), loginOrigin };
