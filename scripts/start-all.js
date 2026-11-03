// One command to bring everything up after the PC was off:  npm start
//   collector  :3010  reads/posts on Google (needs the saved Google login)
//   dashboard  :3020  the web pages + the posting queue worker
//   n8n        :5678  the daily 09:00 schedule
// A service that is already running is left alone. A service that crashes is restarted after 5 seconds. Ctrl+C stops what this script started.
const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');

const root = path.join(__dirname, '..');
const cfg = require('../collector/config');
const SERVICES = [
  { name: 'collector', cmd: 'node', args: ['server.js'], cwd: path.join(root, 'collector'), health: 'http://127.0.0.1:3010/health', open: 'http://127.0.0.1:3010' },
  { name: 'dashboard', cmd: 'node', args: ['dashboard/server.js'], cwd: root, health: 'http://127.0.0.1:3020/api/me', open: 'http://127.0.0.1:3020' },
  { name: 'n8n', cmd: 'n8n', args: ['start'], cwd: root, shell: true, health: 'http://127.0.0.1:5678/healthz', open: 'http://localhost:5678' },
];

const isUp = (url) => new Promise((ok) => {
  const r = http.get(url, { timeout: 2000 }, (res) => { res.resume(); ok(res.statusCode < 500); });
  r.on('error', () => ok(false));
  r.on('timeout', () => { r.destroy(); ok(false); });
});
const log = (name, text) => String(text).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`[${name}] ${l}`));
const kill = (child) => { try { execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' }); } catch (e) { /* already gone */ } };

const children = new Map();
let stopping = false;

// The tool's own Chrome: BROWSER_MODE=personal with CHROME_USER_DATA_DIR set means a separate Chrome instance and profile with remote debugging on,
// so the collector never opens tabs in the user's own Chrome profiles. Started detached and left running when this script stops: it holds the site logins.
async function ensureBotChrome() {
  if (cfg.BROWSER_MODE !== 'personal' || !process.env.CHROME_USER_DATA_DIR) return;
  const health = `http://127.0.0.1:${cfg.CHROME_DEBUG_PORT}/json/version`;
  if (await isUp(health)) return console.log('[chrome] Chrome riêng của tool đã chạy sẵn, bỏ qua.');
  console.log('[chrome] đang mở Chrome riêng của tool...');
  spawn(cfg.CHROME_PATH, [`--user-data-dir=${cfg.CHROME_USER_DATA_DIR}`, `--remote-debugging-port=${cfg.CHROME_DEBUG_PORT}`, '--no-first-run', '--no-default-browser-check'], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 20 && !(await isUp(health)); i++) await new Promise((r) => setTimeout(r, 1000));
  console.log((await isUp(health)) ? '[chrome] sẵn sàng. Đăng nhập các nền tảng trong cửa sổ Chrome này (một lần).' : '[chrome] CHƯA phản hồi. Kiểm tra CHROME_PATH trong .env.');
}

function launch(svc) {
  const child = spawn(svc.cmd, svc.args, { cwd: svc.cwd, shell: Boolean(svc.shell), stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  children.set(svc.name, child);
  child.stdout.on('data', (d) => log(svc.name, d));
  child.stderr.on('data', (d) => log(svc.name, d));
  child.on('exit', (code) => {
    children.delete(svc.name);
    if (stopping) return;
    console.log(`[${svc.name}] dừng bất ngờ (mã ${code}), khởi động lại sau 5 giây...`);
    setTimeout(() => { if (!stopping) launch(svc); }, 5000);
  });
}

async function waitUp(svc, seconds) {
  for (let i = 0; i < seconds; i++) { if (await isUp(svc.health)) return true; await new Promise((r) => setTimeout(r, 1000)); }
  return false;
}

(async () => {
  await ensureBotChrome();
  const started = [];
  for (const svc of SERVICES) {
    if (await isUp(svc.health)) { console.log(`[${svc.name}] đã chạy sẵn, bỏ qua.`); continue; }
    console.log(`[${svc.name}] đang khởi động...`);
    launch(svc);
    started.push(svc);
  }
  if (!started.length) { console.log('Mọi dịch vụ đã chạy sẵn. Không có gì để làm.'); return; }

  for (const svc of started) {
    const up = await waitUp(svc, svc.name === 'n8n' ? 120 : 30);
    console.log(up ? `[${svc.name}] sẵn sàng: ${svc.open}` : `[${svc.name}] CHƯA phản hồi sau khi chờ. Xem log phía trên.`);
  }
  console.log('\nHệ thống đang chạy. Giữ cửa sổ này mở; nhấn Ctrl+C để dừng các dịch vụ do lệnh này bật.');

  const stop = () => { stopping = true; for (const c of children.values()) kill(c); setTimeout(() => process.exit(0), 500); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})();
