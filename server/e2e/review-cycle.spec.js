// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Full Pass 1 review cycle E2E test.
 *
 * Exercises the complete workflow:
 *   editor saves edit → submits for review →
 *   head-editor sees it in queue → approves → completes review →
 *   edits are auto-applied → content is updated
 *
 * Uses admin role for both actors (with different user IDs) to bypass
 * book-access checks and model an editor vs a reviewer. (Self-approval is now
 * permitted for the head-editor/admin tier, so same-id would also approve.)
 *
 * Uses unique IDs per test run to avoid collisions with stale DB state.
 */

const BOOK = '__e2e-fixture__';
const CHAPTER = '1';
const MODULE = 'm68663'; // Use m68663 (intro module) to avoid parallel-worker collision with editor-workflow (m68664)
const API = `/api/segment-editor`;

// Unique per run to avoid UNIQUE constraint collisions with stale data
const RUN_ID = Date.now();
const EDITOR_ID = 70000 + (RUN_ID % 10000);
const REVIEWER_ID = 80000 + (RUN_ID % 10000);
const EDIT_MARKER = `[e2e-${RUN_ID}]`;

test.describe.serial('§0.reg Pass 1 review cycle', () => {
  /** Shared state across serial tests */
  let segmentId;
  let originalContent;
  let editedContent;
  let editId;
  let reviewId;

  test('editor saves a segment edit', async ({ page }) => {
    await loginAs(page, 'admin', EDITOR_ID);

    // Load module to find a real segment
    const loadRes = await page.request.get(`${API}/${BOOK}/${CHAPTER}/${MODULE}`);
    expect(loadRes.ok()).toBe(true);

    const data = await loadRes.json();
    expect(data.segments.length).toBeGreaterThan(0);

    // Pick the first segment with Icelandic content
    const seg = data.segments.find((s) => s.is && s.is.length > 0);
    expect(seg).toBeTruthy();

    segmentId = seg.segmentId;
    originalContent = seg.is;
    editedContent = `${originalContent} ${EDIT_MARKER}`;

    // Save the edit
    const editRes = await page.request.post(`${API}/${BOOK}/${CHAPTER}/${MODULE}/edit`, {
      data: {
        segmentId,
        originalContent,
        editedContent,
        category: 'terminology',
      },
    });
    expect(editRes.ok()).toBe(true);

    const editData = await editRes.json();
    expect(editData.success).toBe(true);
    expect(editData.editId).toBeTruthy();

    editId = editData.editId;
  });

  test('editor submits module for review', async ({ page }) => {
    await loginAs(page, 'admin', EDITOR_ID);

    const res = await page.request.post(`${API}/${BOOK}/${CHAPTER}/${MODULE}/submit`);
    const data = await res.json();

    if (res.status() === 409) {
      // Stale review from a prior run — find it in the queue
      const queueRes = await page.request.get(`${API}/review-queue?book=${BOOK}`);
      const queueData = await queueRes.json();
      const existing = queueData.reviews.find((r) => r.module_id === MODULE);
      expect(existing, 'Expected existing review in queue after 409').toBeTruthy();
      reviewId = existing.id;
    } else {
      expect(res.ok(), `Submit failed (${res.status()}): ${JSON.stringify(data)}`).toBe(true);
      expect(data.success).toBe(true);
      expect(data.reviewId).toBeTruthy();
      reviewId = data.reviewId;
    }
  });

  test('reviewer sees module in review queue', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);

    const res = await page.request.get(`${API}/review-queue?book=${BOOK}`);
    expect(res.ok()).toBe(true);

    const data = await res.json();
    expect(data.reviews.length).toBeGreaterThan(0);

    const match = data.reviews.find((r) => r.module_id === MODULE);
    expect(match).toBeTruthy();
  });

  test('reviewer approves the edit', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);

    const res = await page.request.post(`${API}/edit/${editId}/approve`, {
      data: { note: 'Looks good — e2e test' },
    });
    const data = await res.json();
    expect(res.ok(), `Approve failed (${res.status()}): ${JSON.stringify(data)}`).toBe(true);
    expect(data.success).toBe(true);
  });

  test('reviewer completes the review — edits are auto-applied', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);

    const res = await page.request.post(`${API}/reviews/${reviewId}/complete`);
    const data = await res.json();
    expect(res.ok(), `Complete failed (${res.status()}): ${JSON.stringify(data)}`).toBe(true);
    expect(data.success).toBe(true);
    expect(data.status).toBe('approved');
    expect(data.applied).toBeTruthy();
    expect(data.applied.appliedCount).toBeGreaterThan(0);
  });

  test('edited content appears in reloaded module', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);

    const res = await page.request.get(`${API}/${BOOK}/${CHAPTER}/${MODULE}`);
    expect(res.ok()).toBe(true);

    const data = await res.json();
    const seg = data.segments.find((s) => s.segmentId === segmentId);
    expect(seg).toBeTruthy();
    // After apply, the segment should contain our edit marker
    // (it reads from 03-faithful-translation/ which was just written)
    expect(seg.is).toContain(EDIT_MARKER);
  });

  // §1b/§1d content-restore round-trip. Appended to THIS serial describe
  // (rather than a standalone spec) because restore needs an existing
  // version, and the apply above just created one via
  // contentVersionService.snapshotModule (called from applyApprovedEdits
  // just before it overwrote the faithful file with the pre-edit content —
  // i.e. content WITHOUT EDIT_MARKER). Reuses this describe's closure state
  // (segmentId, EDIT_MARKER, MODULE, BOOK, CHAPTER) — running in a separate
  // parallel-worker spec would race applyApprovedEdits' (book, moduleId)
  // scoping on the same m68663 module.

  test('§1b restore reverts to the pre-edit version', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);

    const versionsRes = await page.request.get(`${API}/${BOOK}/${CHAPTER}/${MODULE}/versions`);
    expect(versionsRes.ok()).toBe(true);
    const { versions } = await versionsRes.json();
    expect(versions.length).toBeGreaterThan(0);

    // getModuleVersions orders by version DESC, so the LAST entry is the
    // lowest version number — the pre-edit snapshot taken just before the
    // apply above overwrote the faithful file.
    const target = versions[versions.length - 1].version;

    const restoreRes = await page.request.post(
      `${API}/${BOOK}/${CHAPTER}/${MODULE}/restore/${target}`,
      { data: { confirm: true } }
    );
    const restoreData = await restoreRes.json();
    expect(
      restoreRes.ok(),
      `Restore failed (${restoreRes.status()}): ${JSON.stringify(restoreData)}`
    ).toBe(true);
    expect(restoreData.success).toBe(true);
    expect(restoreData.restoredVersion).toBe(target);

    const reloadRes = await page.request.get(`${API}/${BOOK}/${CHAPTER}/${MODULE}`);
    expect(reloadRes.ok()).toBe(true);
    const reloadData = await reloadRes.json();
    const seg = reloadData.segments.find((s) => s.segmentId === segmentId);
    expect(seg).toBeTruthy();
    // Reverted to the pre-edit snapshot — the marker should be gone.
    expect(seg.is).not.toContain(EDIT_MARKER);
  });

  test('§1b restore without confirm is rejected 400', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);

    const res = await page.request.post(`${API}/${BOOK}/${CHAPTER}/${MODULE}/restore/1`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('§1d version_restored appears in the activity log', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);

    const res = await page.request.get(`/api/activity/section/${BOOK}/${CHAPTER}/${MODULE}`);
    expect(res.ok()).toBe(true);
    const { activities } = await res.json();
    expect(activities.some((a) => a.type === 'version_restored')).toBe(true);
  });
});
