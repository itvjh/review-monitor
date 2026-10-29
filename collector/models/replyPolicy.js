// Pure gate for writing to Google. REPLY_POSTING in .env: "off" (default) | "dry-run" | "live".
// Even in "live" a request can ask for a dry run, but a request can never turn a dry run into a real post.
exports.policy = (mode, dryRequested) => {
  if (mode === 'live') return { allowed: true, dryRun: dryRequested === true };
  if (mode === 'dry-run') return { allowed: true, dryRun: true };
  return { allowed: false, dryRun: true };
};

exports.MIN_LEN = 20;
exports.MAX_LEN = 4000;

// Normalizes names so "Mai  Đặng" and "mai đặng" count as the same reviewer.
exports.sameName = (a, b) => String(a || '').trim().replace(/\s+/g, ' ').toLowerCase() === String(b || '').trim().replace(/\s+/g, ' ').toLowerCase();
