// Reply drafts, their moderation state and the posting queue (columns on the reviews table, see migrations 0002 and 0003).
const db = require('./supabase');
const cache = require('./cache');
const rules = require('./replyRules');
const { HttpError } = require('./httpError');

const COLUMNS = 'id,platform,rating,reviewer_name,review_text,review_date,review_date_raw,language,has_owner_reply,external_review_id,reply_draft,reply_final,reply_status,reply_reviewed_at,reply_queued_at,reply_attempts,reply_last_attempt_at,reply_error,businesses(business_name,external_business_id)';
const ORDER = 'order=review_date.desc.nullslast,collected_at.desc';
const QUEUE_ORDER = 'order=reply_queued_at.asc.nullsfirst,reply_reviewed_at.asc'; // first approved, first posted
exports.STATUSES = ['pending', 'approved', 'posted', 'rejected', 'none'];

// "none" = a review nobody has replied to and no draft exists yet. "approved" is listed in queue order.
exports.PLATFORMS = ['google', 'tripadvisor'];

exports.list = (status, platform) => cache.memo(`list:${status}:${platform || ''}`, 10000, () => {
  const filter = (status === 'none' ? 'reply_status=is.null&has_owner_reply=eq.false' : `reply_status=eq.${status}`) + (platform ? `&platform=eq.${platform}` : '');
  return db.get(`reviews?select=${COLUMNS}&${filter}&${status === 'approved' ? QUEUE_ORDER : ORDER}&limit=200`);
});

// -> { all, google, tripadvisor }, each { pending, approved, posted, rejected, none }
exports.counts = () => cache.memo('counts', 10000, async () => {
  const rows = await db.get('reviews?select=platform,reply_status,has_owner_reply&or=(reply_status.not.is.null,has_owner_reply.eq.false)&limit=5000');
  const blank = () => ({ pending: 0, approved: 0, posted: 0, rejected: 0, none: 0 });
  const out = { all: blank(), google: blank(), tripadvisor: blank() };
  for (const r of rows) {
    const key = r.reply_status || (!r.has_owner_reply ? 'none' : null);
    if (!key) continue;
    out.all[key]++;
    if (out[r.platform]) out[r.platform][key]++;
  }
  return out;
});

// How many replies were marked posted since `iso` (daily cap for automatic posting).
exports.postedSince = async (iso) => (await db.get(`reviews?select=id&reply_status=eq.posted&reply_reviewed_at=gte.${encodeURIComponent(iso)}&limit=1000`)).length;

// Latest time we touched Google for ANY reply: the spacing between posts is measured from here.
exports.lastAttemptAt = async () => {
  const r = (await db.get('reviews?select=reply_last_attempt_at&reply_last_attempt_at=not.is.null&order=reply_last_attempt_at.desc&limit=1'))[0];
  return r ? r.reply_last_attempt_at : null;
};

// The oldest queued reply that has not used up its attempts. Only platforms in publish.AUTO_PLATFORMS are posted automatically.
exports.nextDue = async (maxAttempts) => (await db.get(`reviews?select=${COLUMNS}&reply_status=eq.approved&platform=in.(google,tripadvisor)&reply_attempts=lt.${maxAttempts}&${QUEUE_ORDER}&limit=1`))[0] || null;

exports.find = async (id) => {
  const row = (await db.get(`reviews?select=${COLUMNS}&id=eq.${id}`))[0];
  if (!row) throw new HttpError(404, 'Không tìm thấy đánh giá.');
  return row;
};

// Compare-and-set on the current status, so two moderators cannot overwrite each other.
const update = async (row, patch) => {
  const guard = row.reply_status ? `reply_status=eq.${row.reply_status}` : 'reply_status=is.null';
  const done = await db.patch(`reviews?id=eq.${row.id}&${guard}`, patch);
  cache.clear();
  if (!done.length) throw new HttpError(409, 'Trạng thái vừa được thay đổi ở nơi khác. Hãy tải lại trang.');
  return done[0];
};

exports.act = async (id, action, text) => {
  const row = await exports.find(id);
  const to = rules.nextStatus(row.reply_status, action);
  const now = new Date().toISOString();
  let patch = { reply_status: to, reply_reviewed_at: now };
  if (action === 'approve') {
    const warnings = rules.lint(text);
    if (rules.hasError(warnings)) throw new HttpError(400, warnings.filter((w) => w.level === 'error').map((w) => w.message).join(' '));
    patch = { ...patch, reply_final: text.trim(), reply_queued_at: now, reply_attempts: 0, reply_error: null }; // approving = joining the end of the posting queue
  } else if (action === 'reopen') {
    patch = { ...patch, reply_queued_at: null, reply_attempts: 0, reply_error: null };
  } else if (action === 'retry') {
    patch = { reply_attempts: 0, reply_error: null }; // keeps its place in the queue
  } else if (action === 'posted') {
    patch = { ...patch, reply_error: null, has_owner_reply: true }; // the owner reply now exists on Google: keep the filter and counters truthful
  }
  return update(row, patch);
};

// Claims a queue item for one posting attempt. Returns null if another process got it first.
exports.markAttempt = async (row) => {
  const done = await db.patch(`reviews?id=eq.${row.id}&reply_status=eq.approved&reply_attempts=eq.${row.reply_attempts}`, {
    reply_attempts: row.reply_attempts + 1,
    reply_last_attempt_at: new Date().toISOString(),
  });
  cache.clear();
  return done[0] || null;
};

exports.setError = async (id, message) => { const out = await db.patch(`reviews?id=eq.${id}`, { reply_error: String(message).slice(0, 500) }); cache.clear(); return out; };

exports.saveDraft = async (row, draft) => {
  if (!rules.canDraft(row.reply_status)) throw new HttpError(409, 'Bản trả lời này đã được duyệt, không thể tạo lại.');
  return update(row, { reply_draft: draft, reply_final: null, reply_status: 'pending', reply_reviewed_at: null });
};
