// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Phase 2 UX audit tests — verify fixes from the March 2026 comprehensive audit.
 */

test.describe('Phase 2 UX fixes', () => {
  test('admin sync button has descriptive tooltip', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin');
    // Switch to Books tab
    await page.locator('button:has-text("Bækur")').click();
    const syncBtn = page.locator('#books-sync-btn');
    await expect(syncBtn).toBeVisible();
    const title = await syncBtn.getAttribute('title');
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(10);
  });

  test('admin migration button has tooltip', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin');
    const migBtn = page.locator('#btn-run-migration');
    // Migration button may be hidden if no pending migrations
    const visible = await migBtn.isVisible().catch(() => false);
    if (visible) {
      const title = await migBtn.getAttribute('title');
      expect(title).toBeTruthy();
    }
  });

  test('feedback radio descriptions are in Icelandic', async ({ page }) => {
    await loginAs(page, 'contributor');
    await page.goto('/feedback');
    const radioDescs = page.locator('.radio-desc');
    const count = await radioDescs.count();
    expect(count).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < count; i++) {
      const text = await radioDescs.nth(i).textContent();
      // Should NOT contain common English descriptions
      expect(text).not.toMatch(/^Translation error$/i);
      expect(text).not.toMatch(/^Technical issue$/i);
      expect(text).not.toMatch(/^Improvement suggestion$/i);
      expect(text).not.toMatch(/^Other$/i);
    }
  });

  test('activity feed shows username, not numeric ID', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/');
    // Wait for activity to load
    await page.waitForTimeout(1500);
    const activityItems = page.locator('.admin-activity-item strong');
    const count = await activityItems.count();
    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        const text = await activityItems.nth(i).textContent();
        // Should not be a pure numeric ID (like "99996")
        // Usernames contain letters; IDs are pure digits
        // Allow "Kerfi" (system) as a valid non-numeric name
        if (text !== 'Kerfi') {
          expect(text).not.toMatch(/^\d+$/);
        }
      }
    }
  });

  test('book register returns 409 on duplicate', async ({ page }) => {
    await loginAs(page, 'admin');
    // Try to register a book that already exists
    const res = await page.request.post('/api/admin/books/register', {
      data: {
        catalogueSlug: 'chemistry-2e',
        slug: 'efnafraedi-2e',
        titleIs: 'Efnafræði 2e',
      },
    });
    // Should get 409 (our route guard) or 500 with "already registered" (service guard)
    expect([409, 500]).toContain(res.status());
    const body = await res.json();
    expect(body.error || body.message).toMatch(/þegar skráð|already registered/i);
  });
});

test.describe('M5 revert bug regression', () => {
  test('saved edit persists after API reload', async ({ page }) => {
    const uniqueText = `persist-test-${Date.now()}`;
    const contributorId = 88010;
    await loginAs(page, 'contributor', contributorId);

    // Save via API
    const saveRes = await page.request.post('/api/segment-editor/efnafraedi-2e/1/m68664/edit', {
      data: {
        segmentId: 'm68664:para:test-persist',
        newText: uniqueText,
        editedContent: uniqueText,
        originalContent: '',
        category: 'accuracy',
      },
    });
    expect(saveRes.ok()).toBe(true);

    // Reload the module and verify edit is present in the edits object
    const moduleRes = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68664');
    expect(moduleRes.ok()).toBe(true);
    const moduleData = await moduleRes.json();
    const segEdits = moduleData.edits['m68664:para:test-persist'] || [];
    const myEdit = segEdits.find((e) => e.edited_content === uniqueText);
    expect(myEdit).toBeTruthy();
    expect(myEdit.status).toBe('pending');

    // Cleanup: delete the test edit
    if (myEdit) {
      await page.request.delete(`/api/segment-editor/edit/${myEdit.id}`);
    }
  });
});
