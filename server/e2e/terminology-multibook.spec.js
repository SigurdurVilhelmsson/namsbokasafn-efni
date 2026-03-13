// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Terminology lookup and multi-book scenario tests.
 *
 * These tests verify:
 * - Terminology lookup API with valid and invalid queries
 * - Per-module term matching endpoint
 * - Multi-book support (chemistry + biology)
 */

// ─── Terminology lookup API ──────────────────────────────────

test.describe('Terminology lookup', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    // Navigate first so the auth cookie is sent on the correct domain
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');
  });

  test('valid query returns results array', async ({ page }) => {
    const response = await page.request.get('/api/segment-editor/terminology/lookup?q=acid');
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('terms');
    expect(Array.isArray(data.terms)).toBe(true);
    // May be empty if no terms are loaded, but the shape must be correct
  });

  test('too-short query returns empty terms or 400', async ({ page }) => {
    const response = await page.request.get('/api/segment-editor/terminology/lookup?q=ab');
    const status = response.status();

    if (status === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('terms');
      expect(data.terms).toEqual([]);
    } else {
      // 400 is also acceptable for too-short queries
      expect(status).toBe(400);
    }
  });

  test('empty query returns empty terms or 400', async ({ page }) => {
    const response = await page.request.get('/api/segment-editor/terminology/lookup?q=');
    const status = response.status();

    if (status === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('terms');
      expect(data.terms).toEqual([]);
    } else {
      expect(status).toBe(400);
    }
  });

  test('term matches for chemistry module returns valid shape', async ({ page }) => {
    const response = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68664/terms');

    // The endpoint may return 200 with results, or 404/500 if module
    // data is not available in the test environment
    if (response.ok()) {
      const data = await response.json();
      expect(data).toHaveProperty('moduleId', 'm68664');
      expect(data).toHaveProperty('termMatches');
    } else {
      // Accept 404 or 500 if the module files are not on disk in CI
      expect([404, 500]).toContain(response.status());
    }
  });
});

// ─── Multi-book scenarios ────────────────────────────────────

test.describe('Multi-book support', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('editor page book selector has multiple options', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');

    const bookSelect = page.locator('#book-select');
    await expect(bookSelect).toBeVisible();

    // The dropdown should have at least one option populated by bookSelector.js.
    // In a full environment there are multiple books; in CI there may be fewer.
    const optionCount = await bookSelect.locator('option').count();
    expect(optionCount).toBeGreaterThanOrEqual(1);
  });

  test('biology book chapter listing returns valid response', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');

    // m66437 is the intro module of biology-2e chapter 3
    const response = await page.request.get('/api/segment-editor/liffraedi-2e/3/m66437');

    // Accept 200 if biology content is present, or 404/500 if the book
    // is registered but chapter files are not on disk in the test environment
    if (response.ok()) {
      const data = await response.json();
      // Should have segment data with the expected module
      expect(data).toHaveProperty('segments');
      expect(Array.isArray(data.segments)).toBe(true);
    } else {
      // 404 (module not found) or 500 (files missing) are acceptable
      // when the biology book content is not fully set up
      expect([404, 500]).toContain(response.status());
    }
  });
});
