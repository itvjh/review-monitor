// One-time manual login. Opens real Chrome with the persistent profile; sign in yourself, then close the window.
//   npm run login                 Google Business Profile
//   npm run login -- tripadvisor  Tripadvisor Management Center
//   npm run login -- agoda        Agoda Partner Portal
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { PROFILE, BROWSER_MODE } = require('./config');

const SITES = {
  traveloka: ['https://tera.traveloka.com/vi-vn/user/property/', 'Sign in to Traveloka in Chrome.'],
  google: ['https://business.google.com/locations', 'Sign in to Google in the opened window, wait for your locations list, then close the window.'],
  tripadvisor: ['https://www.tripadvisor.com.vn/Owners', 'Sign in to Tripadvisor in the opened window, wait for your properties list, then close ALL Chrome windows.'],
  agoda: ['https://portal.agoda.com/', 'Sign in to Agoda in the opened window (including its verification code), wait for your properties, then close ALL Chrome windows.'],
};
const PLAIN = new Set(['tripadvisor', 'agoda']); // sites that reject a Playwright-launched Chrome at sign-in: use a plain Chrome on the same profile
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'; //'C:\Program Files\Google\Chrome\Application\chrome.exe';

(async () => {
  const site = process.argv[2] || 'google';
  const [url, hint] = SITES[site] || SITES.google;
  if (BROWSER_MODE === 'personal') {
    console.log('Đăng nhập trong Chrome cá nhân. Giữ Chrome mở khi hệ thống chạy; bật chrome://inspect/#remote-debugging.');
    const child = spawn(CHROME, [url], { detached: true, stdio: 'ignore' });
    child.on('error', (e) => { console.error(e.message); process.exitCode = 1; });
    child.unref();
    return;
  }
  console.log(hint);
  if (PLAIN.has(site)) {
    await new Promise((resolve) => spawn(CHROME, [`--user-data-dir=${PROFILE}`, '--no-first-run', url], { stdio: 'ignore' }).on('exit', resolve));
    return;
  }
  const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: false });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(url);
  await new Promise((resolve) => ctx.on('close', resolve));
})();
