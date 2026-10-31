// Runs the existing n8n CLI workflow. Raw node output may contain credentials: never log or return it.
const { spawn, execFile } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '../..');
const OUTPUT_LIMIT = 32 * 1024 * 1024;

function resultOf(output, code) {
  if (code !== 0 || !/^Execution was successful:\r?$/m.test(output)) {
    throw new Error('n8n không hoàn tất workflow. Kiểm tra trang Executions trong n8n và phiên đăng nhập Chrome.');
  }
  // CLI emits its execution object after this marker; expose only the run summary, never node inputs.
  const marker = output.indexOf('Execution was successful:');
  const start = output.indexOf('{', marker);
  let execution;
  try { execution = JSON.parse(output.slice(start, output.lastIndexOf('}') + 1)); } catch { return {}; }
  const nodes = execution.data?.resultData?.runData || {};
  const summaryNode = ['Run Summary', 'Auth Summary'].flatMap((name) => nodes[name] || []);
  const value = summaryNode.flatMap((run) => run.data?.main?.flat() || []).map((i) => i.json).find((i) => i && i.summary);
  if (!value) return {};
  const summary = {};
  for (const key of ['businesses_checked', 'reviews_scanned', 'new_reviews', 'errors']) {
    if (Number.isFinite(value.summary[key]) && value.summary[key] >= 0) summary[key] = value.summary[key];
  }
  const outcome = ['SUCCESS', 'PARTIAL', 'FAILED', 'AUTH_REQUIRED'].includes(value.status) ? value.status : null;
  const errorCodes = [...new Set((value.errors || []).map((e) => e.error_code).filter((c) => typeof c === 'string' && /^[A-Z_]{1,40}$/.test(c)))];
  return { summary, outcome, errorCodes };
}

function execute(workflowId) {
  // IDs come only from the platform registry; also validate before passing through Windows' command shim.
  if (!/^[a-zA-Z0-9_-]+$/.test(workflowId)) return Promise.reject(new Error('ID workflow không hợp lệ.'));
  return new Promise((resolve, reject) => {
    const child = spawn('n8n', ['execute', '--id=' + workflowId], {
      cwd: root, shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, N8N_RUNNERS_BROKER_PORT: '5690' },
    });
    let output = '', timedOut = false;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (text) => { if (output.length < OUTPUT_LIMIT) output += text.slice(0, OUTPUT_LIMIT - output.length); });
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32' && child.pid) execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
      else child.kill('SIGTERM');
    }, 60 * 60 * 1000);
    child.once('error', () => { clearTimeout(timer); reject(new Error('Không khởi động được n8n. Kiểm tra n8n đã được cài và có trong PATH.')); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error('Workflow vượt quá 60 phút và đã được dừng.'));
      try { resolve(resultOf(output, code)); } catch (e) { reject(e); }
    });
  });
}

module.exports = { execute, resultOf };
