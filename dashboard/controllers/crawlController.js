const Crawl = require('../models/crawl');
const { HttpError } = require('../models/httpError');
const view = require('../views/render');

exports.index = (req, res) => view.json(res, 200, Crawl.snapshot());
exports.start = (req, res, url, body) => {
  let input;
  try { input = JSON.parse(body); } catch { throw new HttpError(400, 'JSON không hợp lệ.'); }
  view.json(res, 202, Crawl.enqueue(input?.platforms));
};
