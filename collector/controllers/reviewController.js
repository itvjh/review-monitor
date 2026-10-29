const { serial, run } = require('../models/browser');
const Review = require('../models/reviewModel');
const view = require('../views/json');

const int = (v, def, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : def);

// POST /reviews  { limit, stopAfterKnown, known: [review_hash] }  (trust boundary: validate before use)
exports.index = async (req, res, body) => {
  let input;
  try { input = JSON.parse(body || '{}'); } catch (e) { return view.badRequest(res, 'invalid JSON body'); }
  if (input.known !== undefined && !(Array.isArray(input.known) && input.known.every((h) => typeof h === 'string'))) {
    return view.badRequest(res, 'known must be an array of strings');
  }
  const opts = {
    limit: int(input.limit, 200, 1, 5000),
    stopAfterKnown: int(input.stopAfterKnown, 10, 1, 100),
    known: (input.known || []).slice(0, 5000),
  };
  const out = await serial(() => run((page) => Review.read(page, opts)));
  view.ok(res, out);
};
