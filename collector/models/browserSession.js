// Owns the connection, never the user's Chrome. Only pages created here may be closed or routed.
const fs = require('fs');
const path = require('path');
const { CodedError } = require('./errors');

function endpoint(userDataDir, read = fs.readFileSync) {
  let lines;
  try { lines = read(path.join(userDataDir, 'DevToolsActivePort'), 'utf8').trim().split(/\r?\n/); }
  catch { throw new CodedError('AUTH_REQUIRED', 'Mở Chrome cá nhân, vào chrome://inspect/#remote-debugging và bật Remote Debugging.'); }
  const [port, socketPath] = lines;
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535 || !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(socketPath || '')) {
    throw new CodedError('AUTH_REQUIRED', 'DevToolsActivePort không hợp lệ. Tắt rồi bật lại Remote Debugging trong Chrome.');
  }
  return `ws://127.0.0.1:${Number(port)}${socketPath}`;
}

function createSessions(chromium, cfg, resolveEndpoint = endpoint) {
  let connected;
  async function personalBrowser() {
    if (!connected) {
      connected = (async () => {
        const address = cfg.CHROME_DEBUG_URL || resolveEndpoint(cfg.CHROME_USER_DATA_DIR);
        try {
          const browser = await chromium.connectOverCDP(address, { timeout: 60000 });
          browser.on('disconnected', () => { connected = undefined; });
          return browser;
        } catch {
          throw new CodedError('AUTH_REQUIRED', cfg.CHROME_DEBUG_URL ? 'Không kết nối được Chrome riêng của tool. Chạy start.bat để mở lại nó.' : 'Không kết nối được Chrome cá nhân. Giữ Chrome mở, bật chrome://inspect/#remote-debugging và bấm Cho phép khi Chrome hỏi.');
        }
      })();
    }
    const current = connected;
    try { return await current; }
    catch (e) { if (connected === current) connected = undefined; throw e; }
  }
  return {
    async open() {
      if (cfg.BROWSER_MODE === 'personal') {
        const browser = await personalBrowser();
        const ctx = browser.contexts()[0];
        if (!ctx) throw new CodedError('AUTH_REQUIRED', 'Chrome chưa có phiên làm việc. Mở cửa sổ Chrome cá nhân rồi thử lại.');
        const page = await ctx.newPage();
        return { page, close: () => page.close() };
      }
      if (cfg.BROWSER_MODE !== 'persistent') throw new CodedError('UNKNOWN_ERROR', 'BROWSER_MODE phải là personal hoặc persistent.');
      const ctx = await chromium.launchPersistentContext(cfg.PROFILE, { channel: 'chrome', headless: cfg.HEADLESS, viewport: { width: 1400, height: 900 } });
      try {
        const page = ctx.pages()[0] || await ctx.newPage();
        return { page, close: () => ctx.close() };
      } catch (e) { await ctx.close(); throw e; }
    },
    async disconnect() {
      const current = connected;
      connected = undefined;
      if (current) await (await current).close(); // connectOverCDP closes the transport, not Chrome
    },
  };
}

module.exports = { endpoint, createSessions };
