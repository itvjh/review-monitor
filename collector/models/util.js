// Small helpers shared by the Google and Tripadvisor posting flows.
const fs = require('fs');
const path = require('path');
const cfg = require('../config');

// Text as people see it: composed accents (Tripadvisor sends decomposed Vietnamese), one space between words.
exports.squash = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();

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
