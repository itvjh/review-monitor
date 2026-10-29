// Pure parsing for the Tripadvisor Management Center review list (no browser). Class names are obfuscated, so we read visible text lines.
const crypto = require('crypto');

// Lines that end a review body inside an opened row: sub-ratings, stay info, owner tools, the reply box.
const STOP = /^(Giá trị|Dịch vụ|Đồ ăn|Không khí|Phòng|Địa điểm|Sự sạch sẽ|Giấc ngủ|Vị trí|Đọc thêm|Mẹo của người trong cuộc.*|Ngày lưu trú:|Loại chuyến đi:|Chọn làm mục yêu thích|Báo cáo đánh giá|Cách phản hồi.*|Tên của quý vị.*|Gửi|Your response|Phản hồi từ .*|Đã đăng phản hồi|Phản hồi đang chờ xử lý|Xóa phản hồi)$/;

const iso = (y, mo, d) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// "Hôm qua" / "3 ngày trước" -> that day; "28 thg 10, 2026" -> exact; "13 thg 10" -> this year (last year if that lies in the future);
// "thg 9 2026" -> 1st of the month; "5 tháng 8, 2026" -> exact.
function parseDate(text, now = new Date()) {
  const t = String(text || '');
  const ago = (n) => iso(...(() => { const d = new Date(now); d.setDate(d.getDate() - n); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; })());
  if (/hôm nay|(\d+) (giờ|phút) trước/i.test(t)) return ago(0);
  if (/hôm qua/i.test(t)) return ago(1);
  let r = t.match(/(\d+) ngày trước/);
  if (r) return ago(Number(r[1]));
  r = t.match(/(\d+) tuần trước/);
  if (r) return ago(7 * Number(r[1]));
  let m = t.match(/(\d{1,2}) tháng (\d{1,2}),? (\d{4})/);
  if (m) return iso(m[3], m[2], m[1]);
  m = t.match(/(\d{1,2}) thg (\d{1,2})(?:,? (\d{4}))?/);
  if (m) {
    const y = m[3] ? Number(m[3]) : now.getFullYear();
    const d = iso(y, m[2], m[1]);
    return !m[3] && d > iso(now.getFullYear(), now.getMonth() + 1, now.getDate()) ? iso(y - 1, m[2], m[1]) : d; // today in local time
  }
  m = t.match(/thg (\d{1,2}) (\d{4})/);
  return m ? iso(m[2], m[1], 1) : null;
}

const norm = (s) => String(s || '').normalize('NFC').replace(/[’‘´`]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase(); // one spelling of quotes and apostrophes

// The Management Center rows carry no review id, so identity is content: property + title + stars + the first 60 characters of the text.
// The collapsed row shows only the start of the text (cut with an ellipsis), which is why the key stops at 60 characters:
// the same key comes out of the row, of the opened review and of the full text already stored in the database.
function contentHash({ business, title, rating, body, nth = 1 }) {
  const start = norm(body).replace(/^["'«»]+/, '').replace(/(…|\.{3})$/, '').trim().slice(0, 60); // a leading quote mark is not always shown
  const key = ['tripadvisor', business, 'c', norm(title), rating, start];
  if (nth > 1) key.push(nth); // the 2nd, 3rd... identical review in one list ("Tốt" / "ok", 5 stars) gets its own key; the 1st keeps the plain one
  return crypto.createHash('sha256').update(key.join('|')).digest('hex');
}

// Splits "title\nbody..." (how review_text is stored) into its parts.
function splitText(reviewText) {
  const [title, ...rest] = String(reviewText || '').split('\n');
  return { title: title || '', body: rest.join(' ') };
}

// An opened row: lines = the card's text lines. -> { review_text (the full body), date_text } or null when the title is not there.
function parseOpened(rawLines, rawTitle) {
  const lines = rawLines.map((l) => String(l).normalize('NFC').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const at = lines.indexOf(String(rawTitle).normalize('NFC').replace(/\s+/g, ' ').trim());
  if (at < 0) return null;
  const body = [];
  for (let i = at + 1; i < lines.length && !STOP.test(lines[i]); i++) body.push(lines[i]);
  const from = lines.find((l) => /^Đánh giá từ /.test(l)) || '';
  return { review_text: body.join('\n').trim(), date_text: from.replace(/^Đánh giá từ /, '') };
}

const squash = (x) => String(x || '').normalize('NFC').replace(/\s+/g, ' ').trim();
const ANSWERED = /^(đã đăng phản hồi|phản hồi đang chờ xử lý)$/i; // answered, or our reply waits for Tripadvisor's moderation
const PENDING = /^phản hồi đang chờ xử lý$/i;
const cutExcerpt = (e) => norm(e).replace(/^["'«»]+/, '').replace(/(…|\.{3})$/, '').trim().slice(0, 60);

// One Management Center list row as text lines: [reviewer, date, (property name: attractions only), title, excerpt cut with an
// ellipsis, status line when answered]. The title and the excerpt are the last two lines once the status line is dropped.
function parseRowLines(rawLines, ratingText) {
  const lines = rawLines.map(squash).filter(Boolean);
  const content = lines.slice(2).filter((l) => !ANSWERED.test(l));
  const two = content.length >= 2;
  const m = squash(ratingText).match(/(\d)/);
  return {
    name: lines[0] || '',
    date_text: lines[1] || '',
    title: (two ? content[content.length - 2] : content[0]) || '',
    excerpt: two ? content[content.length - 1] : '',
    rating: m ? Number(m[1]) : 0,
    replied: lines.some((l) => ANSWERED.test(l)),
    pending: lines.some((l) => PENDING.test(l)),
  };
}

// The rows that are the review we want to answer: same stars, same title, and the row's cut-off text is the start of our text.
// The reviewer name only breaks a tie (the list shows the account handle, not always the public display name).
function matchRow(rows, want) {
  const body = norm(want.body).replace(/^["'«»]+/, '');
  let hits = rows.filter((r) => r.rating === want.rating && norm(r.title) === norm(want.title) && (!r.excerpt || body.startsWith(cutExcerpt(r.excerpt))));
  if (hits.length > 1) hits = hits.filter((r) => norm(r.name).replace(/\s+/g, '') === norm(want.name).replace(/\s+/g, ''));
  return hits;
}

module.exports = { parseDate, contentHash, splitText, parseOpened, parseRowLines, matchRow };
