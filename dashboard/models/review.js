const db = require('./supabase');
const cache = require('./cache');
const { HttpError } = require('./httpError');

const COLUMNS = 'id,platform,rating,reviewer_name,review_text,review_date,review_date_raw,has_owner_reply,sentiment,sentiment_score,category,priority,requires_attention,summary,suggested_action,collected_at,handled_at:raw_data->>handled_at,businesses(business_name)'; // handled_at: set when a person marks an alert as dealt with

// Newest first; reviews without a parsed date are kept so nothing is silently hidden.
exports.recent = (days) => cache.memo('reviews:' + days, 15000, () => {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  return db.get(`reviews?select=${COLUMNS}&or=(review_date.gte.${since},review_date.is.null)&order=review_date.desc.nullslast,collected_at.desc&limit=300`);
});

// "Đã xử lý": a person dealt with this review (or wants it off the alerts list). Kept in raw_data so no migration is needed.
exports.setHandled = async (id, handled) => {
  const [row] = await db.get(`reviews?select=raw_data&id=eq.${id}`);
  if (!row) throw new HttpError(404, 'Không tìm thấy đánh giá.');
  const raw = { ...(row.raw_data || {}) };
  if (handled) raw.handled_at = new Date().toISOString(); else delete raw.handled_at;
  await db.patch(`reviews?id=eq.${id}`, { raw_data: raw });
  cache.clear();
};
