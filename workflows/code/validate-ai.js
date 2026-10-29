// n8n Code node "Validate AI" (run once for each item). Globals: $, $json.
// Never trust model output: parse, check enums, clamp numbers, drop unknown categories, enforce the rating->priority floor.
const r = $('Review Loop').item.json;
const CATS = ['ROOM','CLEANLINESS','STAFF','SERVICE','LOCATION','PRICE','BREAKFAST','FOOD','FACILITIES','WIFI','NOISE','CHECKIN','CHECKOUT','BOOKING','PAYMENT','PARKING','SECURITY','AIR_CONDITIONER','BATHROOM','BED','VIEW','POOL','RESTAURANT','OTHER'];
const SENT = ['positive', 'neutral', 'negative'];
const PRI = ['low', 'medium', 'high', 'urgent'];
const fail = (m) => ({ json: { ...r, ai_ok: false, ai_error: m } });
if ($json.error) return fail(String($json.error.message || $json.error));
let a;
try { a = JSON.parse($json.candidates[0].content.parts.map((p) => p.text).join('')); } catch (e) { return fail('invalid JSON from model'); }
if (!SENT.includes(a.sentiment) || !PRI.includes(a.priority)) return fail('schema violation');
const floor = r.rating <= 2 ? 2 : r.rating === 3 ? 1 : 0; // rating sets the minimum priority
const priority = PRI[Math.max(PRI.indexOf(a.priority), floor)];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
return { json: {
  ...r, ai_ok: true,
  sentiment: a.sentiment,
  sentiment_score: Math.round(clamp(a.sentiment_score, -100, 100)),
  category: (Array.isArray(a.category) ? a.category : []).filter((c) => CATS.includes(c)),
  priority,
  requires_attention: Boolean(a.requires_attention) || priority === 'urgent',
  summary: String(a.summary || ''),
  key_points: Array.isArray(a.key_points) ? a.key_points.map(String) : [],
  suggested_action: String(a.suggested_action || ''),
  language: String(a.language || 'unknown'),
  reply_draft: r.has_owner_reply ? '' : String(a.reply_draft || '').trim().slice(0, 3500), // human moderates it later
  ai_confidence: clamp(a.ai_confidence, 0, 1),
  analyzed_at: new Date().toISOString(),
} };
