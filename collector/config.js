// Collector settings. Change behaviour here, not inside models.
const path = require('path');
const env = require('../config/env');

module.exports = {
  PORT: Number(process.env.PORT || 3010),
  HEADLESS: process.env.HEADLESS !== '0',
  PROFILE: path.join(__dirname, 'profile'),
  BROWSER_MODE: env.BROWSER_MODE || 'persistent', // persistent | personal (attach to the user's running Chrome)
  CHROME_DEBUG_PORT: Number(env.CHROME_DEBUG_PORT) || 9333, // the tool's own Chrome (see scripts/start-all.js); only used when CHROME_USER_DATA_DIR points at its folder
  CHROME_DEBUG_URL: env.CHROME_USER_DATA_DIR ? `http://127.0.0.1:${Number(env.CHROME_DEBUG_PORT) || 9333}` : '', // set = attach to the tool's own Chrome instead of looking for the user's DevToolsActivePort
  CHROME_PATH: env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  CHROME_USER_DATA_DIR: env.CHROME_USER_DATA_DIR || path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data'),
  SHOTS: path.join(__dirname, 'screenshots'),
  REPLY_MODE: ['dry-run', 'live'].includes(env.REPLY_POSTING) ? env.REPLY_POSTING : 'off', // see models/replyPolicy.js
  ATTEMPTS: 3, // retries for transient failures (timeout / network)
  NAV_HOST: /(^|\.)(google\.com|tripadvisor\.com|tripadvisor\.com\.vn|agoda\.com|traveloka\.com|expediapartnercentral\.com|expediagroup\.com|expedia\.com)$/, // pages we may navigate to
  RES_HOST: /(^|\.)(google\.com|tripadvisor\.com|tripadvisor\.com\.vn|tacdn\.com|agoda\.com|agoda\.net|agodacdn\.com|traveloka\.com|tvlk\.com|expediapartnercentral\.com|expediagroup\.com|expedia\.com|trvl-media\.com|travel-assets\.com|imagekit\.io|cloudfront\.net|gstatic\.com|googleusercontent\.com|googleapis\.com)$/, // sub-resources
};
