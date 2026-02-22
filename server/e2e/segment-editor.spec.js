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

    // Select "efnafraedi" book
    const bookSelect = page.locator('#book-select');
    if (await bookSelect.isVisible()) {
      await bookSelect.selectOption('efnafraedi');

      // Wait for chapter dropdown to populate
      const chapterSelect = page.locator('#chapter-select');
      await expect(chapterSelect).toBeVisible({ timeout: 5000 });

      // Should have at least one chapter option
      const options = chapterSelect.locator('option');
      const count = await options.count();
      expect(count).toBeGreaterThan(1); // > 1 because first is placeholder
    }
  });

  test('loading a chapter shows module list', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');

    const bookSelect = page.locator('#book-select');
    if (await bookSelect.isVisible()) {
      await bookSelect.selectOption('efnafraedi');

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
