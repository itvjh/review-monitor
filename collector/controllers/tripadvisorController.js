const { serial, run } = require('../models/browser');
const Tripadvisor = require('../models/tripadvisorModel');
const TripadvisorReply = require('../models/tripadvisorReplyModel');
const { replyEndpoint } = require('./replySupport');
const view = require('../views/json');

const int = (v, def, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : def);

// GET /tripadvisor/businesses
exports.businesses = async (req, res) => {
  view.ok(res, { businesses: await serial(() => run(Tripadvisor.listBusinesses)) });
};

// POST /tripadvisor/reviews  { limit (new reviews per property), stopAfterKnown, known: [review_hash] }  (trust boundary: validate before use)
exports.reviews = async (req, res, body) => {
  let input;
  try { input = JSON.parse(body || '{}'); } catch (e) { return view.badRequest(res, 'invalid JSON body'); }
  if (input.known !== undefined && !(Array.isArray(input.known) && input.known.every((h) => typeof h === 'string'))) return view.badRequest(res, 'known must be an array of strings');
  const opts = { limit: int(input.limit, 5, 1, 500), stopAfterKnown: int(input.stopAfterKnown, 10, 1, 100), known: (input.known || []).slice(0, 5000) };
  view.ok(res, await serial(() => run((page) => Tripadvisor.read(page, opts))));
};

// POST /tripadvisor/reply {business_identifier, reviewer_name, title, body?, rating, text, retry?, dry_run?, deadline?}
exports.reply = replyEndpoint({
  validate: (i) => (typeof i.title === 'string' && i.title.trim() && (i.body === undefined || typeof i.body === 'string') && Number.isInteger(i.rating) && i.rating >= 1 && i.rating <= 5
    ? null : 'title, rating (1-5) and optional body are required'),
  post: (page, i, dryRun) => TripadvisorReply.post(page, {
    businessIdentifier: String(i.business_identifier), reviewerName: i.reviewer_name, title: i.title, body: i.body || '', rating: i.rating, text: i.text, retry: i.retry === true, dryRun,
  }),
});
