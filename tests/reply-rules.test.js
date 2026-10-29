// Moderation rules: allowed status changes and reply linting. Pure functions, no network.
const assert = require('assert');
const rules = require('../dashboard/models/replyRules');

const status = (fn) => { try { fn(); return 200; } catch (e) { return e.status; } };

// transitions
assert.strictEqual(rules.nextStatus('pending', 'approve'), 'approved');
assert.strictEqual(rules.nextStatus('pending', 'reject'), 'rejected');
assert.strictEqual(rules.nextStatus('approved', 'posted'), 'posted');
assert.strictEqual(rules.nextStatus('rejected', 'reopen'), 'pending');
assert.strictEqual(rules.nextStatus('approved', 'reopen'), 'pending');
assert.strictEqual(status(() => rules.nextStatus('pending', 'posted')), 409); // cannot skip the approval
assert.strictEqual(status(() => rules.nextStatus('posted', 'reopen')), 409); // posted is final
assert.strictEqual(status(() => rules.nextStatus(null, 'approve')), 409); // no draft yet
assert.strictEqual(status(() => rules.nextStatus('pending', 'delete')), 400);

// drafts may be regenerated only before approval
assert.ok(rules.canDraft(null) && rules.canDraft('pending') && rules.canDraft('rejected'));
assert.ok(!rules.canDraft('approved') && !rules.canDraft('posted'));

// lint
const msgs = (t) => rules.lint(t).map((w) => w.level);
assert.ok(rules.hasError(rules.lint('')));
assert.ok(rules.hasError(rules.lint('x'.repeat(rules.MAX_LEN + 1))));
assert.deepStrictEqual(rules.lint('Cảm ơn quý khách đã lựa chọn Sontra Sea Hotel, hẹn gặp lại quý khách.'), []);
assert.ok(msgs('Xem thêm tại https://example.com để biết thêm chi tiết nhé quý khách').includes('warn'));
assert.ok(msgs('Liên hệ chúng tôi qua info@hotel.vn để được hỗ trợ ngay lập tức').includes('warn'));
assert.ok(msgs('Gọi ngay 0905 123 456 để được hỗ trợ nhanh chóng nhất có thể').includes('warn'));
assert.ok(msgs('Chúng tôi sẽ hoàn tiền cho quý khách trong thời gian sớm nhất.').includes('warn'));
assert.ok(msgs('We will gladly offer a full refund for your stay with us.').includes('warn'));
assert.ok(msgs('Dear [name], thank you very much for your lovely review of us.').includes('warn'));
assert.ok(!rules.hasError(rules.lint('Cảm ơn quý khách nhiều lắm, hẹn gặp lại.'))); // warnings never block, errors do
console.log('reply rules ok');
