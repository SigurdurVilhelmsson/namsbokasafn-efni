// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');
const { pickEditableSegment } = require('./helpers/segments');

/**
 * Editor workflow E2E tests.
 *
 * Tests the full lifecycle of a segment edit:
 *   editor saves edit → submits for review → head-editor approves → editor sees approval
 *
 * Uses unique user IDs (88001, 88002) to avoid conflicts with other test suites.
 *
 * RUN-UNIQUENESS LIVES IN THE CONTENT, NOT THE SEGMENT ID (C2). This spec used
 * to invent `m68664:para:e2e-wf-<timestamp>` so an approved row from a previous
 * run could never collide on (book, module_id, segment_id, status, editor_id).
 * The SR-OOS-2 backstop then started resolving the id against the server-side
 * baseline, and an invented id became a hard 404 — red on `main` 2026-07-12 →
 * 2026-07-25. The id is now a REAL one discovered at run time; the timestamp
 * moved into the edited text, which preserves the original anti-collision
 * property (every assertion below matches on the text, not the id).
 */

const BOOK = '__e2e-fixture__';
const CHAPTER = '1';
const MODULE = 'm68664';
const API = `/api/segment-editor/${BOOK}/${CHAPTER}/${MODULE}`;

const EDITOR_ID = 88001;
const HEAD_EDITOR_ID = 88002;

const RUN_ID = Date.now();
const EDIT_SUFFIX = ` [e2e-editor-workflow-${RUN_ID}]`;
// `m68664:abstract:auto-2` is pinned by literal in segment-editor.spec.js's propagation
// tests. Those run against `efnafraedi-2e`, not this fixture book (segment-editor only
// READS the fixture), so excluding it here is not strictly required — it is reserved
// project-wide so the same id never means two different things in two books.
const RESERVED_SEGMENTS = ['m68664:abstract:auto-2'];

test.describe.serial('Editor workflow', () => {
  let editId;
  /** Resolved in the first test; the later serial tests match on these. */
  let segmentId;
  let uniqueText;

  test('editor saves a segment edit', async ({ page }) => {
    await loginAs(page, 'editor', EDITOR_ID);
    await page.goto('/editor');

    const picked = await pickEditableSegment(page.request, {
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      suffix: EDIT_SUFFIX,
      exclude: RESERVED_SEGMENTS,
    });
    segmentId = picked.segmentId;
    uniqueText = picked.editedContent;

    const res = await page.request.post(`${API}/edit`, {
      data: {
        segmentId,
        originalContent: picked.originalContent,
        editedContent: uniqueText,
        category: 'accuracy',
      },
    });

    // Body in the message: a 404 (unknown segment) and a 400 (structural-marker
    // block) are different bugs, and CI logs are all a future session gets.
    const raw = await res.text();
    expect(res.status(), `POST ${API}/edit on ${segmentId} → ${res.status()}: ${raw}`).toBe(200);
    const body = JSON.parse(raw);
    expect(body.success).toBe(true);
    expect(body.editId).toBeTruthy();
    editId = body.editId;
  });

  test('editor submits module for review', async ({ page }) => {
    await loginAs(page, 'editor', EDITOR_ID);
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
    // auth.js mints head-editor tokens scoped to ['efnafraedi-2e', '__e2e-fixture__'],
    // so a head-editor can approve in the fixture book — exercises the real
    // requireHeadEditorFor per-book authz path (not the admin bypass).
    await loginAs(page, 'head-editor', HEAD_EDITOR_ID);
    await page.goto('/editor');

    // Load the module to find edits
    const loadRes = await page.request.get(API);
    expect(loadRes.status()).toBe(200);
    const moduleData = await loadRes.json();

    // Find our edit by matching the unique text
    const segmentEdits = moduleData.edits?.[segmentId] || [];
    const ourEdit = segmentEdits.find((e) => e.edited_content === uniqueText);
    expect(ourEdit).toBeTruthy();
    expect(ourEdit.status).toBe('pending');

    const approveId = ourEdit.id || editId;

    const approveRes = await page.request.post(`/api/segment-editor/edit/${approveId}/approve`, {
      data: { note: 'E2E approval' },
    });

    const approveRaw = await approveRes.text();
    expect(
      approveRes.status(),
      `POST approve/${approveId} → ${approveRes.status()}: ${approveRaw}`
    ).toBe(200);
    const approveBody = JSON.parse(approveRaw);
    expect(approveBody.success).toBe(true);
    expect(approveBody.edit.status).toBe('approved');
  });

  test('editor sees approved status', async ({ page }) => {
    await loginAs(page, 'editor', EDITOR_ID);
    await page.goto('/editor');

    const res = await page.request.get(API);
    expect(res.status()).toBe(200);
    const moduleData = await res.json();

    const segmentEdits = moduleData.edits?.[segmentId] || [];
    const ourEdit = segmentEdits.find((e) => e.edited_content === uniqueText);
    expect(ourEdit).toBeTruthy();
    expect(ourEdit.status).toBe('approved');
  });
});
