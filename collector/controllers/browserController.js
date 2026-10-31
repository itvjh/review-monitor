const browser = require('../models/browser');
const cfg = require('../config');
const view = require('../views/json');

// Keep the permission-bearing connection in the collector process for subsequent scheduled jobs.
exports.check = async (req, res) => {
  await browser.serial(() => browser.run(async (page) => {
    await page.setContent('<title>Collector connection check</title><p>Chrome connection OK</p>');
    if (await page.title() !== 'Collector connection check') throw new Error('Không đọc được tab kiểm tra.');
  }, { retry: false, timeoutMs: 10000 }));
  view.ok(res, { browser_mode: cfg.BROWSER_MODE });
};
