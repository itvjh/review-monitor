// Google reply editor: the send button is found inside the open editor only, whatever it is labelled.
// Runs in a real headless Chrome on a static page; skipped when no Chrome is installed (set CHROME_PATH to point at one).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { chromium } = require('../collector/node_modules/playwright-core');
const { sendButton } = require('../collector/models/replyModel');

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => p && fs.existsSync(p));
const editor = (submit) => `<div><div><button>Trả lời</button></div><div><div><textarea></textarea><div><button>${submit}</button><button>Huỷ</button></div></div></div><div><button>Trả lời</button></div></div>`;

test('Google send button is the one next to the editor, not another card\'s Trả lời', { skip: !chrome && 'Chrome not found' }, async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    for (const label of ['Trả lời', 'Đăng trả lời']) { // Google changed the label: both must work
      const page = await browser.newPage();
      await page.setContent(editor(label));
      const send = sendButton(page, page.locator('textarea:visible'));
      assert.equal(await send.count(), 1);
      assert.equal(await send.evaluate((b) => b.nextElementSibling.textContent), 'Huỷ'); // the editor's own button, not the card's
      await page.close();
    }
  } finally { await browser.close(); }
});
