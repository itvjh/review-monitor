const SEL = require('./selectors');
const { goNext } = require('./browser');
exports.next = async (page) => {
  if (await page.locator(SEL.next).count()) {
    const id = await page.locator(SEL.card).first().getAttribute('data-review-id');
    return goNext(page, id, () => page.locator(SEL.card).first().getAttribute('data-review-id'));
  }
  // The property-specific Google view lazily appends reviews instead of showing page buttons.
  const before = await page.locator(SEL.card).last().getAttribute('data-review-id');
  await page.locator(SEL.card).last().scrollIntoViewIfNeeded();
  for (let n = 0; n < 12; n++) {
    await page.waitForTimeout(500);
    if (await page.locator(SEL.card).last().getAttribute('data-review-id') !== before) return true;
  }
  return false;
};
