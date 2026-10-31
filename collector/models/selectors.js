// Every Google UI selector lives here. Calibrated 2026-10-23 against the Vietnamese UI; class names are Google's
// obfuscated ones, so when they change the models raise SELECTOR_CHANGED (with a screenshot) instead of guessing.
module.exports = {
  profileLink: 'a[href*="/n/"][href*="/profile"]',
  locationsUrl: 'https://business.google.com/locations',
  propertyReviewsUrl: (id) => `https://www.google.com/local/business/${id}/customers/reviews?knm=0&ih=lu&origin=https%3A%2F%2Fwww.google.com&hl=vi&dcs=1`,
  card: '[data-review-id]',
  rowsBox: '[role=listbox]:has([role=option][data-value="50"])',
  next: 'button:has(i:text("navigate_next"))',
  inPage: { // evaluated inside the page, so it must stay plain data
    card: '[data-review-id]',
    biz: 'a[href*="/n/"][href$="/reviews"]',
    reviewer: 'a[href*="maps/contrib"], .GkR7S',
    scoreLabel: 'article [role="img"][aria-label*="/5"]',
    stars: '.HYsjPc > span:first-child > span',
    starFilled: 'MOLvNc',
    date: '.HYsjPc .zWmYWd, article .KEfuhb',
    text: 'blockquote.rSdjR, article #TBiyHc .Fv38Af [jsname="lvvS4b"]',
    fullText: 'article #TBiyHc .Fv38Af [jsname="PBWx0c"]',
    reply: 'blockquote.Q9ktHb, .UP87Yb .uZ1mGe [jsname="lvvS4b"]',
    fullReply: '.UP87Yb .uZ1mGe [jsname="PBWx0c"]',
  },
  // reply editor (Vietnamese and English UI). Calibrated 2026-10-24: unanswered cards have a "Trả lời" button; it opens one textarea.
  replyButton: /Trả lời|Reply/i,
  replySubmit: /Đăng trả lời|Post reply|Trả lời|Reply/i, // Google now labels the send button "Trả lời" too: only ever looked up inside the open editor (see replyModel)
  replyCancel: /Huỷ|Hủy|Cancel/i,
  emptyText: /no reviews|chưa có bài đánh giá|chưa có đánh giá/i,
  ratingOnlyText: /Người dùng không viết bài đánh giá|did not write a review|left a rating/i,
};
