const Directory = require('../models/businessDirectory');
const { serial, run } = require('../models/browser');
const Business = require('../models/businessModel');
const view = require('../views/json');

// GET /businesses
exports.index = async (req, res) => {
  const businesses = await Directory.get('google', () => serial(() => run(Business.list)));
  view.ok(res, { businesses });
};
