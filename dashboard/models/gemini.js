// Gemini access for on-demand reply drafts (the workflow drafts new reviews itself; this covers older ones and "regenerate").
const fs = require('fs');
const path = require('path');
const env = require('../../config/env');
const { HttpError } = require('./httpError');
const platforms = require('../../config/platforms');

const RULES = fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'prompts', 'reply-rules.txt'), 'utf8').trim();
const MODEL = env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

// A platform's own reply rule (config/platforms.js replyNote), appended so it wins over the general greeting.
const platformNote = (id) => (platforms[id] && platforms[id].replyNote ? `

PLATFORM RULE (overrides the rules above)
${platforms[id].replyNote}` : '');

exports.draftReply = async (r) => {
  const business = (r.businesses && r.businesses.business_name) || 'the business';
  const lang = r.review_text && r.language && r.language !== 'unknown' ? `The review language code is "${r.language}": reply in that language.` : 'The review has no text (rating only): reply in English.';
  const prompt = `Business: ${business}\nRating: ${r.rating}/5\nReviewer: ${(platforms[r.platform] || {}).noGuestName ? '(withheld by the platform: never use any guest name)' : r.reviewer_name}\nReview: ${r.review_text || '(no text)'}\n${lang}\n\nWrite the owner's reply. Return only the reply text, nothing else.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: RULES + platformNote(r.platform) }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } }),
    signal: AbortSignal.timeout(60000),
  }).catch((e) => { throw new HttpError(502, `Không gọi được Gemini (${e.name}).`); });
  if (res.status === 429) throw new HttpError(429, 'Gemini đã hết quota (gói Free). Thử lại sau ít phút hoặc bật billing.');
  if (!res.ok) throw new HttpError(502, `Gemini trả lỗi ${res.status}.`);
  const j = await res.json();
  const text = ((j.candidates && j.candidates[0] && j.candidates[0].content.parts) || []).map((p) => p.text || '').join('').trim();
  if (!text) throw new HttpError(502, 'Gemini không trả về nội dung.');
  return text;
};
