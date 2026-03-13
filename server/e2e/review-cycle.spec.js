// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Full Pass 1 review cycle E2E test.
 *
 * Exercises the complete workflow:
 *   contributor saves edit → submits for review →
 *   head-editor sees it in queue → approves → completes review →
 *   edits are auto-applied → content is updated
 *
 * Uses admin role for both actors (with different user IDs) to bypass
 * book-access checks. The distinct IDs ensure approveEdit() doesn't
 * block on self-approval.
 *
 * Uses unique IDs per test run to avoid collisions with stale DB state.
 */

const BOOK = 'efnafraedi-2e';
const CHAPTER = '1';
const MODULE = 'm68664'; // Use m68664 (section 1.1) which has plenty of segments
const API = `/api/segment-editor`;

// Unique per run to avoid UNIQUE constraint collisions with stale data
const RUN_ID = Date.now();
const EDITOR_ID = 70000 + (RUN_ID % 10000);
const REVIEWER_ID = 80000 + (RUN_ID % 10000);
const EDIT_MARKER = `[e2e-${RUN_ID}]`;

test.describe.serial('Pass 1 review cycle', () => {
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
});
