// Collector settings. Change behaviour here, not inside models.
const path = require('path');
const env = require('../config/env');

module.exports = {
  PORT: Number(process.env.PORT || 3010),
  HEADLESS: process.env.HEADLESS !== '0',
  PROFILE: path.join(__dirname, 'profile'),
  SHOTS: path.join(__dirname, 'screenshots'),
  REPLY_MODE: ['dry-run', 'live'].includes(env.REPLY_POSTING) ? env.REPLY_POSTING : 'off', // see models/replyPolicy.js
  ATTEMPTS: 3, // retries for transient failures (timeout / network)
  NAV_HOST: /(^|\.)(google\.com|tripadvisor\.com|tripadvisor\.com\.vn|agoda\.com)$/, // pages we may navigate to
  RES_HOST: /(^|\.)(google\.com|tripadvisor\.com|tripadvisor\.com\.vn|tacdn\.com|agoda\.com|agoda\.net|agodacdn\.com|gstatic\.com|googleusercontent\.com|googleapis\.com)$/, // sub-resources
};
