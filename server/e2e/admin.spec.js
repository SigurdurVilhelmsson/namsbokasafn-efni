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
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

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
