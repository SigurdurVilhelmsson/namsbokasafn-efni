// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Admin panel workflow tests.
 *
 * Tests the admin interface:
 * - Page loads with tab navigation
 * - Users tab shows user table
 * - Role-based access (viewer can't see admin content)
 */

test.describe('Admin panel', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('admin page loads with tabs', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Should have tab navigation (admin uses .tab buttons with data-tab)
    const tabs = page.locator('button.tab[data-tab]');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });

  test('users tab loads user list', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Click users tab if not already active
    const usersTab = page.locator('button.tab[data-tab="users"]').first();
    if (await usersTab.isVisible()) {
      await usersTab.click();
    }

    // Wait for user data to load
    await page.waitForTimeout(2000);

    // Should have a users table or empty state
    const usersContent = page.locator('#tab-users, .users-table, .empty-state').first();
    await expect(usersContent).toBeVisible({ timeout: 5000 });
  });

  test('search/filter input works without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Look for search/filter input
    const searchInput = page
      .locator(
        '#users-search, input[placeholder*="Leita"], input[oninput*="filter"], input[oninput*="Filter"]'
      )
      .first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      // Should not throw
      expect(errors).toEqual([]);
    }
  });

  test('catalogue API returns 200 (verifies migration 014)', async ({ page }) => {
    const response = await page.request.get('/api/admin/catalogue');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.books)).toBe(true);
  });
});

// ─── Role-based visibility ────────────────────────────────────

test.describe('Role-based visibility', () => {
  test('admin sidebar sections visible for admin', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Admin section should be visible
    await expect(page.locator('#sidebar-section-admin')).toBeVisible({ timeout: 5000 });
    // Review section should be visible
    await expect(page.locator('#sidebar-section-review')).toBeVisible({ timeout: 5000 });
  });

  test('admin sidebar sections hidden for viewer', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Give layout.js time to apply roles
    await page.waitForTimeout(2000);

    // Admin section should be hidden
    await expect(page.locator('#sidebar-section-admin')).not.toBeVisible();
  });

  test('admin-only buttons hidden for non-admin', async ({ page }) => {
    await loginAs(page, 'editor');
    await page.goto('/library');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Register button should not be visible for editors
    const registerBtn = page.locator('#register-btn');
    if ((await registerBtn.count()) > 0) {
      await expect(registerBtn).not.toBeVisible();
    }
  });

  test('admin-only buttons visible for admin', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/library');
    await page.waitForLoadState('networkidle');

    // Wait for role visibility to be applied
    await page.waitForTimeout(2000);

    // Register button should be visible for admin
    const registerBtn = page.locator('#register-btn');
    if ((await registerBtn.count()) > 0) {
      await expect(registerBtn).toBeVisible({ timeout: 5000 });
    }
  });
});

/**
 * §C210: a link that leads to /admin is shown only to admins.
 *
 * `/admin` is `requirePageAuth(ROLES.ADMIN)` (server/routes/views.js), so a head
 * editor who followed the sidebar's "Stjórnandi" link, or the feedback page's
 * "Stjórnborð endurgjafar" button (/admin/feedback → /admin?tab=feedback), was
 * bounced to `/`. Both links were shown to head editors.
 *
 * ⚠️ Every hidden-link check first WAITS FOR A POSITIVE SIGNAL that layout.js has
 * applied the role (the Stjórnun section becoming visible). The section starts
 * hidden for everyone, so a bare `not.toBeVisible()` would pass before any role
 * logic ran, and prove nothing.
 */
test.describe('§C210: links to /admin are for admins only', () => {
  const ADMIN_SECTION = '#sidebar-section-admin';
  const ADMIN_LINK = `${ADMIN_SECTION} a[href="/admin"]`;
  const LIBRARY_LINK = `${ADMIN_SECTION} a[href="/library"]`;

  test('premise: /admin bounces a head editor to /', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/$/);
  });

  test('a head editor sees the Stjórnun section but not the Stjórnandi link', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await page.goto('/');
    await expect(page.locator(ADMIN_SECTION)).toBeVisible({ timeout: 10000 }); // roles applied
    await expect(page.locator(LIBRARY_LINK)).toBeVisible(); // its siblings still show
    await expect(page.locator(ADMIN_LINK)).toBeHidden();
  });

  test('an admin sees the Stjórnandi link', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/');
    await expect(page.locator(ADMIN_SECTION)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(ADMIN_LINK)).toBeVisible();
  });

  test('an admin previewing as head editor does not see the Stjórnandi link', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('rolePreviewOverride', 'head-editor'));
    await loginAs(page, 'admin');
    await page.goto('/');
    await expect(page.locator(ADMIN_SECTION)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(LIBRARY_LINK)).toBeVisible();
    await expect(page.locator(ADMIN_LINK)).toBeHidden();
  });

  test('the feedback page hides its admin button from a head editor', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await page.goto('/feedback');
    await expect(page.locator(ADMIN_SECTION)).toBeVisible({ timeout: 10000 }); // roles applied
    await expect(page.locator('#admin-link')).toBeHidden();
  });

  test('the feedback page shows its admin button to an admin', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/feedback');
    await expect(page.locator(ADMIN_SECTION)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#admin-link')).toBeVisible();
  });
});
