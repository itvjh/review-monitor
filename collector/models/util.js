// Small helpers shared by the Google and Tripadvisor posting flows.
const fs = require('fs');
const path = require('path');
const cfg = require('../config');

// Text as people see it: composed accents (Tripadvisor sends decomposed Vietnamese), one space between words.
exports.squash = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
// Is `shown` (a reply as read from the page) our `text`? Spaces are ignored: textContent drops the line breaks of a reply ("Quang,Thank you").
// Google also shows a long reply cut to its first line plus "…" and a "Xem toàn bộ" link, so a cut copy that is the start of ours counts too.
exports.sameReply = (shown, text) => {
  const bare = (x) => exports.squash(x).replace(/ /g, '');
  const s = exports.squash(shown), t = bare(text);
  if (bare(s).includes(t.slice(0, 25))) return true;
  const cut = bare(s.replace(/\s*(…|\.\.\.)?\s*(Xem toàn bộ bài đánh giá|See full review|Xem thêm|See more|More|Thêm)?$/i, ''));
  return cut !== bare(s) && cut.length >= 18 && t.startsWith(cut);
};

// Saves a full-page screenshot for the moderator's eyes and returns its path. Never throws.
exports.screenshot = async (page, label) => {
  fs.mkdirSync(cfg.SHOTS, { recursive: true });
  const file = path.join(cfg.SHOTS, `${Date.now()}-${label}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
};

// All visible text of the page and its frames, normalised. Never throws.
exports.visibleText = async (page) => {
  const parts = await Promise.all(page.frames().map((f) => f.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '')));
  return parts.join('\n').normalize('NFC');
};
