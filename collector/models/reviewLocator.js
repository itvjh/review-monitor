// Cached page numbers are hints only. Always verify the actual review ID/content before returning a match.
function pageHint(locator, property, reviewId, maxPages) {
  if (!locator || String(locator.property_id) !== String(property) || String(locator.review_id) !== String(reviewId)) return 0;
  return Number.isInteger(locator.page) && locator.page >= 0 && locator.page < maxPages ? locator.page : 0;
}
async function seek({ open, find, next, maxPages, hint = 0 }) {
  if (!await open()) return null;
  let start = 0;
  for (; start < hint; start++) if (!await next()) break;
  for (let p = start; p < maxPages; p++) {
    const match = await find(p);
    if (match) return match;
    if (!await next()) break;
  }
  // Newer reviews can push an old page number either way. A stale hint must never mean "not found".
  if (start > 0 && await open()) {
    for (let p = 0; p < start; p++) {
      const match = await find(p);
      if (match) return match;
      if (!await next()) break;
    }
  }
  return null;
}
module.exports = { pageHint, seek };
