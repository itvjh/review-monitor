// Imports and publishes every platform's workflow into n8n (publishing is what arms the schedule).   npm run import:workflow
// n8n only picks the change up after a restart (stop.bat, then start.bat).
const { spawnSync } = require('child_process');
const path = require('path');
const platforms = require('../config/platforms');

for (const p of Object.values(platforms)) {
  const w = p.workflow;
  for (const args of [['import:workflow', '--input=' + path.join('workflows', w.file)], ['publish:workflow', '--id=' + w.id]]) {
    const r = spawnSync('n8n', args, { stdio: 'inherit', shell: true, cwd: path.join(__dirname, '..') });
    if (r.status !== 0) process.exit(r.status || 1);
  }
}
