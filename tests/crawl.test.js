const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createQueue } = require('../dashboard/models/crawl');
const { resultOf } = require('../dashboard/models/crawlRunner');
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('batch crawl runs sequentially, rejects duplicate requests atomically, and continues after a failure', async () => {
  const calls = [], releases = [];
  const queue = createQueue((id) => { calls.push(id); return new Promise((resolve, reject) => releases.push({ resolve, reject })); });
  queue.enqueue(['google', 'tripadvisor', 'agoda']);
  assert.equal(calls.length, 1);
  assert.throws(() => queue.enqueue(['agoda']), { status: 409 });
  assert.equal(queue.snapshot().jobs.length, 3);
  releases[0].resolve({ outcome: 'SUCCESS', summary: { new_reviews: 2 } });
  await flush(); assert.equal(calls.length, 2);
  releases[1].reject(new Error('n8n unavailable'));
  await flush(); assert.equal(calls.length, 3);
  releases[2].resolve({ outcome: 'PARTIAL', summary: { errors: 1 } });
  await flush();
  assert.deepEqual(queue.snapshot().jobs.map((j) => j.status), ['partial', 'failed', 'completed']);
  queue.enqueue(['google']); assert.equal(calls.length, 4);
  releases[3].resolve({}); await flush();
});

test('crawl accepts only unique registry platforms before starting any work', () => {
  const queue = createQueue(() => assert.fail('must not execute'));
  for (const value of [undefined, null, [], ['google', 'google'], ['constructor'], ['__proto__'], ['google; calc'], [1], 'all']) {
    assert.throws(() => queue.enqueue(value), { status: 400 });
  }
  assert.deepEqual(queue.snapshot().jobs, []);
});

test('execution results expose only numeric summary and fixed codes, never raw workflow data', () => {
  const execution = { secret: 'private-key', data: { resultData: { runData: {
    'Run Summary': [{ data: { main: [[{ json: { status: 'PARTIAL', summary: { businesses_checked: 9, reviews_scanned: 5, new_reviews: 4, errors: 1, secret: 'private-key' }, errors: [{ error_code: 'AI_ERROR', error_message: 'private-key' }, { error_code: '<script>' }] } }]] } }],
  } } } };
  const result = resultOf('Startup logs\nExecution was successful:\n====================================\n' + JSON.stringify(execution), 0);
  assert.equal(result.outcome, 'PARTIAL');
  assert.deepEqual(result.errorCodes, ['AI_ERROR']);
  assert.equal(result.summary.new_reviews, 4);
  assert.ok(!JSON.stringify(result).includes('private-key'));
  assert.throws(() => resultOf('Execution was NOT successful.\n', 0));
  assert.throws(() => resultOf('Execution was successful:\n{}', 1));
});

test('stop drops a waiting job and kills a running one without touching the others', async () => {
  const calls = [];
  const queue = createQueue((id, signal) => new Promise((resolve, reject) => { calls.push(id); signal.addEventListener('abort', () => reject(new Error('Đã dừng.'))); }));
  queue.enqueue(['google', 'agoda']);
  const [agoda, google] = queue.snapshot().jobs; // newest first
  queue.stop(agoda.id);
  assert.equal(queue.snapshot().jobs[0].status, 'stopped');
  queue.stop(google.id);
  await flush();
  const jobs = queue.snapshot().jobs;
  assert.deepEqual(jobs.map((j) => j.status), ['stopped', 'stopped']);
  assert.equal(jobs[1].error, undefined);
  assert.deepEqual(calls, ['gbpReviewMonitor1']); // the waiting one never ran
  assert.throws(() => queue.stop(google.id), { status: 409 });
  assert.throws(() => queue.stop('nope'), { status: 404 });
  queue.enqueue(['google']); // a stopped platform can run again
  assert.equal(calls.length, 2);
});
