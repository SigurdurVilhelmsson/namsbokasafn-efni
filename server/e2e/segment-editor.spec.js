// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Segment editor workflow tests.
 *
 * Tests the core segment editing flow:
 * - Page loads with chapter/module selectors
 * - Module list appears for a known book/chapter
 * - Segment table renders when a module is loaded
 */

test.describe('Segment editor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('editor page loads with book selector', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');

    // Should have book and chapter selects
    const bookSelect = page.locator('#book-select, select').first();
    await expect(bookSelect).toBeVisible();
  });

  test('selecting a book populates chapter dropdown', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');

    // Select "efnafraedi-2e" book
    const bookSelect = page.locator('#book-select');
    if (await bookSelect.isVisible()) {
      await bookSelect.selectOption('efnafraedi-2e');

      // Wait for chapter dropdown to populate
      const chapterSelect = page.locator('#chapter-select');
      await expect(chapterSelect).toBeVisible({ timeout: 5000 });

      // Chapters load via an async fetch after the book is selected, so poll
      // until options appear instead of counting once — a one-shot count
      // raced the fetch and flaked on slow CI runners (> 1 because the first
      // option is the placeholder).
      await expect
        .poll(() => chapterSelect.locator('option').count(), { timeout: 10000 })
        .toBeGreaterThan(1);
    }
  });

  test('loading a chapter shows module list', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');

    const bookSelect = page.locator('#book-select');
    if (await bookSelect.isVisible()) {
      await bookSelect.selectOption('efnafraedi-2e');

      const chapterSelect = page.locator('#chapter-select');
      await expect(chapterSelect).toBeVisible({ timeout: 5000 });

      // Select first chapter (usually "1")
      const options = chapterSelect.locator('option:not([value=""])');
      const firstValue = await options.first().getAttribute('value');
      if (firstValue) {
        await chapterSelect.selectOption(firstValue);

        // Module list should appear
        const moduleContainer = page.locator('#module-list, .module-list, .module-card').first();
        await expect(moduleContainer).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('no console errors during editor interaction', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/editor');
    await page.waitForLoadState('networkidle');

    // Give scripts time to initialize
    await page.waitForTimeout(1000);

    expect(errors).toEqual([]);
  });
});

/** Load the first module of efnafraedi-2e ch01 and open the first edit panel. */
async function openFirstEditor(page) {
  await page.goto('/editor');
  await page.waitForLoadState('networkidle');
  await page.locator('#book-select').selectOption('efnafraedi-2e');
  const chapterSelect = page.locator('#chapter-select');
  await expect(chapterSelect).toBeVisible({ timeout: 5000 });
  await expect
    .poll(() => chapterSelect.locator('option').count(), { timeout: 10000 })
    .toBeGreaterThan(1);
  const firstCh = await chapterSelect
    .locator('option:not([value=""])')
    .first()
    .getAttribute('value');
  await chapterSelect.selectOption(firstCh);
  await page.locator('.module-card').first().click();
  await expect(page.locator('.segment-row').first()).toBeVisible({ timeout: 10000 });
  await page.locator('.btn-edit').first().click();
  await expect(page.locator('.edit-panel.active textarea').first()).toBeVisible({ timeout: 5000 });
}

test.describe('B-4 marker overlay', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('opening the editor renders a marker backdrop that tracks input', async ({ page }) => {
    await openFirstEditor(page);
    const ta = page.locator('.edit-panel.active textarea').first();
    const wrap = ta.locator('xpath=ancestor::div[contains(@class,"editor-overlay-wrap")]');
    const backdrop = wrap.locator('.marker-backdrop');
    await expect(backdrop).toHaveCount(1);
    await ta.fill('próf [[MATH:1]] texti');
    await ta.dispatchEvent('input');
    await expect(backdrop.locator('.marker-hl-atom')).toHaveText('[[MATH:1]]');
  });
});

test.describe('B-4 Endurstilla revert button', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('Endurstilla reverts dirty content and keeps the panel open', async ({ page }) => {
    await openFirstEditor(page);
    const panel = page.locator('.edit-panel.active').first();
    const ta = panel.locator('textarea');
    const original = await ta.inputValue();
    await ta.fill(original + ' BREYTING-XYZ');
    await ta.dispatchEvent('input');
    await panel.locator('.btn-revert').click();
    await expect(ta).toHaveValue(original);
    await expect(panel).toBeVisible(); // panel stays open
  });
});

test.describe('B-4 renderMarkdownPreview bracket/brace family', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');
  });

  const render = (page, s) => page.evaluate((x) => window.renderMarkdownPreview(x), s);

  test('renders [[sub:]] and [[sup:]] as sub/sup', async ({ page }) => {
    expect(await render(page, 'H[[sub:2]]O')).toContain('<sub>2</sub>');
    expect(await render(page, 'Ca[[sup:2+]]')).toContain('<sup>2+</sup>');
  });

  test('renders [[i:]] and [[b:]] as em/strong', async ({ page }) => {
    expect(await render(page, '[[i:orð]]')).toContain('<em>orð</em>');
    expect(await render(page, '[[b:orð]]')).toContain('<strong>orð</strong>');
  });

  test('renders [[xref:text|id]] keeping the display text', async ({ page }) => {
    const out = await render(page, '[[xref:Mynd 5.2|CNX_Chem_05_02]]');
    expect(out).toContain('Mynd 5.2');
    expect(out).not.toContain('[[xref:'); // not raw
  });

  test('renders {{term}} and {{fn}} without leaving raw braces', async ({ page }) => {
    expect(await render(page, '{{term}}atóm{{/term}}')).not.toContain('{{term}}');
    expect(await render(page, '{{fn}}nóta{{/fn}}')).not.toContain('{{fn}}');
  });

  test('does not leave a no-text [[xref:id]] raw (ordering safe)', async ({ page }) => {
    const out = await render(page, 'Sjá [[xref:fs-idm222]] hér');
    expect(out).not.toContain('[[xref:fs-idm222]]');
  });

  test('EN pane renders the bracket family (not raw) like the IS pane', async ({ page }) => {
    // load a module without opening the edit panel
    await page.locator('#book-select').selectOption('efnafraedi-2e');
    const chapterSelect = page.locator('#chapter-select');
    await expect(chapterSelect).toBeVisible({ timeout: 5000 });
    await expect
      .poll(() => chapterSelect.locator('option').count(), { timeout: 10000 })
      .toBeGreaterThan(1);
    const firstCh = await chapterSelect
      .locator('option:not([value=""])')
      .first()
      .getAttribute('value');
    await chapterSelect.selectOption(firstCh);
    await page.locator('.module-card').first().click();
    await expect(page.locator('.segment-row').first()).toBeVisible({ timeout: 10000 });
    const joined = (await page.locator('.col-en').allInnerTexts()).join('\n');
    // ch01 EN content contains [[i:]] and [[MATH:]]; after rendering, the raw
    // bracket prefixes must not appear as literal text in the EN column.
    expect(joined).not.toContain('[[i:');
    expect(joined).not.toContain('[[sub:');
  });
});

test.describe('B-4 save-block revert hint', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('corrupting a structural marker shows a block message with a revert hint', async ({
    page,
  }) => {
    // Load m68667 from efnafraedi-2e ch01 — corpus-confirmed to have [[MATH:N]] segments.
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');
    await page.locator('#book-select').selectOption('efnafraedi-2e');
    const chapterSelect = page.locator('#chapter-select');
    await expect(chapterSelect).toBeVisible({ timeout: 5000 });
    await expect
      .poll(() => chapterSelect.locator('option').count(), { timeout: 10000 })
      .toBeGreaterThan(1);
    // ch01 is the first option
    const firstCh = await chapterSelect
      .locator('option:not([value=""])')
      .first()
      .getAttribute('value');
    await chapterSelect.selectOption(firstCh);
    // Open m68667 specifically (has [[MATH:N]] markers)
    await page.locator('.module-card[title^="m68667"]').click();
    await expect(page.locator('.segment-row').first()).toBeVisible({ timeout: 10000 });

    // Find a segment row whose EN cell renders a math placeholder — guaranteed in m68667
    const mathRow = page
      .locator('.segment-row')
      .filter({ has: page.locator('.col-en .math-placeholder') })
      .first();
    await expect(mathRow).toBeVisible({ timeout: 5000 });

    // Open its edit panel
    await mathRow.locator('.btn-edit').click();
    const panel = mathRow.locator('.edit-panel.active');
    await expect(panel.locator('textarea')).toBeVisible({ timeout: 5000 });

    // Replace IS content with text that omits the [[MATH:N]] marker
    const ta = panel.locator('textarea');
    await ta.fill('texti án stærðfræðimerkis');
    await ta.dispatchEvent('input');

    // Capture the dialog BEFORE clicking Vista
    let dialogMessage = '';
    page.once('dialog', async (d) => {
      dialogMessage = d.message();
      await d.accept();
    });
    await panel.locator('.btn-primary').click();

    // The block MUST have fired (m68667 has [[MATH:N]] markers that are required)
    expect(dialogMessage).not.toBe('');
    expect(dialogMessage).toContain('Ekki hægt að vista');
    expect(dialogMessage).toContain('Endurstilla');
  });
});

test.describe('B-1 Icelandic section title in editor header', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('module GET returns the translated section title', async ({ page }) => {
    // m68664 (efnafraedi-2e ch01) has a translated title segment: "Efnafræði í samhengi"
    const res = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68664');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.titleIs).toBe('Efnafræði í samhengi');
  });

  test('editor header shows the Icelandic title, not the module id', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');
    await page.locator('#book-select').selectOption('efnafraedi-2e');
    const chapterSelect = page.locator('#chapter-select');
    await expect(chapterSelect).toBeVisible({ timeout: 5000 });
    await expect
      .poll(() => chapterSelect.locator('option').count(), { timeout: 10000 })
      .toBeGreaterThan(1);
    await chapterSelect.selectOption('1');
    // Open the m68664 module card specifically
    await page.locator('.module-card[onclick*="m68664"]').click();
    await expect(page.locator('#module-title')).toContainText('Efnafræði í samhengi', {
      timeout: 10000,
    });
    await expect(page.locator('#module-title')).not.toContainText('Chemistry in Context');
  });
});

test.describe('O segment propagation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('preview returns occurrences for a recurring objectives intro', async ({ page }) => {
    // m68664 ch01 segment auto-2 is the "By the end of this section…" abstract,
    // which recurs across chapter intro modules.
    const res = await page.request.get(
      '/api/segment-editor/efnafraedi-2e/1/m68664/propagation-preview?segmentId=' +
        encodeURIComponent('m68664:abstract:auto-2')
    );
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('eligible');
    expect(body).toHaveProperty('skipped');
    expect(Array.isArray(body.eligible)).toBe(true);
    // the EN recurs, so at least one occurrence (eligible or skipped) exists
    expect(body.eligible.length + body.skipped.length).toBeGreaterThan(0);
  });
});
