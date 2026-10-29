// Runs a workflow once right now (same as pressing "Execute workflow"):  npm run crawl [-- <platform>]  (google by default; the list is config/platforms.js)
// Use it when the PC was off at 09:00, or to pick up new reviews without waiting. Works while n8n is running.
const { spawnSync } = require('child_process');
const env = require('../config/env');

const platforms = require('../config/platforms');
const chosen = platforms[process.argv[2] || 'google'];
if (!chosen) { console.error('Nền tảng không có trong config/platforms.js: ' + process.argv[2] + ' (có: ' + Object.keys(platforms).join(', ') + ')'); process.exit(1); }
const ID = chosen.workflow.id;
console.log('Đang chạy workflow một lần (có thể mất vài phút)...');
// a second n8n process needs its own task-broker port while the main one is running
const r = spawnSync('n8n', ['execute', '--id=' + ID], { shell: true, stdio: 'ignore', env: { ...process.env, N8N_RUNNERS_BROKER_PORT: '5690' } });
if (r.status !== 0) { console.error('n8n execute thất bại (mã ' + r.status + ').'); process.exit(1); }

(async () => {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/automation_runs?select=status,summary,errors&order=created_at.desc&limit=1`, { headers: { apikey: env.SUPABASE_KEY } });
  const [run] = await res.json();
  if (!run) return console.log('Xong, nhưng chưa thấy bản ghi lượt chạy.');
  const s = run.summary;
  console.log(`Kết quả: ${run.status} | ${s.businesses_checked} doanh nghiệp, ${s.reviews_scanned} review đã quét, ${s.new_reviews} review mới, ${s.errors} lỗi`);
  for (const e of run.errors || []) console.log(`  - ${e.error_code}: ${e.error_message}`);
})();
