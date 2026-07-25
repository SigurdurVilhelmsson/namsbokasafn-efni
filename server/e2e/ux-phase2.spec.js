// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');
const { pickEditableSegment } = require('./helpers/segments');

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
    await loginAs(page, 'editor');
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
    // edlisfraedi-2e is registered by migration 029 on every database
    // (fresh or production), so the duplicate guard fires deterministically
    // before any catalogue lookup.
    const res = await page.request.post('/api/admin/books/register', {
      data: {
        catalogueSlug: 'college-physics-2e',
        slug: 'edlisfraedi-2e',
        titleIs: 'Eðlisfræði 2e',
      },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error || body.message).toMatch(/þegar skráð|already registered/i);
  });
});

/**
 * This block writes to the real `efnafraedi-2e` (not the fixture book), as
 * `segment-editor.spec.js` already does for the same module. That stays safe
 * because the module's MT edit-lock marker is committed and `writeMtLock`
 * no-ops when one exists, so a run leaves the git tree clean.
 *
 * C2: the segment id used to be the invented `m68664:para:test-persist`, which
 * the SR-OOS-2 backstop correctly 404s. It is now discovered at run time; the
 * per-run uniqueness that identifies "our" edit moved into the text.
 */
const M5_BOOK = 'efnafraedi-2e';
const M5_CHAPTER = '1';
const M5_MODULE = 'm68664';
const M5_API = `/api/segment-editor/${M5_BOOK}/${M5_CHAPTER}/${M5_MODULE}`;

test.describe('M5 revert bug regression', () => {
  test('saved edit persists after API reload', async ({ page }) => {
    const editorId = 88010;
    await loginAs(page, 'editor', editorId);

    const picked = await pickEditableSegment(page.request, {
      book: M5_BOOK,
      chapter: M5_CHAPTER,
      moduleId: M5_MODULE,
      suffix: ` [persist-test-${Date.now()}]`,
      // Owned by segment-editor.spec.js's propagation tests, which run in a
      // parallel worker against this same book and module.
      exclude: ['m68664:abstract:auto-2'],
    });

    // Save via API
    const saveRes = await page.request.post(`${M5_API}/edit`, {
      data: {
        segmentId: picked.segmentId,
        editedContent: picked.editedContent,
        originalContent: picked.originalContent,
        category: 'accuracy',
      },
    });
    const saveRaw = await saveRes.text();
    expect(
      saveRes.status(),
      `POST ${M5_API}/edit on ${picked.segmentId} → ${saveRes.status()}: ${saveRaw}`
    ).toBe(200);

    // Reload the module and verify edit is present in the edits object
    const moduleRes = await page.request.get(M5_API);
    expect(moduleRes.ok()).toBe(true);
    const moduleData = await moduleRes.json();
    const segEdits = moduleData.edits[picked.segmentId] || [];
    const myEdit = segEdits.find((e) => e.edited_content === picked.editedContent);
    expect(myEdit).toBeTruthy();
    expect(myEdit.status).toBe('pending');

    // Cleanup: delete the test edit
    if (myEdit) {
      await page.request.delete(`/api/segment-editor/edit/${myEdit.id}`);
    }
  });
});
