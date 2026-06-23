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
