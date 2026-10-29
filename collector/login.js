// One-time manual login. Opens real Chrome with the persistent profile; sign in yourself, then close the window.
//   npm run login                 Google Business Profile
//   npm run login -- tripadvisor  Tripadvisor Management Center
//   npm run login -- agoda        Agoda Partner Portal
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { PROFILE } = require('./config');

const SITES = {
  google: ['https://business.google.com/locations', 'Sign in to Google in the opened window, wait for your locations list, then close the window.'],
  tripadvisor: ['https://www.tripadvisor.com.vn/Owners', 'Sign in to Tripadvisor in the opened window, wait for your properties list, then close ALL Chrome windows.'],
  agoda: ['https://portal.agoda.com/', 'Sign in to Agoda in the opened window (including its verification code), wait for your properties, then close ALL Chrome windows.'],
};
const PLAIN = new Set(['tripadvisor', 'agoda']); // sites that reject a Playwright-launched Chrome at sign-in: use a plain Chrome on the same profile
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'; //'C:\Program Files\Google\Chrome\Application\chrome.exe';

(async () => {
  const site = process.argv[2] || 'google';
  const [url, hint] = SITES[site] || SITES.google;
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
