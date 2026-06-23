// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Smoke tests — verify every page loads without JS errors.
 *
 * Each test:
 * 1. Navigates to a route
 * 2. Asserts no uncaught JS exceptions (catches CSP violations, undefined functions)
 * 3. Asserts a key heading or element is present
 *
 * Note: We listen for `pageerror` (uncaught exceptions) rather than `console.error`
 * because the browser logs "Failed to load resource" as a console error whenever
 * an API returns 4xx, which is expected for test users with no real data.
 */

// ─── Public pages (no auth required) ──────────────────────────

test.describe('Public pages', () => {
  test('login page loads', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/login');
    await expect(page.locator('h1')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('feedback page loads', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/feedback');
    await expect(page.locator('main.page-content, .app-layout')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('404 page returns 404 status', async ({ page }) => {
    const response = await page.goto('/nonexistent-page-xyz');
    expect(response?.status()).toBe(404);
  });
});

// ─── Authenticated pages ──────────────────────────────────────

test.describe('Authenticated pages (admin)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('home (my-work) loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page.locator('.app-layout')).toBeVisible();
    await expect(page.locator('#app-sidebar')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('progress page loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/progress');
    await expect(page.locator('.app-layout')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('terminology page loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/terminology');
    await expect(page.locator('.app-layout')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('editor page loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/editor');
    await expect(page.locator('.app-layout')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('library page loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/library');
    await expect(page.locator('.app-layout')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('library has no retired images feature (item M)', async ({ page }) => {
    // The /api/images endpoints were removed in the 2026-03-24 refocus; the
    // dead "Myndir" tab fired GET /api/images/<book> → 404 + toast. The whole
    // feature was removed — assert it's gone and never requests /api/images.
    const imageRequests = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/images')) imageRequests.push(req.url());
    });

    await page.goto('/library');
    await expect(page.locator('.app-layout')).toBeVisible();

    // No images tab / view remain
    await expect(page.locator('.library-tab[data-view="images"]')).toHaveCount(0);
    await expect(page.locator('#view-images')).toHaveCount(0);

    // Exercise the still-present tabs; none should hit /api/images
    await page.locator('.library-tab[data-view="chapter"]').click();
    await page.locator('.library-tab[data-view="books"]').click();
    await page.waitForTimeout(300);
    expect(imageRequests).toEqual([]);
  });

  test('reviews redirects to editor', async ({ page }) => {
    await page.goto('/reviews');
    await expect(page).toHaveURL(/\/editor/);
  });

  test('localization page loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/localization');
    await expect(page.locator('.app-layout')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('admin page loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/admin');
    await expect(page.locator('.app-layout')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('buildEmptyTaskMessage is queue-aware (B-2)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const fn = (args) => window.buildEmptyTaskMessage(args.r, args.p, args.k);

    const reviewerPending = await page.evaluate(fn, { r: true, p: 14, k: 0 });
    expect(reviewerPending.heading).toBe('Engin ritstjórnarverkefni í dag');
    expect(reviewerPending.body).toContain('14');
    expect(reviewerPending.body).toContain('úrskurðar');
    expect(reviewerPending.actionHref).toBe('/editor?view=reviews');

    const reviewerReady = await page.evaluate(fn, { r: true, p: 0, k: 3 });
    expect(reviewerReady.body).toContain('birtingar');
    expect(reviewerReady.actionHref).toBe('/editor?view=reviews');

    const reviewerIdle = await page.evaluate(fn, { r: true, p: 0, k: 0 });
    expect(reviewerIdle.heading).toBe('Ekkert verkefni í dag!');
    expect(reviewerIdle.actionHref).toBeUndefined();

    const editor = await page.evaluate(fn, { r: false, p: 0, k: 0 });
    expect(editor.heading).toBe('Ekkert verkefni í dag!');

    const singular = await page.evaluate(fn, { r: true, p: 1, k: 0 });
    expect(singular.body).toContain('1 breyting bíður');
  });
});

// ─── Layout shell ─────────────────────────────────────────────

test.describe('Layout shell', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('sidebar shows admin section for admin users', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#sidebar-section-admin')).toBeVisible({ timeout: 5000 });
  });

  test('sidebar shows review section for admin users', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#sidebar-section-review')).toBeVisible({ timeout: 5000 });
  });

  test('topbar shows user info', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#user-info')).not.toBeEmpty({ timeout: 5000 });
  });

  test('theme toggle works', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const toggleBtn = page.locator('.theme-toggle').first();
    await expect(toggleBtn).toBeVisible();

    // Get initial theme
    const htmlEl = page.locator('html');
    const initialTheme = await htmlEl.getAttribute('data-theme');

    // Click toggle
    await toggleBtn.click();

    // Wait for theme to apply
    await page.waitForTimeout(200);

    // Theme should change
    const newTheme = await htmlEl.getAttribute('data-theme');
    expect(newTheme).not.toBe(initialTheme);
  });
});

// ─── Logout (item K) ─────────────────────────────────────────

test.describe('Logout (item K)', () => {
  test('logout button logs the user out and returns to /login', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/');
    await expect(page.locator('.app-layout')).toBeVisible();

    const logoutBtn = page.locator('#logout-btn');
    await expect(logoutBtn).toBeVisible({ timeout: 5000 });

    await logoutBtn.click();
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });

    // Cookie cleared → a gated page bounces back to login
    await page.goto('/editor');
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('logged-out topbar shows no logout button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#logout-btn')).toHaveCount(0);
  });
});

// ─── Legacy redirects ─────────────────────────────────────────

test.describe('Legacy redirects', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('/my-work redirects to /', async ({ page }) => {
    await page.goto('/my-work');
    expect(page.url()).toMatch(/\/$/);
  });

  test('/status redirects to /progress', async ({ page }) => {
    await page.goto('/status');
    expect(page.url()).toContain('/progress');
  });

  test('/books redirects to /library', async ({ page }) => {
    await page.goto('/books');
    expect(page.url()).toContain('/library');
  });
});

// ─── B-3 ready-to-publish label ───────────────────────────────

test.describe('B-3 ready-to-publish label', () => {
  test('quick-stat label is clarified with a tooltip', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const statItem = page.locator('#quick-stats .quick-stat-item:nth-child(2)');
    await expect(statItem.locator('.quick-stat-label')).toHaveText('Samþykkt, bíður birtingar', {
      timeout: 5000,
    });
    await expect(statItem).toHaveAttribute('title', /beita og birta/);
  });
});
