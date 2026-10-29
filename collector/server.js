// Read-only Google Business Profile collector. n8n calls it over HTTP on 127.0.0.1. Bootstrap + route table only.
const http = require('http');
const cfg = require('./config');
const { classify } = require('./models/errors');
const guard = require('./models/requestGuard');
const business = require('./controllers/businessController');
const review = require('./controllers/reviewController');
const reply = require('./controllers/replyController');
const tripadvisor = require('./controllers/tripadvisorController');
const view = require('./views/json');
const browser = require('./models/browser');

// "METHOD path" -> controller(req, res, body)
const routes = {
  'GET /health': (req, res) => view.health(res, browser.pendingJobs()),
  'GET /businesses': business.index,
  'POST /reviews': review.index,
  'POST /reply': reply.post,
  'GET /tripadvisor/businesses': tripadvisor.businesses,
  'POST /tripadvisor/reviews': tripadvisor.reviews,
  'POST /tripadvisor/reply': tripadvisor.reply,
};

// Reads the body with a size and time limit; a client that stalls or floods is dropped.
const readBody = (req) => new Promise((ok, fail) => {
  let s = '';
  const timer = setTimeout(() => { fail(new Error('body timeout')); req.destroy(); }, guard.BODY_MS);
  req.on('data', (d) => { s += d; if (s.length > guard.MAX_BODY) { clearTimeout(timer); fail(new Error('body too large')); req.destroy(); } });
  req.on('end', () => { clearTimeout(timer); ok(s); });
  req.on('error', fail);
});

http.createServer(async (req, res) => {
  const refused = guard.check(req);
  if (refused) return view.refuse(res, refused.code, refused.message);
  const controller = routes[`${req.method} ${req.url}`];
  if (!controller) return view.notFound(res);
  try {
    await controller(req, res, req.method === 'POST' ? await readBody(req) : '');
  } catch (e) { if (!res.headersSent) view.fail(res, classify(e)); }
}).listen(cfg.PORT, '127.0.0.1', () => console.log(`collector on http://127.0.0.1:${cfg.PORT} (headless=${cfg.HEADLESS})`));
