// n8n Code node "Run Summary" (run once for all items). Globals: $, $input.
// Fires when the review loop is done; its input is every item that looped back (saved, skipped or failed).
const cfg = $('Config').first().json;
const stats = $('Flatten Reviews').first().json._stats;
const items = $input.all().map((i) => i.json);
const saved = items.filter((r) => r.id && r.sentiment);
const aiFail = items.filter((r) => r.ai_ok === false).length;
const dbFail = items.filter((r) => r.error).length;
const now = new Date().toISOString();
const errors = stats.errors.map((e) => ({ ...e, timestamp: now }));
if (aiFail) errors.push({ business: null, error_code: 'AI_ERROR', error_message: aiFail + ' review(s) not analyzed; retried next run', screenshot: null, timestamp: now });
if (dbFail) errors.push({ business: null, error_code: 'DATABASE_ERROR', error_message: dbFail + ' review(s) failed to save/check', screenshot: null, timestamp: now });
const count = (f) => saved.filter(f).length;
const summary = {
  platform: cfg.platform || 'google',
  businesses_checked: stats.businesses,
  reviews_scanned: stats.scanned,
  new_reviews: saved.length,
  positive_reviews: count((r) => r.sentiment === 'positive'),
  neutral_reviews: count((r) => r.sentiment === 'neutral'),
  negative_reviews: count((r) => r.sentiment === 'negative'),
  urgent_reviews: count((r) => r.priority === 'urgent'),
  errors: errors.length,
  started_at: cfg.startedAt,
  completed_at: now,
};
const status = stats.fatal ? 'FAILED' : errors.length ? 'PARTIAL' : 'SUCCESS';
return [{ json: { status, summary, errors, error_code: errors.length ? errors[0].error_code : null, message: errors.map((e) => e.error_code + ': ' + e.error_message).join('\n') } }];
