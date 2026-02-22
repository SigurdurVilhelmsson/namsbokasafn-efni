// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * CSP violation tests — detect Content Security Policy violations
 * that would silently break features in the browser.
 *
 * These tests listen for `securitypolicyviolation` events via
 * page.evaluate() and fail if any are detected.
 */

/**
 * Install a CSP violation listener on the page.
 * Returns a function to retrieve collected violations.
 */
async function collectCSPViolations(page) {
  await page.evaluate(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push({
        directive: e.violatedDirective,
        blocked: e.blockedURI,
        source: e.sourceFile,
        line: e.lineNumber,
      });
    });
  });
}

async function getCSPViolations(page) {
  return page.evaluate(() => window.__cspViolations || []);
}

// ─── CSP tests per page ───────────────────────────────────────

test.describe('CSP compliance', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  const authenticatedPages = [
    { path: '/', name: 'home' },
    { path: '/progress', name: 'progress' },
    { path: '/terminology', name: 'terminology' },
    { path: '/editor', name: 'editor' },
    { path: '/library', name: 'library' },
    { path: '/reviews', name: 'reviews' },
    { path: '/localization', name: 'localization' },
    { path: '/admin', name: 'admin' },
  ];

  for (const { path, name } of authenticatedPages) {
    test(`${name} page has no CSP violations`, async ({ page }) => {
      await page.goto(path);
      await collectCSPViolations(page);

      // Wait for page scripts to execute
      await page.waitForTimeout(1000);

      const violations = await getCSPViolations(page);
      if (violations.length > 0) {
        console.error(`CSP violations on ${path}:`, JSON.stringify(violations, null, 2));
      }
      expect(violations).toEqual([]);
    });
  }

  test('login page has no CSP violations', async ({ page }) => {
    // Login page doesn't need auth
    await page.goto('/login');
    await collectCSPViolations(page);
    await page.waitForTimeout(1000);

    const violations = await getCSPViolations(page);
    expect(violations).toEqual([]);
  });

  test('feedback page has no CSP violations', async ({ page }) => {
    await page.goto('/feedback');
    await collectCSPViolations(page);
    await page.waitForTimeout(1000);

    const violations = await getCSPViolations(page);
    expect(violations).toEqual([]);
  });
});

// ─── Inline handler execution tests ──────────────────────────

test.describe('Inline handlers execute', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('onclick handler on admin page executes without error', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/admin');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // The admin page has tab buttons with onclick handlers.
    // Click the first tab button to verify inline handlers work.
    const tabButton = page.locator('[onclick*="showTab"], [onclick*="switchTab"]').first();
    if (await tabButton.isVisible()) {
      await tabButton.click();
      // If CSP blocked the inline handler, we'd get a pageerror
      expect(errors).toEqual([]);
    }
  });

  test('theme toggle button works (uses addEventListener, not inline)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const toggle = page.locator('.theme-toggle').first();
    await toggle.click();

    expect(errors).toEqual([]);
  });
});
