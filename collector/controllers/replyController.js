const Reply = require('../models/replyModel');
const { replyEndpoint } = require('./replySupport');

// POST /reply {review_id, business_identifier, reviewer_name, text, dry_run?, deadline?}
exports.post = replyEndpoint({
  validate: (i) => (typeof i.review_id === 'string' && i.review_id.length > 0 && i.review_id.length <= 300 ? null : 'review_id is required'),
  post: (page, i, dryRun) => Reply.post(page, { reviewId: i.review_id, businessIdentifier: String(i.business_identifier), reviewerName: i.reviewer_name, text: i.text, dryRun }),
});
