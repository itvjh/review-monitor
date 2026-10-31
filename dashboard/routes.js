// Route table: "METHOD path" -> controller(req, res, url, body). Add new endpoints here only.
const data = require('./controllers/dataController');
const page = require('./controllers/pageController');
const reply = require('./controllers/replyController');
const crawl = require('./controllers/crawlController');
const view = require('./views/render');
const { HttpError } = require('./models/httpError');
const access = require('./models/access');
const platforms = require('../config/platforms');

const routes = {
  'GET /api/me': data.me,
  'GET /': page.file('index.html'),
  'GET /replies': page.file('replies.html'),
  'GET /crawl': page.file('crawl.html'),
  'GET /crawl.js': page.file('crawl.js'),
  'GET /api/crawl': crawl.index,
  'POST /api/crawl': crawl.start,
  'GET /platforms.js': data.platformsScript,
  'GET /common.js': page.file('common.js'),
  'GET /app.js': page.file('app.js'),
  'GET /replies.js': page.file('replies.js'),
  'GET /style.css': page.file('style.css'),
  'GET /vendor/chart.js': page.vendor('chart.js/dist/chart.umd.js', 'text/javascript; charset=utf-8'),
  ...Object.fromEntries(Object.values(platforms).filter((p) => p.logo).map((p) => [`GET ${p.logo}`, page.file(p.logo.slice(1))])), // /logos/<id>.svg
  'GET /api/data': data.index,
  'GET /api/replies': reply.index,
  'POST /api/replies/lint': reply.lint,
  'POST /api/replies/action': reply.act,
  'POST /api/replies/generate': reply.generate,
  'POST /api/replies/bulk': reply.bulk,
  'POST /api/replies/post': reply.post,
};

const MAX_BODY = 50_000;
const readBody = (req) => new Promise((ok, fail) => {
  let s = '';
  req.on('data', (d) => { s += d; if (s.length > MAX_BODY) { fail(new HttpError(413, 'Body quá lớn.')); req.destroy(); } });
  req.on('end', () => ok(s));
});

// Blocks DNS rebinding (Host), cross-site form posts (Origin / content type) and writes by anyone but the owner's machine.
const guard = (req) => {
  const host = req.headers.host || '';
  if (!access.hostAllowed(host)) throw new HttpError(403, 'Host không hợp lệ.');
  if (req.method === 'POST') {
    if (access.role(req) !== 'moderator') throw new HttpError(403, 'Bạn chỉ có quyền xem.');
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Cần Content-Type: application/json.');
    if (req.headers.origin && req.headers.origin !== `http://${host}`) throw new HttpError(403, 'Origin không hợp lệ.');
  }
};

exports.guard = guard;

exports.handle = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const controller = routes[`${req.method} ${url.pathname}`];
  try {
    guard(req);
    if (!controller) return view.notFound(res);
    await controller(req, res, url, req.method === 'POST' ? await readBody(req) : '');
  } catch (e) { view.error(res, e); }
};
