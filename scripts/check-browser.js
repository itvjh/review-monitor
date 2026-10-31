// A local connection check: no website visits, no cookies exported, no replies sent.
const browser = require('../collector/models/browser');
const cfg = require('../collector/config');
(async () => {
  let health;
  try {
    const response = await fetch(`http://127.0.0.1:${cfg.PORT}/health`, { signal: AbortSignal.timeout(2000) });
    health = await response.json();
  } catch { /* collector offline: run the standalone check below */ }
  if (health) {
    if (health.browser_mode !== cfg.BROWSER_MODE) throw new Error('Khởi động lại collector để nhận cấu hình Chrome mới trước khi kiểm tra.');
    const response = await fetch(`http://127.0.0.1:${cfg.PORT}/browser/check`, { signal: AbortSignal.timeout(80000) });
    const result = await response.json();
    if (result.status !== 'OK') throw new Error(`${result.error_code}: ${result.error_message}`);
    console.log(`Collector kết nối Chrome OK (mode=${result.browser_mode}); giữ kết nối cho các lượt crawl theo lịch.`);
    return;
  }
  await browser.serial(() => browser.run(async (page) => {
    await page.setContent('<title>Collector connection check</title><p>Chrome connection OK</p>');
    if (await page.title() !== 'Collector connection check') throw new Error('Không đọc được tab kiểm tra.');
    console.log(`Kết nối Chrome OK (mode=${cfg.BROWSER_MODE}). Tab kiểm tra sẽ đóng, các tab khác giữ nguyên.`);
  }, { retry: false, timeoutMs: 10000 }));
})().catch((e) => { console.error(`${e.code || 'ERROR'}: ${e.message}`); process.exitCode = 1; })
  .finally(() => browser.disconnect().catch(() => {}));
