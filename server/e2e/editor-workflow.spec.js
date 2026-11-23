// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');
const { pickEditableSegment } = require('./helpers/segments');

/**
 * Editor workflow E2E tests.
 *
 * Tests the full lifecycle of a segment edit:
 *   editor saves edit → marks the unit done → head-editor approves → editor sees approval
 *
 * Uses unique user IDs (88001, 88002) to avoid conflicts with other test suites.
 *
 * WHERE IT RUNS. In efnafraedi-2e chapter 4, module m68710, which this spec owns (seed-fixture.js). It used to run
 * in the fixture book, which is now closed to every non-admin (G1.13 spec §6.1). Chemistry is a study book and so
 * always assignment-enforced (spec §6.2): the editor (88001) saves there through the users row and chapter 4
 * assignment that seed-fixture.js plants, and its first serve opens m68710, a module no other spec serves. The head
 * editor (88002) passes by the token's `books`. Like every chemistry study unit, m68710 carries a committed
 * study-freeze marker, so the save writes no MT edit-lock marker (ux-phase2.spec.js's M5 block says more).
 *
 * RUN-UNIQUENESS LIVES IN THE CONTENT, NOT THE SEGMENT ID (C2). This spec used
 * to invent `m68664:para:e2e-wf-<timestamp>`. The SR-OOS-2 backstop then started
 * resolving the id against the server-side baseline, and an invented id became a
 * hard 404 — red on `main` 2026-07-12 → 2026-07-25. The id is now a REAL one
 * discovered at run time, and the timestamp moved into the edited text.
 *
 * ⚠️ What the run-unique CONTENT is and is not for. The old header justified the
 * invented id as avoiding "UNIQUE constraint violations on (book, module_id,
 * segment_id, status, editor_id)". **That constraint no longer exists** —
 * migration 039 dropped the table-level UNIQUE and replaced it with the partial
 * `idx_segment_edits_one_pending ON (book, module_id, segment_id, editor_id)
 * WHERE status = 'pending'`. A re-run against a REUSED database is therefore
 * safe for a different reason than the old comment claimed: the leftover row is
 * `approved`, so it falls outside the partial index and a fresh `pending` insert
 * cannot collide with it. The suffix below is NOT load-bearing for DB integrity;
 * it exists so the assertions in the later tests can identify THIS run's edit
 * among any others on the same segment.
 */

const BOOK = 'efnafraedi-2e';
const CHAPTER = '4';
const MODULE = 'm68710';
const API = `/api/segment-editor/${BOOK}/${CHAPTER}/${MODULE}`;

const EDITOR_ID = 88001;
const HEAD_EDITOR_ID = 88002;

const RUN_ID = Date.now();
const EDIT_SUFFIX = ` [e2e-editor-workflow-${RUN_ID}]`;

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
    });
    segmentId = picked.segmentId;
    uniqueText = picked.editedContent;

    const res = await page.request.post(`${API}/edit`, {
      data: {
        segmentId,
        originalContent: picked.originalContent,
        editedContent: uniqueText,
        category: 'accuracy',
        baseSha256: picked.baseSha256,
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

  // "Merkja sem lokið" (register §C222): a recorded moment, so a second press succeeds as the first did. It
  // replaced "Senda til yfirlestrar", which answered 409 after the first press (ED-07).
  test('editor marks the unit done, twice', async ({ page }) => {
    await loginAs(page, 'editor', EDITOR_ID);
    await page.goto('/editor');

    for (let i = 0; i < 2; i++) {
      const res = await page.request.post(`${API}/done`);
      const body = await res.json();
      expect(res.status(), JSON.stringify(body)).toBe(200);
      expect(body.success).toBe(true);
      expect(typeof body.doneAt).toBe('string');
    }
  });

  test('head-editor approves the edit', async ({ page }) => {
    // auth.js mints head-editor tokens scoped to ['efnafraedi-2e', '__e2e-fixture__'],
    // so a head-editor can approve in chemistry — exercises the real
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
