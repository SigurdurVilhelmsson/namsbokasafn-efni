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

  test('reviews page loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/reviews');
    await expect(page.locator('.app-layout')).toBeVisible();
    expect(errors).toEqual([]);
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
