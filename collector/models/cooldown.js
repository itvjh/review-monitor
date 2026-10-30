// When a site says "access restricted", the worst thing to do is to keep knocking: every further visit makes the block longer.
// The first detection pauses ALL automated visits to that site for a few hours (the pause survives restarts, in blocked.json);
// until then every request to it fails at once with AUTH_REQUIRED, without opening the site. A person can check the site in a normal
// browser and delete collector/blocked.json to try again sooner.
const fs = require('fs');
const path = require('path');
const { CodedError } = require('./errors');

const FILE = path.join(__dirname, '..', 'blocked.json');
const read = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return {}; } };

// Throws AUTH_REQUIRED while the site is paused.
exports.check = (site, label) => {
  const until = Number(read()[site] || 0);
  if (until > Date.now()) {
    throw new CodedError('AUTH_REQUIRED', `${label} đã chặn truy cập tự động nên hệ thống tạm dừng đến ${new Date(until).toLocaleString('vi-VN')}, không mở lại trang để tránh bị chặn lâu hơn. Hãy kiểm tra ${label} bằng Chrome thường; xóa collector/blocked.json để thử lại sớm hơn.`);
  }
};

exports.trip = (site, hours = 6) => {
  const state = read();
  state[site] = Date.now() + hours * 3600000;
  fs.writeFileSync(FILE, JSON.stringify(state));
};
