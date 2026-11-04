const { CodedError } = require('./errors');
const env = require('../../config/env');

const loginPage = (value) => {
  const u = new URL(value);
  return u.origin === 'https://portal.agoda.com' && /^\/mldc\/[^/]+\/public\/login\/?$/i.test(u.pathname);
};
const authenticated = (value) => {
  const u = new URL(value);
  return u.origin === 'https://portal.agoda.com' && /^\/mldc\/[^/]+\/app\//i.test(u.pathname);
};
function createLogin(account = env.AGODA_GOOGLE_ACCOUNT || '', now = Date.now) {
  let retryAt = 0;
  return async (page) => {
    if (!loginPage(page.url())) return false;
    if (now() < retryAt) throw new CodedError('AUTH_REQUIRED', 'Agoda cần đăng nhập Google trong Chrome riêng; tự động thử lại sau 10 phút.');
    retryAt = now() + 10 * 60000;
    let popup;
    try {
      const form = page.frameLocator('iframe[title="Universal login"]');
      const google = form.getByText('Sign in with Google', { exact: true });
      await google.waitFor({ state: 'visible', timeout: 15000 });
      const remember = form.getByRole('checkbox', { name: 'keep me sign in box', exact: true });
      if (await remember.count() === 1) await remember.check({ timeout: 8000 });
      const opening = page.waitForEvent('popup', { timeout: 10000 }).catch(() => null);
      await google.click({ timeout: 8000 });
      popup = await opening;
      const target = popup || page;
      let selected = false, continued = false;
      for (let i = 0; i < 90; i++) {
        if (authenticated(page.url())) { retryAt = 0; return true; }
        if (target.isClosed()) { await page.waitForTimeout(500); continue; }
        const u = new URL(target.url());
        if (u.origin === 'https://accounts.google.com') {
          const body = await target.locator('body').innerText().catch(() => '');
          if (/captcha|verify you are human|2.step verification|xác minh 2 bước|verification code|mã xác minh/i.test(body)) break;
          if (!selected) {
            const choice = account ? target.getByRole('link').filter({ hasText: account }) : target.locator('[data-identifier]');
            if (await choice.count() === 1) {
              if (account && !(await choice.innerText()).toLowerCase().split(/\s+/).includes(account.toLowerCase())) break;
              await choice.click({ timeout: 8000 });
              selected = true;
            }
          }
          // Only renew an existing Agoda login. New consent/access requests are left for the operator.
          const renewing = target.getByRole('heading', { name: /^(Bạn đang đăng nhập lại vào Agoda|You[’']re signing back in to Agoda)$/i });
          if (!continued && await renewing.count() === 1) {
            const next = target.getByRole('button', { name: /^(Tiếp tục|Continue)$/ });
            if (await next.count() === 1) { await next.click({ timeout: 8000 }); continued = true; }
          }
        }
        await page.waitForTimeout(500);
      }
      throw new Error();
    } catch {
      throw new CodedError('AUTH_REQUIRED', 'Agoda chưa hoàn tất đăng nhập Google. Chọn đúng tài khoản hoặc xác minh trong Chrome riêng; tự động thử lại sau 10 phút.');
    } finally {
      if (popup && !popup.isClosed()) await popup.close().catch(() => {});
    }
  };
}
module.exports = { loginPage, authenticated, createLogin, autoLogin: createLogin() };
