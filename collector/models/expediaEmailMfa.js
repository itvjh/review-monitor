const env = require('../../config/env');
const Mail = require('./expediaOtpMail');
const { CodedError } = require('./errors');

function isMfaPage(value) {
  const u = new URL(value);
  return u.protocol === 'https:' && ['www.expediapartnercentral.com', 'apps.expediapartnercentral.com'].includes(u.hostname) && /^\/account\/mfa\/initiate\/?$/i.test(u.pathname);
}
async function complete(page, email, readCode = Mail.readCode, enabled = env.EXPEDIA_EMAIL_OTP === '1') {
  if (!enabled || !isMfaPage(page.url())) return false;
  let code, stage = 'WAIT_FORM';
  const count = loc => loc.count().catch(() => 0);
  try {
    const input = page.locator('input[name="passcode-input"]:visible');
    const emailChoice = page.getByRole('button', { name: /^(Tiếp tục bằng email|Continue with email)$/i });
    for (let i = 0; await count(input) !== 1 && await count(emailChoice) !== 1; i++) {
      if (i === 39 || !isMfaPage(page.url())) throw new Error();
      await page.waitForTimeout(500);
    }
    stage = 'PREPARE_MAIL';
    code = await readCode(page, email, async () => {
      stage = 'REQUEST_CODE';
      if (!isMfaPage(page.url())) throw new Error();
      if (await input.count() === 1) {
        const text = await page.locator('body').innerText();
        if (!text.toLowerCase().includes(email.toLowerCase())) throw new Error();
        // A resumed challenge needs a fresh code; never use one sent before this run.
        const resend = page.getByText(/^(Gửi lại mã|Resend code)$/i);
        if (await resend.count() !== 1) throw new Error();
        await resend.click({ timeout: 8000 });
      } else await emailChoice.click({ timeout: 8000 });
      stage = 'WAIT_CODE_INPUT';
      await input.waitFor({ state: 'visible', timeout: 20000 });
    });
    stage = 'CHECK_CODE_RECIPIENT';
    if (!isMfaPage(page.url()) || !/^\d{6}$/.test(code) || !(await page.locator('body').innerText()).toLowerCase().includes(email.toLowerCase())) throw new Error();
    await input.fill('');
    stage = 'TYPE_CODE';
    await input.pressSequentially(code, { delay: 100, timeout: 10000 });
    if (!isMfaPage(page.url())) throw new Error();
    const verify = page.getByRole('button', { name: /^(Xác thực thiết bị|Verify device)$/i });
    stage = 'VERIFY_DEVICE';
    if (await verify.count() !== 1) throw new Error();
    await verify.click({ timeout: 10000 }); // one verification attempt; no resend/retry loop
    stage = 'WAIT_PORTAL';
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(500);
      const u = new URL(page.url());
      if (u.origin === 'https://apps.expediapartnercentral.com' && /^\/(manageproperty|supply)\//i.test(u.pathname)) return true;
    }
    // Expedia can verify the cookie without leaving the MFA screen. Check the protected portal once,
    // rather than sending the code again or falsely reporting that verification failed.
    await page.goto('https://apps.expediapartnercentral.com/manageproperty/ManageProperty', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('li a.landing-page').first().waitFor({ state: 'visible', timeout: 30000 });
    if (new URL(page.url()).origin === 'https://apps.expediapartnercentral.com') return true;
    throw new Error();
  } catch (err) {
    if (err instanceof CodedError) throw err;
    throw new CodedError('AUTH_REQUIRED', `Chưa hoàn tất xác minh email Expedia (bước ${stage}). Kiểm tra phiên Gmail và trang Expedia trong Chrome riêng.`);
  } finally { code = null; }
}
module.exports = { isMfaPage, complete };
