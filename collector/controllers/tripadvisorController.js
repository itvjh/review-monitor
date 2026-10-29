const { serial, run } = require('../models/browser');
const Tripadvisor = require('../models/tripadvisorModel');
const TripadvisorReply = require('../models/tripadvisorReplyModel');
const cfg = require('../config');
const { policy, MIN_LEN, MAX_LEN } = require('../models/replyPolicy');
const { CodedError } = require('../models/errors');
const view = require('../views/json');

// GET /tripadvisor/businesses
exports.businesses = async (req, res) => {
  view.ok(res, { businesses: await serial(() => run(Tripadvisor.listBusinesses)) });
};

// POST /tripadvisor/reviews  { limit (per property), known: [review_hash] }  (trust boundary: validate before use)
exports.reviews = async (req, res, body) => {
  let input;
  try { input = JSON.parse(body || '{}'); } catch (e) { return view.badRequest(res, 'invalid JSON body'); }
  if (input.known !== undefined && !(Array.isArray(input.known) && input.known.every((h) => typeof h === 'string'))) return view.badRequest(res, 'known must be an array of strings');
  const limit = Number.isInteger(input.limit) && input.limit >= 1 && input.limit <= 5000 ? input.limit : 300;
  const known = (input.known || []).slice(0, 5000);
  view.ok(res, await serial(() => run((page) => Tripadvisor.read(page, { limit, known }))));
};

// POST /tripadvisor/reply {business_identifier, reviewer_name, title, rating, text, dry_run?, deadline?}
// Validation first (400), then the posting gate (REPLY_POSTING), then one non-retried browser run.
exports.reply = async (req, res, body) => {
  let i;
  try { i = JSON.parse(body || '{}'); } catch (e) { return view.badRequest(res, 'invalid JSON body'); }
  const ok = /^\d{6,}$/.test(String(i.business_identifier))
    && typeof i.reviewer_name === 'string' && i.reviewer_name.trim()
    && typeof i.title === 'string' && i.title.trim()
    && (i.body === undefined || typeof i.body === 'string')
    && Number.isInteger(i.rating) && i.rating >= 1 && i.rating <= 5
    && typeof i.text === 'string' && i.text.trim().length >= MIN_LEN && i.text.length <= MAX_LEN;
  if (!ok) return view.badRequest(res, `business_identifier, reviewer_name, title, rating and text (${MIN_LEN}-${MAX_LEN} chars) are required`);

  const gate = policy(cfg.REPLY_MODE, i.dry_run);
  if (!gate.allowed) throw new CodedError('POSTING_DISABLED', 'Đăng tự động đang tắt (REPLY_POSTING=off trong .env).');

  const out = await serial(() => {
    // a request that waited in the queue past its deadline was already reported as failed: never post it late
    if (Number(i.deadline) && Date.now() > Number(i.deadline)) throw new CodedError('BROWSER_TIMEOUT', 'Yêu cầu đã hết hạn trong hàng đợi nên không đăng.');
    return run((page) => TripadvisorReply.post(page, {
      businessIdentifier: String(i.business_identifier), reviewerName: i.reviewer_name, title: i.title, body: i.body || '', rating: i.rating, text: i.text, dryRun: gate.dryRun,
    }), { retry: false, timeoutMs: 150000 });
  });
  view.ok(res, out);
};
