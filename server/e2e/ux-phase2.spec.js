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
 * This block writes to the real `efnafraedi-2e` (not the fixture book), in
 * chapter 6, module m68729, which it owns (seed-fixture.js). Chemistry is a
 * study book and so always assignment-enforced (G1.13 spec §6.2): the editor
 * (88010) saves there through the users row and chapter 6 assignment that
 * seed-fixture.js plants. That row also makes its first serve open the module,
 * and an opened module gets suggestions for every viewer once the view is on,
 * so the block moved off m68664, which several specs serve, to a module no
 * other spec serves.
 *
 * This used to read "that stays safe because the module's MT edit-lock marker
 * is committed and writeMtLock no-ops when one exists". That was true when
 * written and stopped being true in PR #411, whose Phase 2.1 deleted all seven
 * committed chemistry locks to unblock the re-MT — m68664 among them. The edit
 * below then wrote a fresh marker into READ-ONLY 02-mt-output on every run, and
 * mtRunDecision skips a locked module silently (§C118 (9)).
 *
 * The tree is kept clean by global-setup.js + global-teardown.js, which sweep
 * markers this run created and keep any that predate it. Since G1.7, m68729,
 * like every chemistry study unit, carries a COMMITTED content-free study-freeze
 * marker, on purpose: it holds the unit's MT for the study, it predates every
 * run so the sweep keeps it, and writeMtLock no-ops on it, so the edit below
 * writes no marker. Never remove or replace it to make a run pass, and add no
 * other committed lock here.
 *
 * C2: the segment id used to be the invented `m68664:para:test-persist`, which
 * the SR-OOS-2 backstop correctly 404s. It is now discovered at run time; the
 * per-run uniqueness that identifies "our" edit moved into the text.
 */
const M5_BOOK = 'efnafraedi-2e';
const M5_CHAPTER = '6';
const M5_MODULE = 'm68729';
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
    });

    // Save via API
    const saveRes = await page.request.post(`${M5_API}/edit`, {
      data: {
        segmentId: picked.segmentId,
        editedContent: picked.editedContent,
        originalContent: picked.originalContent,
        category: 'accuracy',
        baseSha256: picked.baseSha256,
      },
    });
    const saveRaw = await saveRes.text();
    expect(
      saveRes.status(),
      `POST ${M5_API}/edit on ${picked.segmentId} → ${saveRes.status()}: ${saveRaw}`
    ).toBe(200);

    // Reload the module — this is the actual regression under test (M5: does a
    // saved edit survive an API reload?). Capture first, assert LAST.
    const moduleRes = await page.request.get(M5_API);
    expect(moduleRes.ok()).toBe(true);
    const moduleData = await moduleRes.json();
    const segEdits = moduleData.edits[picked.segmentId] || [];
    const myEdit = segEdits.find((e) => e.edited_content === picked.editedContent);

    // CLEAN UP BEFORE ASSERTING. This test writes into the PRODUCTION book, so a
    // stranded pending edit would make that row un-editable and un-acceptable for
    // every later spec and user (`canEdit=false`; `acceptBlockReason` →
    // EDIT_EXISTS), and on a locally reused server it survives into the next run.
    // Asserting first would skip cleanup on exactly the failure path that strands
    // it; a `finally` would fix that but let a teardown error REPLACE the real
    // assertion failure and destroy the diagnosis. Deleting first avoids both.
    if (myEdit) {
      const del = await page.request.delete(`/api/segment-editor/edit/${myEdit.id}`);
      // Asserted, not fire-and-forget (acceptance.spec.js:140 sets the precedent).
      expect(del.status(), 'teardown DELETE must succeed').toBe(200);
    }

    expect(myEdit, `no edit matching ${picked.editedContent} after reload`).toBeTruthy();
    expect(myEdit.status).toBe('pending');
  });
});
