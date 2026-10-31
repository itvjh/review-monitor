// n8n Code node "Flatten Reviews" (run once for all items). Globals: $, $input, $json.
// Joins the collector response with the Supabase business ids and emits one item per review.
const first = $input.first().json;
const batches = first.business ? $input.all().map(i => i.json) : null;
const biz = batches ? batches.map(b => b.business) : $('Split Businesses').all().map((i) => i.json);
const ups = batches ? batches.map(b => b.upsert) : $('Upsert Business').all().map((i) => i.json);
const r = batches ? { status: 'OK', scanned: batches.reduce((n,b) => n + (b.response.scanned || 0), 0), reviews: batches.flatMap(b => b.response.reviews || []), errors: batches.flatMap(b => b.response.status !== 'OK' ? [{business:b.business.business_identifier,error_code:b.response.error_code || 'UNKNOWN_ERROR',error_message:b.response.error_message || b.response.status}] : b.response.errors || []) } : first;
const msg = (e) => String((e && e.message) || e || '');
const idMap = {};
const errors = [];
for (const u of ups) {
  if (u.id) idMap[u.external_business_id] = u.id;
  else errors.push({ business: null, error_code: 'DATABASE_ERROR', error_message: msg(u.error), screenshot: null });
}
const nameOf = Object.fromEntries(biz.map((b) => [b.business_identifier, b.business_name]));
let fatal = false;
let reviews = [];
if (r.error) { fatal = true; errors.push({ business: null, error_code: 'NETWORK_ERROR', error_message: msg(r.error), screenshot: null }); }
else if (r.status !== 'OK') { fatal = true; errors.push({ business: null, error_code: r.error_code || 'UNKNOWN_ERROR', error_message: r.error_message || r.status, screenshot: r.screenshot || null }); }
else { reviews = r.reviews || []; for (const e of r.errors || []) errors.push({ business: e.business, error_code: e.error_code, error_message: e.error_message, screenshot: null }); } // per-property failures
reviews.sort((a,b) => String(a.business_identifier).localeCompare(String(b.business_identifier), 'en', {numeric:true}) || String(a.review_id || a.review_hash).localeCompare(String(b.review_id || b.review_hash), 'en', {numeric:true}));
const out = [];
const t0 = Date.now();
for (const x of reviews) {
  if (!idMap[x.business_identifier]) {
    errors.push({ business: x.business_identifier, error_code: 'BUSINESS_NOT_FOUND', error_message: 'review for a business missing from the locations list', screenshot: null });
    continue;
  }
  // Feed is newest first; 1 ms steps keep that order in collected_at, the dashboard's tie-break inside one day.
  out.push({ json: { ...x, platform: x.platform || 'google', business_id: idMap[x.business_identifier], business_name: nameOf[x.business_identifier], collected_at: new Date(t0 - out.length).toISOString() } });
}
// Sentinel keeps the review loop (and the final summary) running when nothing was scraped.
if (!out.length) out.push({ json: { _sentinel: true, review_hash: 'none' } });
out[0].json._stats = { businesses: biz.length, scanned: r.scanned || 0, errors, fatal };
return out;
