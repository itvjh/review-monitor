const crypto = require('crypto');
const squash = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
function parseDate(text) {
  const m = squash(text).toLowerCase().match(/(\d{1,2})\s+(?:thg\s+(\d{1,2})|([a-z]{3}))\s+(\d{4})/);
  if (!m) return null;
  const month = m[2] ? Number(m[2]) : MONTHS[m[3]], day = Number(m[1]), year = Number(m[4]);
  if (!month || month > 12 || day < 1 || new Date(Date.UTC(year, month, 0)).getUTCDate() < day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
// TERA exposes native IDs only in reply forms; immutable visible fields identify all cards, including answered ones.
function identity(property, row) {
  return crypto.createHash('sha256').update(JSON.stringify([String(property), squash(row.name), parseDate(row.date), squash(row.stay), Number(row.score), squash(row.text)])).digest('hex');
}
const stars = (score) => Math.max(1, Math.min(5, Math.round(Number(score) / 2)));
module.exports = { parseDate, identity, stars };
