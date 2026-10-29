const Review = require('../models/review');
const Run = require('../models/run');
const { split } = require('../models/reviewText');
const view = require('../views/render');
const access = require('../models/access');
const publish = require('../models/publish');
const queue = require('../models/queue');

// GET /api/me -> { role: 'moderator' | 'viewer', posting: 'off' | 'dry-run' | 'live' }
exports.me = (req, res) => view.json(res, 200, { role: access.role(req), posting: publish.mode(), gapMinutes: queue.GAP_MS / 60000 });

// GET /api/data?days=14  -> { reviews, runs: { google, tripadvisor } }
exports.index = async (req, res, url) => {
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 14, 1), 365);
  const [reviews, runs] = await Promise.all([Review.recent(days), Run.latestByPlatform()]);
  view.json(res, 200, { reviews: reviews.map((r) => ({ ...r, text_parts: split(r.review_text) })), runs });
};
