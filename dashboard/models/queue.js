// The posting queue: approved replies go to Google ONE AT A TIME, at least REPLY_GAP_SECONDS apart (default 300),
// so Google never sees a burst of automated replies. State lives in the database, so the queue survives restarts.
const env = require('../../config/env');
const Reply = require('./reply');
const publish = require('./publish');
const collector = require('./collector');
const rules = require('./queueRules');

const GAP_MS = (Number(env.REPLY_GAP_SECONDS) || 300) * 1000; // the queue looks every TICK_MS, so a gap shorter than that is rounded up to it
const MAX_ATTEMPTS = 3; // after this many failures an item waits for a person ("Thử lại")
const TICK_MS = 10000;

exports.GAP_MS = GAP_MS;
exports.MAX_ATTEMPTS = MAX_ATTEMPTS;

// Dependencies are injected so the logic can be tested without a database or a browser.
exports.createQueue = ({ reply = Reply, pub = publish, col = collector, now = Date.now, gapMs = GAP_MS, maxAttempts = MAX_ATTEMPTS } = {}) => {
  let running = false;

  // One step. Returns why it did or did not post: 'off' | 'busy' | 'wait' | 'cap' | 'empty' | 'collector-down' | 'collector-busy' | 'raced' | 'posted' | 'failed'.
  const tick = async () => {
    if (pub.mode() !== 'live') return 'off'; // dry-run and off never post on their own
    if (running) return 'busy';
    running = true;
    try {
      if (rules.waitMs(await reply.lastAttemptAt(), gapMs, now()) > 0) return 'wait';
      if ((await reply.postedSince(pub.startOfToday())) >= pub.DAILY_LIMIT) return 'cap';
      const due = await reply.nextDue(maxAttempts);
      if (!due) return 'empty';
      const c = await col.status(); // no attempt is spent while the collector is down or busy with a crawl: the item just waits its turn
      if (!c.up) return 'collector-down';
      if (c.busy) return 'collector-busy';
      // Record the attempt BEFORE touching Google: a crash or hang then still counts, so it can never be retried in a tight loop.
      if (!(await reply.markAttempt(due))) return 'raced';
      try { await pub.publish(due.id); return 'posted'; } catch (e) { await reply.setError(due.id, e.message, e.stall ? maxAttempts : undefined); return 'failed'; }
    } finally { running = false; }
  };
  return { tick };
};

let instance = null;
const report = (r) => { if (['posted', 'failed', 'cap'].includes(r)) console.log(`[queue] ${r}`); };
const step = () => instance.tick().then(report, (e) => console.error('[queue] error:', e.message));

exports.start = () => {
  instance = exports.createQueue();
  setInterval(step, TICK_MS);
  setTimeout(step, 5000);
};

// Called right after replies were approved: look at the queue now instead of waiting for the next tick.
exports.kick = () => { if (instance) setTimeout(step, 800); };
