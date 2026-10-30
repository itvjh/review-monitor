// diskCache: the second call inside the time limit does not run the function again; errors are never cached.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { memo } = require('../collector/models/diskCache');

(async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-')), 'cache.json');
  let calls = 0;
  const fn = async () => { calls++; return { n: calls }; };
  assert.deepStrictEqual(await memo('k', 60000, fn, file), { n: 1 });
  assert.deepStrictEqual(await memo('k', 60000, fn, file), { n: 1 }); // from the file
  assert.strictEqual(calls, 1);
  assert.deepStrictEqual(await memo('k', 0, fn, file), { n: 2 }); // too old: runs again
  await assert.rejects(memo('bad', 60000, async () => { throw new Error('boom'); }, file));
  assert.deepStrictEqual(await memo('bad', 60000, fn, file), { n: 3 }); // the failure was not stored
  fs.writeFileSync(file, '{broken');
  assert.deepStrictEqual(await memo('k', 60000, fn, file), { n: 4 }); // a damaged file means no cache
  console.log('disk cache ok');
})().catch((e) => { console.error(e); process.exit(1); });
