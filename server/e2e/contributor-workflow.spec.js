// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Contributor workflow E2E tests.
 *
 * Tests the full lifecycle of a segment edit:
 *   contributor saves edit → submits for review → head-editor approves → contributor sees approval
 *
 * Uses unique user IDs (88001, 88002) to avoid conflicts with other test suites.
 * Uses a unique segment ID per run to avoid UNIQUE constraint violations from
 * prior approved edits sharing the same (book, module_id, segment_id, status, editor_id).
 */

const BOOK = 'efnafraedi-2e';
const CHAPTER = '1';
const MODULE = 'm68664';
const API = `/api/segment-editor/${BOOK}/${CHAPTER}/${MODULE}`;

const CONTRIBUTOR_ID = 88001;
const HEAD_EDITOR_ID = 88002;

// Unique per run so approving won't collide with a leftover approved row
const RUN_ID = Date.now();
const SEGMENT_ID = `${MODULE}:para:e2e-wf-${RUN_ID}`;
const uniqueText = `E2E-contrib-workflow-${RUN_ID}`;

test.describe.serial('Contributor workflow', () => {
  let editId;

  test('contributor saves a segment edit', async ({ page }) => {
    await loginAs(page, 'contributor', CONTRIBUTOR_ID);
    await page.goto('/editor');

    const res = await page.request.post(`${API}/edit`, {
      data: {
        segmentId: SEGMENT_ID,
        editedContent: uniqueText,
        category: 'accuracy',
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.editId).toBeTruthy();
    editId = body.editId;
  });

  test('contributor submits module for review', async ({ page }) => {
    await loginAs(page, 'contributor', CONTRIBUTOR_ID);
    await page.goto('/editor');

    const res = await page.request.post(`${API}/submit`);
    const body = await res.json();

    // Accept 200 (new review created) or 409 (review already exists from prior run)
    expect([200, 409]).toContain(res.status());
    if (res.status() === 200) {
      expect(body.success).toBe(true);
      expect(body.reviewId).toBeTruthy();
    }
  });

  test('head-editor approves the edit', async ({ page }) => {
    await loginAs(page, 'head-editor', HEAD_EDITOR_ID);
    await page.goto('/editor');

    // Load the module to find edits
    const loadRes = await page.request.get(API);
    expect(loadRes.status()).toBe(200);
    const moduleData = await loadRes.json();

    // Find our edit by matching the unique text
    const segmentEdits = moduleData.edits?.[SEGMENT_ID] || [];
    const ourEdit = segmentEdits.find((e) => e.edited_content === uniqueText);
    expect(ourEdit).toBeTruthy();
    expect(ourEdit.status).toBe('pending');

    const approveId = ourEdit.id || editId;

    const approveRes = await page.request.post(`/api/segment-editor/edit/${approveId}/approve`, {
      data: { note: 'E2E approval' },
    });

    expect(approveRes.status()).toBe(200);
    const approveBody = await approveRes.json();
    expect(approveBody.success).toBe(true);
    expect(approveBody.edit.status).toBe('approved');
  });

  test('contributor sees approved status', async ({ page }) => {
    await loginAs(page, 'contributor', CONTRIBUTOR_ID);
    await page.goto('/editor');

    const res = await page.request.get(API);
    expect(res.status()).toBe(200);
    const moduleData = await res.json();

    const segmentEdits = moduleData.edits?.[SEGMENT_ID] || [];
    const ourEdit = segmentEdits.find((e) => e.edited_content === uniqueText);
    expect(ourEdit).toBeTruthy();
    expect(ourEdit.status).toBe('approved');
  });
});
