// @ts-check
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * spec §5.4 (G1.1 + G1.2 PR2): a serve whose opening could not be recorded answers 503 OPENING_UNRECORDED; the page
 * shows its own text and returns to the module list, from which the editor opens the unit again. On a reload from an
 * open pane (after a save, a review action, or a refused save), the editor leaves the unit as Back leaves it, except
 * that nothing is discarded: every pane's text, and every text a refused save kept, stays in this unit's draft and
 * comes back when the unit is opened again (decision 13). Nothing the editor can do on that screen saves, accepts or
 * discards for the unit (T6's client half): not Escape, Ctrl/Cmd+S, Ctrl/Cmd+Shift+Enter, F5, or a refused replay.
 * Writes sent BEFORE the reload are NOT stopped, on purpose, and may land after it: a save saveRetry queued, and a
 * save, accept or review action still awaiting its answer. Their texts were typed while the unit was open, which
 * Review Focus 8 accepts as the honest record. Such an answer changes nothing the editor left and re-serves nothing;
 * a save refused with a kept code adds its text to the unit's draft, which brings it back unasked (PR2 review R1).
 *
 * The 503 is STUBBED (route.fulfill): the E2E database holds no users row (seed-fixture.js) and logins are injected
 * JWTs (helpers/auth.js), so the opening predicate never holds here and the real server never answers it. The
 * real-server half is server/__tests__/moduleOpeningRoute.test.js. Writes no edit and no acceptance on the server:
 * every save and accept a test sends is a route.fulfill stub, so no test claims a segment in helpers/segments.js's
 * table (its real module GETs still mint served versions, as every editor spec's do).
 */
const UI = new Function(
  `${fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ui-strings.js'), 'utf8')}; return UI;`
)();
const segmentValidation = require('../public/js/segment-validation');
const MODULE_URL = '/api/segment-editor/efnafraedi-2e/1/m68664';
const MODULE_GET = `**${MODULE_URL}`;
const OPENING = { error: 'OPENING_UNRECORDED', message: 'netþjónn' };
const STUB_SAVED = { success: true, editId: 1, updated: false, termWarnings: [], qaFindings: [] };
const stub = (status, body) => (route) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
/** A route predicate for POST <module>/<suffix> (edit, accept). */
const writeTo = (suffix) => (url) => url.pathname === `${MODULE_URL}/${suffix}`;
const rowOf = (page, segmentId) =>
  page.locator(`#segments-body tr[data-segment-id="${segmentId}"]`);
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
/** Every draft value stored for a unit of chapter 1, under any tab's key, joined: what a reopen would read. */
const draftsOf = (page, moduleId) =>
  page.evaluate(
    (m) =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith(`seg-draft:efnafraedi-2e/1/${m}:`))
        .map((k) => localStorage.getItem(k))
        .join('\n'),
    moduleId
  );
/** The keys saveRetry holds parked (refused replays), waiting for their unit's next load. */
const parkedKeys = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem('saveRetryParked') || '[]').map((p) => p.key)
  );

/**
 * One row per tag of a chapter-1 unit whose own text plus a suffix the client's validator passes with no warning, so a
 * save from them asks nothing before it posts. Returns the rows and those texts. Rows nearest the module's middle that
 * hold no edit and no acceptance: sibling specs write to the first rows of efnafraedi-2e's m68664 in a parallel
 * worker (segment-editor.spec.js's `…:abstract:auto-2`, ux-phase2's first append-safe row; helpers/segments.js),
 * and a row holding another editor's pending edit shows no edit button (measured: the full suite timed out on it).
 */
async function freeRows(page, tags, moduleId = 'm68664') {
  const res = await page.request.get(`/api/segment-editor/efnafraedi-2e/1/${moduleId}`);
  expect(res.ok()).toBe(true);
  const data = await res.json();
  const stamp = Date.now();
  const mid = Math.floor(data.segments.length / 2);
  const rows = data.segments
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => {
      if (i < 3 || i > data.segments.length - 2 || !s.hasTranslation || !s.is) return false;
      if ((data.edits[s.segmentId] || []).length || (data.acceptances || {})[s.segmentId])
        return false;
      return tags.every((tag) => {
        const v = segmentValidation.validateStructure(s.en, s.is, `${s.is} ${tag}-${stamp}`);
        return !v.blocked && !v.warnings;
      });
    })
    .sort((a, b) => Math.abs(a.i - mid) - Math.abs(b.i - mid));
  expect(rows.length).toBeGreaterThanOrEqual(tags.length);
  return rows
    .slice(0, tags.length)
    .map(({ s }, i) => ({ ...s, text: `${s.is} ${tags[i]}-${stamp}` }));
}
async function typeInto(page, segmentId, text) {
  const row = rowOf(page, segmentId);
  await row.locator('.btn-edit').first().click();
  await row.locator('textarea').fill(text);
  await row.locator('textarea').dispatchEvent('input');
}
/** Answer every save and accept with a stub, recording each body: nothing reaches the server. */
async function recordWrites(page) {
  const posts = { edit: [], accept: [] };
  for (const what of ['edit', 'accept']) {
    await page.route(writeTo(what), (route) => {
      posts[what].push(route.request().postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(what === 'edit' ? STUB_SAVED : { success: true }),
      });
    });
  }
  return posts;
}

/**
 * Review Focus 13's start: pane W holds typed text, pane Y's save is refused 409 STALE_BASE (PR1's keepText holds
 * Y and writes both to the draft), and the reload that follows answers 503 OPENING_UNRECORDED, so the branch runs.
 * Leaves the 503 stub installed and the save stub removed. Returns both rows with their texts.
 */
async function refuseThenUnrecorded(page) {
  await openForReal(page);
  const [w, y] = await freeRows(page, ['W', 'Y']);
  await typeInto(page, w.segmentId, w.text);
  await typeInto(page, y.segmentId, y.text);
  await page.route(writeTo('edit'), stub(409, { error: 'STALE_BASE', message: 'stub' }));
  await page.route(MODULE_GET, stub(503, OPENING));
  const asked = [];
  const acceptAll = (d) => {
    asked.push(d.message());
    d.accept().catch(() => {});
  };
  page.on('dialog', acceptAll);
  await rowOf(page, y.segmentId).getByRole('button', { name: 'Vista', exact: true }).click();
  await expect.poll(() => asked).toContain(UI.segmentEditor.openingUnrecorded);
  page.off('dialog', acceptAll);
  await expect(page.locator('#editor-container')).toBeHidden();
  await page.unroute(writeTo('edit'));
  // Positive control for every test built on this: right after the branch, the draft holds both texts.
  const stored = await draftsOf(page, 'm68664');
  expect(stored).toContain(w.text);
  expect(stored).toContain(y.text);
  return { w, y };
}

/**
 * Open m68664 again from the module list, answering every dialog to the end of the test: a draft-recovery offer is
 * accepted, anything else (a background re-render's closePanels about the restored, dirty pane) is declined, as an
 * editor keeping the restored pane would. Resolves, once both background loads have answered, to the messages asked.
 */
async function reopen(page) {
  await page.unroute(MODULE_GET);
  const background = backgroundLoads(page);
  const asked = [];
  page.on('dialog', (d) => {
    asked.push(d.message());
    const recovery = [1, 2, 3].some((n) => d.message() === UI.confirm.draftRecovery(n));
    (recovery ? d.accept() : d.dismiss()).catch(() => {});
  });
  await page.locator('.module-card[title^="m68664"]').click();
  await background;
  return asked;
}
const recoveryOffers = (asked) =>
  asked.filter((m) => [1, 2, 3].some((n) => m === UI.confirm.draftRecovery(n)));
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

/** Whether a response is the answer to POST <module>/edit with this status. */
const editAnswered = (status) => (r) =>
  new URL(r.url()).pathname === `${MODULE_URL}/edit` && r.status() === status;
/** Record every GET of m68664 itself (a serve: the module list and the background loads are other paths). */
function recordModuleGets(page) {
  const gets = [];
  page.on('request', (r) => {
    if (r.method() === 'GET' && new URL(r.url()).pathname === MODULE_URL) gets.push(r.url());
  });
  return gets;
}
/** A promise the test resolves by hand, with the value the route then answers. */
function heldAnswer() {
  let answer;
  let arrived;
  const value = new Promise((r) => (answer = (status, body) => r({ status, body })));
  const sent = new Promise((r) => (arrived = r));
  return { answer, value, sent, arrived: () => arrived() };
}

/**
 * A save still in flight when the unit is left (PR2 review R1): panes X, V and Z hold typed text, X's save is held at
 * the route, and V's save answers 200, so saveEdit's own reload meets a stubbed 503 OPENING_UNRECORDED and the branch
 * runs while X's save has no answer yet. Leaves the 503 stub installed and every dialog accepted until
 * stopAnswering(). Returns the rows, answerX(status, body), and the module GETs and dialogs recorded.
 */
async function saveInFlightThenUnrecorded(page) {
  await openForReal(page);
  const [x, v, z] = await freeRows(page, ['X', 'V', 'Z']);
  const held = heldAnswer();
  await page.route(writeTo('edit'), async (route) => {
    if (route.request().postDataJSON().segmentId !== x.segmentId)
      return stub(200, STUB_SAVED)(route);
    held.arrived();
    const { status, body } = await held.value;
    return stub(status, body)(route);
  });
  const moduleGets = recordModuleGets(page);
  const asked = [];
  const acceptAll = (d) => {
    asked.push(d.message());
    d.accept().catch(() => {});
  };
  page.on('dialog', acceptAll);
  for (const row of [x, v, z]) await typeInto(page, row.segmentId, row.text);
  await rowOf(page, x.segmentId).getByRole('button', { name: 'Vista', exact: true }).click();
  await held.sent;
  await page.route(MODULE_GET, stub(503, OPENING));
  await rowOf(page, v.segmentId).getByRole('button', { name: 'Vista', exact: true }).click();
  await expect.poll(() => asked).toContain(UI.segmentEditor.openingUnrecorded);
  await expect(page.locator('#editor-container')).toBeHidden();
  // Positive control for every test built on this: right after the branch the draft holds the text in flight and
  // the other pane's.
  const stored = await draftsOf(page, 'm68664');
  expect(stored).toContain(x.text);
  expect(stored).toContain(z.text);
  return {
    x,
    z,
    answerX: held.answer,
    moduleGets,
    getsAtBranch: moduleGets.length,
    asked,
    stopAnswering: () => page.off('dialog', acceptAll),
  };
}
const openingAlerts = (asked) => asked.filter((m) => m === UI.segmentEditor.openingUnrecorded);

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

  test('Review Focus 13: a refused save whose reload answers 503; opened again, the kept text comes back unasked and the typed one is offered back', async ({
    page,
  }) => {
    const { w, y } = await refuseThenUnrecorded(page);
    const asked = await reopen(page);
    await expect(rowOf(page, y.segmentId).locator('textarea')).toHaveValue(y.text);
    await expect(
      rowOf(page, y.segmentId).locator('.draft-notice[data-notice="STALE_BASE"]')
    ).toBeVisible();
    await expect(rowOf(page, w.segmentId).locator('textarea')).toHaveValue(w.text);
    // Only the typed text asks (index decision 12: a kept text comes back unasked).
    expect(recoveryOffers(asked)).toEqual([UI.confirm.draftRecovery(1)]);
  });

  test('after the branch, Escape on the module list keeps every text in the draft', async ({
    page,
  }) => {
    const { w, y } = await refuseThenUnrecorded(page); // its positive control: both texts in the draft
    await page.keyboard.press('Escape');
    const stored = await draftsOf(page, 'm68664');
    expect(stored).toContain(w.text);
    expect(stored).toContain(y.text);
  });

  test('after the branch, F5 keeps every text: no leave prompt, and the page brings the kept text back and offers the typed one', async ({
    page,
  }) => {
    const { w, y } = await refuseThenUnrecorded(page);
    await page.unroute(MODULE_GET); // the page's own first load after F5 is real
    const asked = [];
    page.on('dialog', (d) => {
      asked.push(`${d.type()}:${d.message()}`);
      const take = d.type() === 'beforeunload' || d.message() === UI.confirm.draftRecovery(1);
      (take ? d.accept() : d.dismiss()).catch(() => {});
    });
    const background = backgroundLoads(page);
    await page.reload();
    await background;
    await expect(rowOf(page, w.segmentId).locator('textarea')).toHaveValue(w.text);
    await expect(rowOf(page, y.segmentId).locator('textarea')).toHaveValue(y.text);
    await expect(
      rowOf(page, y.segmentId).locator('.draft-notice[data-notice="STALE_BASE"]')
    ).toBeVisible();
    expect(asked).toContain(`confirm:${UI.confirm.draftRecovery(1)}`);
    // Nothing was on screen to lose, so leaving asks nothing.
    expect(asked.filter((m) => m.startsWith('beforeunload:'))).toEqual([]);
  });

  test('after the branch, Ctrl+S on the module list sends no save', async ({ page }) => {
    await openForReal(page);
    const [x] = await freeRows(page, ['S', 'S2']);
    const posts = await recordWrites(page);
    await typeInto(page, x.segmentId, x.text);
    await reloadWithStub(page, 503, OPENING);
    await expect(page.locator('#editor-container')).toBeHidden();
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(1000);
    expect(posts.edit).toEqual([]);

    // Control: on the unit opened again, with that text restored to its pane, the same key from outside the
    // textarea (the handler's fallback to the open pane, the route it would take after the branch) does send it.
    await reopen(page);
    await expect(rowOf(page, x.segmentId).locator('textarea')).toHaveValue(x.text);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const reloaded = backgroundLoads(page); // saveEdit's reload after the stubbed save
    await page.keyboard.press('Control+s');
    await expect.poll(() => posts.edit.map((b) => b.editedContent)).toEqual([x.text]);
    await reloaded;
  });

  test('after the branch, Ctrl+Shift+Enter twice on the module list sends no accept', async ({
    page,
  }) => {
    await openForReal(page);
    const posts = await recordWrites(page);
    await reloadWithStub(page, 503, OPENING);
    await expect(page.locator('#editor-container')).toBeHidden();
    await page.keyboard.press('Control+Shift+Enter');
    await page.keyboard.press('Control+Shift+Enter');
    await page.waitForTimeout(1000);
    expect(posts.accept).toEqual([]);

    // Control: on the unit opened again, the same two presses accept one row (the first places the cursor).
    await reopen(page);
    await page.keyboard.press('Control+Shift+Enter');
    const reloaded = backgroundLoads(page); // acceptSegment's reload after the stubbed accept
    await page.keyboard.press('Control+Shift+Enter');
    await expect.poll(() => posts.accept.length).toBe(1);
    await reloaded;
  });

  test('a save queued before the branch and refused after it neither rewrites the draft nor reloads the unit; its text waits for the next opening', async ({
    page,
  }) => {
    await openForReal(page);
    const [x, w] = await freeRows(page, ['T1', 'W']);
    const T2 = `${x.text} T2`;
    // The live save answers 500, so saveRetry queues it; its replay is held until the branch has run, then refused.
    let saves = 0;
    let release;
    const gate = new Promise((r) => (release = r));
    let replayArrived;
    const replaySeen = new Promise((r) => (replayArrived = r));
    await page.route(writeTo('edit'), async (route) => {
      saves++;
      if (saves === 1) return stub(500, { error: 'boom' })(route);
      replayArrived();
      await gate;
      return stub(409, { error: 'STALE_BASE', message: 'stub' })(route);
    });
    const moduleGets = [];
    page.on('request', (r) => {
      if (r.method() === 'GET' && new URL(r.url()).pathname === MODULE_URL) moduleGets.push(r);
    });
    const asked = [];
    const acceptAll = (d) => {
      asked.push(d.message());
      d.accept().catch(() => {});
    };
    page.on('dialog', acceptAll);

    await typeInto(page, x.segmentId, x.text);
    await rowOf(page, x.segmentId).getByRole('button', { name: 'Vista', exact: true }).click();
    await expect.poll(() => saves).toBe(1);
    await rowOf(page, x.segmentId).locator('textarea').fill(T2); // the editor keeps typing
    await rowOf(page, x.segmentId).locator('textarea').dispatchEvent('input');
    await typeInto(page, w.segmentId, w.text);
    await page.route(MODULE_GET, stub(503, OPENING));
    await page.evaluate(() => window.loadModule('m68664', { force: true }));
    await expect(page.locator('#editor-container')).toBeHidden();
    const before = await draftsOf(page, 'm68664'); // positive control: the branch wrote both texts
    expect(before).toContain(T2);
    expect(before).toContain(w.text);
    const getsAtBranch = moduleGets.length;

    await replaySeen;
    const refused = page.waitForResponse(
      (r) => new URL(r.url()).pathname === `${MODULE_URL}/edit` && r.status() === 409
    );
    release();
    await refused;
    const key = `seg:efnafraedi-2e/1/m68664:${x.segmentId}`;
    // saveRetry parks it on the answer's body; wait for that, or for either harm, whichever comes first.
    await expect
      .poll(
        async () =>
          (await parkedKeys(page)).includes(key) ||
          moduleGets.length > getsAtBranch ||
          !(await draftsOf(page, 'm68664')).includes(T2)
      )
      .toBe(true);
    const after = await draftsOf(page, 'm68664');
    expect(after).toContain(T2);
    expect(after).toContain(w.text);
    expect(moduleGets.length).toBe(getsAtBranch); // nothing reloaded the unit on its own
    expect(await parkedKeys(page)).toContain(key); // left for the unit's next load
    page.off('dialog', acceptAll);

    // Opened again: restoreDraft merges the parked refusal with the newer drafted text (mergeRestoreSources), so the
    // pane gets T2, marked kept with the replay's code, unasked; the other pane's text is offered back.
    const reopened = await reopen(page);
    await expect(rowOf(page, x.segmentId).locator('textarea')).toHaveValue(T2);
    await expect(
      rowOf(page, x.segmentId).locator('.draft-notice[data-notice="STALE_BASE"]')
    ).toBeVisible();
    await expect(rowOf(page, w.segmentId).locator('textarea')).toHaveValue(w.text);
    expect(recoveryOffers(reopened)).toEqual([UI.confirm.draftRecovery(1)]);
  });

  test("opening another unit after the branch writes none of this unit's texts under that unit's draft key", async ({
    page,
  }) => {
    const { w, y } = await refuseThenUnrecorded(page);
    await page.unroute(MODULE_GET);
    const background = Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/efnafraedi-2e/1/m68663/terms')),
      page.waitForResponse((r) => r.url().endsWith('/efnafraedi-2e/1/m68663/repetitions')),
    ]);
    await page.locator('.module-card[title^="m68663"]').click();
    await expect(page.locator('#editor-container')).toBeVisible({ timeout: 10000 });
    await background;
    // Control: a text typed in the other unit IS written under its key within one draft-timer period, so a text of
    // m68664's written there would be seen.
    const [b] = await freeRows(page, ['B', 'B2'], 'm68663');
    await typeInto(page, b.segmentId, b.text);
    await page.waitForTimeout(6000);
    const other = await draftsOf(page, 'm68663');
    expect(other).toContain(b.text);
    expect(other).not.toContain(y.text);
    expect(other).not.toContain(w.text);
    const own = await draftsOf(page, 'm68664');
    expect(own).toContain(y.text);
    expect(own).toContain(w.text);
  });

  test('Back with a kept text, then Escape on the module list, keeps the kept text in the draft', async ({
    page,
  }) => {
    await openForReal(page);
    const [, y] = await freeRows(page, ['K', 'Y']);
    await typeInto(page, y.segmentId, y.text);
    await page.route(writeTo('edit'), stub(409, { error: 'STALE_BASE', message: 'stub' }));
    const background = backgroundLoads(page); // the refusal's reload is real: it puts the kept text back
    const acceptAll = (d) => d.accept().catch(() => {});
    page.on('dialog', acceptAll);
    await rowOf(page, y.segmentId).getByRole('button', { name: 'Vista', exact: true }).click();
    await background;
    await expect(
      rowOf(page, y.segmentId).locator('.draft-notice[data-notice="STALE_BASE"]')
    ).toBeVisible();
    page.off('dialog', acceptAll);
    await page.locator('#btn-back').click();
    await expect(page.locator('#module-selector')).toBeVisible();
    expect(await draftsOf(page, 'm68664')).toContain(y.text); // control: Back kept it
    await page.keyboard.press('Escape');
    expect(await draftsOf(page, 'm68664')).toContain(y.text);
  });

  test('a save in flight when the branch runs, refused after it: the other pane keeps its text, nothing reopens the unit, and F5 asks nothing and brings the text back kept (R1)', async ({
    page,
  }) => {
    const { x, z, answerX, moduleGets, getsAtBranch, asked, stopAnswering } =
      await saveInFlightThenUnrecorded(page);
    const refused = page.waitForResponse(editAnswered(409));
    answerX(409, { error: 'STALE_BASE', message: 'stub' });
    await refused;
    await expect.poll(() => asked.some((m) => m.includes(UI.refusal.textKept))).toBe(true); // reported
    const stored = await draftsOf(page, 'm68664');
    expect(stored).toContain(z.text);
    expect(stored).toContain(x.text);
    expect(moduleGets.length).toBe(getsAtBranch); // nothing re-served the unit on its own
    expect(openingAlerts(asked)).toHaveLength(1);
    stopAnswering();

    // F5: nothing is on screen to lose, so leaving asks nothing; the page's own load brings X back unasked, marked
    // kept with the refusal's code, and offers Z back.
    await page.unroute(MODULE_GET);
    const leaving = [];
    page.on('dialog', (d) => {
      leaving.push(`${d.type()}:${d.message()}`);
      const take = d.type() === 'beforeunload' || d.message() === UI.confirm.draftRecovery(1);
      (take ? d.accept() : d.dismiss()).catch(() => {});
    });
    const background = backgroundLoads(page);
    await page.reload();
    await background;
    await expect(rowOf(page, x.segmentId).locator('textarea')).toHaveValue(x.text);
    await expect(
      rowOf(page, x.segmentId).locator('.draft-notice[data-notice="STALE_BASE"]')
    ).toBeVisible();
    await expect(rowOf(page, z.segmentId).locator('textarea')).toHaveValue(z.text);
    expect(leaving).toContain(`confirm:${UI.confirm.draftRecovery(1)}`);
    expect(leaving.filter((m) => m.startsWith('beforeunload:'))).toEqual([]);
  });

  test("a save refused after the branch writes its text under no other unit's draft key (R1)", async ({
    page,
  }) => {
    const { x, z, answerX, asked, stopAnswering } = await saveInFlightThenUnrecorded(page);
    const refused = page.waitForResponse(editAnswered(409));
    answerX(409, { error: 'STALE_BASE', message: 'stub' });
    await refused;
    await expect.poll(() => asked.some((m) => m.includes(UI.refusal.textKept))).toBe(true);
    stopAnswering();
    await page.unroute(MODULE_GET);
    const background = Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/efnafraedi-2e/1/m68663/terms')),
      page.waitForResponse((r) => r.url().endsWith('/efnafraedi-2e/1/m68663/repetitions')),
    ]);
    await page.locator('.module-card[title^="m68663"]').click();
    await expect(page.locator('#editor-container')).toBeVisible({ timeout: 10000 });
    await background;
    // Control: a text typed in the other unit IS written under its key within one draft-timer period.
    const [b] = await freeRows(page, ['B'], 'm68663');
    await typeInto(page, b.segmentId, b.text);
    await page.waitForTimeout(6000);
    const other = await draftsOf(page, 'm68663');
    expect(other).toContain(b.text);
    expect(other).not.toContain(x.text);
    expect(other).not.toContain(z.text);
    const own = await draftsOf(page, 'm68664');
    expect(own).toContain(x.text);
    expect(own).toContain(z.text);
  });

  test('a save in flight when the branch runs, saved after it: the other pane keeps its text and nothing reopens the unit (R1)', async ({
    page,
  }) => {
    const { z, answerX, moduleGets, getsAtBranch, asked, stopAnswering } =
      await saveInFlightThenUnrecorded(page);
    const saved = page.waitForResponse(editAnswered(200));
    answerX(200, STUB_SAVED);
    await saved;
    await page.waitForTimeout(1000); // what saveEdit runs after its await
    expect(await draftsOf(page, 'm68664')).toContain(z.text);
    expect(moduleGets.length).toBe(getsAtBranch);
    expect(openingAlerts(asked)).toHaveLength(1);
    await expect(page.locator('#editor-container')).toBeHidden();
    stopAnswering();
    const reopened = await reopen(page);
    await expect(rowOf(page, z.segmentId).locator('textarea')).toHaveValue(z.text);
    expect(recoveryOffers(reopened)).toHaveLength(1);
  });

  test('control: a save refused after its unit was opened again is kept in its pane, as in any open unit (R1)', async ({
    page,
  }) => {
    const { x, z, answerX, stopAnswering } = await saveInFlightThenUnrecorded(page);
    stopAnswering();
    const reopened = await reopen(page); // answers every dialog from here: accepts a recovery, declines the rest
    expect(recoveryOffers(reopened)).toEqual([UI.confirm.draftRecovery(2)]);
    await expect(rowOf(page, x.segmentId).locator('textarea')).toHaveValue(x.text);
    const background = backgroundLoads(page); // the refusal's reload of the open unit
    answerX(409, { error: 'STALE_BASE', message: 'stub' });
    await background;
    await expect(
      rowOf(page, x.segmentId).locator('.draft-notice[data-notice="STALE_BASE"]')
    ).toBeVisible();
    await expect(rowOf(page, x.segmentId).locator('textarea')).toHaveValue(x.text);
    await expect(rowOf(page, z.segmentId).locator('textarea')).toHaveValue(z.text);
  });

  test("Back with a kept text while a save is in flight: the save's answer neither drops the kept text nor reopens the unit (R1; from PR1)", async ({
    page,
  }) => {
    await openForReal(page);
    const [x, y] = await freeRows(page, ['X', 'Y']);
    const held = heldAnswer();
    await page.route(writeTo('edit'), async (route) => {
      if (route.request().postDataJSON().segmentId === y.segmentId)
        return stub(409, { error: 'STALE_BASE', message: 'stub' })(route);
      held.arrived();
      const { status, body } = await held.value;
      return stub(status, body)(route);
    });
    const acceptAll = (d) => d.accept().catch(() => {});
    page.on('dialog', acceptAll);
    await typeInto(page, y.segmentId, y.text);
    const background = backgroundLoads(page); // the refusal's reload is real: it puts the kept text back
    await rowOf(page, y.segmentId).getByRole('button', { name: 'Vista', exact: true }).click();
    await background;
    await expect(
      rowOf(page, y.segmentId).locator('.draft-notice[data-notice="STALE_BASE"]')
    ).toBeVisible();
    await typeInto(page, x.segmentId, x.text);
    await rowOf(page, x.segmentId).getByRole('button', { name: 'Vista', exact: true }).click();
    await held.sent;
    await page.locator('#btn-back').click();
    await expect(page.locator('#module-selector')).toBeVisible();
    expect(await draftsOf(page, 'm68664')).toContain(y.text); // control: Back kept it
    const moduleGets = recordModuleGets(page);
    const saved = page.waitForResponse(editAnswered(200));
    held.answer(200, STUB_SAVED);
    await saved;
    await page.waitForTimeout(1000);
    expect(await draftsOf(page, 'm68664')).toContain(y.text);
    expect(moduleGets).toEqual([]);
    await expect(page.locator('#editor-container')).toBeHidden();
  });

  test('an accept in flight when the branch runs does not reopen the unit when it answers (R1)', async ({
    page,
  }) => {
    await openForReal(page);
    const [a, v] = await freeRows(page, ['A', 'V']);
    const held = heldAnswer();
    await page.route(writeTo('accept'), async (route) => {
      held.arrived();
      const { status, body } = await held.value;
      return stub(status, body)(route);
    });
    await page.route(writeTo('edit'), stub(200, STUB_SAVED));
    const moduleGets = recordModuleGets(page);
    const asked = [];
    page.on('dialog', (d) => {
      asked.push(d.message());
      d.accept().catch(() => {});
    });
    await typeInto(page, v.segmentId, v.text);
    await rowOf(page, a.segmentId).locator('.btn-accept').click();
    await held.sent;
    await page.route(MODULE_GET, stub(503, OPENING));
    await rowOf(page, v.segmentId).getByRole('button', { name: 'Vista', exact: true }).click();
    await expect.poll(() => asked).toContain(UI.segmentEditor.openingUnrecorded);
    await expect(page.locator('#editor-container')).toBeHidden();
    const getsAtBranch = moduleGets.length;
    const accepted = page.waitForResponse(
      (r) => new URL(r.url()).pathname === `${MODULE_URL}/accept` && r.status() === 200
    );
    held.answer(200, { success: true });
    await accepted;
    await page.waitForTimeout(1000);
    expect(moduleGets.length).toBe(getsAtBranch);
    expect(openingAlerts(asked)).toHaveLength(1);
  });

  test("propagating from a pane whose save's reload runs the branch sends nothing from the unit (R1)", async ({
    page,
  }) => {
    await openForReal(page);
    const [x] = await freeRows(page, ['P']);
    const previews = [];
    const propagated = [];
    await page.route(writeTo('edit'), stub(200, STUB_SAVED));
    await page.route(
      (url) => url.pathname === `${MODULE_URL}/propagation-preview`,
      (route) => {
        previews.push(route.request().url());
        return stub(200, { eligible: [{ moduleId: 'm68663', segmentId: 'e2e' }] })(route);
      }
    );
    await page.route(writeTo('propagate'), (route) => {
      propagated.push(route.request().postDataJSON());
      return stub(200, { created: [], skipped: [] })(route);
    });
    const asked = [];
    const acceptAll = (d) => {
      asked.push(d.message());
      d.accept().catch(() => {});
    };
    page.on('dialog', acceptAll);
    await typeInto(page, x.segmentId, x.text);
    await page.route(MODULE_GET, stub(503, OPENING));
    await rowOf(page, x.segmentId).locator('.btn-propagate').click();
    await expect.poll(() => asked).toContain(UI.segmentEditor.openingUnrecorded);
    await expect(page.locator('#editor-container')).toBeHidden();
    await page.waitForTimeout(1000);
    expect(previews).toEqual([]);
    expect(propagated).toEqual([]);
    expect(asked).not.toContain(UI.segmentEditor.propagateConfirm(1));
    page.off('dialog', acceptAll);

    // Control: on the unit opened again, the same steps (a typed pane, its save answered 200, a real reload) do reach
    // the preview, so the stubs are live. The save above landed, so nothing is restored to the pane.
    await reopen(page);
    await typeInto(page, x.segmentId, x.text);
    await rowOf(page, x.segmentId).locator('.btn-propagate').click();
    await expect.poll(() => previews.length).toBe(1);
  });
});
