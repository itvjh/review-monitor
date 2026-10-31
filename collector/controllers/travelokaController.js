const Directory = require('../models/businessDirectory');
const { serial, run } = require('../models/browser');
const Traveloka = require('../models/travelokaModel');
const Reply = require('../models/travelokaReplyModel');
const { replyEndpoint } = require('./replySupport');
const view = require('../views/json');
const int = (v, def, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi ? v : def;
exports.businesses = async (req, res) => view.ok(res, { businesses: await Directory.get('traveloka', () => serial(() => run(Traveloka.listBusinesses))) });
exports.reviews = async (req, res, body) => {
  let opts;
  try { opts = require('./readOptions').parse(body, 5, 500); } catch (e) { return view.badRequest(res, e.message); }
  view.ok(res, await serial(() => run((page) => Traveloka.read(page, opts))));
};
exports.reply = replyEndpoint({
  validate: (i) => typeof i.review_id === 'string' && /^[a-f0-9]{64}$/.test(i.review_id) ? null : 'review_id must be the stored Traveloka review identity',
  post: (page, i, dryRun) => Reply.post(page, { property: String(i.business_identifier), reviewId: i.review_id, reviewer: i.reviewer_name, text: i.text, dryRun, sourceLocator: i.source_locator }),
});
