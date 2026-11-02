const Review = require('../models/review');
const Run = require('../models/run');
const { split } = require('../models/reviewText');
const view = require('../views/render');
const platforms = require('../../config/platforms');
const access = require('../models/access');
const publish = require('../models/publish');
const queue = require('../models/queue');
const { HttpError } = require('../models/httpError');

// GET /api/me -> { role: 'moderator' | 'viewer', posting: 'off' | 'dry-run' | 'live' }
exports.me = (req, res) => view.json(res, 200, { role: access.role(req), posting: publish.mode(), gapSeconds: queue.GAP_MS / 1000 });

// GET /api/data?days=14  -> { reviews, runs: { google, tripadvisor } }
exports.index = async (req, res, url) => {
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 14, 1), 365);
  const [reviews, runs] = await Promise.all([Review.recent(days), Run.latestByPlatform()]);
  view.json(res, 200, { reviews: reviews.map((r) => ({ ...r, text_parts: split(r.review_text) })), runs });
};

// GET /platforms.js -> const PLATFORMS = {id: {name, logo, color, tint, login, ownerUrl, autoReply}}; plus the per-platform colours as CSS.
exports.platformsScript = (req, res) => {
  const pub = Object.fromEntries(Object.entries(platforms).map(([id, p]) => [id, { name: p.name, logo: p.logo, color: p.color, tint: p.tint, login: p.login, ownerUrl: p.ownerUrl, autoReply: p.autoReply }]));
  const css = Object.entries(pub).map(([id, p]) => `.badge.${id}{color:${p.color};background:${p.tint}}.dot.${id}{background:${p.color}}`).join('');
  view.script(res, `const PLATFORMS = ${JSON.stringify(pub)};\n(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.append(s); })();\n`);
};

// POST /api/reviews/handled {id, handled} -> marks an alert as dealt with (or undoes it)
exports.handled = async (req, res, url, body) => {
  let input;
  try { input = JSON.parse(body || '{}'); } catch { throw new HttpError(400, 'JSON không hợp lệ.'); }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(input.id)) || typeof input.handled !== 'boolean') throw new HttpError(400, 'Cần id và handled (true/false).');
  await Review.setHandled(input.id, input.handled);
  view.json(res, 200, { id: input.id, handled: input.handled });
};
