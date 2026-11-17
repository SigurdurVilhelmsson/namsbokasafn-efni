// @ts-check
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

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
