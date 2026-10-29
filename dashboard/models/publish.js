// Sends an APPROVED reply to Google through the collector. Everything that must hold before a public post lives here.
const env = require('../../config/env');
const Reply = require('./reply');
const rules = require('./replyRules');
const collector = require('./collector');
const { HttpError } = require('./httpError');
const platforms = require('../../config/platforms');

const mode = () => (['dry-run', 'live'].includes(env.REPLY_POSTING) ? env.REPLY_POSTING : 'off');
const DAILY_LIMIT = Number(env.REPLY_DAILY_LIMIT) || 10;
const inflight = new Set(); // this process only: stops a double click from posting twice

exports.mode = mode;

// Platforms whose approved replies the queue may post by itself.
const AUTO_PLATFORMS = Object.keys(platforms).filter((id) => platforms[id].autoReply);
exports.AUTO_PLATFORMS = AUTO_PLATFORMS;

// Each collector adapter identifies the review its own way. `base` = what every platform gets (business, reviewer, text, retry flag, dry run, deadline;
// retry: markAttempt already counted this attempt, so more than one means an earlier attempt may have posted without telling us).
const NEEDS_REVIEW_ID = ['google', 'agoda']; // Tripadvisor's list has no review ids: it is matched by title, stars and text
const lines = (row) => String(row.review_text || '').split('\n');
const PAYLOAD = {
  google: (row, base) => ({ review_id: row.external_review_id, ...base }),
  tripadvisor: (row, base) => ({ title: lines(row)[0], body: lines(row).slice(1).join(' '), rating: row.rating, ...base }),
  agoda: (row, base) => ({ bid: row.external_review_id, language: row.language, ...base }),
};

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
exports.startOfToday = startOfToday;
exports.DAILY_LIMIT = DAILY_LIMIT;

// -> { result: 'posted', item } | { result: 'dry-run', screenshot }; throws HttpError otherwise.
exports.publish = async (id) => {
  if (mode() === 'off') throw new HttpError(403, 'Đăng tự động đang tắt (REPLY_POSTING=off trong .env).');
  if (inflight.has(id)) throw new HttpError(409, 'Đang đăng review này, vui lòng đợi.');
  inflight.add(id);
  try {
    const row = await Reply.find(id);
    if (row.reply_status !== 'approved') throw new HttpError(409, 'Chỉ đăng được nội dung đã duyệt.');
    if (!AUTO_PLATFORMS.includes(row.platform)) throw new HttpError(409, 'Nền tảng này chưa hỗ trợ tự đăng. Hãy sao chép nội dung và đăng tay.');
    const text = (row.reply_final || '').trim();
    if (rules.hasError(rules.lint(text))) throw new HttpError(400, 'Nội dung đã duyệt không hợp lệ.');
    const biz = row.businesses && row.businesses.external_business_id;
    if (!biz || (NEEDS_REVIEW_ID.includes(row.platform) && !row.external_review_id)) throw new HttpError(409, 'Thiếu mã review hoặc cơ sở nên không thể tự đăng. Hãy đăng tay.');
    if (mode() === 'live' && (await Reply.postedSince(startOfToday())) >= DAILY_LIMIT) {
      throw new HttpError(429, `Đã đạt giới hạn ${DAILY_LIMIT} phản hồi tự đăng mỗi ngày (REPLY_DAILY_LIMIT).`);
    }
    const payload = PAYLOAD[row.platform](row, { business_identifier: biz, reviewer_name: row.reviewer_name, text, retry: row.reply_attempts > 1, dry_run: mode() !== 'live', deadline: Date.now() + 170000 });
    const out = await collector.postReply(payload, row.platform);
    if (out.status !== 'OK') throw new HttpError(502, `${out.error_code || 'LỖI'}: ${out.error_message || out.status}${out.screenshot ? ` (ảnh: ${out.screenshot})` : ''}`);
    if (out.posted) return { result: 'posted', item: await Reply.act(id, 'posted') };
    return { result: 'dry-run', screenshot: out.screenshot };
  } finally { inflight.delete(id); }
};
