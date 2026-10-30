// Pure timing rules of the posting queue (no I/O). All times are epoch milliseconds or ISO strings.

// Milliseconds still to wait before Google may be touched again. `lastIso` is the latest attempt on ANY review.
exports.waitMs = (lastIso, gapMs, now = Date.now()) => (lastIso ? Math.max(0, new Date(lastIso).getTime() + gapMs - now) : 0);

// When the queue item at `index` (0 = next) is expected to be posted.
exports.eta = (index, lastIso, gapMs, now = Date.now()) => now + exports.waitMs(lastIso, gapMs, now) + index * gapMs;

// Same, with the daily limit: only `limit - postedToday` posts are left today; the rest wait for tomorrow (local midnight),
// `limit` per day, one gap apart.
exports.etaCapped = (index, lastIso, gapMs, postedToday, limit, now = Date.now()) => {
  const left = Math.max(0, limit - postedToday);
  if (index < left) return exports.eta(index, lastIso, gapMs, now);
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const k = index - left;
  return midnight.getTime() + Math.floor(k / limit) * 86400000 + (k % limit) * gapMs;
};
