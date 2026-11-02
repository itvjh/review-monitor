const Reply = require('../models/reply');
const rules = require('../models/replyRules');
const gemini = require('../models/gemini');
const publish = require('../models/publish');
const queue = require('../models/queue');
const queueRules = require('../models/queueRules');
const { split } = require('../models/reviewText');
const { HttpError } = require('../models/httpError');
const view = require('../views/render');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/; // ids go into a query string: accept nothing else
const MIGRATION_HINT = 'Chưa áp dụng migration mới nhất trên Supabase (sql/migrations/0002 và 0003: dán từng file vào SQL Editor).';
const MAX_BULK = 100;

const parse = (body) => { try { return JSON.parse(body || '{}'); } catch (e) { throw new HttpError(400, 'JSON không hợp lệ.'); } };
const idOf = (input) => { if (!input || !UUID.test(String(input.id))) throw new HttpError(400, 'id không hợp lệ.'); return input.id; };
const bizName = (r) => (r.businesses && r.businesses.business_name) || '';
const shape = (r) => ({ ...r, text_parts: split(r.review_text), warnings: r.reply_draft ? rules.lint(r.reply_final || r.reply_draft, bizName(r)) : [] });

// The reply columns exist only after migrations 0002/0003: turn the raw database error into an instruction.
const guarded = (fn) => async (...args) => {
  try { return await fn(...args); } catch (e) {
    if (!(e instanceof HttpError) && /reply_[a-z_]+|42703|PGRST204/.test(e.message)) throw new HttpError(503, MIGRATION_HINT);
    throw e;
  }
};

// Queue position and expected posting time for the approved tab (live mode only: dry-run and off never post by themselves).
const withQueueInfo = async (items, offset = 0) => {
  if (publish.mode() !== 'live') return items.map(shape);
  const [last, postedToday] = await Promise.all([Reply.lastAttemptAt(), Reply.postedSince(publish.startOfToday())]);
  const left = Math.max(0, publish.DAILY_LIMIT - postedToday);
  let position = offset; // the queue order continues across pages
  return items.map((r) => {
    if (!publish.AUTO_PLATFORMS.includes(r.platform)) return { ...shape(r), manual: true }; // not auto-posted: the moderator pastes it on the platform
    if (r.reply_attempts >= queue.MAX_ATTEMPTS) return { ...shape(r), stalled: true };
    const eta = new Date(queueRules.etaCapped(position, last, queue.GAP_MS, postedToday, publish.DAILY_LIMIT)).toISOString();
    return { ...shape(r), queue_position: ++position, eta, capped: position > left, daily_limit: publish.DAILY_LIMIT }; // capped: today's quota is used up
  });
};

// GET /api/replies?status=pending[&platform=google|tripadvisor][&page=2] (one page of 20) -> { items, counts (for that platform), platforms (counts per platform) }
exports.index = guarded(async (req, res, url) => {
  const status = url.searchParams.get('status') || 'pending';
  if (!Reply.STATUSES.includes(status)) throw new HttpError(400, 'status không hợp lệ.');
  const platform = url.searchParams.get('platform') || '';
  if (platform && !Reply.PLATFORMS.includes(platform)) throw new HttpError(400, 'platform không hợp lệ.');
  const page = Math.min(Math.max(parseInt(url.searchParams.get('page'), 10) || 1, 1), 1000);
  const [items, platforms] = await Promise.all([Reply.list(status, platform, page), Reply.counts()]);
  const counts = platforms[platform || 'all'];
  view.json(res, 200, { items: status === 'approved' ? await withQueueInfo(items, (page - 1) * Reply.PAGE_SIZE) : items.map(shape), counts, platforms, page, pageSize: Reply.PAGE_SIZE, pages: Math.max(1, Math.ceil(counts[status] / Reply.PAGE_SIZE)) });
});

// POST /api/replies/lint {text} -> warnings (stateless, used while the moderator edits)
exports.lint = async (req, res, url, body) => {
  const { text } = parse(body);
  view.json(res, 200, { warnings: rules.lint(typeof text === 'string' ? text : '') });
};

// POST /api/replies/action {id, action: approve|reject|reopen|posted|retry, text?}
// Approving only moves the reply into the posting queue; the queue worker (models/queue.js) posts it later.
exports.act = guarded(async (req, res, url, body) => {
  const input = parse(body);
  const row = await Reply.act(idOf(input), input.action, typeof input.text === 'string' ? input.text : '');
  if (input.action === 'approve' || input.action === 'retry') queue.kick();
  view.json(res, 200, { item: shape(row), queued: input.action === 'approve' && publish.mode() === 'live' });
});

// POST /api/replies/bulk {action: 'approve', items: [{id, text}]}
// Approves every clean reply in one go; replies with lint warnings or errors are skipped and reported back.
exports.bulk = guarded(async (req, res, url, body) => {
  const input = parse(body);
  if (input.action !== 'approve') throw new HttpError(400, 'Chỉ hỗ trợ duyệt hàng loạt (approve).');
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > MAX_BULK) throw new HttpError(400, `Cần từ 1 đến ${MAX_BULK} mục.`);
  const items = input.items.map((i) => ({ id: idOf(i), text: typeof i.text === 'string' ? i.text : '' }));
  const { ok, skipped } = rules.classifyBulk(items);
  const approved = [];
  const todo = [...ok];
  const worker = async () => { // 4 writes at a time: each one is a pair of 200-300 ms round trips, 100 in a row would take a minute
    for (let i = todo.shift(); i; i = todo.shift()) {
      try { await Reply.act(i.id, 'approve', i.text, { strict: true }); approved.push(i.id); } catch (e) { skipped.push({ id: i.id, reason: e.message }); }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (approved.length) queue.kick();
  view.json(res, 200, { approved, skipped, queued: publish.mode() === 'live' });
});

// POST /api/replies/post {id} -> dry run of one approved reply (dry-run mode only).
// In live mode the queue is the only way out, so posts stay spaced apart.
exports.post = guarded(async (req, res, url, body) => {
  const id = idOf(parse(body));
  if (publish.mode() === 'live') throw new HttpError(409, `Ở chế độ đăng thật, bài được đăng tự động theo hàng đợi (mỗi bài cách nhau ${queue.GAP_MS % 60000 ? queue.GAP_MS / 1000 + ' giây' : queue.GAP_MS / 60000 + ' phút'}).`);
  view.json(res, 200, await publish.publish(id));
});

// POST /api/replies/generate {id} -> AI draft for a review that has none yet (or "regenerate" before approval)
exports.generate = guarded(async (req, res, url, body) => {
  const row = await Reply.find(idOf(parse(body)));
  if (row.has_owner_reply) throw new HttpError(409, 'Đánh giá này đã có phản hồi của chủ sở hữu.');
  if (row.raw_data?.reply_allowed === false) throw new HttpError(409, 'Nền tảng không cho trả lời đánh giá này.');
  if (!rules.canDraft(row.reply_status)) throw new HttpError(409, 'Bản trả lời này đã được duyệt, không thể tạo lại.');
  const saved = await Reply.saveDraft(row, await gemini.draftReply(row));
  view.json(res, 200, { item: shape(saved) });
});
