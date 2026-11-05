// @ts-check
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * spec §5.4 (G1.1 + G1.2 PR2): a serve whose opening could not be recorded answers 503 OPENING_UNRECORDED; the page
 * shows its own text and returns to the module list, from which the editor opens the unit again. On a reload from an
 * open pane (after a save, a review action, or a refused save), the pane goes too, so nothing can be saved on a unit
 * whose opening was not recorded (T6), and its typed text stays in the draft.
 *
 * The 503 is STUBBED (route.fulfill): the E2E database holds no users row (seed-fixture.js) and logins are injected
 * JWTs (helpers/auth.js), so the opening predicate never holds here and the real server never answers it. The
 * real-server half is server/__tests__/moduleOpeningRoute.test.js. Writes nothing on the server: the reload tests type
 * into the first pane and never save, so they claim no segment in helpers/segments.js's table.
 */
const UI = new Function(
  `${fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ui-strings.js'), 'utf8')}; return UI;`
)();
const MODULE_GET = '**/api/segment-editor/efnafraedi-2e/1/m68664';
const stub = (status, body) => (route) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
/** Both background loads of m68664 (loadTermData, loadRepetitions), each of which re-renders the table. */
const backgroundLoads = (page) =>
  Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/efnafraedi-2e/1/m68664/terms')),
    page.waitForResponse((r) => r.url().endsWith('/efnafraedi-2e/1/m68664/repetitions')),
  ]);

/** A first load, from the URL, answered by the stub: #editor-container was never shown. */
async function openWithStub(page, status, body) {
  await loginAs(page, 'editor');
  await page.route(MODULE_GET, stub(status, body));
  const dialog = page.waitForEvent('dialog');
  // Not awaited before the dialog: the alert opens before the page's load event, which then waits for the alert to
  // close, so awaiting goto first would never return (measured: page.goto timed out).
  const nav = page.goto('/editor?book=efnafraedi-2e&chapter=1&module=m68664');
  const d = await dialog;
  const message = d.message();
  await d.accept();
  await nav;
  return message;
}

/** A real first load (the predicate never holds in E2E, so it answers 200), then a reload answered by the stub. */
async function openForReal(page) {
  await loginAs(page, 'editor');
  // Both background loads (loadTermData, loadRepetitions) re-render the table, closing any pane opened before them;
  // interact only after they have answered (served-base-client.spec.js's openModule).
  const background = backgroundLoads(page);
  await page.goto('/editor?book=efnafraedi-2e&chapter=1&module=m68664');
  await expect(page.locator('.segment-row').first()).toBeVisible({ timeout: 10000 });
  await background;
}
async function reloadWithStub(page, status, body) {
  await page.route(MODULE_GET, stub(status, body));
  const dialog = page.waitForEvent('dialog');
  const done = page.evaluate(() => window.loadModule('m68664', { force: true })); // the in-editor reload's call
  const d = await dialog;
  const message = d.message();
  await d.accept();
  await done;
  return message;
}
/** Whether any of this module's draft keys (seg-draft:<book>/<chapter>/<module>:<tab>) holds the text. */
const draftHolding = (page, text) =>
  page.evaluate(
    (t) =>
      Object.keys(localStorage).some(
        (k) =>
          k.startsWith('seg-draft:efnafraedi-2e/1/m68664:') && localStorage.getItem(k).includes(t)
      ),
    text
  );
/**
 * Record every tab-claim release this page posts, as "<key> <tabId>", in window.__releases. tabGuard.release() posts
 * on the BroadcastChannel 'editor-tab-guard', and every other channel object of that name receives it, this page's
 * own included (only the posting object does not).
 */
const listenForReleases = (page) =>
  page.evaluate(() => {
    window.__releases = [];
    window.__guardEcho = new BroadcastChannel('editor-tab-guard');
    window.__guardEcho.onmessage = (e) => {
      if (e.data && e.data.type === 'release')
        window.__releases.push(`${e.data.key} ${e.data.tabId}`);
    };
  });

test.describe('a serve whose opening was not recorded (spec §5.4)', () => {
  test('a first load: shows the opening text and returns to the module list, with no pane to save from', async ({
    page,
  }) => {
    const message = await openWithStub(page, 503, {
      error: 'OPENING_UNRECORDED',
      message: 'netþjónn',
    });
    expect(message).toBe(UI.segmentEditor.openingUnrecorded);
    await expect(page.locator('#module-selector')).toBeVisible();
    await expect(page.locator('#editor-container')).toBeHidden();
    await expect(page.locator('.segment-row')).toHaveCount(0);
  });

  test("control: any other first-load error keeps today's text", async ({ page }) => {
    const message = await openWithStub(page, 500, { error: 'boom' });
    expect(message).toBe(UI.common.errorLoading + 'boom');
  });

  test("a first load leaves this tab's draft alone: a text Back kept survives the 503 and comes back on the next opening", async ({
    page,
  }) => {
    await loginAs(page, 'editor');
    const res = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68664');
    expect(res.ok()).toBe(true);
    const segmentId = (await res.json()).segments[0].segmentId;
    await page.goto('/editor?book=efnafraedi-2e&chapter=1');
    await expect(page.locator('.module-card[title^="m68664"]')).toBeVisible({ timeout: 10000 });
    // What Back leaves when it held a refused save's text (PR1 Task 19: clearDraft, then writeDraft(kept)): that
    // text, under this tab's key for the unit. The catch's saveDraft, run with nothing dirty or held, would remove
    // exactly this key, which is why a first load skips the branch (plan decision 13).
    const kept = `BACK-KEPT-${Date.now()}`;
    const key = await page.evaluate(
      ({ id, text }) => {
        const k = `seg-draft:efnafraedi-2e/1/m68664:${window.tabGuard.tabId}`;
        const value = window.segmentSaveState.buildDraftValue(
          { [id]: { text, refused: 'STALE_BASE' } },
          Date.now()
        );
        localStorage.setItem(k, JSON.stringify(value));
        return k;
      },
      { id: segmentId, text: kept }
    );
    const stored = () => page.evaluate((k) => localStorage.getItem(k), key);
    const before = await stored();

    await page.route(MODULE_GET, stub(503, { error: 'OPENING_UNRECORDED', message: 'netþjónn' }));
    const asked = [];
    const acceptAll = (d) => {
      asked.push(d.message());
      d.accept().catch(() => {});
    };
    page.on('dialog', acceptAll);
    await page.locator('.module-card[title^="m68664"]').click();
    await expect.poll(() => asked).toEqual([UI.segmentEditor.openingUnrecorded]);
    page.off('dialog', acceptAll);
    await expect(page.locator('#editor-container')).toBeHidden();
    expect(await stored()).toBe(before);

    // Control: that key is this tab's draft of the unit, the one saveDraft writes and removes. Opened again, the kept
    // text comes back to its pane unasked (index decision 12), and restoreDraft writes it back under exactly that key
    // and no other (it clears the unit's draft keys, then saveDraft writes this tab's).
    await page.unroute(MODULE_GET);
    const background = backgroundLoads(page);
    const reopen = [];
    const keepPanes = (d) => {
      reopen.push(d.message());
      d.dismiss().catch(() => {}); // a background re-render's closePanels, declined: the pane stays
    };
    page.on('dialog', keepPanes);
    await page.locator('.module-card[title^="m68664"]').click();
    await background;
    await expect(
      page.locator(`#segments-body tr[data-segment-id="${segmentId}"] textarea`)
    ).toHaveValue(kept);
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter((k) => k.startsWith('seg-draft:efnafraedi-2e/1/m68664:'))
      )
    ).toEqual([key]);
    expect(reopen).not.toContain(UI.confirm.draftRecovery(1));
  });

  test('a reload from an open pane: the pane goes, the module list shows, and the typed text stays in the draft', async ({
    page,
  }) => {
    await openForReal(page);
    await page.locator('button.btn-edit').first().click();
    const textarea = page.locator('.edit-panel.active textarea').first();
    const typed = `OPNUN-503-${Date.now()}`;
    await textarea.fill(typed);
    await textarea.dispatchEvent('input');

    await listenForReleases(page);
    const message = await reloadWithStub(page, 503, {
      error: 'OPENING_UNRECORDED',
      message: 'netþjónn',
    });
    expect(message).toBe(UI.segmentEditor.openingUnrecorded);
    await expect(page.locator('#editor-container')).toBeHidden();
    await expect(page.locator('#save-status-bar')).toBeHidden();
    await expect(page.locator('#module-selector')).toBeVisible();
    // The tab claim is released, as Back releases it: another tab that opens the unit is not warned about a pane
    // nobody can see.
    const tabId = await page.evaluate(() => window.tabGuard.tabId);
    await expect
      .poll(() => page.evaluate(() => window.__releases))
      .toEqual([`seg:efnafraedi-2e/1/m68664 ${tabId}`]);

    // One draft-timer period (5 s) later the text is still there: the catch stopped the timer before it emptied
    // dirtyEdits, so no tick removed the draft (saveDraft removes it when nothing is dirty or held).
    await page.waitForTimeout(6000);
    expect(await draftHolding(page, typed)).toBe(true);

    // Opening the unit again offers exactly that text back, and asks nothing about panes nobody can see
    // (with dirtyEdits left full, the first dialog would be UI.confirm.closePanels). One handler answers every
    // dialog of the reopen, to the end of the test, so none waits on it (measured: an awaited click hung on the
    // recovery confirm, and a dialog still open at the end failed the context's teardown): it accepts the recovery
    // and declines what follows, as an editor keeping the restored pane would. Only the first dialog is this task's:
    // the closePanels each background load's re-render asks about the restored, dirty pane is renderSegments' own,
    // so the test does not count them.
    await page.unroute(MODULE_GET);
    const background = backgroundLoads(page);
    const dialogs = [];
    const answer = (dlg) => {
      dialogs.push(dlg.message());
      (dialogs.length === 1 ? dlg.accept() : dlg.dismiss()).catch(() => {});
    };
    page.on('dialog', answer);
    await page.locator('.module-card[title^="m68664"]').click();
    await background;
    await expect.poll(() => dialogs[0]).toBe(UI.confirm.draftRecovery(1));
    await expect(page.locator('.edit-panel.active textarea').first()).toHaveValue(typed);
    expect(dialogs.filter((m) => m === UI.confirm.draftRecovery(1))).toHaveLength(1); // offered once
  });

  test("control: a reload that fails otherwise keeps today's text and today's pane", async ({
    page,
  }) => {
    await openForReal(page);
    const message = await reloadWithStub(page, 500, { error: 'boom' });
    expect(message).toBe(UI.common.errorLoading + 'boom');
    // Today's behaviour, kept on purpose (decision 13): only OPENING_UNRECORDED takes the pane away.
    await expect(page.locator('#editor-container')).toBeVisible();
    // And today's tab claim: a claim of the unit from another tab is still answered with tabGuard's warning, which it
    // shows only for the key it holds, so the release in the reload test above is the branch's doing.
    await page.evaluate(() => {
      window.__otherTab = new BroadcastChannel('editor-tab-guard');
      window.__otherTab.postMessage({
        type: 'claim',
        key: 'seg:efnafraedi-2e/1/m68664',
        tabId: 'e2e-other-tab',
      });
    });
    await expect(page.locator('#tab-guard-warning')).toBeVisible();
  });
});
