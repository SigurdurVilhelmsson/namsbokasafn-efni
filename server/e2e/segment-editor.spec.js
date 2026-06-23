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
