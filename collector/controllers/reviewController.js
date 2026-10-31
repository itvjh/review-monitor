const { serial, run } = require('../models/browser');
const Review = require('../models/reviewModel');
const view = require('../views/json');

const int = (v, def, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : def);

// POST /reviews  { limit, stopAfterKnown, known: [review_hash] }  (trust boundary: validate before use)
exports.index = async (req, res, body) => {
  let opts;
  try { opts = require('./readOptions').parse(body, 200, 5000); } catch (e) { return view.badRequest(res, e.message); }
  const out = await serial(() => (opts.businesses && Review.hasFeed() ? Review.read(null, opts) : run((page) => Review.read(page, opts)))); // a feed already read this crawl needs no browser tab
  view.ok(res, out);
};
