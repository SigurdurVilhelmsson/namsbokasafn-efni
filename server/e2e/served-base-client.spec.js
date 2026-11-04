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
 * background loads (/terms, /repetitions; segment-editor.js:296-297) re-render the table, and each re-render asks
 * closePanels again, so wait for both responses before removing the handler. Any confirm still to come then meets
 * NO listener, and Playwright auto-dismisses a dialog nobody listens for: declined too. So no test in this file
 * installs an ACCEPTING dialog handler while a dirty pane must survive.
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
});
