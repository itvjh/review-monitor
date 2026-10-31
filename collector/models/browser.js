// Browser session layer: personal or persistent Chrome, domain allow-list, retries, screenshots, shared page helpers.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const cfg = require('../config');
const SEL = require('./selectors');
const { classify, CodedError } = require('./errors');
const sessions = require('./browserSession').createSessions(chromium, cfg);
exports.disconnect = () => sessions.disconnect();

// Error screenshots show customer names and review text: keep two weeks, then delete.
try { for (const f of fs.readdirSync(cfg.SHOTS)) { const p = path.join(cfg.SHOTS, f); if (Date.now() - fs.statSync(p).mtimeMs > 14 * 864e5) fs.unlinkSync(p); } } catch { /* no screenshots folder yet */ }

let queue = Promise.resolve(); // one browser at a time: the profile dir is locked per instance
let pending = 0; // jobs running or waiting (a crawl, a reply...)
exports.serial = (fn) => {
  pending++;
  const job = () => Promise.resolve().then(fn).finally(() => { pending--; });
  return (queue = queue.then(job, job));
};
exports.pendingJobs = () => pending;

const isAuthPage = async (page) => {
  const u = new URL(page.url());
  if (u.hostname === 'accounts.google.com' || /signin|challenge|recaptcha|servicelogin/i.test(u.pathname + u.search)) return true;
  return (await page.locator('input[type=password]').count()) > 0;
};
exports.isAuthPage = isAuthPage;

async function withPage(fn, timeoutMs) {
  const session = await sessions.open();
  let page;
  try {
    page = session.page;
    await page.route('**/*', (route) => {
      const req = route.request();
      const host = new URL(req.url()).hostname;
      const ok = req.isNavigationRequest() ? cfg.NAV_HOST.test(host) : cfg.RES_HOST.test(host) || req.url().startsWith('data:');
      return ok ? route.continue() : route.abort();
    });
    page.setDefaultTimeout(30000);
    let timer;
    const budget = new Promise((_, reject) => { timer = setTimeout(() => reject(new CodedError('BROWSER_TIMEOUT', `Quá ${Math.round(timeoutMs / 1000)} giây, đã dừng.`)), timeoutMs); });
    try { return await Promise.race([fn(page), budget]); } finally { clearTimeout(timer); }
  } catch (e) {
    const err = classify(e);
    if (page && err.code !== 'AUTH_REQUIRED') {
      fs.mkdirSync(cfg.SHOTS, { recursive: true });
      err.screenshot = path.join(cfg.SHOTS, `${Date.now()}-${err.code}.png`);
      await page.screenshot({ path: err.screenshot, fullPage: true }).catch(() => (err.screenshot = null));
    }
    throw err;
  } finally {
    let timer;
    try { await Promise.race([session.close(), new Promise((ok) => { timer = setTimeout(ok, 15000); })]); }
    finally { clearTimeout(timer); }
  }
}

// Retries only transient failures; AUTH_REQUIRED / SELECTOR_CHANGED etc. are final.
exports.run = async (fn, { retry = true, timeoutMs = 15 * 60 * 1000 } = {}) => {
  let last;
  for (let i = 1; i <= (retry ? cfg.ATTEMPTS : 1); i++) {
    try { return await withPage(fn, timeoutMs); } catch (e) {
      last = e;
      if (e.code !== 'BROWSER_TIMEOUT' && e.code !== 'NETWORK_ERROR') break;
    }
  }
  throw last;
};

const settle = (page) => page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

// Picks the largest rows-per-page option (clicking the current one opens the dropdown).
// The numeric filter keeps us off the group dropdown, whose options are names.
const numOpt = (page, extra = '') => page.locator(`[role=option]${extra}:visible`).filter({ hasText: /^\d{2,3}$/ });

exports.setMaxRows = async (page) => {
  if (!(await page.locator(SEL.rowsBox).count())) return;
  const current = numOpt(page, '[aria-selected=true]').first();
  await current.scrollIntoViewIfNeeded();
  await current.click();
  await numOpt(page).last().click();
  await settle(page);
};

// Clicks "next" if enabled and waits until the list actually changes. Returns false on the last page.
// Polls from node: page.waitForFunction is blocked by this site's CSP.
exports.goNext = async (page, firstKey, keyOf) => {
  const next = page.locator(SEL.next);
  if (!(await next.count()) || (await next.first().isDisabled())) return false;
  await next.first().click();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(500);
    if ((await keyOf()) !== firstKey) break;
  }
  await settle(page);
  return true;
};
