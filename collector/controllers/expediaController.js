const Directory = require('../models/businessDirectory');
const { serial, run } = require('../models/browser');
const Expedia = require('../models/expediaModel');
const Reply = require('../models/expediaReplyModel');
const { replyEndpoint } = require('./replySupport');
const view = require('../views/json');

// GET /expedia/businesses
exports.businesses = async (req, res) => view.ok(res, { businesses: await Directory.get('expedia', () => serial(() => run(Expedia.listBusinesses))) });

// POST /expedia/reviews {businesses: [one], limit, stopAfterKnown, known}
exports.reviews = async (req, res, body) => {
  let opts;
  try { opts = require('./readOptions').parse(body, 5, 500); } catch (e) { return view.badRequest(res, e.message); }
  view.ok(res, await serial(() => run((page) => Expedia.read(page, opts))));
};

// POST /expedia/reply {business_identifier, review_id (booking id), reviewer_name, text, dry_run?, deadline?}
exports.reply = replyEndpoint({
  validate: (i) => (/^\d{6,}$/.test(String(i.review_id)) ? null : 'review_id must be the Expedia booking id'),
  post: (page, i, dryRun) => Reply.post(page, { property: String(i.business_identifier), reviewId: String(i.review_id), reviewer: i.reviewer_name, text: i.text, dryRun }),
});
