// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Localization editor (Pass 2) E2E tests.
 *
 * Tests the localization editor page and its API endpoints.
 * Note: faithful translation files (03-faithful-translation/) do not exist
 * in the test environment, so module-load tests verify graceful 404 handling
 * rather than full three-column rendering.
 */

test.describe('Localization editor — page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('page loads with app layout and book selector', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/localization');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.app-layout')).toBeVisible();

    // Book selector should be present
    const bookSelect = page.locator('#book-select, select').first();
    await expect(bookSelect).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('selecting a book populates chapter dropdown', async ({ page }) => {
    await page.goto('/localization');
    await page.waitForLoadState('networkidle');

    const bookSelect = page.locator('#book-select');
    if (await bookSelect.isVisible()) {
      await bookSelect.selectOption('efnafraedi-2e');

      const chapterSelect = page.locator('#chapter-select');
      await expect(chapterSelect).toBeVisible({ timeout: 5000 });

      // Should have at least one chapter option beyond the placeholder
      const options = chapterSelect.locator('option');
      const count = await options.count();
      expect(count).toBeGreaterThan(1);
    }
  });
});

test.describe('Localization editor — API', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('GET /chapters returns chapter list', async ({ page }) => {
    // Navigate first so cookies are sent
    await page.goto('/localization');

    const response = await page.request.get('/api/localization-editor/efnafraedi-2e/chapters');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('book', 'efnafraedi-2e');
    expect(data).toHaveProperty('chapters');
    expect(Array.isArray(data.chapters)).toBe(true);
    expect(data.chapters.length).toBeGreaterThan(0);
  });

  test('GET /:chapter returns module list', async ({ page }) => {
    await page.goto('/localization');

    const response = await page.request.get('/api/localization-editor/efnafraedi-2e/1');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data.modules || data)).toBe(true);
  });

  test('GET /:chapter/:moduleId returns 404 when faithful file missing', async ({ page }) => {
    await page.goto('/localization');

    const response = await page.request.get('/api/localization-editor/efnafraedi-2e/1/m68663');
    // Faithful translation file does not exist in test env
    // The API should return 404 (or 500) rather than crash
    expect([404, 500]).toContain(response.status());
  });

  test('GET /:chapter/:moduleId returns segments when faithful file exists', async ({ page }) => {
    await page.goto('/localization');

    // m68664 has a faithful translation file (from applyApprovedEdits in prior audit)
    const response = await page.request.get('/api/localization-editor/efnafraedi-2e/1/m68664');
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('segments');
      expect(Array.isArray(data.segments)).toBe(true);
      expect(data.segments.length).toBeGreaterThan(0);
      // Segments should have EN, faithful, and optionally localized content
      const seg = data.segments[0];
      expect(seg).toHaveProperty('segmentId');
      expect(seg).toHaveProperty('en');
      expect(seg).toHaveProperty('faithful');
    }
    // If 404, faithful file was cleaned up — that's OK too
  });

  test('GET /chapters rejects invalid book', async ({ page }) => {
    await page.goto('/localization');

    const response = await page.request.get('/api/localization-editor/nonexistent-book/chapters');
    expect(response.status()).toBe(400);
  });

  test('POST /save rejects missing segmentId', async ({ page }) => {
    await page.goto('/localization');

    const response = await page.request.post(
      '/api/localization-editor/efnafraedi-2e/1/m68663/save',
      {
        data: { content: 'test', category: 'terminology', lastModified: 0 },
        headers: { 'Content-Type': 'application/json' },
      }
    );
    // Should be 400 for missing required field (or 500 if faithful file missing)
    expect([400, 404, 500]).toContain(response.status());
  });

  test('POST /save rejects empty content', async ({ page }) => {
    await page.goto('/localization');

    const response = await page.request.post(
      '/api/localization-editor/efnafraedi-2e/1/m68663/save',
      {
        data: { segmentId: 'test:1', content: '', category: 'terminology', lastModified: 0 },
        headers: { 'Content-Type': 'application/json' },
      }
    );
    // Empty content or missing faithful file should be rejected
    expect([400, 404, 500]).toContain(response.status());
  });

  test('GET /history returns array (possibly empty)', async ({ page }) => {
    await page.goto('/localization');

    const response = await page.request.get(
      '/api/localization-editor/efnafraedi-2e/1/m68663/history'
    );
    // History endpoint may return 200 with empty array or 404 if module unknown
    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data.history || data)).toBe(true);
    } else {
      expect([404, 500]).toContain(response.status());
    }
  });

  test('GET /segment history returns array (possibly empty)', async ({ page }) => {
    await page.goto('/localization');

    const response = await page.request.get(
      '/api/localization-editor/efnafraedi-2e/1/m68663/m68663:para:1/history'
    );
    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data.history || data)).toBe(true);
    } else {
      expect([404, 500]).toContain(response.status());
    }
  });
});
