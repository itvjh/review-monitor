// Short-lived read cache. Every Supabase round trip costs 200-300 ms, and several pages and viewers ask for the same data every minute.
// Concurrent callers share one in-flight request. Writes made by this process call clear(); rows written elsewhere (the n8n workflow)
// show up after at most one TTL.
const store = new Map();

exports.memo = (key, ttlMs, fn) => {
  const hit = store.get(key);
  if (hit && Date.now() < hit.until) return hit.value;
  const value = Promise.resolve().then(fn).catch((e) => { if (store.get(key) && store.get(key).value === value) store.delete(key); throw e; }); // never cache a failure
  store.set(key, { until: Date.now() + ttlMs, value });
  return value;
};

exports.clear = () => store.clear();
