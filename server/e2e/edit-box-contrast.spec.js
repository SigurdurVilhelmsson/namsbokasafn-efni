// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * The text in the segment editor's edit box can be read in both themes (interface audit 2026-11-13, ED-10).
 *
 * The box is a transparent textarea over a backdrop that draws the text and highlights its markers. The backdrop's
 * text colour was a fixed near-black, so in the dark theme it stood at 1.2:1 against the pane behind it. This
 * measures what the page computes: the colour of the backdrop's text against the first opaque background behind
 * it, and the same for a marker chip, which keeps its own light background in both themes.
 *
 * Reads only: it opens a pane and types into it, and saves nothing.
 */
const BOOK = '__e2e-fixture__';
const MODULE = 'm68664';
const MODULE_URL = `/api/segment-editor/${BOOK}/1/${MODULE}`;
const AA = 4.5; // WCAG 2.1 AA for body text

/** Contrast of an element's text against the first opaque background at or behind it. */
async function contrast(locator) {
  return locator.evaluate((el) => {
    const rgb = (value) => (value.match(/[\d.]+/g) || []).map(Number);
    const luminance = ([r, g, b]) => {
      const c = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    let behind = null;
    for (let node = el; node && !behind; node = node.parentElement) {
      const bg = rgb(getComputedStyle(node).backgroundColor);
      if (bg.length >= 3 && (bg.length === 3 || bg[3] > 0.99)) behind = bg;
    }
    const text = luminance(rgb(getComputedStyle(el).color));
    const back = luminance(behind || [255, 255, 255]);
    return (Math.max(text, back) + 0.05) / (Math.min(text, back) + 0.05);
  });
}

for (const colorScheme of ['dark', 'light']) {
  test.describe(`edit box, ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test('the text and a marker chip in the edit box meet the AA contrast', async ({ page }) => {
      await loginAs(page, 'admin');
      const background = Promise.all([
        page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/terms`)),
        page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/repetitions`)),
      ]);
      await page.goto(`/editor?book=${BOOK}&chapter=1&module=${MODULE}`);
      await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 15000 });
      await background;
      // Control: the page is in the theme this describe asks for (dark pages have a dark body).
      const body = await page.evaluate(() =>
        (getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || []).map(Number)
      );
      expect(body[0] + body[1] + body[2] < 384).toBe(colorScheme === 'dark');

      const row = page.locator('#segments-body tr:has(.btn-edit)').nth(3);
      await row.locator('.btn-edit').click();
      await row.locator('textarea').fill('Texti með merki [[MATH:1]] í miðju.');
      const backdrop = row.locator('.marker-backdrop');
      await expect(backdrop).toContainText('Texti með merki');
      expect(await contrast(backdrop)).toBeGreaterThanOrEqual(AA);
      expect(await contrast(backdrop.locator('.marker-hl').first())).toBeGreaterThanOrEqual(AA);
      // The caret is the only part of the textarea itself that is drawn; it follows the text colour.
      const caret = await row.locator('textarea').evaluate((el) => getComputedStyle(el).caretColor);
      const textColor = await backdrop.evaluate((el) => getComputedStyle(el).color);
      expect(caret).toBe(textColor);
    });
  });
}
