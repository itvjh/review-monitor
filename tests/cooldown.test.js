// When a site blocks us, automated visits pause for hours (collector/models/cooldown.js). The state file is saved and restored around the test.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cooldown = require('../collector/models/cooldown');

const FILE = path.join(__dirname, '..', 'collector', 'blocked.json');
const saved = fs.existsSync(FILE) ? fs.readFileSync(FILE) : null;
try {
  fs.rmSync(FILE, { force: true });
  assert.doesNotThrow(() => cooldown.check('example', 'Example')); // nothing recorded: free
  cooldown.trip('example', 1);
  assert.throws(() => cooldown.check('example', 'Example'), (e) => e.code === 'AUTH_REQUIRED' && /tạm dừng/.test(e.message)); // paused, stops at once
  assert.doesNotThrow(() => cooldown.check('other-site', 'Other')); // only that site
  fs.writeFileSync(FILE, JSON.stringify({ example: Date.now() - 1000 }));
  assert.doesNotThrow(() => cooldown.check('example', 'Example')); // pause over
  fs.writeFileSync(FILE, '{not json');
  assert.doesNotThrow(() => cooldown.check('example', 'Example')); // a damaged file never blocks everything
} finally {
  if (saved) fs.writeFileSync(FILE, saved); else fs.rmSync(FILE, { force: true });
}
console.log('cooldown ok');
