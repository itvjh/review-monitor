const crypto = require('crypto');

const UNIT = {
  second: 's', giây: 's', minute: 'm', phút: 'm', hour: 'h', giờ: 'h',
  day: 'd', ngày: 'd', week: 'w', tuần: 'w', month: 'M', tháng: 'M', year: 'y', năm: 'y',
};

// Relative dates ("2 weeks ago") are approximate by nature; absolute ones are exact.
function normalizeDate(text, now = new Date()) {
  const t = String(text || '').toLowerCase();
  let m = t.match(/(\d+|an?|một)\s+(second|minute|hour|day|week|month|year|giây|phút|giờ|ngày|tuần|tháng|năm)s?\s+(?:ago|trước)/);
  if (!m && /yesterday|hôm qua/.test(t)) m = [null, '1', 'day'];
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
    const d = new Date(now);
    const u = UNIT[m[2]];
    if (u === 's') d.setSeconds(d.getSeconds() - n);
    else if (u === 'm') d.setMinutes(d.getMinutes() - n);
    else if (u === 'h') d.setHours(d.getHours() - n);
    else if (u === 'd') d.setDate(d.getDate() - n);
    else if (u === 'w') d.setDate(d.getDate() - 7 * n);
    else if (u === 'M') d.setMonth(d.getMonth() - n);
    else d.setFullYear(d.getFullYear() - n);
    return d.toISOString().slice(0, 10);
  }
  const iso = t.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const dmy = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return null;
}

// review_date_text is deliberately NOT in the hash: relative dates ("2 days ago") drift every run.
function hashReview({ platform = 'google', business_identifier, review_id, reviewer_name, rating, review_text }) {
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const key = review_id
    ? [platform, business_identifier, 'id', review_id]
    : [platform, business_identifier, norm(reviewer_name), rating, norm(review_text)];
  return crypto.createHash('sha256').update(key.join('|')).digest('hex');
}

module.exports = { normalizeDate, hashReview };
