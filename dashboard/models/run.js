const db = require('./supabase');
const cache = require('./cache');

const COLUMNS = 'status,summary,errors,completed_at,created_at';
const newest = async (filter) => (await db.get(`automation_runs?select=${COLUMNS}${filter}&order=created_at.desc&limit=1`))[0] || null;

// Latest run of each platform. Runs saved before Tripadvisor existed carry no platform and belong to Google.
exports.latestByPlatform = () => cache.memo('runs', 15000, async () => {
  const [google, tripadvisor] = await Promise.all([
    newest('&or=(summary->>platform.eq.google,summary->>platform.is.null)'),
    newest('&summary->>platform=eq.tripadvisor'),
  ]);
  return { google, tripadvisor };
});
