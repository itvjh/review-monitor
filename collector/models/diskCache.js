// A tiny cache on disk for things that almost never change (a site's list of properties): one less page visit on every run.
// Visiting a site less is the best protection against being blocked as a bot.
const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = path.join(__dirname, '..', 'cache.json');

// Returns the cached value of `key` while it is younger than ttlMs, otherwise runs fn(), stores and returns its result.
// Nothing is cached when fn throws. A damaged or missing file just means "no cache".
exports.memo = async (key, ttlMs, fn, file = DEFAULT_FILE) => {
  let all = {};
  try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { all = {}; }
  const hit = all[key];
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  all[key] = { at: Date.now(), value };
  fs.writeFileSync(file, JSON.stringify(all));
  return value;
};
