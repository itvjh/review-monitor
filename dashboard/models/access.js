// Who is asking? The machine running the dashboard is the "moderator"; everyone else on the network is a read-only "viewer".
// Decided from the TCP peer address, which a remote browser cannot forge. Do NOT put a reverse proxy in front: it would make every request look local.
const os = require('os');
const env = require('../../config/env');

const own = () => {
  const addrs = new Set(['127.0.0.1', '::1']);
  for (const list of Object.values(os.networkInterfaces())) for (const i of list) addrs.add(i.address);
  return addrs;
};

exports.role = (req) => {
  const peer = String((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, '');
  return own().has(peer) ? 'moderator' : 'viewer';
};

// Hosts we answer to: this machine, private-network IPs (what colleagues type in), plus DASHBOARD_ALLOWED_HOSTS (comma separated names).
// Anything else, such as a public domain pointing at us, is refused (DNS rebinding defence).
const PRIVATE = /^(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
const EXTRA = String(env.DASHBOARD_ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

exports.hostAllowed = (host) => PRIVATE.test(host || '') || EXTRA.includes(String(host || '').toLowerCase().replace(/:\d+$/, ''));

// URLs to print at startup so the owner knows what to share.
exports.lanUrls = (port) => Object.values(os.networkInterfaces()).flat()
  .filter((i) => i.family === 'IPv4' && !i.internal)
  .map((i) => `http://${i.address}:${port}`);
