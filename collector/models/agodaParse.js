// Pure helpers for the Agoda Partner Portal (no browser): scores, dates, booking ids, reply language names.
const BID = /BID:\s*(\d+)/;

// Agoda scores guests 0-10; the database and the alert rules use 1-5 stars. 10 -> 5, 8.4 -> 4, 5.0 -> 3, 4.9 -> 2, 2 -> 1.
exports.parseScore = (text) => {
  const m = String(text || '').match(/\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : 0;
};
exports.starsFromScore = (score) => Math.min(5, Math.max(1, Math.round(Number(score) / 2) || 1));

// "BID: 1775304101" -> "1775304101". The booking id is Agoda's own id of the review (one review per booking): the stable identity.
exports.bidOf = (text) => (String(text || '').match(BID) || [])[1] || '';

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// "Reviewed October 28, 2026" / "October 28, 2026" -> "2026-10-28"; the stay month alone ("October 2026 (1 night)") -> first of that month.
exports.parseReviewedDate = (text) => {
  const t = String(text || '').toLowerCase();
  let m = t.match(/([a-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (m && MONTHS[m[1]]) return iso(m[3], MONTHS[m[1]], m[2]);
  m = t.match(/([a-z]+)\s+(\d{4})/);
  return m && MONTHS[m[1]] ? iso(m[2], MONTHS[m[1]], 1) : null;
};

// The reply-language dropdown lists languages by their own name. language = the ISO code the AI stored on the review.
const LANGUAGES = {
  en: 'English', fr: 'Français', de: 'Deutsch', it: 'Italiano', es: 'Español', ja: '日本語', ko: '한국어', el: 'Ελληνικά', ru: 'Русский',
  nl: 'Nederlands', th: 'ภาษาไทย', ms: 'Bahasa Malaysia', vi: 'Tiếng Việt', sv: 'Svenska', id: 'Bahasa Indonesia', pl: 'Język polski',
  no: 'Norsk', nb: 'Norsk', da: 'Dansk', fi: 'Suomi', cs: 'Čeština', tr: 'Türkçe', ca: 'Català', hu: 'Magyar', bg: 'Български език',
  sl: 'Slovenski jezik', ar: 'العربية', pt: 'Português (BR)', zh: '简体中文', 'zh-tw': '繁體中文 (台灣)', 'zh-hk': '繁體中文 (香港)',
};
// -> the dropdown label, or '' when we have no match (the dropdown is then left on its default).
exports.languageLabel = (code) => {
  const c = String(code || '').toLowerCase().replace('_', '-');
  return LANGUAGES[c] || LANGUAGES[c.split('-')[0]] || '';
};
