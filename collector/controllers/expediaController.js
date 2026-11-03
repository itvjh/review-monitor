const Directory = require('../models/businessDirectory');
const { serial, run } = require('../models/browser');
const Expedia = require('../models/expediaModel');
const view = require('../views/json');

// GET /expedia/businesses
exports.businesses = async (req, res) => view.ok(res, { businesses: await Directory.get('expedia', () => serial(() => run(Expedia.listBusinesses))) });

// POST /expedia/reviews {businesses: [one], limit, stopAfterKnown, known}
exports.reviews = async (req, res, body) => {
  let opts;
  try { opts = require('./readOptions').parse(body, 5, 500); } catch (e) { return view.badRequest(res, e.message); }
  view.ok(res, await serial(() => run((page) => Expedia.read(page, opts))));
};
