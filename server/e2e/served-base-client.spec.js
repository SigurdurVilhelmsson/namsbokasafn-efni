// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');
const segmentValidation = require('../public/js/segment-validation');

/**
 * G1.1, the client (spec §5.18; T23; T4's client half): a save and an accept
 * echo what the ROW shows, read from its own DOM, and a refused save keeps the
 * typed text (index decision 12).
 *
 * "The base changed after the page loaded" is simulated by rewriting the FIRST
 * module GET this page receives (route.fetch + route.fulfill), so no file under
 * books/ is touched. A declined re-render is a reload with a dirty pane open and
 * the closePanels confirm dismissed.
 *
 * ⚠️ WRITES AT MOST ONE EDIT ROW: one positive control saves for real and then
 * deletes its row. Every other success is a route.fulfill stub; every other real request is one
 * the server refuses. Rows used: virgin rows nearest the middle of fixture
 * m68664, away from the rows sibling specs claim (helpers/segments.js).
 */
const BOOK = '__e2e-fixture__';
const CHAPTER = '1';
const MODULE = 'm68664';
const MODULE_URL = `/api/segment-editor/${BOOK}/${CHAPTER}/${MODULE}`;
const USER_ID = 88600;
const FAKE_SHA = 'f'.repeat(64);
const SUFFIX = ' g11-client';
const STUB_SAVED = { success: true, editId: 1, updated: false, termWarnings: [], qaFindings: [] };

async function loadModuleJson(page) {
  const res = await page.request.get(MODULE_URL);
  expect(res.ok()).toBe(true);
  return res.json();
}

/**
 * Virgin, append-safe rows nearest the module's middle (siblings claim the ends
 * and the first virgin rows). `plain`: no bracket at all, for edits that wrap or
 * replace text without the backstop seeing a marker move.
 */
function middleVirginRows(data, { plain = false } = {}) {
  const segs = data.segments;
  const mid = Math.floor(segs.length / 2);
  const ok = (s, i) =>
    i > 1 &&
    i < segs.length - 2 &&
    s.hasTranslation &&
    s.is &&
    s.segmentId !== 'm68664:abstract:auto-2' &&
    /^[0-9a-f]{64}$/.test(s.baseSha256 || '') &&
    !(data.edits[s.segmentId] || []).length &&
    !data.acceptances[s.segmentId] &&
    (!plain || !/[[\]]/.test(s.en + s.is)) &&
    !segmentValidation.validateStructure(s.en, s.is, `${s.is}${SUFFIX}`).blocked &&
    !segmentValidation.validateStructure(s.en, s.is, `${s.is}${SUFFIX}`).warnings;
  const picks = segs
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => ok(s, i))
    .sort((a, b) => Math.abs(a.i - mid) - Math.abs(b.i - mid));
  expect(picks.length).toBeGreaterThanOrEqual(2);
  return [picks[0].s, picks[1].s];
}

/** Serve the module once with `edit` applied to one segment, then pass through. */
async function rewriteFirstServe(page, segmentId, edit) {
  let served = 0;
  await page.route(`**${MODULE_URL}`, async (route) => {
    served++;
    if (served > 1 || route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const json = await response.json();
    edit(json.segments.find((s) => s.segmentId === segmentId));
    await route.fulfill({ response, json });
  });
}

async function openModule(page) {
  // Both background loads re-render the table; interact only after they have.
  const background = Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/terms`)),
    page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/repetitions`)),
  ]);
  await page.goto(`/editor?book=${BOOK}&chapter=${CHAPTER}&module=${MODULE}`);
  await expect(page.locator('#editor-container')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 10000 });
  await background;
}

const rowOf = (page, segmentId) =>
  page.locator(`#segments-body tr[data-segment-id="${segmentId}"]`);

/**
 * Reload the module with a dirty pane open, and decline the re-render. loadModule returns before its two
 * background loads (/terms, /repetitions; loadTermData, loadRepetitions) re-render the table, and each re-render asks
 * closePanels again, so wait for both responses before removing the handler. Any confirm still to come then meets
 * NO listener, and Playwright auto-dismisses a dialog nobody listens for: declined too. So no test in this file
 * installs an ACCEPTING dialog handler while a dirty pane must survive a declined re-render. A pane holding a KEPT
 * text (index decision 12) is another matter: the client carries it across every re-render without asking
 * closePanels, so the refusal tests below accept every dialog on purpose, since the kept text must survive even an
 * editor who answers OK.
 */
async function declineReRender(page) {
  const dismiss = (d) => d.dismiss();
  page.on('dialog', dismiss);
  const background = Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/terms`)),
    page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/repetitions`)),
  ]);
  await page.evaluate((m) => window.loadModule(m, { force: true }), MODULE);
  await background;
  page.off('dialog', dismiss);
}

/**
 * Stub the next POST to MODULE_URL/<suffix>: nothing is written. AWAIT this call, so the route is installed before
 * the click; it resolves to `{ posted }`, a promise of the request body. (Wrapped in an object on purpose: an async
 * function that returned the body promise itself would adopt it, and awaiting the call would wait for the click.)
 */
async function captureAndStub(page, suffix, status, json) {
  let resolveBody;
  const posted = new Promise((r) => (resolveBody = r));
  await page.route(
    `**${MODULE_URL}/${suffix}`,
    async (route) => {
      resolveBody(route.request().postDataJSON());
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
    },
    { times: 1 }
  );
  return { posted };
}

test.describe('G1.1 client: the row is what the save and the accept echo', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin', USER_ID);
  });

  test('with no re-render, a save sends the served base and a null displayed pair (T23 control)', async ({
    page,
  }) => {
    const [target] = middleVirginRows(await loadModuleJson(page));
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await expect(row).toHaveAttribute('data-base-sha256', target.baseSha256);
    await row.locator('.btn-edit').click();
    await row.locator('textarea').fill(`${target.is}${SUFFIX}`);
    const { posted } = await captureAndStub(page, 'edit', 200, STUB_SAVED);
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    const body = await posted;
    expect(body.baseSha256).toBe(target.baseSha256);
    expect(body.originalContent).toBe(target.is);
    expect([body.displayedEditId, body.displayedEditSha256, body.baseEditId]).toEqual([
      null,
      null,
      0,
    ]);
    expect(body.clientActionId).toMatch(/^\S{12,}$/);
    expect(typeof body.clientActionTime).toBe('number');
    expect(body.assists).toEqual([]);
    expect('occurrence' in body).toBe(false); // §5.18: not until G1.12 (b)
    expect('replayed' in body).toBe(false);
  });

  test("after a declined re-render, a save sends the row's own base, not the newer one (T23)", async ({
    page,
  }) => {
    const [target] = middleVirginRows(await loadModuleJson(page));
    await rewriteFirstServe(page, target.segmentId, (s) => {
      s.baseSha256 = FAKE_SHA;
    });
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    await row.locator('textarea').fill(`${target.is}${SUFFIX}`);
    await declineReRender(page); // moduleData now holds the real base; the screen does not
    await expect(row).toHaveAttribute('data-base-sha256', FAKE_SHA);
    const { posted } = await captureAndStub(page, 'edit', 200, STUB_SAVED);
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    const body = await posted;
    expect(body.baseSha256).toBe(FAKE_SHA);
    expect(body.baseSha256).not.toBe(target.baseSha256);
  });

  test('control: with no re-render, an accept sends the served text', async ({ page }) => {
    const [target] = middleVirginRows(await loadModuleJson(page));
    await openModule(page);
    const { posted } = await captureAndStub(page, 'accept', 200, { success: true });
    await rowOf(page, target.segmentId).locator('.btn-accept').click();
    const body = await posted;
    expect(body.acceptedContent).toBe(target.is);
    expect(body.acceptOrigin).toBe('single');
    expect(body.clientActionId).toMatch(/^\S{12,}$/);
  });

  test("after a declined re-render, an accept sends the row's own text and the value check refuses it (T4)", async ({
    page,
  }) => {
    const [target, other] = middleVirginRows(await loadModuleJson(page));
    const shownIs = `${target.is} [no longer served]`;
    await rewriteFirstServe(page, target.segmentId, (s) => {
      s.is = shownIs;
    });
    await openModule(page);
    // A dirty pane elsewhere makes the reload ask before re-rendering.
    await rowOf(page, other.segmentId).locator('.btn-edit').click();
    await rowOf(page, other.segmentId).locator('textarea').fill(`${other.is}${SUFFIX}`);
    await declineReRender(page);
    // A DISMISSING handler declines the 409's alert and every closePanels confirm the client's reload raises (the
    // reload itself and each background re-render), exactly as Playwright's auto-dismiss did. It is explicit because
    // auto-dismiss raced the page closing when the test ended mid-dialog ("session closed"); `.catch` swallows that
    // late failure. It is installed only AFTER declineReRender, which adds and removes its own listener: two
    // listeners would dismiss one dialog twice. It must never ACCEPT: an accepting handler would let a late
    // re-render through, rebuild the row from moduleData, and send the real `is`.
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    const posted = page.waitForRequest(
      (r) => r.url().endsWith(`${MODULE_URL}/accept`) && r.method() === 'POST'
    );
    const answered = page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/accept`));
    // The client's post-409 reload fetches its two background loads; waiting for both keeps the test from ending
    // while that reload is still under way (the dialogs its re-renders raise meet the handler above).
    const reloaded = Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/terms`)),
      page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/repetitions`)),
    ]);
    await rowOf(page, target.segmentId).locator('.btn-accept').click();
    expect((await posted).postDataJSON().acceptedContent).toBe(shownIs); // the row, not moduleData
    const res = await answered;
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('STALE_CONTENT'); // the server's value check (§5.6 Accept)
    await reloaded;
    const after = await loadModuleJson(page);
    expect(after.acceptances[target.segmentId]).toBeUndefined(); // nothing written
  });

  test('a save lists the repetition insert, the wraps and the term insert since the pane opened (§5.10)', async ({
    page,
  }) => {
    const [target, other] = middleVirginRows(await loadModuleJson(page), { plain: true });
    // A repetition suggestion for the target, stubbed: the fixture holds no applied twin.
    const suggestion = {
      is_text: `${target.is}${SUFFIX}`,
      book: 'efnafraedi-2e',
      chapter: 3,
      module_id: 'm68000',
    };
    await page.route(`**${MODULE_URL}/repetitions`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ repetitions: [{ segmentId: target.segmentId, suggestion }] }),
      })
    );
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    const ta = row.locator('textarea');
    await row.getByRole('button', { name: 'Nota þessa þýðingu' }).click(); // whole text, tm
    await expect(ta).toHaveValue(suggestion.is_text);
    await ta.evaluate((el) => el.setSelectionRange(0, 3));
    await row.locator('.format-toolbar .tb-bold').click(); // markup-wrap, toolbar
    await ta.press('Control+i'); // markup-wrap, keyboard
    // A term goes into the LAST-FOCUSED textarea: the target's, though another pane opened after it.
    await rowOf(page, other.segmentId).locator('.btn-edit').click();
    await ta.focus();
    await page.evaluate(() => window.insertTermFromLookup('hugtak'));
    const { posted } = await captureAndStub(page, 'edit', 200, STUB_SAVED);
    page.on('dialog', (d) => d.accept()); // the validation warning an empty '*' pair raises
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    const body = await posted;
    expect(body.assists.map((a) => [a.itemType, a.source])).toEqual([
      ['repetition-insert', 'tm'],
      ['markup-wrap', 'toolbar'],
      ['markup-wrap', 'keyboard'],
      ['term-insert', 'termbase'],
    ]);
    expect(body.assists[0].detail).toEqual({
      text: suggestion.is_text,
      book: 'efnafraedi-2e',
      chapter: 3,
      moduleId: 'm68000',
    });
    expect(body.assists[1].detail).toEqual({ marker: '**' });
    expect(body.assists[2].detail).toEqual({ marker: '*' });
    expect(body.assists[3].detail).toEqual({ term: 'hugtak' });
    for (const a of body.assists) expect(typeof a.clientTimeMs).toBe('number');
  });

  test('a stale-base refusal keeps the text, its base, its insert and its wrap; the next save lists them and draft-restore (T23)', async ({
    page,
  }) => {
    const [target] = middleVirginRows(await loadModuleJson(page), { plain: true });
    // T23 "the next save lists both the earlier insert and draft-restore": a repetition insert, stubbed as Task 10's
    // test does (the fixture holds no applied twin). It is a WHOLE-TEXT item, so its detail.text is what a refusal,
    // the draft and the restore could lose (§5.10, §14 call 18).
    const suggestion = {
      is_text: `${target.is} g11-rep`,
      book: 'efnafraedi-2e',
      chapter: 3,
      module_id: 'm68000',
    };
    await page.route(`**${MODULE_URL}/repetitions`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ repetitions: [{ segmentId: target.segmentId, suggestion }] }),
      })
    );
    await rewriteFirstServe(page, target.segmentId, (s) => {
      s.baseSha256 = FAKE_SHA; // the page holds a base the server no longer serves
    });
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.getByRole('button', { name: 'Nota þessa þýðingu' }).click(); // repetition-insert, tm; opens the pane
    const ta = row.locator('textarea');
    await expect(ta).toHaveValue(suggestion.is_text);
    await ta.evaluate((el) => el.setSelectionRange(0, 3));
    await row.locator('.format-toolbar .tb-bold').click();
    await ta.press('End');
    await ta.pressSequentially(SUFFIX);
    const typed = await ta.inputValue();
    const alerts = [];
    page.on('dialog', async (d) => {
      alerts.push(d.message());
      await d.accept().catch(() => {}); // a dialog still open as the page closes (see the T4 test)
    });
    const refused = page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/edit`));
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    const res = await refused;
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('STALE_BASE'); // the real server (§5.6 step 4)

    // After the reload: the pane is back with the text and the notice, on the newly served base.
    await expect(row.locator('.draft-notice[data-notice="STALE_BASE"]')).toBeVisible();
    await expect(row.locator('textarea')).toHaveValue(typed);
    await expect(row).toHaveAttribute('data-base-sha256', target.baseSha256);
    expect(alerts.some((m) => m.includes('geymdur'))).toBe(true);
    const stored = await page.evaluate((id) => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('seg-draft:')) {
          const v = JSON.parse(localStorage.getItem(key));
          if (v.segments && v.segments[id]) return v.segments[id];
        }
      }
      return null;
    }, target.segmentId);
    expect(stored.baseSha256).toBe(FAKE_SHA); // the base it was typed on
    expect(stored.refused).toBe('STALE_BASE');
    expect(stored.assists.map((a) => a.itemType)).toEqual([
      'repetition-insert',
      'markup-wrap',
      'draft-restore',
    ]);
    expect(stored.assists[0].detail.text).toBe(suggestion.is_text); // the whole text survives the draft
    expect((await loadModuleJson(page)).edits[target.segmentId]).toBeUndefined(); // refused: nothing written

    // Positive control, REAL: the next save goes out on the new base, listing the wrap and the restore, and lands.
    const posted = page.waitForRequest(
      (r) => r.url().endsWith(`${MODULE_URL}/edit`) && r.method() === 'POST'
    );
    const saved = page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/edit`));
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    const body = (await posted).postDataJSON();
    expect(body.baseSha256).toBe(target.baseSha256);
    expect(body.assists.map((a) => [a.itemType, a.source])).toEqual([
      ['repetition-insert', 'tm'],
      ['markup-wrap', 'toolbar'],
      ['draft-restore', null],
    ]);
    // The insert's whole text came through the refusal, the draft and the restore unchanged.
    expect(body.assists[0].detail).toEqual({
      text: suggestion.is_text,
      book: 'efnafraedi-2e',
      chapter: 3,
      moduleId: 'm68000',
    });
    expect(body.assists[2].detail).toEqual({ text: typed });
    const ok = await saved;
    expect(ok.status()).toBe(200);
    const edit = (await loadModuleJson(page)).edits[target.segmentId].find(
      (e) => e.edited_content === typed
    );
    expect(edit.original_content).toBe(target.is); // the server's base (§5.6 step 6)
    await page.request.delete(`/api/segment-editor/edit/${edit.id}`); // best effort, as editor-lifecycle Test 9
  });

  test('a DUPLICATE_ID refusal keeps the text with its notice, and the pane never sends it (R4, §5.7)', async ({
    page,
  }) => {
    const [target] = middleVirginRows(await loadModuleJson(page));
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    const text = `${target.is}${SUFFIX}`;
    await row.locator('textarea').fill(text);
    const posts = [];
    await page.route(`**${MODULE_URL}/edit`, async (route) => {
      posts.push(route.request().postDataJSON());
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'DUPLICATE_ID', message: 'stub' }),
      });
    });
    const acceptAll = (d) => d.accept().catch(() => {});
    page.on('dialog', acceptAll);
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    await expect(row.locator('.draft-notice[data-notice="DUPLICATE_ID"]')).toBeVisible();
    expect(posts).toHaveLength(1); // positive control: the first save was sent
    await expect(row.locator('textarea')).toHaveValue(text);
    await expect(row.getByRole('button', { name: 'Vista', exact: true })).toBeDisabled();
    await row.locator('textarea').press('Control+Enter');
    await row.locator('textarea').press('Control+s');
    await page.waitForTimeout(500);
    expect(posts).toHaveLength(1); // never sent again
    // Discarding asks first; declining keeps the text.
    page.off('dialog', acceptAll);
    page.once('dialog', (d) => d.dismiss());
    await row.getByRole('button', { name: 'Hætta við' }).click();
    await expect(row.locator('textarea')).toHaveValue(text);
    // Back keeps it for the next visit. Reopened through the selector, as editor-lifecycle
    // Test 7 does: a page.goto would meet the dirty page's beforeunload handler.
    await page.locator('#btn-back').click();
    await expect(page.locator('#module-selector')).toBeVisible({ timeout: 5000 });
    await page.locator('#book-select').selectOption(BOOK);
    await expect(page.locator('#chapter-select')).toBeEnabled({ timeout: 5000 });
    await page.locator('#chapter-select').selectOption(CHAPTER);
    await page.locator(`.module-card[title^="${MODULE}"]`).first().click();
    await expect(
      rowOf(page, target.segmentId).locator('.draft-notice[data-notice="DUPLICATE_ID"]')
    ).toBeVisible({
      timeout: 10000,
    });
    await expect(rowOf(page, target.segmentId).locator('textarea')).toHaveValue(text);
  });

  test('a refusal reached through Beita víðar propagates nothing (R4, decision 32)', async ({
    page,
  }) => {
    const [target, other] = middleVirginRows(await loadModuleJson(page));
    await openModule(page);
    const saves = [];
    const previews = [];
    const propagated = [];
    // Stubs only: a 409 DUPLICATE_ID for the target's save, a success for the control's, and a preview that always
    // offers a target, so a propagation that is NOT stopped reaches POST /propagate.
    await page.route(`**${MODULE_URL}/edit`, async (route) => {
      const body = route.request().postDataJSON();
      saves.push(body.segmentId);
      if (body.segmentId === target.segmentId) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'DUPLICATE_ID', message: 'stub' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(STUB_SAVED),
      });
    });
    await page.route(
      (url) => url.pathname === `${MODULE_URL}/propagation-preview`,
      (route) => {
        previews.push(new URL(route.request().url()).searchParams.get('segmentId'));
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ eligible: [{ segmentId: 'stub' }] }),
        });
      }
    );
    await page.route(`**${MODULE_URL}/propagate`, async (route) => {
      propagated.push(route.request().postDataJSON().segmentId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ created: [], skipped: [] }),
      });
    });
    page.on('dialog', (d) => d.accept().catch(() => {})); // the refusal alert and the propagate confirm; no other pane is dirty
    // Positive control: a save that lands goes on to propagate, so the stubs can see a propagation.
    await rowOf(page, other.segmentId).locator('.btn-edit').click();
    await rowOf(page, other.segmentId).locator('textarea').fill(`${other.is}${SUFFIX}`);
    await rowOf(page, other.segmentId).locator('.btn-propagate').click();
    await expect.poll(() => propagated).toEqual([other.segmentId]);
    // The refused one: its save is sent once, then nothing.
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    await row.locator('textarea').fill(`${target.is}${SUFFIX}`);
    await row.locator('.btn-propagate').click();
    await expect(row.locator('.draft-notice[data-notice="DUPLICATE_ID"]')).toBeVisible();
    await page.waitForTimeout(500);
    expect(saves).toEqual([other.segmentId, target.segmentId]);
    expect(previews).toEqual([other.segmentId]);
    expect(propagated).toEqual([other.segmentId]);
  });

  test('BASE_MISSING asks for F5 and keeps the text', async ({ page }) => {
    const [target] = middleVirginRows(await loadModuleJson(page));
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    await row.locator('textarea').fill(`${target.is}${SUFFIX}`);
    await page.route(`**${MODULE_URL}/edit`, (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'BASE_MISSING', message: 'stub' }),
      })
    );
    const alert = new Promise((resolve) =>
      page.once('dialog', async (d) => {
        resolve(d.message());
        await d.accept();
      })
    );
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    expect(await alert).toContain('F5');
    await expect(row.locator('.draft-notice[data-notice="BASE_MISSING"]')).toBeVisible();
    await expect(row.locator('textarea')).toHaveValue(`${target.is}${SUFFIX}`);
  });

  test('a 409 answered to a replay keeps the typed text, marked replayed, with one action id (index decision 12)', async ({
    page,
  }) => {
    const [target] = middleVirginRows(await loadModuleJson(page));
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    const typed = `${target.is}${SUFFIX}`;
    await row.locator('textarea').fill(typed);
    const bodies = [];
    await page.route(`**${MODULE_URL}/edit`, async (route) => {
      bodies.push(route.request().postDataJSON());
      if (bodies.length === 1) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: '{"error":"stub"}',
        });
      }
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'conflict', message: 'stub' }),
      });
    });
    page.on('dialog', (d) => d.accept().catch(() => {})); // a dialog still open as the page closes (see the T4 test)
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    await expect(page.locator('.toast-error').first()).toBeVisible(); // the 5xx: queued for a replay
    // The replay fires after about a second; its 409 parks the text and the module reloads.
    await expect(row.locator('.draft-notice[data-notice="REFUSED"]')).toBeVisible({
      timeout: 10000,
    });
    await expect(row.locator('textarea')).toHaveValue(typed);
    expect(bodies).toHaveLength(2);
    expect('replayed' in bodies[0]).toBe(false);
    expect(bodies[1].replayed).toBe(true);
    expect(bodies[1].clientActionId).toBe(bodies[0].clientActionId);
    expect(bodies[1].baseSha256).toBe(bodies[0].baseSha256);
    expect(await page.evaluate(() => localStorage.getItem('saveRetryParked'))).toBeNull(); // taken
  });

  test('a replay whose 5xx answers exhaust the retries keeps the typed text, with the generic notice (decision 28)', async ({
    page,
  }) => {
    const [target] = middleVirginRows(await loadModuleJson(page));
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    const typed = `${target.is}${SUFFIX}`;
    await row.locator('textarea').fill(typed);
    const bodies = [];
    await page.route(`**${MODULE_URL}/edit`, async (route) => {
      bodies.push(route.request().postDataJSON());
      // Not JSON, as a proxy's error page is: the parked item has no code, so no refusal notice applies.
      return route.fulfill({
        status: 502,
        contentType: 'text/html',
        body: '<html>Bad Gateway</html>',
      });
    });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    // Three replays at about 1 s, 2 s and 4 s (saveRetry's backoff); the last leaves no attempt, so it parks.
    await expect(row.locator('.draft-notice[data-notice="REFUSED"]')).toBeVisible({
      timeout: 20000,
    });
    await expect(row.locator('textarea')).toHaveValue(typed);
    expect(bodies).toHaveLength(4); // the live save and three replays, every one a 502
    expect(bodies.slice(1).every((b) => b.replayed === true)).toBe(true);
    expect(new Set(bodies.map((b) => b.clientActionId)).size).toBe(1);
    await expect(page.locator('.toast-error', { hasText: 'geymdur' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('saveRetryParked'))).toBeNull(); // taken
  });

  test('a replay whose network failures exhaust the retries keeps the typed text, with the generic notice (decision 28)', async ({
    page,
  }) => {
    const [target] = middleVirginRows(await loadModuleJson(page));
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    const typed = `${target.is}${SUFFIX}`;
    await row.locator('textarea').fill(typed);
    const bodies = [];
    await page.route(`**${MODULE_URL}/edit`, async (route) => {
      bodies.push(route.request().postDataJSON());
      // No answer at all, as when the network drops ([USER]'s later answer), on EVERY attempt, so the retries run
      // out. The control is editor-lifecycle Test 4, unchanged: it aborts only the first two, and a later replay
      // still succeeds with nothing parked.
      return route.abort('connectionfailed');
    });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    // Three replays at about 1 s, 2 s and 4 s; the last fails with no attempt left, so it parks with status null.
    await expect(row.locator('.draft-notice[data-notice="REFUSED"]')).toBeVisible({
      timeout: 20000,
    });
    await expect(row.locator('textarea')).toHaveValue(typed);
    expect(bodies).toHaveLength(4); // the live save and three replays, every one aborted
    expect(bodies.slice(1).every((b) => b.replayed === true)).toBe(true);
    expect(new Set(bodies.map((b) => b.clientActionId)).size).toBe(1);
    await expect(page.locator('.toast-error', { hasText: 'geymdur' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('saveRetryParked'))).toBeNull(); // taken
  });

  test('a replay parked before this page loaded comes back at the module load, with no draft stored (decision 28)', async ({
    page,
  }) => {
    const [target] = middleVirginRows(await loadModuleJson(page));
    const typed = `${target.is}${SUFFIX}`;
    // What a body queued by a page loaded before the deploy leaves behind once this page's saveRetry has replayed
    // it: no hash, so BASE_MISSING, parked, and no seg-draft key at all. Planted once, before the page's scripts run.
    const other = `seg:${BOOK}/${CHAPTER}/m99999:x`;
    const parked = [
      {
        key: `seg:${BOOK}/${CHAPTER}/${MODULE}:${target.segmentId}`,
        url: `${MODULE_URL}/edit`,
        body: JSON.stringify({ segmentId: target.segmentId, editedContent: typed }),
        status: 409,
        code: 'BASE_MISSING',
        message: 'stub',
        parkedAt: Date.now(),
      },
      {
        key: other,
        url: 'stub',
        body: JSON.stringify({ segmentId: 'x', editedContent: 'y' }),
        status: 409,
        code: 'conflict',
        message: 'stub',
        parkedAt: Date.now(),
      },
    ];
    await page.addInitScript((value) => {
      if (sessionStorage.getItem('g11-planted')) return;
      localStorage.setItem('saveRetryParked', value);
      sessionStorage.setItem('g11-planted', '1');
    }, JSON.stringify(parked));
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await expect(row.locator('.draft-notice[data-notice="BASE_MISSING"]')).toBeVisible();
    await expect(row.locator('textarea')).toHaveValue(typed);
    // Control: only this module's prefix is taken; another module's parked replay waits for that module.
    const left = JSON.parse(await page.evaluate(() => localStorage.getItem('saveRetryParked')));
    expect(left.map((p) => p.key)).toEqual([other]);
  });
});
