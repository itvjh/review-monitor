const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../dashboard/models/supabase');
const Review = require('../dashboard/models/review');

test('"đã xử lý" is kept in raw_data next to the other keys and can be undone', async () => {
  const patches = [];
  db.get = async () => [{ raw_data: { source_locator: { page: 0 }, handled_at: '2026-01-01T00:00:00Z' } }];
  db.patch = async (query, body) => { patches.push({ query, body }); return [{}]; };
  await Review.setHandled('abc', true);
  assert.equal(patches[0].query, 'reviews?id=eq.abc');
  assert.deepEqual(Object.keys(patches[0].body.raw_data).sort(), ['handled_at', 'source_locator']);
  assert.notEqual(patches[0].body.raw_data.handled_at, '2026-01-01T00:00:00Z');
  await Review.setHandled('abc', false);
  assert.deepEqual(patches[1].body.raw_data, { source_locator: { page: 0 } });
  db.get = async () => [];
  await assert.rejects(Review.setHandled('abc', true), { status: 404 });
});
