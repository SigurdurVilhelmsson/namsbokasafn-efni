// @ts-check
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');
const segmentValidation = require('../public/js/segment-validation');

/**
 * "Merkja sem lokið" in the segment editor (register §C222; design
 * docs/superpowers/specs/2026-11-17-c222-unit-done-signal-design.md).
 *
 * A press is a recorded moment, never a status: the button asks, records, and shows "Merkt sem lokið <date>" beside
 * itself, and a second press records again. It refuses, before asking, while the unit holds unsaved text, so the
 * recorded moment cannot come before the editor's last edit. The eight strings are [USER]-approved (2026-11-17).
 *
 * Run-unique admin ids, so a reused local database holds no earlier press by the same person.
 */

const UI = new Function(
  `${fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ui-strings.js'), 'utf8')}; return UI;`
)();
const BOOK = '__e2e-fixture__';
const CHAPTER = '1';
const MODULE = 'm68664';
const MODULE_URL = `/api/segment-editor/${BOOK}/${CHAPTER}/${MODULE}`;
const RUN = Date.now() % 1000;
const TOOLTIP =
  'Skráir að þú hafir lokið við þennan hluta. Breytingar fara til yfirlestrar um leið og þær eru vistaðar.';

const backgroundLoads = (page) =>
  Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/terms`)),
    page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/repetitions`)),
  ]);

async function openModule(page) {
  // Both background loads re-render the table; interact only after they have.
  const background = backgroundLoads(page);
  await page.goto(`/editor?book=${BOOK}&chapter=${CHAPTER}&module=${MODULE}`);
  await expect(page.locator('#editor-container')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 10000 });
  await background;
}

/** Answer every dialog from here on, recording each message. */
function answerDialogs(page, accept) {
  const asked = [];
  page.on('dialog', (d) => {
    asked.push(d.message());
    (accept ? d.accept() : d.dismiss()).catch(() => {});
  });
  return asked;
}

const SUFFIX = ' ó';

async function loadModuleJson(page) {
  const res = await page.request.get(MODULE_URL);
  expect(res.ok()).toBe(true);
  return res.json();
}

/**
 * The `index`-th virgin row, counted from the module's start (past the first rows other specs edit), whose text plus
 * SUFFIX the client's validator passes with no warning, so Vista posts without asking. Every save these cases make is
 * stubbed, so nothing is written and no other spec's rows are touched (helpers/segments.js).
 */
function plainRow(data, index) {
  const ok = (s, i) =>
    i > 3 &&
    i < data.segments.length - 2 &&
    s.hasTranslation &&
    s.is &&
    /^[0-9a-f]{64}$/.test(s.baseSha256 || '') &&
    !(data.edits[s.segmentId] || []).length &&
    !(data.acceptances || {})[s.segmentId] &&
    !segmentValidation.validateStructure(s.en, s.is, `${s.is}${SUFFIX}`).blocked &&
    !segmentValidation.validateStructure(s.en, s.is, `${s.is}${SUFFIX}`).warnings;
  const picks = data.segments.filter((s, i) => ok(s, i));
  expect(picks.length).toBeGreaterThan(index);
  return picks[index];
}

const rowOf = (page, segmentId) =>
  page.locator(`#segments-body tr[data-segment-id="${segmentId}"]`);

/** Save answers held back for good: `posts` counts the saves sent. */
async function holdSaves(page) {
  const posts = [];
  await page.route(`**${MODULE_URL}/edit`, async (route) => {
    posts.push(route.request().postDataJSON());
    await new Promise(() => {});
  });
  return posts;
}

/** Hold back every module GET until `release()`: the reload after a refusal does not come back meanwhile. */
async function holdReload(page) {
  let n = 0;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route(`**${MODULE_URL}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    n++;
    await gate;
    await route.continue();
  });
  return { held: () => n, release };
}

/** Every POST …/done this page sends, with its status. */
function donePosts(page) {
  const seen = [];
  page.on('response', (r) => {
    if (r.request().method() === 'POST' && r.url().endsWith(`${MODULE_URL}/done`))
      seen.push(r.status());
  });
  return seen;
}

test.describe('Merkja sem lokið (§C222)', () => {
  test('the button says "Merkja sem lokið" and the old one is gone', async ({ page }) => {
    await loginAs(page, 'admin', 89100 + RUN);
    await openModule(page);
    await expect(page.locator('#btn-done')).toHaveText('Merkja sem lokið');
    await expect(page.locator('#btn-done')).toHaveAttribute('title', TOOLTIP);
    await expect(page.getByText('Senda til yfirlestrar')).toHaveCount(0);
    await expect(page.locator('#done-trace')).toBeHidden();
  });

  test('a press with no edits asks, records, and shows the trace; a second press records again', async ({
    page,
  }) => {
    await loginAs(page, 'admin', 89200 + RUN);
    await openModule(page);
    const asked = answerDialogs(page, true);
    const posts = donePosts(page);

    await page.locator('#btn-done').click();
    await expect.poll(() => posts).toEqual([200]);
    expect(asked).toEqual([UI.confirm.markDone]);
    await expect(page.locator('#done-trace')).toBeVisible();
    await expect(page.locator('#done-trace')).toContainText('Merkt sem lokið ');

    await page.locator('#btn-done').click();
    await expect.poll(() => posts).toEqual([200, 200]);
    expect(asked).toEqual([UI.confirm.markDone, UI.confirm.markDone]);
    await expect(page.locator('#done-trace')).toContainText('Merkt sem lokið ');

    // A fresh load reads the press back from the server: the trace is not browser state.
    await openModule(page);
    await expect(page.locator('#done-trace')).toContainText('Merkt sem lokið ');
  });

  test('declining the confirm records nothing', async ({ page }) => {
    await loginAs(page, 'admin', 89300 + RUN);
    await openModule(page);
    const asked = answerDialogs(page, false);
    const posts = donePosts(page);
    await page.locator('#btn-done').click();
    await expect.poll(() => asked).toEqual([UI.confirm.markDone]);
    await page.waitForTimeout(500);
    expect(posts).toEqual([]);
    await expect(page.locator('#done-trace')).toBeHidden();
  });

  test('unsaved text refuses the press before asking, and sends nothing', async ({ page }) => {
    await loginAs(page, 'admin', 89400 + RUN);
    await openModule(page);
    const row = page
      .locator('#segments-body tr')
      .filter({ has: page.locator('.btn-edit') })
      .nth(3);
    await row.locator('.btn-edit').click();
    const box = row.locator('textarea');
    await box.fill(`${await box.inputValue()} ó`);
    const asked = answerDialogs(page, true);
    const posts = donePosts(page);
    await page.locator('#btn-done').click();
    await expect.poll(() => asked).toEqual([UI.alert.doneUnsaved]);
    await page.waitForTimeout(500);
    expect(posts).toEqual([]);
  });

  // Final review, Important 3: each arm of the refusal on its own. A pane typed back to its original no longer
  // counts as changed, so in these two only the save in flight, or the kept text waiting for its pane, can refuse.
  test('a save still in flight refuses the press, even with its pane typed back', async ({
    page,
  }) => {
    await loginAs(page, 'admin', 89600 + RUN);
    const target = plainRow(await loadModuleJson(page), 0);
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    const box = row.locator('textarea');
    await box.fill(`${target.is}${SUFFIX}`);
    const posts = await holdSaves(page); // never answered in this test
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    await expect.poll(() => posts.length).toBe(1);
    await box.fill(target.is);
    const asked = answerDialogs(page, true);
    const dones = donePosts(page);
    await page.locator('#btn-done').click();
    await expect.poll(() => asked).toEqual([UI.alert.doneUnsaved]);
    await page.waitForTimeout(500);
    expect(dones).toEqual([]);
  });

  test("a refused save's text waiting for its pane refuses the press", async ({ page }) => {
    await loginAs(page, 'admin', 89700 + RUN);
    const target = plainRow(await loadModuleJson(page), 1);
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    await row.locator('textarea').fill(`${target.is}${SUFFIX}`);
    await page.route(
      `**${MODULE_URL}/edit`,
      (route) =>
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'STALE_BASE', message: 'stub' }),
        }),
      { times: 1 }
    );
    const reload = await holdReload(page); // the refusal's reload is held: its text waits in the hold
    const asked = answerDialogs(page, true);
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    await expect.poll(() => reload.held()).toBeGreaterThan(0);
    await row.locator('textarea').fill(target.is);
    const before = asked.length;
    const dones = donePosts(page);
    await page.locator('#btn-done').click();
    await expect.poll(() => asked.slice(before)).toEqual([UI.alert.doneUnsaved]);
    await page.waitForTimeout(500);
    expect(dones).toEqual([]);
    reload.release();
  });

  // After the refusal's reload re-renders, the kept text is back in its pane (installDraft takes it out of the hold)
  // and the pane's state still says it was refused. Typing the original back leaves no changed text, so only the
  // refused-pane arm can refuse: typing does not clear `refused`.
  test("a refused save's kept text, typed back after the re-render, still refuses the press", async ({
    page,
  }) => {
    await loginAs(page, 'admin', 89800 + RUN);
    const target = plainRow(await loadModuleJson(page), 2);
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    const kept = `${target.is}${SUFFIX}`;
    await row.locator('textarea').fill(kept);
    await page.route(
      `**${MODULE_URL}/edit`,
      (route) =>
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'STALE_BASE', message: 'stub' }),
        }),
      { times: 1 }
    );
    const asked = answerDialogs(page, true);
    const reloaded = backgroundLoads(page);
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    await reloaded;
    await page.waitForTimeout(300); // the two background re-renders have run
    // Control: the refusal took effect, and the re-rendered pane holds the kept text with its notice.
    await expect(row.locator('textarea')).toHaveValue(kept);
    await expect(row.locator('.draft-notice[data-notice="STALE_BASE"]')).toBeVisible();
    await row.locator('textarea').fill(target.is);
    const before = asked.length;
    const dones = donePosts(page);
    await page.locator('#btn-done').click();
    await expect.poll(() => asked.slice(before)).toEqual([UI.alert.doneUnsaved]);
    await page.waitForTimeout(500);
    expect(dones).toEqual([]);
  });

  test('a refused press says it was not recorded', async ({ page }) => {
    await loginAs(page, 'admin', 89500 + RUN);
    await openModule(page);
    await page.route(`**${MODULE_URL}/done`, (r) =>
      r.fulfill({ status: 500, json: { error: 'Not recorded', code: 'DONE_NOT_RECORDED' } })
    );
    const asked = answerDialogs(page, true);
    await page.locator('#btn-done').click();
    await expect.poll(() => asked).toEqual([UI.confirm.markDone, UI.alert.doneNotRecorded]);
    await expect(page.locator('#done-trace')).toBeHidden();
    await expect(page.locator('#btn-done')).toBeEnabled();
  });
});
