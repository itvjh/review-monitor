const Directory = require('../models/businessDirectory');
const { serial, run } = require('../models/browser');
const Business = require('../models/businessModel');
const Review = require('../models/reviewModel');
const view = require('../views/json');

// GET /businesses
exports.index = async (req, res) => {
  Review.forgetFeed(); // a crawl starts here: its first business reads the Google feed fresh
  const businesses = await Directory.get('google', () => serial(() => run(Business.list)));
  view.ok(res, { businesses });
};
