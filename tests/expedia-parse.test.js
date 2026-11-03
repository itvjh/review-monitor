const assert = require('assert');
const { parseCard, parseDate, propertyIdOf, starsFromScore } = require('../collector/models/expediaParse');

assert.strictEqual(parseDate('Oct 28, 2026'), '2026-10-28');
assert.strictEqual(parseDate('Gửi vào Mar 3, 2026'), '2026-03-03');
assert.strictEqual(parseDate('rubbish'), null);
assert.strictEqual(propertyIdOf('https://apps.expediapartnercentral.com/supply/home?htid=76784107'), '76784107');
assert.strictEqual(starsFromScore(10), 5);
assert.strictEqual(starsFromScore(8), 4);

const answered = ['b', 'b.', 'bich hang vu', 'Mã đặt phòng 2586693500', 'Thứ 3, 27 thg 10 – Thứ 4, 28 thg 10, 2026', 'Expedia', '10/10', 'Gửi vào Oct 28, 2026',
  'Phòng sạch sẽ, khách sạn đối diện là bãi biển.', 'Dịch', 'Ảnh thu nhỏ của hình đầu tiên', 'S', 'S.', 'Sontra Sea Hotel vào Oct 29, 2026', 'Kính gửi quý khách, cảm ơn.', 'Trân trọng.'];
const a = parseCard(answered);
assert.deepStrictEqual(a, { name: 'bich hang vu', bookingId: '2586693500', source: 'Expedia', score: 10, dateText: 'Oct 28, 2026', text: 'Phòng sạch sẽ, khách sạn đối diện là bãi biển.', reply: 'Kính gửi quý khách, cảm ơn.\nTrân trọng.' });

const open = ['T', 'T.', 'Thanh Mai Lê', 'Mã đặt phòng 2404459402', 'Thứ 2, 9 thg 3 – Thứ 3, 10 thg 3, 2026', 'Expedia', '8/10', 'Gửi vào Mar 13, 2026', 'Phòng sạch sẽ.', 'Hiển thị thêm', 'Phản hồi'];
const o = parseCard(open);
assert.strictEqual(o.text, 'Phòng sạch sẽ.');
assert.strictEqual(o.reply, '');
assert.strictEqual(o.score, 8);

// rating only: no text; a review line that merely looks like a reply header is not taken for one (no avatar letters before it)
const bare = ['X', 'X.', 'Ann', 'Mã đặt phòng 1', 'Thứ 2', 'Hotels', '6/10', 'Gửi vào Jan 2, 2026'];
assert.strictEqual(parseCard(bare).text, '');
const tricky = [...bare, 'We left vào Jan 5, 2026'];
assert.strictEqual(parseCard(tricky).text, 'We left vào Jan 5, 2026');
assert.strictEqual(parseCard(['not a card']), null);
console.log('expedia parse ok');

// Expedia forbids the guest's name in a reply: whole words of 3+ letters, accents kept, no false hit inside another word
const { mentionsName } = require('../collector/models/expediaParse');
assert.strictEqual(mentionsName('Kính gửi quý khách Le Hai Yen,', 'Le Hai Yen'), true);
assert.strictEqual(mentionsName('chân thành cảm ơn', 'Thanh Mai Lê'), false); // "Thanh" the name is not "thành" the word
assert.strictEqual(mentionsName('Dear Thanh,', 'Thanh Mai Lê'), true);
assert.strictEqual(mentionsName('Kính gửi quý khách, cảm ơn.', 'Le Hai Yen'), false);
assert.strictEqual(mentionsName('enjoy Yenzo', 'Le Hai Yen'), false);
assert.strictEqual(require('../dashboard/models/replyRules').mentionsName('Dear Ann,', 'Ann'), true);
assert.strictEqual(require('../dashboard/models/replyRules').mentionsName('Dear valued guest,', 'Ann'), false);
console.log('expedia name guard ok');
