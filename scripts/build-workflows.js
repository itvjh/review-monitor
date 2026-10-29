// Builds every platform's n8n workflow (config/platforms.js) into workflows/<file>.   npm run build:workflow
const { spawnSync } = require('child_process');
const path = require('path');
const platforms = require('../config/platforms');

for (const [id, p] of Object.entries(platforms)) {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'workflows', 'build.js'), path.join('workflows', p.workflow.file), id], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  if (r.status !== 0) process.exit(r.status || 1);
}
