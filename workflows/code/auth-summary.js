// n8n Code node "Auth Summary" (run once for all items). Globals: $, $json.
// The collector could not list businesses (login needed, selector change, collector down): record a FAILED run.
const code = $json.status === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : $json.status === 'OK' ? 'BUSINESS_NOT_FOUND' : ($json.error_code || 'NETWORK_ERROR');
const message = String($json.error_message || ($json.error && $json.error.message) || (code === 'BUSINESS_NOT_FOUND' ? 'no managed businesses found' : code));
const now = new Date().toISOString();
const summary = { businesses_checked: 0, reviews_scanned: 0, new_reviews: 0, positive_reviews: 0, neutral_reviews: 0, negative_reviews: 0, urgent_reviews: 0, errors: 1, started_at: $('Config').first().json.startedAt, completed_at: now };
return [{ json: { status: 'FAILED', error_code: code, message, summary, errors: [{ business: null, error_code: code, error_message: message, screenshot: $json.screenshot || null, timestamp: now }] } }];
