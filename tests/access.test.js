// Sharing the dashboard on the local network: only this machine moderates, everyone else is read-only. No network needed.
const assert = require('assert');
const os = require('os');
const access = require('../dashboard/models/access');
const { guard } = require('../dashboard/routes');

const req = (peer, over = {}) => ({ socket: { remoteAddress: peer }, method: 'GET', headers: { host: '192.168.1.10:3020' }, ...over });
const status = (fn) => { try { fn(); return 200; } catch (e) { return e.status; } };

// role from the TCP peer address
const ownLan = Object.values(os.networkInterfaces()).flat().find((i) => i.family === 'IPv4' && !i.internal);
assert.strictEqual(access.role(req('127.0.0.1')), 'moderator');
assert.strictEqual(access.role(req('::1')), 'moderator');
assert.strictEqual(access.role(req('::ffff:127.0.0.1')), 'moderator');
if (ownLan) assert.strictEqual(access.role(req(ownLan.address)), 'moderator'); // owner opening the page through the LAN address
assert.strictEqual(access.role(req('203.0.113.9')), 'viewer');
assert.strictEqual(access.role(req('::ffff:203.0.113.9')), 'viewer');
assert.strictEqual(access.role({}), 'viewer'); // unknown peer is never trusted

// host allow-list: localhost and private IPs only (a public name pointing at us is a rebinding attempt)
for (const h of ['localhost:3020', '127.0.0.1:3020', '192.168.1.20:3020', '10.1.2.3:3020', '172.16.0.5:3020', '172.31.9.9']) assert.ok(access.hostAllowed(h), h);
for (const h of ['evil.example', 'evil.example:3020', '8.8.8.8:3020', '172.32.0.1:3020', '192.168.1.20.evil.example', '', undefined]) assert.ok(!access.hostAllowed(h), String(h));

// guard: viewers may read but never write; moderators may write JSON from their own origin only
const viewerPost = req('203.0.113.9', { method: 'POST', headers: { host: '192.168.1.10:3020', 'content-type': 'application/json' } });
assert.strictEqual(status(() => guard(req('203.0.113.9'))), 200); // viewer GET
assert.strictEqual(status(() => guard(viewerPost)), 403); // viewer POST
const ownerPost = req('127.0.0.1', { method: 'POST', headers: { host: 'localhost:3020', 'content-type': 'application/json' } });
assert.strictEqual(status(() => guard(ownerPost)), 200);
assert.strictEqual(status(() => guard({ ...ownerPost, headers: { ...ownerPost.headers, origin: 'http://evil.example' } })), 403);
assert.strictEqual(status(() => guard({ ...ownerPost, headers: { ...ownerPost.headers, 'content-type': 'text/plain' } })), 415);
assert.strictEqual(status(() => guard(req('127.0.0.1', { headers: { host: 'evil.example' } }))), 403);
console.log('access ok');
