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
  let restoredVersion;
  let snapshotVersion;

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

    // G-5: a body without the served hash (an old page's) is refused, and writes nothing.
    const oldPage = await page.request.post(`${API}/${BOOK}/${CHAPTER}/${MODULE}/edit`, {
      data: { segmentId, originalContent, editedContent, category: 'terminology' },
    });
    expect(oldPage.status()).toBe(409);
    expect((await oldPage.json()).error).toBe('BASE_MISSING');
    expect(seg.baseSha256).toMatch(/^[0-9a-f]{64}$/);

    // Save the edit
    const editRes = await page.request.post(`${API}/${BOOK}/${CHAPTER}/${MODULE}/edit`, {
      data: {
        segmentId,
        originalContent,
        editedContent,
        category: 'terminology',
        baseSha256: seg.baseSha256,
      },
    });
    expect(editRes.ok()).toBe(true);

    const editData = await editRes.json();
    expect(editData.success).toBe(true);
    expect(editData.editId).toBeTruthy();
    expect(editData.updated).toBe(false); // an insert: the refused post above wrote no row to update

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
    // Shared with §1d, which scopes its assertion to this run's restore.
    // `restoredVersion` alone doesn't discriminate runs (getModuleVersions
    // orders DESC, so `target` — the lowest version — is `1` on essentially
    // every run against a reused DB). `snapshotVersion` is a per-module
    // counter that strictly increases with every restore call across the
    // DB's whole lifetime (contentVersionService.restoreVersion snapshots
    // current content before restoring), so pinning both together is
    // genuinely unique to this run's restore event.
    restoredVersion = target;
    snapshotVersion = restoreData.snapshotVersion;
    expect(snapshotVersion).toBeGreaterThan(0);

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
    // Scoped to THIS run's restore (not just "some row exists somewhere"):
    // contentVersionService.restoreVersion logs both metadata.restoredVersion
    // and metadata.snapshotVersion (server/services/contentVersionService.js),
    // and activityLog.getBySection JSON.parses the stored metadata column, so
    // both are available pre-parsed here. restoredVersion alone repeats across
    // runs (see §1b); snapshotVersion is a strictly-increasing per-restore
    // counter, so the pair together identifies exactly this run's restore.
    expect(
      activities.some(
        (a) =>
          a.type === 'version_restored' &&
          a.metadata?.restoredVersion === restoredVersion &&
          a.metadata?.snapshotVersion === snapshotVersion
      )
    ).toBe(true);
  });
});

/**
 * §C210: an editor can read and answer a "Ræða" (discuss) note in the segment editor.
 *
 * A head editor's "Ræða" stored a topic on the edit (`reviewer_note`), and the
 * thread endpoints (`GET /edit/:id/comments`, `POST /edit/:id/comment`) existed,
 * but no page called them and no page showed the topic, so an editor could not
 * reply. The editor now shows a thread control on an edit in discussion: the
 * topic heads the thread, the replies follow, and a reply box posts to the API.
 *
 * ⚠️ WHY THIS LIVES IN review-cycle.spec.js, AFTER THE CYCLE ABOVE: a module
 * submit stamps every open edit in the module (pending or discuss) into the new
 * review. An edit in discussion on m68663, created by another spec FILE, would be
 * claimed by this file's submit whenever the two overlapped (spec files run in
 * parallel), turning the review above into 'changes_requested'. Measured: that is
 * exactly what happened when this block was a separate file. Inside this file it
 * runs after the cycle, and its last test withdraws the edit so none lingers.
 *
 * The LAST segment with Icelandic text is used (the cycle above edits the first).
 * Persistence is checked twice: the API returns the reply, and a fresh page load
 * renders it, so a reply kept only in browser state cannot pass.
 */

const TOPIC = `Umræðuefni e2e ${RUN_ID}`;
const REPLY = `Svar ritstjóra e2e ${RUN_ID}`;

/** Open a module of the e2e fixture book in the segment editor (as figure-review.spec.js does). */
async function openFixtureModule(page, moduleId) {
  await page.goto('/editor');
  await page.waitForLoadState('networkidle');
  await page.locator('#book-select').selectOption(BOOK);
  const chapterSelect = page.locator('#chapter-select');
  await expect(chapterSelect).toBeVisible({ timeout: 5000 });
  await expect
    .poll(() => chapterSelect.locator('option').count(), { timeout: 10000 })
    .toBeGreaterThan(1);
  await chapterSelect.selectOption(CHAPTER);
  await page.locator(`.module-card[title^="${moduleId}"]`).click();
  await expect(page.locator('.segment-row').first()).toBeVisible({ timeout: 10000 });
}

test.describe.serial('§C210 reply thread on a "Ræða" note', () => {
  let segmentId;
  let editId;

  test('setup: an editor saves an edit and a head editor marks it for discussion', async ({
    page,
  }) => {
    await loginAs(page, 'admin', EDITOR_ID);
    const loadRes = await page.request.get(`${API}/${BOOK}/${CHAPTER}/${MODULE}`);
    expect(loadRes.ok()).toBe(true);
    const data = await loadRes.json();
    const withIs = data.segments.filter((s) => s.is && s.is.length > 0);
    expect(withIs.length).toBeGreaterThan(1);
    const seg = withIs[withIs.length - 1];
    segmentId = seg.segmentId;

    const editRes = await page.request.post(`${API}/${BOOK}/${CHAPTER}/${MODULE}/edit`, {
      data: {
        segmentId,
        originalContent: seg.is,
        editedContent: `${seg.is} [e2e-thread-${RUN_ID}]`,
        category: 'readability',
        baseSha256: seg.baseSha256,
      },
    });
    expect(editRes.ok()).toBe(true);
    editId = (await editRes.json()).editId;
    expect(editId).toBeTruthy();

    await loginAs(page, 'admin', REVIEWER_ID);
    const discussRes = await page.request.post(`${API}/edit/${editId}/discuss`, {
      data: { note: TOPIC },
    });
    expect(discussRes.ok()).toBe(true);
  });

  test('the editor sees the topic and posts a reply from the page', async ({ page }) => {
    await loginAs(page, 'admin', EDITOR_ID);
    await openFixtureModule(page, MODULE);

    const threadButton = page.locator(`.btn-thread[data-edit-id="${editId}"]`);
    await expect(threadButton).toBeVisible({ timeout: 5000 });
    await threadButton.click();

    const dialog = page.locator('#discussion-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.discussion-topic')).toContainText(TOPIC);

    await dialog.locator('#discussion-reply').fill(REPLY);
    await dialog.locator('#discussion-send').click();
    await expect(dialog.locator('.discussion-comment')).toContainText(REPLY, { timeout: 5000 });
  });

  test('a reply containing markup is shown as text, never run as HTML', async ({ page }) => {
    const MARKUP = `<img src="x" class="e2e-injected-${RUN_ID}"><b>feitt</b>`;
    await loginAs(page, 'admin', EDITOR_ID);
    await openFixtureModule(page, MODULE);
    await page.locator(`.btn-thread[data-edit-id="${editId}"]`).click();
    const dialog = page.locator('#discussion-dialog');
    await dialog.locator('#discussion-reply').fill(MARKUP);
    await dialog.locator('#discussion-send').click();
    await expect(dialog.locator('.discussion-comment').last()).toHaveText(new RegExp(`feitt`), {
      timeout: 5000,
    });
    await expect(dialog.locator('.discussion-comment').last()).toContainText(MARKUP);
    await expect(dialog.locator(`.e2e-injected-${RUN_ID}`)).toHaveCount(0);
    await expect(dialog.locator('.discussion-thread b')).toHaveCount(0);
  });

  test('the reply is stored: the API returns it', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);
    const res = await page.request.get(`${API}/edit/${editId}/comments`);
    expect(res.ok()).toBe(true);
    const { comments } = await res.json();
    expect(comments.map((c) => c.comment)).toContain(REPLY);
  });

  test('a fresh page load renders the topic and the reply from the server', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);
    await openFixtureModule(page, MODULE);
    await page.locator(`.btn-thread[data-edit-id="${editId}"]`).click();
    const dialog = page.locator('#discussion-dialog');
    await expect(dialog.locator('.discussion-topic')).toContainText(TOPIC);
    // The markup test above added a second reply, so pick this one by its text.
    await expect(dialog.locator('.discussion-comment').filter({ hasText: REPLY })).toHaveCount(1);
  });

  test('a reply does not change the edit status (it stays in discussion)', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);
    const res = await page.request.get(`${API}/${BOOK}/${CHAPTER}/${MODULE}`);
    const data = await res.json();
    const latest = data.edits[segmentId][0];
    expect(latest.id).toBe(editId);
    expect(latest.status).toBe('discuss');
  });

  test('an edit with a thread cannot be deleted; cleanup rejects it instead', async ({ page }) => {
    // [USER] 2026-11-08: an edit that carries a discussion thread is never deleted, so
    // no discussion text is lost. A module submit claims every open edit in the module,
    // so the edit is rejected rather than left pending for the next review of m68663.
    await loginAs(page, 'admin', REVIEWER_ID);
    const back = await page.request.post(`${API}/edit/${editId}/return-to-pending`);
    expect(back.ok(), await back.text()).toBe(true);

    await loginAs(page, 'admin', EDITOR_ID);
    const del = await page.request.delete(`${API}/edit/${editId}`);
    expect(del.status()).toBe(409);
    expect((await del.json()).error).toBe('HAS_DISCUSSION');

    // Withdrawing by saving the original text back is refused the same way.
    const load = await (await page.request.get(`${API}/${BOOK}/${CHAPTER}/${MODULE}`)).json();
    const seg = load.segments.find((x) => x.segmentId === segmentId);
    // The save names the edit the row shows, as the page does: a save that names none while an
    // edit is in flight is refused as stale before the withdraw is looked at (unsaved-text.spec.js, ED-05).
    const shown = load.edits[segmentId][0];
    expect(shown.id).toBe(editId);
    const withdraw = await page.request.post(`${API}/${BOOK}/${CHAPTER}/${MODULE}/edit`, {
      data: {
        segmentId,
        originalContent: seg.is,
        editedContent: seg.is,
        category: 'readability',
        baseSha256: seg.baseSha256,
        displayedEditId: shown.id,
        displayedEditSha256: shown.contentSha256,
      },
    });
    expect(withdraw.status(), await withdraw.text()).toBe(409);
    expect((await withdraw.json()).error).toBe('HAS_DISCUSSION');

    await loginAs(page, 'admin', REVIEWER_ID);
    const reject = await page.request.post(`${API}/edit/${editId}/reject`, {
      data: { note: `e2e cleanup ${RUN_ID}` },
    });
    expect(reject.ok(), await reject.text()).toBe(true);
    const comments = await (await page.request.get(`${API}/edit/${editId}/comments`)).json();
    expect(comments.comments.map((c) => c.comment)).toContain(REPLY); // the thread survives
  });
});
