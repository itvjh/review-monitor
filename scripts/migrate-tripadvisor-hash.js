// One-time data migration: Tripadvisor reviews used to be identified by the id in their public-page link; they are now read from the
// Management Center, which has no ids, so identity is content (collector/models/tripadvisorParse.contentHash).
// This rewrites review_hash of every stored Tripadvisor review to the content hash (old value kept in raw_data.old_hash).
//   node scripts/migrate-tripadvisor-hash.js            dry run: only reports
//   node scripts/migrate-tripadvisor-hash.js --apply    writes
// Safe to run twice. Run it BEFORE the next Tripadvisor crawl, or every review would look new.
const env = require('../config/env');
const { contentHash, splitText } = require('../collector/models/tripadvisorParse');

const apply = process.argv.includes('--apply');
const headers = { apikey: env.SUPABASE_KEY, 'content-type': 'application/json', Prefer: 'return=minimal' };

(async () => {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/reviews?select=id,rating,review_text,review_hash,raw_data,businesses(external_business_id)&platform=eq.tripadvisor&limit=5000`, { headers });
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('cannot read reviews: ' + JSON.stringify(rows).slice(0, 200));
  const plan = new Map(); // new hash -> row
  const clashes = [];
  let same = 0;
  for (const r of rows) {
    const { title, body } = splitText(r.review_text);
    const hash = contentHash({ business: r.businesses.external_business_id, title, rating: r.rating, body });
    if (hash === r.review_hash) { same++; continue; }
    if (plan.has(hash)) clashes.push([r.id, plan.get(hash).id]); else plan.set(hash, r);
  }
  console.log(`${rows.length} Tripadvisor reviews: ${same} already migrated, ${plan.size} to rewrite, ${clashes.length} would clash`);
  if (clashes.length) { console.log('clashing ids (two reviews with the same title, stars and text start), not touched:', JSON.stringify(clashes)); }
  if (!apply) return console.log('dry run: nothing written. Add --apply to write.');

  let done = 0;
  for (const [hash, r] of plan) {
    const raw = { ...(r.raw_data || {}), old_hash: (r.raw_data && r.raw_data.old_hash) || r.review_hash };
    const out = await fetch(`${env.SUPABASE_URL}/rest/v1/reviews?id=eq.${r.id}`, { method: 'PATCH', headers, body: JSON.stringify({ review_hash: hash, raw_data: raw }) });
    if (!out.ok) throw new Error(`update failed for ${r.id}: ${out.status} ${(await out.text()).slice(0, 200)}`);
    done++;
  }
  console.log(`rewrote ${done} review_hash values`);
})().catch((e) => { console.error(e.message); process.exit(1); });
