const db = require('./supabase');
const cache = require('./cache');

const COLUMNS = 'id,platform,rating,reviewer_name,review_text,review_date,review_date_raw,has_owner_reply,sentiment,sentiment_score,category,priority,requires_attention,summary,suggested_action,collected_at,businesses(business_name)';

// Newest first; reviews without a parsed date are kept so nothing is silently hidden.
exports.recent = (days) => cache.memo('reviews:' + days, 15000, () => {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  return db.get(`reviews?select=${COLUMNS}&or=(review_date.gte.${since},review_date.is.null)&order=review_date.desc.nullslast,collected_at.desc&limit=300`);
});
