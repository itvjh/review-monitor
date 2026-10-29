// Splitting Google's machine translation from the original review text. Pure function, no network.
const assert = require('assert');
const { split } = require('../dashboard/models/reviewText');

// Vietnamese UI: translation first, then the original
assert.deepStrictEqual(
  split('(Bản dịch tự động của Google) Tháng Ba tuyệt vời quá! (Bản gốc) Отличный март! Есть всё, что нужно'),
  { translated: 'Tháng Ba tuyệt vời quá!', original: 'Отличный март! Есть всё, что нужно' },
);
// English UI
assert.deepStrictEqual(split('(Translated by Google) Great stay (Original) Séjour super'), { translated: 'Great stay', original: 'Séjour super' });
// reversed order, multi-line text keeps its line breaks
assert.deepStrictEqual(split('(Original) Ligne 1\nLigne 2 (Translated by Google) Line 1\nLine 2'), { original: 'Ligne 1\nLigne 2', translated: 'Line 1\nLine 2' });
// a review that merely mentions the words is not split; plain and empty text give null
assert.strictEqual(split('Bản gốc của món ăn rất ngon'), null);
assert.strictEqual(split('(Bản gốc) chỉ có bản gốc'), null);
assert.strictEqual(split(''), null);
assert.strictEqual(split(null), null);
console.log('review text ok');
