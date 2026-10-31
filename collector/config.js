// Collector settings. Change behaviour here, not inside models.
const path = require('path');
const env = require('../config/env');

module.exports = {
  PORT: Number(process.env.PORT || 3010),
  HEADLESS: process.env.HEADLESS !== '0',
  PROFILE: path.join(__dirname, 'profile'),
  BROWSER_MODE: env.BROWSER_MODE || 'persistent', // persistent | personal (attach to the user's running Chrome)
  CHROME_USER_DATA_DIR: env.CHROME_USER_DATA_DIR || path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data'),
  SHOTS: path.join(__dirname, 'screenshots'),
  REPLY_MODE: ['dry-run', 'live'].includes(env.REPLY_POSTING) ? env.REPLY_POSTING : 'off', // see models/replyPolicy.js
  ATTEMPTS: 3, // retries for transient failures (timeout / network)
  NAV_HOST: /(^|\.)(google\.com|tripadvisor\.com|tripadvisor\.com\.vn|agoda\.com|traveloka\.com)$/, // pages we may navigate to
  RES_HOST: /(^|\.)(google\.com|tripadvisor\.com|tripadvisor\.com\.vn|tacdn\.com|agoda\.com|agoda\.net|agodacdn\.com|traveloka\.com|tvlk\.com|imagekit\.io|cloudfront\.net|gstatic\.com|googleusercontent\.com|googleapis\.com)$/, // sub-resources
};
