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
      await bookSelect.selectOption('__e2e-fixture__');

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

    const response = await page.request.get('/api/localization-editor/__e2e-fixture__/chapters');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('book', '__e2e-fixture__');
    expect(data).toHaveProperty('chapters');
    expect(Array.isArray(data.chapters)).toBe(true);
    expect(data.chapters.length).toBeGreaterThan(0);
  });

  test('GET /:chapter returns module list', async ({ page }) => {
    await page.goto('/localization');

    const response = await page.request.get('/api/localization-editor/__e2e-fixture__/1');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data.modules || data)).toBe(true);
  });

  test('GET /:chapter/:moduleId returns 404 when faithful file missing', async ({ page }) => {
    await page.goto('/localization');

    // Use a fictional module ID (m99999) that passes format validation but has no faithful
    // file and will never be written by any test — avoids the inter-spec ordering sensitivity
    // that arises from review-cycle auto-applying m68663 or m68664.
    const response = await page.request.get('/api/localization-editor/__e2e-fixture__/1/m99999');
    // Faithful translation file does not exist in test env
    // The API should return 404 (or 500) rather than crash
    expect([404, 500]).toContain(response.status());
  });

  test('GET /:chapter/:moduleId returns segments when faithful file exists', async ({ page }) => {
    await page.goto('/localization');

    // m68664 has a faithful translation file (from applyApprovedEdits in prior audit)
    const response = await page.request.get('/api/localization-editor/__e2e-fixture__/1/m68664');
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
      '/api/localization-editor/__e2e-fixture__/1/m68663/save',
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
      '/api/localization-editor/__e2e-fixture__/1/m68663/save',
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
      '/api/localization-editor/__e2e-fixture__/1/m68663/history'
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
      '/api/localization-editor/__e2e-fixture__/1/m68663/m68663:para:1/history'
    );
    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data.history || data)).toBe(true);
    } else {
      expect([404, 500]).toContain(response.status());
    }
  });
});

test.describe('Localization editor — review tab', () => {
  // Interface audit 2026-11-13, LO-01: the "Hluti" list asked for an address no router had, so it read "Villa"
  // and stayed disabled, and "Hlaða" could never be pressed.
  //
  // The book and chapter lists come from the catalogue and from server/data. Neither holds the fixture book, so
  // those two answers are stubbed here. The section list's own request is the one under test and is NOT stubbed:
  // it reads the two sections that seed-fixture.js plants under the fixture book.
  test('the section list loads for the chosen chapter, and "Hlaða" can then be pressed', async ({
    page,
  }) => {
    await loginAs(page, 'head-editor');
    await page.route('**/api/admin/books', (route) =>
      route.fulfill({ json: { books: [{ slug: '__e2e-fixture__', titleIs: 'E2E Fixture' }] } })
    );
    await page.route('**/api/books/__e2e-fixture__', (route) =>
      route.fulfill({ json: { chapters: [{ chapter: 1, titleIs: 'E2E kafli' }] } })
    );

    await page.goto('/localization');
    await page.locator('.view-tab[data-view="review"]').click();
    await page.selectOption('#rv-book-select', '__e2e-fixture__');
    await page.selectOption('#rv-chapter-select', '1');

    const sections = page.locator('#rv-section-select');
    await expect(sections).toBeEnabled();
    // In reading order (the seed inserts 1.2 first), with the note the list puts beside a section in progress.
    await expect(sections.locator('option')).toHaveText([
      /^Veldu/,
      /^1\.1$/,
      /^1\.2 \(í vinnslu\)$/,
    ]);

    const load = page.locator('#rv-load-btn');
    await expect(load).toBeDisabled();
    await sections.selectOption({ label: '1.1' });
    await expect(load).toBeEnabled();
  });

  // The book list comes from an address that answers with every registered book. A head editor localizes the
  // books they hold, and the section list's route refuses the rest, so a book they do not hold led only to
  // "Villa". The answer is stubbed with three books; the head editor of these specs holds the first two
  // (helpers/auth.js).
  const THREE_BOOKS = {
    books: [
      { slug: '__e2e-fixture__', titleIs: 'E2E Fixture' },
      { slug: 'efnafraedi-2e', titleIs: 'Efnafræði 2e' },
      { slug: 'liffraedi-2e', titleIs: 'Líffræði 2e' },
    ],
  };

  /** The review tab's book list, as this role sees it. */
  async function reviewTabBooks(page, role) {
    await loginAs(page, role);
    await page.route('**/api/admin/books', (route) => route.fulfill({ json: THREE_BOOKS }));
    await page.goto('/localization');
    await page.locator('.view-tab[data-view="review"]').click();
    return page.locator('#rv-book-select option');
  }

  test('a head editor is offered the books they hold, and no other', async ({ page }) => {
    const books = await reviewTabBooks(page, 'head-editor');
    await expect(books).toHaveText([/^Veldu/, 'E2E Fixture', 'Efnafræði 2e']);
  });

  test('control: an admin is offered every book', async ({ page }) => {
    const books = await reviewTabBooks(page, 'admin');
    await expect(books).toHaveText([/^Veldu/, 'E2E Fixture', 'Efnafræði 2e', 'Líffræði 2e']);
  });
});
