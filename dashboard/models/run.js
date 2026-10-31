const db = require('./supabase');
const cache = require('./cache');
const PLATFORMS = require('../../config/platforms');

const COLUMNS = 'status,summary,errors,completed_at,created_at';
const newest = async (filter) => (await db.get(`automation_runs?select=${COLUMNS}${filter}&order=created_at.desc&limit=1`))[0] || null;

// Latest run of each platform in the registry. Runs saved before Tripadvisor existed carry no platform and belong to Google.
exports.latestByPlatform = () => cache.memo('runs', 15000, async () => {
  const ids = Object.keys(PLATFORMS);
  const runs = await Promise.all(ids.map((id) => newest(id === 'google' ? '&or=(summary->>platform.eq.google,summary->>platform.is.null)' : `&summary->>platform=eq.${id}`)));
  return Object.fromEntries(ids.map((id, i) => [id, runs[i]]));
});
