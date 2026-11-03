// Pure moderation rules (no I/O): which status changes are allowed and what a reply must not contain.
const { HttpError } = require('./httpError');

const MAX_LEN = 4000; // Google caps owner replies at 4096 characters

// action -> { from: allowed current statuses, to: new status }
const ACTIONS = {
  approve: { from: ['pending'], to: 'approved' },
  reject: { from: ['pending'], to: 'rejected' },
  reopen: { from: ['rejected', 'approved'], to: 'pending' },
  posted: { from: ['approved'], to: 'posted' },
  retry: { from: ['approved'], to: 'approved' }, // clears a stalled queue item so the worker tries it again
};

exports.nextStatus = (current, action) => {
  const a = ACTIONS[action];
  if (!a) throw new HttpError(400, 'action không hợp lệ');
  if (!a.from.includes(current)) throw new HttpError(409, `Không thể "${action}" khi trạng thái là ${current || 'chưa có bản nháp'}`);
  return a.to;
};

// A draft may be (re)generated until a human has approved it.
exports.canDraft = (current) => current === null || current === undefined || ['pending', 'rejected'].includes(current);

const PROMISES = ['hoàn tiền', 'bồi thường', 'miễn phí', 'giảm giá', 'tặng voucher', 'refund', 'compensat', 'free of charge', 'discount', 'voucher', 'возврат', 'компенсаци', 'бесплатн'];

// Words of the business name long enough to be a name ("Vistara", "Yzistel", "mini"), lower case.
const brandWords = (name) => String(name || '').normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4);

// level "error" blocks approval; "warn" is shown to the moderator, who decides. `business` (optional) is the business name the reply signs with.
exports.lint = (text, business) => {
  const t = String(text || '').trim();
  const out = [];
  if (!t) return [{ level: 'error', message: 'Nội dung trả lời đang trống.' }];
  if (t.length > MAX_LEN) out.push({ level: 'error', message: `Quá dài (${t.length}/${MAX_LEN} ký tự).` });
  if (t.length < 20) out.push({ level: 'error', message: 'Quá ngắn (cần ít nhất 20 ký tự, collector từ chối nội dung ngắn hơn).' }); // same minimum as collector/models/replyPolicy.js
  if (/(https?:\/\/|www\.)\S+/i.test(t)) out.push({ level: 'warn', message: 'Có chứa liên kết.' });
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(t)) out.push({ level: 'warn', message: 'Có chứa địa chỉ email.' });
  if (/\+?\d[\d\s().-]{7,}\d/.test(t)) out.push({ level: 'warn', message: 'Có chứa số điện thoại hoặc dãy số dài.' });
  const low = t.toLowerCase();
  const hit = PROMISES.find((p) => low.includes(p));
  if (hit) out.push({ level: 'warn', message: `Có thể đang hứa hoàn tiền/bồi thường/ưu đãi ("${hit}"). Cần có sự đồng ý của quản lý.` });
  if (/\[[^\]]*\]|\{\{|TODO/i.test(t)) out.push({ level: 'warn', message: 'Còn ký tự giữ chỗ như [tên] hoặc {{...}}.' });
  const words = brandWords(business);
  if (words.length && !words.some((w) => low.includes(w))) out.push({ level: 'warn', message: 'Không thấy tên cơ sở trong nội dung (chữ ký sai hoặc lạc đề).' });
  return out;
};

// Bulk approval is for clean replies only: anything the linter flags (error or warning) is left for a person to read.
// items: [{id, text}] -> { ok: [{id, text}], skipped: [{id, reason}] }
exports.classifyBulk = (items) => {
  const ok = [];
  const skipped = [];
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    const warnings = exports.lint(it.text);
    if (warnings.length) skipped.push({ id: it.id, reason: warnings.map((w) => w.message).join(' ') });
    else ok.push(it);
  }
  return { ok, skipped };
};

// Platforms such as Expedia forbid the guest's name in a reply: does `text` use a word (3+ letters) of `name`?
// (Same check as collector/models/expediaParse.js.)
const fold = (x) => String(x || '').normalize('NFC').toLowerCase(); // accents kept: "Thanh" (a name) is not "thành" (a common word)
const escapeRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
exports.mentionsName = (text, name) => {
  const t = fold(text);
  return fold(name).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3)
    .some((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(w)}($|[^\\p{L}\\p{N}])`, 'u').test(t));
};

exports.hasError = (warnings) => warnings.some((w) => w.level === 'error');
exports.MAX_LEN = MAX_LEN;
