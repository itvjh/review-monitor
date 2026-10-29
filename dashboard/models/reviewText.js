// Google appends its machine translation to a review: "(Bản dịch tự động của Google) <vi> (Bản gốc) <original>"
// (English UI: "(Translated by Google) ... (Original) ..."; the order can also be reversed). Pure function, no I/O.
const TRANSLATED = /\((?:Bản dịch tự động của Google|Translated by Google)\)/i;
const ORIGINAL = /\((?:Bản gốc|Original)\)/i;

// -> { original, translated } or null when the review has no translation block.
exports.split = (text) => {
  const t = String(text || '');
  const tr = TRANSLATED.exec(t);
  const og = ORIGINAL.exec(t);
  if (!tr || !og) return null;
  const after = (m, end) => t.slice(m.index + m[0].length, end).trim();
  const parts = tr.index < og.index
    ? { translated: after(tr, og.index), original: after(og) }
    : { original: after(og, tr.index), translated: after(tr) };
  return parts.translated || parts.original ? parts : null;
};
