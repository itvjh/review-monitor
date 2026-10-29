const { serial, run } = require('../models/browser');
const Business = require('../models/businessModel');
const view = require('../views/json');

// GET /businesses
exports.index = async (req, res) => {
  const businesses = await serial(() => run(Business.list));
  view.ok(res, { businesses });
};
