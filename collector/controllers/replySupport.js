// The part every "post a reply" endpoint shares: parse, validate, pass the posting gate, then ONE browser run that is never retried.
// A platform supplies only what differs: validate(input) -> message or null, post(page, input, dryRun).
const cfg = require('../config');
const { serial, run } = require('../models/browser');
const { policy, MIN_LEN, MAX_LEN } = require('../models/replyPolicy');
const { CodedError } = require('../models/errors');
const view = require('../views/json');

exports.MIN_LEN = MIN_LEN;
exports.MAX_LEN = MAX_LEN;

// Fields every platform needs: the reply text and the business id.
exports.commonProblem = (i) => (/^\d{6,}$/.test(String(i.business_identifier)) && typeof i.text === 'string' && i.text.trim().length >= MIN_LEN && i.text.length <= MAX_LEN
  && typeof i.reviewer_name === 'string' && i.reviewer_name.trim() ? null : `business_identifier, reviewer_name and text (${MIN_LEN}-${MAX_LEN} chars) are required`);

exports.replyEndpoint = ({ validate, post }) => async (req, res, body) => {
  let i;
  try { i = JSON.parse(body || '{}'); } catch (e) { return view.badRequest(res, 'invalid JSON body'); }
  const problem = exports.commonProblem(i) || validate(i);
  if (problem) return view.badRequest(res, problem);

  const gate = policy(cfg.REPLY_MODE, i.dry_run);
  if (!gate.allowed) throw new CodedError('POSTING_DISABLED', 'Đăng tự động đang tắt (REPLY_POSTING=off trong .env).');

  const out = await serial(() => {
    // a request that waited in the queue past its deadline was already reported as failed: never post it late
    if (Number(i.deadline) && Date.now() > Number(i.deadline)) throw new CodedError('BROWSER_TIMEOUT', 'Yêu cầu đã hết hạn trong hàng đợi nên không đăng.');
    return run((page) => post(page, i, gate.dryRun), { retry: false, timeoutMs: 150000 });
  });
  view.ok(res, out);
};
