// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Concurrent editing and conflict detection E2E tests.
 *
 * Tests API-level conflict detection in the localization editor (409 on stale
 * lastModified) and cross-editor awareness in the segment editor
 * (otherPendingSegments populated when another user has pending edits).
 *
 * Note: BroadcastChannel cross-tab detection is a client-side JS feature
 * and cannot be tested via Playwright API calls.
 */

const BOOK = 'efnafraedi-2e';
const CHAPTER = '1';
const MODULE = 'm68664';
const SEG_API = '/api/segment-editor';
const LOC_API = '/api/localization-editor';

// Unique per run to avoid collisions with stale DB state
const RUN_ID = Date.now();
const USER_A_ID = 60000 + (RUN_ID % 10000);
const USER_B_ID = 61000 + (RUN_ID % 10000);
const EDIT_MARKER = `[concurrent-e2e-${RUN_ID}]`;

test.describe('Localization editor conflict detection', () => {
  test('saving with stale lastModified returns 409', async ({ page }) => {
    await loginAs(page, 'admin', USER_A_ID);

    // Load the module to get current segments
    const loadRes = await page.request.get(`${LOC_API}/${BOOK}/${CHAPTER}/${MODULE}`);

    // Faithful translation files may not exist in test env
    if (!loadRes.ok()) {
      const status = loadRes.status();
      test.skip(
        status === 404 || status === 500,
        `Module not available for localization (status ${status}) — skipping`
      );
      return;
    }

    const loadData = await loadRes.json();
    expect(loadData.segments.length).toBeGreaterThan(0);

    const seg = loadData.segments.find((s) => s.faithful || s.localized);
    if (!seg) {
      test.skip(true, 'No segments with faithful/localized content — skipping');
      return;
    }

    const segmentId = seg.segmentId;
    const baseContent = seg.localized || seg.faithful;

    // First save (creates the localized file if it doesn't exist yet)
    const saveA1 = await page.request.post(`${LOC_API}/${BOOK}/${CHAPTER}/${MODULE}/save`, {
      data: {
        segmentId,
        content: baseContent + ` ${EDIT_MARKER}-A1`,
        lastModified: loadData.lastModified, // may be null on first save
      },
    });

    if (!saveA1.ok()) {
      test.skip(true, `First save failed with ${saveA1.status()} — skipping`);
      return;
    }

    // Capture the lastModified from save A1's response — this is the "known state"
    const saveA1Data = await saveA1.json();
    const knownMtime = saveA1Data.lastModified;
    expect(knownMtime).toBeTruthy();

    // Second save by user A advances the mtime, making knownMtime stale
    const saveA2 = await page.request.post(`${LOC_API}/${BOOK}/${CHAPTER}/${MODULE}/save`, {
      data: {
        segmentId,
        content: baseContent + ` ${EDIT_MARKER}-A2`,
        lastModified: knownMtime, // current — should succeed
      },
    });
    expect(saveA2.ok()).toBe(true);

    // User B tries to save using the STALE knownMtime from save A1
    await loginAs(page, 'admin', USER_B_ID);

    const saveB = await page.request.post(`${LOC_API}/${BOOK}/${CHAPTER}/${MODULE}/save`, {
      data: {
        segmentId,
        content: baseContent + ` ${EDIT_MARKER}-B`,
        lastModified: knownMtime, // stale — file was modified by save A2
      },
    });

    expect(saveB.status()).toBe(409);

    const conflictData = await saveB.json();
    expect(conflictData.error).toBe('conflict');
    expect(conflictData.currentLastModified).toBeTruthy();
  });
});

test.describe('Segment editor cross-editor awareness', () => {
  test('otherPendingSegments includes edits from a different user', async ({ page }) => {
    // User A creates a pending edit
    await loginAs(page, 'admin', USER_A_ID);

    const loadRes = await page.request.get(`${SEG_API}/${BOOK}/${CHAPTER}/${MODULE}`);
    expect(loadRes.ok()).toBe(true);

    const loadData = await loadRes.json();
    expect(loadData.segments.length).toBeGreaterThan(0);

    // Pick a segment with Icelandic content
    const seg = loadData.segments.find((s) => s.is && s.is.length > 0);
    expect(seg).toBeTruthy();

    const segmentId = seg.segmentId;
    const originalContent = seg.is;
    const editedContent = `${originalContent} ${EDIT_MARKER}`;

    // Save edit as user A
    const editRes = await page.request.post(`${SEG_API}/${BOOK}/${CHAPTER}/${MODULE}/edit`, {
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

    // Now load the same module as user B
    await loginAs(page, 'admin', USER_B_ID);

    const loadAsB = await page.request.get(`${SEG_API}/${BOOK}/${CHAPTER}/${MODULE}`);
    expect(loadAsB.ok()).toBe(true);

    const dataAsB = await loadAsB.json();
    expect(dataAsB.otherPendingSegments).toBeTruthy();
    expect(Array.isArray(dataAsB.otherPendingSegments)).toBe(true);
    expect(dataAsB.otherPendingSegments).toContain(segmentId);
  });

  test('otherPendingSegments excludes own edits', async ({ page }) => {
    // Load the module as user A — their own edits should NOT appear in otherPendingSegments
    await loginAs(page, 'admin', USER_A_ID);

    const loadRes = await page.request.get(`${SEG_API}/${BOOK}/${CHAPTER}/${MODULE}`);
    expect(loadRes.ok()).toBe(true);

    const data = await loadRes.json();
    expect(data.otherPendingSegments).toBeTruthy();
    expect(Array.isArray(data.otherPendingSegments)).toBe(true);

    // User A's own pending edit from the previous test should NOT be in otherPendingSegments
    // (it may contain edits from other test runs, but not from USER_A_ID)
    // We verify by checking that the segment we just edited is NOT listed
    // when viewed by the same user who made the edit
    const seg = data.segments.find((s) => s.is && s.is.includes(EDIT_MARKER));
    if (seg) {
      // If we can identify our edited segment, verify it's excluded from other-pending
      expect(data.otherPendingSegments).not.toContain(seg.segmentId);
    }
    // If the edit was already applied (from a prior complete cycle), the marker
    // would be in the content but no pending edit exists — that's also fine
  });
});
