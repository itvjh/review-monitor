const platforms = require('../config/platforms');
const env = require('../config/env');
const base = env.COLLECTOR_URL || 'http://127.0.0.1:3010';
(async () => {
  for (const platform of Object.keys(platforms)) {
    const r = await fetch(base + '/directory/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ platform }), signal: AbortSignal.timeout(300000) });
    const data = await r.json();
    if (data.status !== 'OK') throw new Error(`${platform}: ${data.error_message || data.status}`);
    console.log(`${platform}: ${data.businesses.length} cơ sở, ID: ${data.businesses.map(b => b.business_identifier).join(', ')}`);
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
