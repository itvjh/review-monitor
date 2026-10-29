const assert = require('assert');
const { parseDate, contentHash, splitText, parseOpened } = require('../collector/models/tripadvisorParse');

const now = new Date('2026-10-26T10:00:00Z');
assert.strictEqual(parseDate('13 thg 10', now), '2026-10-13');
assert.strictEqual(parseDate('28 thg 10, 2026', now), '2026-10-28');
assert.strictEqual(parseDate('30 thg 12', now), '2025-12-30'); // would be in the future: last year
assert.strictEqual(parseDate('thg 9 2026', now), '2026-09-01');
assert.strictEqual(parseDate('Đã viết vào 5 tháng 8, 2026', now), '2026-08-05');
assert.strictEqual(parseDate('hôm qua', now), '2026-10-25');
assert.strictEqual(parseDate('Hôm nay', now), '2026-10-26');
assert.strictEqual(parseDate('3 ngày trước', now), '2026-10-23');
assert.strictEqual(parseDate('2 tuần trước', now), '2026-10-12');
assert.strictEqual(parseDate('', now), null);

// Content identity: the collapsed row (cut-off excerpt) and the full stored text must give the same key.
const body = 'I stayed in a room with two beds, and it was quiet spacious. The beds were large, the linens were clean, and everything was neatly arranged.';
const fromRow = contentHash({ business: '34666891', title: 'Spacious, Airy and Clean Room', rating: 4, body: body.slice(0, 90) + '...' });
const stored = splitText('Spacious, Airy and Clean Room\n' + body);
assert.deepStrictEqual(stored, { title: 'Spacious, Airy and Clean Room', body });
assert.strictEqual(contentHash({ business: '34666891', title: stored.title, rating: 4, body: stored.body }), fromRow);
// whitespace, case, decomposed accents do not matter; another property, another star count or another text do
assert.strictEqual(contentHash({ business: '34666891', title: 'SPACIOUS,  Airy and Clean Room', rating: 4, body: '  ' + body }), fromRow);
assert.strictEqual(contentHash({ business: '1', title: 'Tiêu đề', rating: 5, body: 'Nội dung' }), contentHash({ business: '1', title: 'Tiêu đề', rating: 5, body: 'Nội dung' }));
assert.notStrictEqual(contentHash({ business: '34694475', title: stored.title, rating: 4, body }), fromRow);
assert.notStrictEqual(contentHash({ business: '34666891', title: stored.title, rating: 5, body }), fromRow);
assert.notStrictEqual(contentHash({ business: '34666891', title: stored.title, rating: 4, body: 'Different text' }), fromRow);
// short reviews are keyed on the whole text
assert.strictEqual(contentHash({ business: '1', title: 't', rating: 5, body: 'ok' }), contentHash({ business: '1', title: 't', rating: 5, body: 'ok' }));

// an opened row: full body between the title and the owner tools
const opened = parseOpened(['Companion58556228671', 'Thành phố Hồ Chí Minh, Việt Nam • 2 đóng góp', 'Đánh giá từ 28 thg 10, 2026', 'Spacious, Airy and Clean Room', body, 'Second paragraph.',
  'Giá trị', 'Phòng', 'Chọn làm mục yêu thích', 'Báo cáo đánh giá', 'Cách phản hồi: Mẹo hàng đầu', 'Tên của quý vị sẽ được hiển thị dưới dạng', 'Gửi'], 'Spacious, Airy and Clean Room');
assert.strictEqual(opened.review_text, body + '\nSecond paragraph.');
assert.strictEqual(opened.date_text, '28 thg 10, 2026');
assert.strictEqual(parseDate(opened.date_text, now), '2026-10-28');
// non-breaking spaces / decomposed text in the title still match
assert.strictEqual(parseOpened(['A', 'Tiêu đề', 'Nội dung.', 'Gửi'], 'Tiêu đề').review_text, 'Nội dung.');
assert.strictEqual(parseOpened(['x'], 'missing title'), null);
console.log('tripadvisor-parse ok');
