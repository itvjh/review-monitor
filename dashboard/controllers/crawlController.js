const Crawl = require('../models/crawl');
const { HttpError } = require('../models/httpError');
const view = require('../views/render');

exports.index = (req, res) => view.json(res, 200, Crawl.snapshot());
const parse = (body) => { try { return JSON.parse(body); } catch { throw new HttpError(400, 'JSON không hợp lệ.'); } };
exports.start = (req, res, url, body) => view.json(res, 202, Crawl.enqueue(parse(body)?.platforms));
exports.stop = (req, res, url, body) => view.json(res, 200, Crawl.stop(parse(body)?.id));
