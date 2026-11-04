// Pure checks for Gmail's visible Expedia access-code rows. Never persist/print a code.
const SENDER = 'admin@expediapartnercentral.com';
const SUBJECT = /^(?:Mã truy cập Partner Central của quý vị|Your access code for Partner Central):\s*(\d{6})\s*\((?:KHÔNG CHIA SẺ|DO NOT SHARE)\)\s*$/i;

function mailTime(text, offsetMinutes) {
  let year, month, day, hour, minute;
  const vi = String(text).match(/(\d{1,2}):(\d{2}).*?(\d{1,2})\s+thg\s+(\d{1,2}),?\s+(\d{4})/i);
  if (vi) [, hour, minute, day, month, year] = vi.map((v, i) => i ? Number(v) : v);
  else {
    const en = String(text).match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4}).*?(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!en) return NaN;
    month = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ').indexOf(en[1].toLowerCase()) + 1;
    day = Number(en[2]); year = Number(en[3]); hour = Number(en[4]) % 12 + (/pm/i.test(en[6]) ? 12 : 0); minute = Number(en[5]);
  }
  if (!Number.isFinite(offsetMinutes) || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return NaN;
  return Date.UTC(year, month - 1, day, hour, minute) + offsetMinutes * 60000;
}

function chooseCode(rows, { baseline, requestedAt, now = Date.now(), offsetMinutes }) {
  const found = new Map();
  for (const row of rows) {
    if (!/^[a-f0-9]{10,32}$/i.test(row.id || '') || baseline.has(row.id)) continue;
    if (!row.senders?.length || row.senders.some(s => s.toLowerCase() !== SENDER)) continue;
    const match = String(row.subject).normalize('NFC').trim().match(SUBJECT);
    const receivedAt = mailTime(row.date, offsetMinutes);
    // Gmail renders minutes, not seconds. The pre-request message-ID snapshot excludes earlier messages in the same minute.
    if (!match || !Number.isFinite(receivedAt) || receivedAt < Math.floor(requestedAt / 60000) * 60000 || receivedAt > now + 60000 || now - receivedAt > 5 * 60000) continue;
    found.set(row.id, { id: row.id, code: match[1] });
  }
  if (found.size > 1) throw new Error('Ambiguous Expedia verification emails');
  return found.values().next().value || null;
}
module.exports = { SENDER, SUBJECT, mailTime, chooseCode };
