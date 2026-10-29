const assert = require('assert');
const { normalizeDate, hashReview } = require('../collector/models/reviewUtils');

const now = new Date('2026-10-23T10:00:00Z');
assert.strictEqual(normalizeDate('2 ngày trước', now), '2026-10-21');
assert.strictEqual(normalizeDate('a week ago', now), '2026-10-16');
assert.strictEqual(normalizeDate('3 months ago', now), '2026-07-23');
assert.strictEqual(normalizeDate('một năm trước', now), '2025-10-23');
assert.strictEqual(normalizeDate('yesterday', now), '2026-10-22');
assert.strictEqual(normalizeDate('05/03/2026', now), '2026-03-05');
assert.strictEqual(normalizeDate('garbage', now), null);

const a = { business_identifier: '1', reviewer_name: 'Nguyễn Văn A', rating: 5, review_text: '' };
assert.strictEqual(hashReview(a), hashReview({ ...a, reviewer_name: ' nguyễn  văn a ' }));
assert.notStrictEqual(hashReview(a), hashReview({ ...a, rating: 4 }));
assert.notStrictEqual(hashReview(a), hashReview({ ...a, business_identifier: '2' }));
assert.strictEqual(hashReview({ ...a, review_id: 'x' }), hashReview({ ...a, review_id: 'x', rating: 1 }));
console.log('lib ok');
