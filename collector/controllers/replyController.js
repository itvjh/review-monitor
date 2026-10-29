const cfg = require('../config');
const { serial, run } = require('../models/browser');
const Reply = require('../models/replyModel');
const { policy, MIN_LEN, MAX_LEN } = require('../models/replyPolicy');
const { CodedError } = require('../models/errors');
const view = require('../views/json');

// POST /reply {review_id, business_identifier, reviewer_name, text, dry_run?}
// Validation first (400), then the posting gate, then one non-retried browser run.
exports.post = async (req, res, body) => {
  let i;
  try { i = JSON.parse(body || '{}'); } catch (e) { return view.badRequest(res, 'invalid JSON body'); }
  const ok = typeof i.review_id === 'string' && i.review_id.length > 0 && i.review_id.length <= 300
    && /^\d{6,}$/.test(String(i.business_identifier))
    && typeof i.reviewer_name === 'string' && i.reviewer_name.trim()
    && typeof i.text === 'string' && i.text.trim().length >= MIN_LEN && i.text.length <= MAX_LEN;
  if (!ok) return view.badRequest(res, `review_id, business_identifier, reviewer_name and text (${MIN_LEN}-${MAX_LEN} chars) are required`);

  const gate = policy(cfg.REPLY_MODE, i.dry_run);
  if (!gate.allowed) throw new CodedError('POSTING_DISABLED', 'Đăng tự động đang tắt (REPLY_POSTING=off trong .env).');

  const out = await serial(() => {
    // a request that waited in the queue past its deadline was already reported as failed to the user: never post it late
    if (Number(i.deadline) && Date.now() > Number(i.deadline)) throw new CodedError('BROWSER_TIMEOUT', 'Yêu cầu đã hết hạn trong hàng đợi nên không đăng.');
    return run((page) => Reply.post(page, {
    reviewId: i.review_id, businessIdentifier: String(i.business_identifier), reviewerName: i.reviewer_name, text: i.text, dryRun: gate.dryRun,
  }), { retry: false, timeoutMs: 150000 });
  });
  view.ok(res, out);
};
