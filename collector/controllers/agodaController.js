const Directory = require('../models/businessDirectory');
const { serial, run } = require('../models/browser');
const Agoda = require('../models/agodaModel');
const AgodaReply = require('../models/agodaReplyModel');
const { replyEndpoint } = require('./replySupport');
const view = require('../views/json');

const int = (v, def, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : def);

// GET /agoda/businesses
exports.businesses = async (req, res) => {
  view.ok(res, { businesses: await Directory.get('agoda', () => serial(() => run(Agoda.listBusinesses))) });
};

// POST /agoda/reviews  { limit (new reviews per property), stopAfterKnown, known: [review_hash] }  (trust boundary: validate before use)
exports.reviews = async (req, res, body) => {
  let opts;
  try { opts = require('./readOptions').parse(body, 5, 500); } catch (e) { return view.badRequest(res, e.message); }
  view.ok(res, await serial(() => run((page) => Agoda.read(page, opts))));
};

// POST /agoda/reply {business_identifier, reviewer_name, bid, language?, text, retry?, dry_run?, deadline?}
exports.reply = replyEndpoint({
  validate: (i) => (/^\d{6,}$/.test(String(i.bid)) && (i.language === undefined || typeof i.language === 'string') ? null : 'bid (the booking id of the review) is required'),
  post: (page, i, dryRun) => AgodaReply.post(page, { propertyId: String(i.business_identifier), bid: String(i.bid), language: i.language || '', text: i.text, retry: i.retry === true, dryRun, sourceLocator: i.source_locator }),
});
