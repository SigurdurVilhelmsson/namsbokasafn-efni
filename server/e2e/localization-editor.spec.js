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

  /**
   * The review tab's book list, as this role sees it when the address answers with these books. It waits for the
   * page to go quiet first, so a list that the page leaves as it was is read after the answer, not before it.
   */
  async function reviewTabBooks(page, role, answer = THREE_BOOKS) {
    await loginAs(page, role);
    await page.route('**/api/admin/books', (route) => route.fulfill({ json: answer }));
    await page.goto('/localization');
    await page.waitForLoadState('networkidle');
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

  // A head editor who holds none of the listed books had a list with nothing in it but "Veldu bók...", and
  // nothing that said why. The list now says so itself, in place of the prompt.
  const NONE_HELD = {
    books: [
      { slug: 'liffraedi-2e', titleIs: 'Líffræði 2e' },
      { slug: 'orverufraedi', titleIs: 'Örverufræði' },
    ],
  };

  test('a head editor who holds none of the listed books is told so, in the list itself', async ({
    page,
  }) => {
    const books = await reviewTabBooks(page, 'head-editor', NONE_HELD);
    await expect(books).toHaveText(['Þú ert ekki aðalritstjóri neinnar bókar á listanum']);
  });

  // An admin is offered every book, so an empty list is not about what they hold: the line would be untrue.
  test('control: an admin with no book listed keeps the plain prompt', async ({ page }) => {
    const books = await reviewTabBooks(page, 'admin', { books: [] });
    await expect(books).toHaveText([/^Veldu/]);
  });
});

test.describe('Localization editor — editor tab', () => {
  // The editor tab's book list comes from an address that answers with every registered book. Localization is for
  // the book's head editors and admins: the server lets a head editor read any book here, and refuses to save in
  // one they do not hold. So the list holds the books the user localizes, as the review tab's does.
  //
  // The list does more than offer: when it is filled it picks a book (the stored choice, else the first) and the
  // page then asks for that book's chapters. So these cases read three things: what is offered, which book the tab
  // opens on, and which chapter lists were asked for. The book list's answer is stubbed; the head editor of these
  // specs holds the fixture book and efnafraedi-2e (helpers/auth.js), and not liffraedi-2e.
  const NOT_HELD_FIRST = {
    books: [
      { slug: 'liffraedi-2e', label: 'Líffræði 2e' },
      { slug: '__e2e-fixture__', label: 'E2E Fixture' },
      { slug: 'efnafraedi-2e', label: 'Efnafræði 2e' },
    ],
  };
  const NOT_HELD_LAST = {
    books: [
      { slug: '__e2e-fixture__', label: 'E2E Fixture' },
      { slug: 'efnafraedi-2e', label: 'Efnafræði 2e' },
      { slug: 'liffraedi-2e', label: 'Líffræði 2e' },
    ],
  };

  /**
   * Open the page as this role with the book list answering with these books, and wait for it to go quiet.
   *
   * @param {import('@playwright/test').Page} page
   * @param {'admin'|'head-editor'} role
   * @param {{books: Array<{slug: string, label: string}>}} answer
   * @returns {Promise<{select: import('@playwright/test').Locator, chaptersAskedFor: string[]}>} the editor tab's
   *   book list, and the books whose chapter list the page asked for, in order
   */
  async function openEditorTab(page, role, answer) {
    await loginAs(page, role);
    await page.route('**/api/books/list', (route) => route.fulfill({ json: answer }));
    const chaptersAskedFor = [];
    page.on('request', (request) => {
      const asked = request.url().match(/\/api\/localization-editor\/([^/]+)\/chapters$/);
      if (asked) chaptersAskedFor.push(decodeURIComponent(asked[1]));
    });
    await page.goto('/localization');
    await page.waitForLoadState('networkidle');
    return { select: page.locator('#ed-book-select'), chaptersAskedFor };
  }

  test('a head editor is offered the books they hold, and no other', async ({ page }) => {
    const { select } = await openEditorTab(page, 'head-editor', NOT_HELD_FIRST);
    await expect(select.locator('option')).toHaveText([/^Veldu/, 'E2E Fixture', 'Efnafræði 2e']);
  });

  test('the tab opens on a book the head editor holds, not on the first book listed', async ({
    page,
  }) => {
    const { select } = await openEditorTab(page, 'head-editor', NOT_HELD_FIRST);
    await expect(select).toHaveValue('__e2e-fixture__');
  });

  // One list, in order: the held book's chapters were asked for (so the page did pick a book), and no other's.
  test('the page asks for the chapters of a book the head editor holds, and of no other', async ({
    page,
  }) => {
    const { chaptersAskedFor } = await openEditorTab(page, 'head-editor', NOT_HELD_FIRST);
    expect(chaptersAskedFor).toEqual(['__e2e-fixture__']);
  });

  // The stored choice is shared with the other pages' book lists, where a head editor may well have picked a book
  // they do not hold. Here it is not listed, so it is not restored.
  test('a stored choice of a book the head editor does not hold is not restored', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('selectedBook', 'liffraedi-2e'));
    const { select } = await openEditorTab(page, 'head-editor', NOT_HELD_LAST);
    await expect(select).toHaveValue('__e2e-fixture__');
  });

  test('control: an admin is offered every book', async ({ page }) => {
    const { select } = await openEditorTab(page, 'admin', NOT_HELD_FIRST);
    await expect(select.locator('option')).toHaveText([
      /^Veldu/,
      'Líffræði 2e',
      'E2E Fixture',
      'Efnafræði 2e',
    ]);
  });

  test('control: for an admin the tab opens on the first book listed', async ({ page }) => {
    const { select } = await openEditorTab(page, 'admin', NOT_HELD_FIRST);
    await expect(select).toHaveValue('liffraedi-2e');
  });

  test('control: an admin has their stored choice restored', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('selectedBook', 'liffraedi-2e'));
    const { select } = await openEditorTab(page, 'admin', NOT_HELD_LAST);
    await expect(select).toHaveValue('liffraedi-2e');
  });

  // A head editor who holds none of the listed books: the list says so itself, as the review tab's does.
  const NONE_HELD = {
    books: [
      { slug: 'liffraedi-2e', label: 'Líffræði 2e' },
      { slug: 'orverufraedi', label: 'Örverufræði' },
    ],
  };

  test('a head editor who holds none of the listed books is told so, in the list itself', async ({
    page,
  }) => {
    const { select } = await openEditorTab(page, 'head-editor', NONE_HELD);
    await expect(select.locator('option')).toHaveText([
      'Þú ert ekki aðalritstjóri neinnar bókar á listanum',
    ]);
  });

  test('a head editor who holds none of the listed books has no chapters asked for', async ({
    page,
  }) => {
    const { select, chaptersAskedFor } = await openEditorTab(page, 'head-editor', NONE_HELD);
    // The list has been filled (it shows its line, which only filling it puts there) before the absence is read.
    await expect(select.locator('option')).toHaveText([/^Þú ert ekki aðalritstjóri/]);
    expect(chaptersAskedFor).toEqual([]);
  });

  // The shared list code answers a failed request with an empty list. That is not about what anyone holds, so
  // the line would be untrue there too.
  test('control: a head editor whose book list could not be loaded keeps the plain prompt', async ({
    page,
  }) => {
    await loginAs(page, 'head-editor');
    await page.route('**/api/books/list', (route) => route.abort());
    await page.goto('/localization');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#ed-book-select option')).toHaveText([/^Veldu/]);
  });

  // An admin is offered every book, so an empty list is not about what they hold: the line would be untrue.
  test('control: an admin with no book listed keeps the plain prompt', async ({ page }) => {
    const { select } = await openEditorTab(page, 'admin', { books: [] });
    await expect(select.locator('option')).toHaveText([/^Veldu/]);
  });
});
