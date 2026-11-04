// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Editor Lifecycle Smoke Tests
 *
 * End-to-end verification of the complete segment editing workflow:
 * login → navigate → edit → save → retry on failure → draft recovery → cleanup
 */

const BOOK = '__e2e-fixture__';
const CHAPTER = '1';
// Pin to m68664 so editor-lifecycle does not pollute m68663, which review-cycle.spec.js
// uses exclusively. Both live in the fixture; m68664 is also targeted by editor-workflow
// (DB-only approve, no disk write), so parallel runs remain safely isolated.
const MODULE = 'm68664';
const SMOKE_PREFIX = 'SMOKE-TEST-';

/**
 * Navigate to the pinned module (MODULE) in the segment editor.
 * Selects book, chapter, waits for module list, clicks the card matching MODULE.
 * Returns the moduleId string.
 */
async function navigateToFirstModule(page) {
  await page.goto('/editor');
  await page.waitForLoadState('networkidle');

  // Select book
  await page.locator('#book-select').selectOption(BOOK);

  // Select chapter — wait for options to populate
  const chapterSelect = page.locator('#chapter-select');
  await expect(chapterSelect).toBeEnabled({ timeout: 5000 });
  await chapterSelect.selectOption(CHAPTER);

  // Wait for module cards to appear
  const firstCard = page.locator('.module-card').first();
  await expect(firstCard).toBeVisible({ timeout: 10000 });

  // Find and click the card for the pinned MODULE (title starts with the module ID)
  const targetCard = page.locator(`.module-card[title^="${MODULE}"]`).first();
  const cardExists = await targetCard.count();
  const cardToClick = cardExists > 0 ? targetCard : firstCard;

  const cardTitle = await cardToClick.getAttribute('title');
  const moduleId = cardTitle.split(' ')[0]; // e.g. "m68664"

  // Click to load the module
  await cardToClick.click();

  // Wait for the editor container to become visible and segments to load
  await expect(page.locator('#editor-container')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 10000 });

  return moduleId.trim();
}

test.describe('Editor lifecycle', () => {
  test.describe.configure({ mode: 'serial' });

  /** Shared state across serial tests */
  let moduleId = '';

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  // ------------------------------------------------------------------
  // Test 1: Navigate to module and verify segments load
  // ------------------------------------------------------------------
  test('navigate to module and load segments', async ({ page }) => {
    moduleId = await navigateToFirstModule(page);

    // Assert editor is visible with segments
    await expect(page.locator('#editor-container')).toBeVisible();
    const rowCount = await page.locator('#segments-body tr').count();
    expect(rowCount).toBeGreaterThan(0);

    // Module title should contain the module ID
    const title = await page.locator('#module-title').textContent();
    expect(title).toContain(moduleId);
  });

  // ------------------------------------------------------------------
  // Test 2: Make a test edit and save
  // ------------------------------------------------------------------
  test('make a test edit and save', async ({ page }) => {
    moduleId = await navigateToFirstModule(page);

    // Find the first "Breyta" button and click it
    const editBtn = page.locator('button.btn-edit').first();
    await editBtn.click();

    // Wait for edit panel to appear
    const editPanel = page.locator('.edit-panel.active').first();
    await expect(editPanel).toBeVisible({ timeout: 5000 });

    // Type test marker text into the textarea
    const textarea = editPanel.locator('textarea');
    const timestamp = Date.now();
    const marker = `${SMOKE_PREFIX}${timestamp}`;
    const original = await textarea.inputValue();
    await textarea.fill(`${original} [${marker}]`);

    // Select category
    const catSelect = editPanel.locator('select');
    await catSelect.selectOption('readability');

    // Add editor note
    const noteInput = editPanel.locator('input[type="text"]');
    await noteInput.fill('E2E smoke test edit');

    // Click "Vista" button
    const saveBtn = editPanel.locator('button.btn-primary');
    await saveBtn.click();

    // After save, the module reloads. Wait for segments to reappear.
    await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 10000 });

    // The first row should now show a "pending" status badge
    const statusBadge = page.locator('.edit-status.pending').first();
    await expect(statusBadge).toBeVisible({ timeout: 5000 });
  });

  // ------------------------------------------------------------------
  // Test 3: Verify save persisted via API
  // ------------------------------------------------------------------
  test('verify save persisted via API', async ({ page }) => {
    moduleId = await navigateToFirstModule(page);

    // Fetch module data via API to check edits exist
    const response = await page.request.get(`/api/segment-editor/${BOOK}/${CHAPTER}/${moduleId}`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();

    // Find any edit by test-admin (user ID 99999) that contains our marker
    const allEdits = Object.values(data.edits).flat();
    const testEdits = allEdits.filter(
      (e) => e.editor_username === 'test-admin' && e.edited_content?.includes(SMOKE_PREFIX)
    );

    expect(testEdits.length).toBeGreaterThan(0);
    expect(testEdits[0].status).toBe('pending');
    expect(testEdits[0].category).toBe('readability');
  });

  // ------------------------------------------------------------------
  // Test 4: Network failure triggers retry with toast
  // ------------------------------------------------------------------
  test('network failure triggers retry with toast', async ({ page }) => {
    moduleId = await navigateToFirstModule(page);

    const editRow = page
      .locator('#segments-body tr')
      .filter({ has: page.locator('button.btn-edit') })
      .first();
    const segId = await editRow.getAttribute('data-segment-id');
    const mod = await (
      await page.request.get(`/api/segment-editor/${BOOK}/${CHAPTER}/${moduleId}`)
    ).json();
    const latest = (mod.edits[segId] || [])[0];
    const inFlight =
      !!latest &&
      (latest.status === 'pending' || (latest.status === 'approved' && !latest.applied_at));
    // Control: Test 2 saved test-admin's pending SMOKE edit on this first editable row and Test 3 asserted it, so
    // the row shows an in-flight edit. Without this, a row showing the base would let the T4 assertions below
    // pass on null/null and never test the in-flight half.
    expect(inFlight).toBe(true);
    expect(latest.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    // T4 (client half): the row renders the pair the module response gave that edit.
    await expect(editRow).toHaveAttribute('data-displayed-edit-id', String(latest.id));
    await expect(editRow).toHaveAttribute('data-displayed-edit-sha256', latest.contentSha256);
    const bodies = [];

    // Intercept POST to edit endpoint — abort first 2 attempts
    let interceptCount = 0;
    await page.route('**/edit', async (route) => {
      if (route.request().method() === 'POST') {
        bodies.push(route.request().postDataJSON());
        interceptCount++;
        if (interceptCount <= 2) {
          await route.abort('connectionfailed');
        } else {
          await route.continue();
        }
      } else {
        await route.continue();
      }
    });

    // Open edit panel
    const editBtn = page.locator('button.btn-edit').first();
    await editBtn.click();
    const editPanel = page.locator('.edit-panel.active').first();
    await expect(editPanel).toBeVisible({ timeout: 5000 });

    // Make an edit
    const textarea = editPanel.locator('textarea');
    const original = await textarea.inputValue();
    await textarea.fill(`${original} [RETRY-NET-${Date.now()}]`);
    await editPanel.locator('select').selectOption('readability');

    // Click save
    await editPanel.locator('button.btn-primary').click();

    // Error toast should appear for the network failure
    const errorToast = page.locator('.toast-error');
    await expect(errorToast).toBeVisible({ timeout: 10000 });

    // Wait for success toast — appears when a background retry succeeds
    // Retries use exponential backoff: 1s, then 2s
    const successToast = page.locator('.toast-success');
    await expect(successToast).toBeVisible({ timeout: 15000 });

    // We should have intercepted at least 2 failed + 1 success = 3 total
    expect(interceptCount).toBeGreaterThanOrEqual(3);
    // §5.9: the replays carry the live attempt's base and action id, marked replayed.
    expect(bodies[0].baseSha256).toMatch(/^[0-9a-f]{64}$/);
    expect('replayed' in bodies[0]).toBe(false);
    for (const b of bodies.slice(1)) {
      expect(b.replayed).toBe(true);
      expect(b.baseSha256).toBe(bodies[0].baseSha256);
      expect(b.clientActionId).toBe(bodies[0].clientActionId);
    }
    // T4 (client half): the save echoes the in-flight edit the row rendered (the null/null arm is the base-displayed
    // control in served-base-client.spec.js's first test).
    expect([bodies[0].displayedEditId, bodies[0].displayedEditSha256]).toEqual([
      latest.id,
      latest.contentSha256,
    ]);
  });

  // ------------------------------------------------------------------
  // Test 5: Server 500 triggers retry with backoff
  // ------------------------------------------------------------------
  test('server 500 triggers retry with backoff', async ({ page }) => {
    moduleId = await navigateToFirstModule(page);

    // Intercept POST to edit endpoint — return 500 for first 2 attempts
    let failCount = 0;
    await page.route('**/edit', async (route) => {
      if (route.request().method() === 'POST') {
        failCount++;
        if (failCount <= 2) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Simulated server error' }),
          });
        } else {
          await route.continue();
        }
      } else {
        await route.continue();
      }
    });

    // Open edit panel
    const editBtn = page.locator('button.btn-edit').first();
    await editBtn.click();
    const editPanel = page.locator('.edit-panel.active').first();
    await expect(editPanel).toBeVisible({ timeout: 5000 });

    // Make an edit
    const textarea = editPanel.locator('textarea');
    const original = await textarea.inputValue();
    await textarea.fill(`${original} [RETRY-500-${Date.now()}]`);
    await editPanel.locator('select').selectOption('readability');

    // Click save
    await editPanel.locator('button.btn-primary').click();

    // Error toast should appear for the 500 response
    const errorToast = page.locator('.toast-error');
    await expect(errorToast).toBeVisible({ timeout: 10000 });

    // Wait for success toast — appears when a background retry succeeds
    const successToast = page.locator('.toast-success');
    await expect(successToast).toBeVisible({ timeout: 15000 });

    // 2 failures + 1 success = 3 total intercepted POSTs
    expect(failCount).toBeGreaterThanOrEqual(2);
  });

  // ------------------------------------------------------------------
  // Test 6: Draft auto-saves to localStorage
  // ------------------------------------------------------------------
  test('draft auto-saves to localStorage', async ({ page }) => {
    moduleId = await navigateToFirstModule(page);

    // Open edit panel
    const editBtn = page.locator('button.btn-edit').first();
    await editBtn.click();
    const editPanel = page.locator('.edit-panel.active').first();
    await expect(editPanel).toBeVisible({ timeout: 5000 });

    // Type unique text and dispatch input event to mark dirty
    const textarea = editPanel.locator('textarea');
    const draftMarker = `DRAFT-TEST-${Date.now()}`;
    await textarea.fill(draftMarker);
    await textarea.dispatchEvent('input');

    // Wait for draft timer to fire (5s interval + buffer)
    await page.waitForTimeout(6000);

    // Check localStorage for our draft
    const hasDraft = await page.evaluate((marker) => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('seg-draft:')) {
          const val = localStorage.getItem(key);
          if (val && val.includes(marker)) return true;
        }
      }
      return false;
    }, draftMarker);

    expect(hasDraft).toBe(true);
    // §5.18: version 2, keeping the base the text was typed on, plus the mirror a pre-deploy page reads.
    const segId = await page
      .locator('#segments-body tr')
      .filter({ has: page.locator('.edit-panel.active') })
      .first()
      .getAttribute('data-segment-id');
    const rowBase = await page
      .locator(`#segments-body tr[data-segment-id="${segId}"]`)
      .getAttribute('data-base-sha256');
    const stored = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('seg-draft:')) return JSON.parse(localStorage.getItem(key));
      }
      return null;
    });
    expect(rowBase).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.v).toBe(2);
    expect(stored.segments[segId].text).toBe(draftMarker);
    expect(stored.segments[segId].baseSha256).toBe(rowBase);
    expect(stored.drafts[segId]).toBe(draftMarker);
  });

  // ------------------------------------------------------------------
  // Test 7: Draft recovery on reload
  // ------------------------------------------------------------------
  test('draft recovery on reload', async ({ page }) => {
    moduleId = await navigateToFirstModule(page);

    // Today's format, as a page loaded before the G1.1 deploy wrote it (§5.18), on the
    // first row's REAL id (data-segment-id; no reversing of cssId).
    const draftMarker = `RECOVERY-TEST-${Date.now()}`;
    const segId = await page.locator('#segments-body tr').first().getAttribute('data-segment-id');
    expect(segId).toBeTruthy();
    // Accept the recovery confirm and any validation prompt; DECLINE closePanels. restoreDraft runs inside
    // loadModule before its background loads (loadTermData, loadRepetitions), and each of those re-renders and
    // asks closePanels while the restored pane is dirty: accepting it would close the pane before Vista is clicked.
    page.on('dialog', (d) =>
      d.message().startsWith('Opnum klippispjöldum') ? d.dismiss() : d.accept()
    ); // UI.confirm.closePanels, ui-strings.js:50

    // Back to the selector and into the module again (unchanged from today's Test 7).
    await page.locator('#btn-back').click();
    await expect(page.locator('#module-selector')).toBeVisible({ timeout: 5000 });
    // The draft is written AFTER Back: the Back handler's clearDraft() removes every draft under the
    // module's prefix, so one written before it never reaches restoreDraft (measured: no pane opened).
    await page.evaluate(
      ({ book, chapter, mid, sid, marker }) => {
        localStorage.setItem(
          `seg-draft:${book}/${chapter}/${mid}:fake-e2e-tab`,
          JSON.stringify({ ts: Date.now(), drafts: { [sid]: marker } })
        );
      },
      { book: BOOK, chapter: CHAPTER, mid: moduleId, sid: segId, marker: draftMarker }
    );
    await page.locator('#book-select').selectOption(BOOK);
    const chapterSelect = page.locator('#chapter-select');
    await expect(chapterSelect).toBeEnabled({ timeout: 5000 });
    await chapterSelect.selectOption(CHAPTER);
    // Wait for the chapter's cards before choosing one (as navigateToFirstModule does): counted at once,
    // the pinned card is not there yet and the fallback opens another module (measured: m68663).
    await expect(page.locator('.module-card').first()).toBeVisible({ timeout: 10000 });
    const targetCard = page.locator(`.module-card[title^="${MODULE}"]`).first();
    const moduleCard =
      (await targetCard.count()) > 0 ? targetCard : page.locator('.module-card').first();
    await expect(moduleCard).toBeVisible({ timeout: 10000 });
    await moduleCard.click();
    await expect(page.locator('#editor-container')).toBeVisible({ timeout: 10000 });

    // The legacy draft is restored into that segment's pane, unconditionally.
    const panel = page.locator(`#segments-body tr[data-segment-id="${segId}"] .edit-panel.active`);
    await expect(panel).toHaveCount(1);
    await expect(panel.locator('textarea')).toHaveValue(draftMarker);

    // The next save carries the restore as an unverified, legacy, whole-text item. Stubbed: nothing written. The
    // route is AWAITED before the click, so the POST cannot reach the real server first.
    let resolvePosted;
    const posted = new Promise((r) => (resolvePosted = r));
    await page.route(
      '**/edit',
      async (route) => {
        resolvePosted(route.request().postDataJSON());
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            editId: 1,
            updated: true,
            termWarnings: [],
            qaFindings: [],
          }),
        });
      },
      { times: 1 }
    );
    await panel.locator('button.btn-primary').click();
    expect((await posted).assists).toEqual([
      {
        itemType: 'draft-restore',
        source: null,
        clientTimeMs: expect.any(Number),
        claim: 'unverified',
        detail: { legacy: true, text: draftMarker },
      },
    ]);
  });

  // ------------------------------------------------------------------
  // Test 8: beforeunload saves draft
  // ------------------------------------------------------------------
  test('beforeunload saves draft', async ({ page }) => {
    moduleId = await navigateToFirstModule(page);

    // Clear any existing drafts
    await page.evaluate(() => {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('seg-draft:')) localStorage.removeItem(key);
      }
    });

    // Open edit panel and type text
    const editBtn = page.locator('button.btn-edit').first();
    await editBtn.click();
    const editPanel = page.locator('.edit-panel.active').first();
    await expect(editPanel).toBeVisible({ timeout: 5000 });

    const textarea = editPanel.locator('textarea');
    const marker = `UNLOAD-TEST-${Date.now()}`;
    await textarea.fill(marker);
    // Fire input event to mark dirty
    await textarea.dispatchEvent('input');

    // Trigger beforeunload via evaluate (saveDraft is called from there)
    await page.evaluate(() => {
      // The segment-editor.html registers a beforeunload handler that calls saveDraft()
      window.dispatchEvent(new Event('beforeunload'));
    });

    // Small wait for the event handler to complete
    await page.waitForTimeout(200);

    // Check that localStorage now has our draft
    const hasDraft = await page.evaluate((m) => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('seg-draft:')) {
          const val = localStorage.getItem(key);
          if (val && val.includes(m)) return true;
        }
      }
      return false;
    }, marker);

    expect(hasDraft).toBe(true);
  });

  // ------------------------------------------------------------------
  // Test 9: Verify test edits exist and clean up
  // ------------------------------------------------------------------
  test('verify test edits exist and clean up', async ({ page }) => {
    // Navigate to editor and immediately kill the saveRetry queue
    await page.goto('/editor');
    await page.evaluate(() => {
      localStorage.removeItem('saveRetryQueue');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('seg-draft:')) localStorage.removeItem(key);
      }
    });

    // Verify test-admin edits exist on the pinned MODULE (created by earlier tests)
    moduleId = MODULE;

    const resp = await page.request.get(`/api/segment-editor/${BOOK}/${CHAPTER}/${moduleId}`);
    const data = await resp.json();
    const testEdits = Object.values(data.edits)
      .flat()
      .filter((e) => e.editor_username === 'test-admin');

    // Tests 2, 4, 5 all edited the same segment — should be 1 upserted edit
    expect(testEdits.length).toBeGreaterThan(0);
    expect(testEdits[0].status).toBe('pending');

    // Attempt cleanup via DELETE API (best-effort — known type mismatch
    // in deleteSegmentEdit's strict comparison of editor_id)
    for (const edit of testEdits) {
      await page.request.delete(`/api/segment-editor/edit/${edit.id}`);
    }
  });
});
