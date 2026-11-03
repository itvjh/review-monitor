// Pure helpers for Expedia Partner Central (no browser): one review card's text -> a record.
const { starsFromScore } = require('./agodaParse');

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const NOISE = /^(Dịch|Hiển thị thêm|Hiển thị ít hơn|Phản hồi|Chỉnh sửa|Ảnh thu nhỏ của hình .+)$/; // buttons and image captions inside a card
// Expedia moderates owner replies: a block like this stands in for the reply until it is approved (or after it was refused).
const MODERATION = /^(Phản hồi đang chờ duyệt|Đã từ chối phản hồi)$/;
const REPLY_HEAD = /^(.+) vào ([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/; // "Sontra Sea Hotel vào Oct 29, 2026"

// "Oct 28, 2026" -> "2026-10-28"
exports.parseDate = (text) => {
  const m = String(text || '').match(/([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})/);
  return m && MONTHS[m[1].toLowerCase()] ? `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
};

exports.starsFromScore = starsFromScore;

// The property id of a "ManageProperty" row link: ".../supply/home?htid=76784107" -> "76784107".
exports.propertyIdOf = (href) => (String(href || '').match(/[?&]htid=(\d+)/) || [])[1] || '';

// `lines` = the card's visible text, one entry per line:
//   (initial) / (initial.) / guest name / "Mã đặt phòng N" / stay dates / source / "10/10" / "Gửi vào Oct 28, 2026" / review text...
//   then, when answered: (initial) / (initial.) / "<Property> vào Oct 29, 2026" / reply text...
// A reply waiting for approval, or one that was refused, shows a status block instead of the reply ("Phản hồi đang chờ duyệt" / "Đã từ chối phản hồi"):
// that block is not review text, and `moderation` says which one it was ('pending' | 'rejected' | '').
// -> { name, bookingId, source, score, dateText, text, reply, moderation } or null when it is not a review card.
exports.parseCard = (lines) => {
  const L = lines.map((l) => String(l).normalize('NFC').replace(/\s+/g, ' ').trim()).filter((l) => l && !NOISE.test(l));
  const booking = L.findIndex((l) => /^Mã đặt phòng \d+$/.test(l));
  const score = L.findIndex((l) => /^\d+(?:[.,]\d+)?\/10$/.test(l));
  const sent = L.findIndex((l) => /^Gửi vào /.test(l));
  if (booking < 1 || score < booking || sent < score) return null;
  let head = L.findIndex((l, i) => i > sent && REPLY_HEAD.test(l) && L[i - 1] && /^.\.$/.test(L[i - 1]));
  if (head < 0) head = L.length;
  const initials = head < L.length ? 2 : 0; // the avatar letters just before the reply header belong to the reply, not the review
  const mark = L.findIndex((l, i) => i > sent && MODERATION.test(l));
  const textEnd = mark >= 0 && mark < head - initials ? mark : head - initials;
  return {
    name: L[booking - 1],
    bookingId: L[booking].replace(/\D/g, ''),
    source: L[score - 1] || '',
    score: Number(L[score].split('/')[0].replace(',', '.')),
    dateText: L[sent].replace(/^Gửi vào /, ''),
    text: L.slice(sent + 1, textEnd).join('\n'),
    reply: head < L.length ? L.slice(head + 1).join('\n') : '',
    moderation: mark < 0 ? '' : L[mark].startsWith('Phản hồi đang') ? 'pending' : 'rejected',
  };
};

const fold = (x) => String(x || '').normalize('NFC').toLowerCase(); // accents kept: "Thanh" (a name) is not "thành" (a common word)
const WORD_EDGE = '(^|[^\\p{L}\\p{N}])';
const escapeRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Does `text` use any word (3+ letters) of the guest's name? Expedia forbids names in replies, and the sheet makes the sender declare there are none.
exports.mentionsName = (text, name) => {
  const t = fold(text);
  return fold(name).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3)
    .some((w) => new RegExp(`${WORD_EDGE}${escapeRe(w)}${WORD_EDGE.replace('(^|', '($|')}`, 'u').test(t));
};

