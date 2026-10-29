// Read-only Google Business Profile collector. n8n calls it over HTTP on 127.0.0.1. Bootstrap + route table only.
const http = require('http');
const cfg = require('./config');
const { classify } = require('./models/errors');
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

http.createServer(async (req, res) => {
  const body = await new Promise((r) => { let s = ''; req.on('data', (d) => (s += d)); req.on('end', () => r(s)); });
  const controller = routes[`${req.method} ${req.url}`];
  if (!controller) return view.notFound(res);
  try { await controller(req, res, body); } catch (e) { view.fail(res, classify(e)); }
}).listen(cfg.PORT, '127.0.0.1', () => console.log(`collector on http://127.0.0.1:${cfg.PORT} (headless=${cfg.HEADLESS})`));
