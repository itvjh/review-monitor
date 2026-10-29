const assert = require('assert');
const { parseDate, contentHash, splitText, parseOpened, parseRowLines, matchRow } = require('../collector/models/tripadvisorParse');

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
// two identical short reviews in one list get different keys; the top one keeps the plain key
const short = { business: '1', title: 'Tốt', rating: 5, body: 'ok' };
assert.strictEqual(contentHash({ ...short, nth: 1 }), contentHash(short));
assert.notStrictEqual(contentHash({ ...short, nth: 2 }), contentHash(short));
assert.notStrictEqual(contentHash({ ...short, nth: 2 }), contentHash({ ...short, nth: 3 }));

// list rows, three real shapes: hotel / restaurant (4 lines), attraction (extra property-name line), answered, waiting for moderation
const hotelRow = parseRowLines(['Sithikham', '17 thg 10, 2026', 'Khách sạn nhiều tiện ích', 'Ks có khá nhiều tiện ích, phòng gym...'], '5 trên 5 bong bóng');
assert.deepStrictEqual([hotelRow.title, hotelRow.excerpt, hotelRow.rating, hotelRow.replied], ['Khách sạn nhiều tiện ích', 'Ks có khá nhiều tiện ích, phòng gym...', 5, false]);
const sight = parseRowLines(['Odysseyki', '9 thg 9, 2026', 'Sontra mini Mart 24h', 'Very Convenient for Travelers', 'It is a long text that goes on...', 'Đã đăng phản hồi'], '5 trên 5 bong bóng');
assert.deepStrictEqual([sight.title, sight.excerpt, sight.replied, sight.pending], ['Very Convenient for Travelers', 'It is a long text that goes on...', true, false]);
const waiting = parseRowLines(['tuanminh_1996', 'Hôm qua', 'Conveniment for travelers', "I realized I'd forgotten a few...", 'Phản hồi đang chờ xử lý'], '5 trên 5 bong bóng');
assert.deepStrictEqual([waiting.replied, waiting.pending, waiting.title], [true, true, 'Conveniment for travelers']);
assert.strictEqual(parseRowLines(['x', 'y', 'Chỉ có tiêu đề'], '4 trên 5').excerpt, ''); // a row with a title and no text

// which row is the review we answer: the account handle may differ from the stored display name; a tie is broken by name; none or many = refuse
const rows = [
  { name: 'tuanminh_1996', title: 'Conveniment for travelers', excerpt: "I realized I'd forgotten a few personal essentinals during my trip to Quy Nhon, so I stopped by G...", rating: 5 },
  { name: 'hulitre', title: 'May mà có cửa hàng mở cửa khuya', excerpt: 'Bạn mình cần mua đồ dùng...', rating: 5 },
];
const want = { name: 'Phạm Tuấn Minh', title: 'Conveniment for travelers', rating: 5, body: "I realized I'd forgotten a few personal essentinals during my trip to Quy Nhon, so I stopped by Gia Lai mini Mart." };
assert.deepStrictEqual(matchRow(rows, want).map((r) => r.name), ['tuanminh_1996']);
assert.strictEqual(matchRow(rows, { ...want, rating: 4 }).length, 0); // other star count
assert.strictEqual(matchRow(rows, { ...want, body: 'A completely different text about a hotel.' }).length, 0); // same title, other text
assert.strictEqual(matchRow(rows, { ...want, body: want.body.replace("'", '’') }).length, 1); // curly apostrophe
const twins = [{ name: 'Ann B', title: 'Tốt', excerpt: 'ok', rating: 5 }, { name: 'zed', title: 'Tốt', excerpt: 'ok', rating: 5 }];
assert.strictEqual(matchRow(twins, { name: 'Ann  B', title: 'Tốt', rating: 5, body: 'ok' }).length, 1); // tie broken by name
assert.strictEqual(matchRow(twins, { name: 'someone else', title: 'Tốt', rating: 5, body: 'ok' }).length, 0); // still ambiguous after the name: refuse
console.log('tripadvisor-parse ok');
