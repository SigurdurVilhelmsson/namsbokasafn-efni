// @ts-check
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { loginAs, getTestToken } = require('./helpers/auth');
const segmentValidation = require('../public/js/segment-validation');

/**
 * Unsaved text in the segment editor (interface audit 2026-11-13, ED-01 to ED-05 and parts of ED-18).
 *
 * One rule: text typed into a row is never lost without the editor being asked. The first describe types into a
 * row and then does what lost the text on 2026-11-13: Back, a save conflict answered with OK, a save of another
 * row, Escape and the two discard buttons, and a save from a second tab that had not seen the first tab's save.
 * The second holds what leaving rows in place must not break, one test per case the reviews of the fix found.
 *
 * Rows: virgin rows nearest the three-quarter point of fixture m68664, away from the rows sibling specs claim
 * (helpers/segments.js). Two tests write real edit rows (ED-02 and ED-05); the afterEach below deletes them, with
 * a request context of its own, so it also runs when a test has timed out. Every other save is a stub.
 */
const UI = new Function(
  `${fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ui-strings.js'), 'utf8')}; return UI;`
)();
const BOOK = '__e2e-fixture__';
const CHAPTER = '1';
const MODULE = 'm68664';
const MODULE_URL = `/api/segment-editor/${BOOK}/${CHAPTER}/${MODULE}`;
const USER_A = 88710;
const USER_B = 88711;
const SUFFIX = ' ia1-óvistað';
const STUB_SAVED = { success: true, editId: 1, updated: false, termWarnings: [], qaFindings: [] };

async function loadModuleJson(page) {
  const res = await page.request.get(MODULE_URL);
  expect(res.ok()).toBe(true);
  return res.json();
}

/** The `index`-th virgin, append-safe row counted outwards from the module's three-quarter point. */
function freeRow(data, index) {
  const segs = data.segments;
  const at = Math.floor((segs.length * 3) / 4);
  const ok = (s, i) =>
    i > 1 &&
    i < segs.length - 2 &&
    s.hasTranslation &&
    s.is &&
    s.segmentId !== 'm68664:abstract:auto-2' &&
    /^[0-9a-f]{64}$/.test(s.baseSha256 || '') &&
    !(data.edits[s.segmentId] || []).length &&
    !data.acceptances[s.segmentId] &&
    !segmentValidation.validateStructure(s.en, s.is, `${s.is}${SUFFIX}`).blocked &&
    !segmentValidation.validateStructure(s.en, s.is, `${s.is}${SUFFIX}`).warnings;
  const picks = segs
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => ok(s, i))
    .sort((a, b) => Math.abs(a.i - at) - Math.abs(b.i - at));
  expect(picks.length).toBeGreaterThan(index);
  return picks[index].s;
}

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

const rowOf = (page, segmentId) =>
  page.locator(`#segments-body tr[data-segment-id="${segmentId}"]`);

/** Open the row's pane and type `text` into it. */
async function typeInto(page, segmentId, text) {
  const row = rowOf(page, segmentId);
  await row.locator('.btn-edit').click();
  await row.locator('textarea').fill(text);
  return row;
}

/** Answer every dialog from here on, recording each message. Returns the list and a function that stops answering. */
function answerDialogs(page, accept) {
  const asked = [];
  const handler = (d) => {
    asked.push(d.message());
    (accept ? d.accept() : d.dismiss()).catch(() => {});
  };
  page.on('dialog', handler);
  return { asked, stop: () => page.off('dialog', handler) };
}

/** The two people this spec saves real rows as (ED-02 and ED-05). The helper names a user after its role. */
const WRITERS = [
  ['admin', USER_A],
  ['head-editor', USER_B],
];

// No real row outlives its test, also when the test timed out and its own page is gone.
test.afterEach(async ({ playwright }) => {
  for (const [role, id] of WRITERS) {
    const api = await playwright.request.newContext({
      baseURL: 'http://localhost:3456',
      extraHTTPHeaders: { cookie: `auth_token=${getTestToken(role, id)}` },
    });
    try {
      const res = await api.get(MODULE_URL);
      expect(res.ok()).toBe(true);
      const own = Object.values((await res.json()).edits)
        .flat()
        .filter((edit) => String(edit.editor_id) === String(id));
      for (const edit of own) {
        const del = await api.delete(`/api/segment-editor/edit/${edit.id}`);
        expect(del.status(), await del.text()).toBe(200);
      }
    } finally {
      await api.dispose();
    }
  }
});

/** The draft entry stored for `segmentId` under any tab's key, or null. */
async function storedDraftEntry(page, segmentId) {
  return page.evaluate((id) => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('seg-draft:')) {
        const v = JSON.parse(localStorage.getItem(key));
        if (v.segments && v.segments[id]) return v.segments[id];
      }
    }
    return null;
  }, segmentId);
}

/**
 * Have the row's next save refused with `code` (a stub: nothing is written), every dialog answered OK, and wait
 * until the reload that follows has re-rendered. The pane then holds a kept text.
 */
async function refuseNextSave(page, row, code) {
  await page.route(
    `**${MODULE_URL}/edit`,
    (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: code, message: 'stub' }),
      }),
    { times: 1 }
  );
  const { stop } = answerDialogs(page, true);
  const reloaded = backgroundLoads(page);
  await row.getByRole('button', { name: 'Vista', exact: true }).click();
  await reloaded;
  await page.waitForTimeout(300); // the two background re-renders have run
  stop();
}

/**
 * Hold back every module GET from here on until `release()` is called: the reload that follows a save or a refusal
 * does not come back, so the page stays in the state between the answer and its re-render. `held()` counts them.
 */
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

/** A save answer held back until `release()` is called; `posts` counts the saves sent. */
async function holdSaves(page, status, body) {
  const posts = [];
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route(`**${MODULE_URL}/edit`, async (route) => {
    posts.push(route.request().postDataJSON());
    await held;
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return { posts, release };
}

test.describe('unsaved text in the segment editor is never lost unasked', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin', USER_A);
  });

  test('ED-01: Back asks before leaving a row with unsaved text, and Cancel keeps it', async ({
    page,
  }) => {
    const target = freeRow(await loadModuleJson(page), 0);
    await openModule(page);
    const text = `${target.is}${SUFFIX}`;
    const row = await typeInto(page, target.segmentId, text);

    const cancel = answerDialogs(page, false);
    await page.locator('#btn-back').click();
    await expect.poll(() => cancel.asked).toEqual([UI.confirm.leaveDiscards(1)]);
    cancel.stop();
    await expect(page.locator('#editor-container')).toBeVisible();
    await expect(row.locator('textarea')).toHaveValue(text);
    await expect(page.locator('#save-status-text')).toHaveText(UI.save.unsaved(1));

    // OK leaves, as Back always has.
    const ok = answerDialogs(page, true);
    await page.locator('#btn-back').click();
    await expect(page.locator('#module-selector')).toBeVisible();
    await expect(page.locator('#editor-container')).toBeHidden();
    ok.stop();
    expect(ok.asked).toEqual([UI.confirm.leaveDiscards(1)]); // asked once
  });

  test('ED-01 control: Back asks nothing when no text was changed', async ({ page }) => {
    const target = freeRow(await loadModuleJson(page), 0);
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    await row.locator('textarea').fill(`${target.is}x`);
    await row.locator('textarea').fill(target.is); // typed, then typed back: the pane is dirty, its text is not changed
    const { asked, stop } = answerDialogs(page, false); // a question answered Cancel would keep the editor open
    await page.locator('#btn-back').click();
    await expect(page.locator('#module-selector')).toBeVisible();
    stop();
    expect(asked).toEqual([]);
  });

  test('ED-02: after a save conflict answered with OK, the typed text is still in its row', async ({
    page,
    browser,
  }) => {
    const target = freeRow(await loadModuleJson(page), 1);
    await openModule(page);
    const mine = `${target.is}${SUFFIX} A`;
    const row = await typeInto(page, target.segmentId, mine);
    await row.locator('select[id^="cat-"]').selectOption('style');
    await row.locator('input[id^="note-"]').fill('mín athugasemd');

    // Another editor saves the same row first.
    const other = await browser.newContext({ baseURL: 'http://localhost:3456' });
    const otherPage = await other.newPage();
    // A different role, because the helper names a user after its role and the row's Breyta rule goes by name:
    // two admins would look like one person, and the other editor's edit like this editor's own.
    await loginAs(otherPage, 'head-editor', USER_B);
    const theirs = `${target.is}${SUFFIX} B`;
    try {
      // (a plain API save: it names no edit and does not say it handles UNSEEN_EDIT, like any script)
      const saved = await otherPage.request.post(`${MODULE_URL}/edit`, {
        data: {
          segmentId: target.segmentId,
          editedContent: theirs,
          category: 'accuracy',
          editorNote: 'þeirra athugasemd',
          baseSha256: target.baseSha256,
          baseEditId: 0,
          displayedEditId: null,
          displayedEditSha256: null,
        },
      });
      expect(saved.ok()).toBe(true);

      const { asked, stop } = answerDialogs(page, true); // OK to everything
      const answered = page.waitForResponse(
        (r) => r.url().endsWith(`${MODULE_URL}/edit`) && r.request().method() === 'POST'
      );
      const reloaded = backgroundLoads(page);
      await row.getByRole('button', { name: 'Vista', exact: true }).click();
      expect((await answered).status()).toBe(409);
      await reloaded;
      await page.waitForTimeout(300); // the two background re-renders have run
      stop();

      await expect(row.locator('.edit-panel')).toHaveClass(/active/);
      await expect(row.locator('textarea')).toHaveValue(mine);
      await expect(row.locator('.col-is .segment-content')).toContainText(`${SUFFIX} B`.trim());
      await expect(row.locator('.draft-notice[data-notice="ROW_NOT_YOURS"]')).toHaveText(
        UI.draftNotice.rowNotYours
      );
      // The row is the other editor's to finish (it shows no Breyta), so the kept text cannot be saved over
      // their waiting edit: Vista is off, and Ctrl+S sends nothing.
      await expect(row.getByRole('button', { name: 'Vista', exact: true })).toBeDisabled();
      const sent = [];
      page.on('request', (r) => {
        if (r.url().endsWith(`${MODULE_URL}/edit`) && r.method() === 'POST') sent.push(r.url());
      });
      const blocked = answerDialogs(page, true);
      await row.locator('textarea').press('Control+s');
      await expect.poll(() => blocked.asked).toEqual([UI.draftNotice.rowNotYours]);
      blocked.stop();
      expect(sent).toEqual([]);
      // The pane's own category and note came back with the text, not the other editor's.
      await expect(row.locator('select[id^="cat-"]')).toHaveValue('style');
      await expect(row.locator('input[id^="note-"]')).toHaveValue('mín athugasemd');
      // One message, the refusal's: who saved first, and that the typed text was kept.
      expect(asked).toHaveLength(1);
      expect(asked[0]).toContain(UI.refusal.textKept);
      await expect(page.locator('#save-status-text')).toHaveText(UI.save.unsaved(1));

      // Endurstilla has nothing of this editor's to reset the pane to on such a row: after its question the
      // pane closes, so no pane with a working Vista is left on a row that offers no Breyta.
      const reset = answerDialogs(page, true);
      await row.locator('.btn-revert').click();
      await expect(row.locator('.edit-panel')).not.toHaveClass(/active/);
      reset.stop();
      expect(reset.asked).toEqual([UI.draftNotice.discardKept]);
      await expect(page.locator('#save-status-text')).toHaveText(UI.save.nothingUnsaved);
    } finally {
      await other.close();
    }
  });

  test('ED-03: saving one row asks nothing about another row with unsaved text, and keeps it', async ({
    page,
  }) => {
    const data = await loadModuleJson(page);
    const waiting = freeRow(data, 2);
    const saving = freeRow(data, 3);
    await openModule(page);
    const waitingText = `${waiting.is}${SUFFIX} bíður`;
    const waitingRow = await typeInto(page, waiting.segmentId, waitingText);
    const savingRow = await typeInto(page, saving.segmentId, `${saving.is}${SUFFIX}`);

    await page.route(
      `**${MODULE_URL}/edit`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(STUB_SAVED),
        }),
      { times: 1 }
    );
    const { asked, stop } = answerDialogs(page, true); // OK to everything
    const reloaded = backgroundLoads(page);
    await savingRow.getByRole('button', { name: 'Vista', exact: true }).click();
    await reloaded;
    await page.waitForTimeout(300); // the two background re-renders have run
    stop();

    expect(asked).toEqual([]);
    await expect(waitingRow.locator('.edit-panel')).toHaveClass(/active/);
    await expect(waitingRow.locator('textarea')).toHaveValue(waitingText);
    await expect(savingRow.locator('.edit-panel')).not.toHaveClass(/active/);
    await expect(page.locator('#save-status-text')).toHaveText(UI.save.unsaved(1));
  });

  test('ED-03: a filter that would hide a row with unsaved text keeps it on screen and asks nothing', async ({
    page,
  }) => {
    const target = freeRow(await loadModuleJson(page), 2);
    await openModule(page);
    const text = `${target.is}${SUFFIX} sía`;
    const row = await typeInto(page, target.segmentId, text);
    const before = await page.locator('#segments-body tr').count();

    const { asked, stop } = answerDialogs(page, true);
    await page.locator('#filter-type').selectOption('pending'); // the row has no pending edit
    await expect.poll(() => page.locator('#segments-body tr').count()).toBeLessThan(before);
    expect(asked).toEqual([]);
    await expect(row.locator('.edit-panel')).toHaveClass(/active/);
    await expect(row.locator('textarea')).toHaveValue(text);
    await expect(row.locator('textarea')).toBeVisible();

    // Once the text is thrown away the row follows the filter like any other.
    await row.getByRole('button', { name: 'Hætta við', exact: true }).click();
    stop();
    expect(asked).toEqual([UI.confirm.discardChanges]);
    await expect(row).toHaveCount(0);
    await page.locator('#filter-type').selectOption('all');
    await expect(rowOf(page, target.segmentId).locator('.edit-panel')).not.toHaveClass(/active/);
  });

  for (const gesture of [
    {
      how: 'Escape in the text box',
      run: async (page, row) => {
        await row.locator('textarea').focus();
        await page.keyboard.press('Escape');
      },
    },
    {
      how: 'Hætta við',
      run: (page, row) => row.getByRole('button', { name: 'Hætta við', exact: true }).click(),
    },
    {
      how: 'Endurstilla',
      run: (page, row) => row.locator('.btn-revert').click(),
    },
  ]) {
    test(`ED-04: ${gesture.how} asks before discarding changed text, and Cancel keeps it`, async ({
      page,
    }) => {
      const target = freeRow(await loadModuleJson(page), 4);
      await openModule(page);
      const text = `${target.is}${SUFFIX}`;
      const row = await typeInto(page, target.segmentId, text);

      const cancel = answerDialogs(page, false);
      await gesture.run(page, row);
      await expect.poll(() => cancel.asked).toEqual([UI.confirm.discardChanges]);
      cancel.stop();
      await expect(row.locator('textarea')).toHaveValue(text);
      await expect(row.locator('.edit-panel')).toHaveClass(/active/);

      const ok = answerDialogs(page, true);
      await gesture.run(page, row);
      await expect.poll(() => ok.asked).toEqual([UI.confirm.discardChanges]); // asked once
      ok.stop();
      await expect(row.locator('textarea')).toHaveValue(target.is);
      // The text was thrown away, not saved, and the status line says only that nothing is unsaved.
      await expect(page.locator('#save-status-text')).toHaveText(UI.save.nothingUnsaved);
      await expect(row.locator('.seg-save-ind')).not.toHaveText(UI.save.changed); // the row agrees with the line
    });
  }

  test('ED-04 control: closing a pane in which nothing was changed asks nothing', async ({
    page,
  }) => {
    const target = freeRow(await loadModuleJson(page), 4);
    await openModule(page);
    const row = rowOf(page, target.segmentId);
    await row.locator('.btn-edit').click();
    await row.locator('textarea').fill(`${target.is}x`);
    await row.locator('textarea').fill(target.is); // typed, then typed back
    const { asked, stop } = answerDialogs(page, false);
    await row.getByRole('button', { name: 'Hætta við', exact: true }).click();
    await expect(row.locator('.edit-panel')).not.toHaveClass(/active/);
    stop();
    expect(asked).toEqual([]);
  });

  test('ED-18: text typed while a save is on its way is still there when the answer comes', async ({
    page,
  }) => {
    const target = freeRow(await loadModuleJson(page), 6);
    await openModule(page);
    const sent = `${target.is}${SUFFIX}`;
    const row = await typeInto(page, target.segmentId, sent);

    // The save's answer is held back until more has been typed. It carries the echo the real route sends: the
    // base it was checked against and the edit the segment now displays.
    const answer = {
      ...STUB_SAVED,
      editId: 4242,
      baseSha256: target.baseSha256,
      displayedEditId: 4242,
      displayedEditSha256: 'a'.repeat(64),
    };
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route(
      `**${MODULE_URL}/edit`,
      async (route) => {
        await held;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(answer),
        });
      },
      { times: 1 }
    );
    const posted = page.waitForRequest(
      (r) => r.url().endsWith(`${MODULE_URL}/edit`) && r.method() === 'POST'
    );
    const { asked, stop } = answerDialogs(page, true); // OK to everything
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    expect((await posted).postDataJSON().editedContent).toBe(sent);
    const more = `${sent} og meira`;
    await row.locator('textarea').fill(more);
    const reloaded = backgroundLoads(page);
    release();
    await reloaded;
    await page.waitForTimeout(300); // the two background re-renders have run
    stop();

    expect(asked).toEqual([]);
    await expect(row.locator('.edit-panel')).toHaveClass(/active/);
    await expect(row.locator('textarea')).toHaveValue(more);
    await expect(page.locator('#save-status-text')).toHaveText(UI.save.unsaved(1));
    await expect(row.locator('.seg-save-ind')).toHaveText(UI.save.changed); // not left at "Vistar..."
    // The next save is made over the one that landed: the row carries its echo.
    await expect(row).toHaveAttribute('data-displayed-edit-id', String(answer.displayedEditId));
    await expect(row).toHaveAttribute('data-displayed-edit-sha256', answer.displayedEditSha256);
  });

  test("ED-05: a second tab that has not seen the first tab's save is refused, and keeps its text", async ({
    page,
    context,
  }) => {
    const target = freeRow(await loadModuleJson(page), 5);
    await openModule(page);
    const stale = await context.newPage(); // the same person, a second tab
    await openModule(stale);
    try {
      const first = `${target.is}${SUFFIX} flipi 1`;
      const row = await typeInto(page, target.segmentId, first);
      const saved = page.waitForResponse(
        (r) => r.url().endsWith(`${MODULE_URL}/edit`) && r.request().method() === 'POST'
      );
      const tab1 = answerDialogs(page, true);
      await row.getByRole('button', { name: 'Vista', exact: true }).click();
      expect((await saved).status()).toBe(200);
      tab1.stop();

      // The second tab still shows the row as it was before that save.
      const second = `${target.is}${SUFFIX} flipi 2`;
      const staleRow = await typeInto(stale, target.segmentId, second);
      const answered = stale.waitForResponse(
        (r) => r.url().endsWith(`${MODULE_URL}/edit`) && r.request().method() === 'POST'
      );
      const tab2 = answerDialogs(stale, true); // OK to everything
      const reloaded = backgroundLoads(stale);
      await staleRow.getByRole('button', { name: 'Vista', exact: true }).click();
      const refused = await answered;
      expect(refused.status()).toBe(409);
      expect((await refused.json()).error).toBe('UNSEEN_EDIT');
      await reloaded;
      await stale.waitForTimeout(300);
      tab2.stop();

      // The first tab's text is still the saved one; the second tab's text is still on its screen.
      const after = await loadModuleJson(page);
      expect((after.edits[target.segmentId] || []).map((e) => e.edited_content)).toEqual([first]);
      await expect(staleRow.locator('.edit-panel')).toHaveClass(/active/);
      await expect(staleRow.locator('textarea')).toHaveValue(second);
      await expect(staleRow.locator('.draft-notice[data-notice="UNSEEN_EDIT"]')).toHaveText(
        UI.draftNotice.unseenEdit
      );
      await expect(staleRow.locator('.col-is .segment-content')).toContainText('flipi 1');
    } finally {
      await stale.close();
    }
  });
});

test.describe('unsaved text: what leaving rows in place must not break', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin', USER_A);
  });

  test('a re-render leaves the focus and the caret where the editor is typing, also when a kept text is put back in another row', async ({
    page,
  }) => {
    const data = await loadModuleJson(page);
    const keptSeg = freeRow(data, 7);
    const typing = freeRow(data, 8);
    await openModule(page);
    const keptText = `${keptSeg.is}${SUFFIX} geymt`;
    const keptRow = await typeInto(page, keptSeg.segmentId, keptText);
    await refuseNextSave(page, keptRow, 'DUPLICATE_ID');
    await expect(keptRow.locator('.draft-notice[data-notice="DUPLICATE_ID"]')).toBeVisible();

    const text = `${typing.is}${SUFFIX} skrifa`;
    const row = await typeInto(page, typing.segmentId, text);
    await row.locator('textarea').evaluate((el) => {
      el.focus();
      el.setSelectionRange(3, 5);
    });
    // Marks on the two rows as they are now: a row rebuilt by the reload loses its mark, a row left in place keeps it.
    for (const r of [row, keptRow]) await r.evaluate((tr) => (tr.dataset.before = '1'));
    const { asked, stop } = answerDialogs(page, true); // nothing is asked; an OK would have closed the panes before
    const reloaded = backgroundLoads(page);
    await page.evaluate((m) => window.loadModule(m, { force: true }), MODULE);
    await reloaded;
    await page.waitForTimeout(300); // the two background re-renders have run
    stop();
    expect(asked).toEqual([]);
    await expect(row).toHaveAttribute('data-before', '1'); // left in place
    await expect(keptRow).not.toHaveAttribute('data-before', '1'); // rebuilt, its kept text put back

    const focus = await page.evaluate(() => {
      const el = document.activeElement;
      return { id: el && el.id, start: el && el.selectionStart, end: el && el.selectionEnd };
    });
    expect(focus).toEqual({
      id: await row.locator('textarea').getAttribute('id'),
      start: 3,
      end: 5,
    });
    await expect(row.locator('textarea')).toHaveValue(text);
    await expect(keptRow.locator('textarea')).toHaveValue(keptText);
    await expect(keptRow.locator('.draft-notice[data-notice="DUPLICATE_ID"]')).toBeVisible();
    // Rows left in place and rows rebuilt around them: no row twice.
    const ids = await page
      .locator('#segments-body tr')
      .evaluateAll((trs) => trs.map((tr) => tr.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(data.segments.length);
  });

  test('a kept text stays on screen when the filter would hide its row', async ({ page }) => {
    const target = freeRow(await loadModuleJson(page), 9);
    await openModule(page);
    const text = `${target.is}${SUFFIX} sía geymt`;
    const row = await typeInto(page, target.segmentId, text);
    await page.locator('#filter-type').selectOption('pending'); // the row has no pending edit
    await refuseNextSave(page, row, 'STALE_BASE');

    await expect(row.locator('.edit-panel')).toHaveClass(/active/);
    await expect(row.locator('textarea')).toHaveValue(text);
    await expect(row.locator('.draft-notice[data-notice="STALE_BASE"]')).toBeVisible();
    await expect(page.locator('#save-status-text')).toHaveText(UI.save.unsaved(1));
  });

  test('a refused save keeps what the box holds when the answer comes, not only what was sent', async ({
    page,
  }) => {
    const target = freeRow(await loadModuleJson(page), 10);
    await openModule(page);
    const sent = `${target.is}${SUFFIX}`;
    const row = await typeInto(page, target.segmentId, sent);
    const { posts, release } = await holdSaves(page, 409, { error: 'conflict', message: 'stub' });
    const { stop } = answerDialogs(page, true);
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    await expect.poll(() => posts.length).toBe(1);
    const more = `${sent} og meira`;
    await row.locator('textarea').fill(more);
    // The reload after the refusal is held back, so what is checked first is what the refusal itself kept: the
    // draft it wrote, which is all there is if that reload never comes back.
    const gate = await holdReload(page);
    release();
    await expect.poll(() => gate.held()).toBe(1);
    expect(posts[0].editedContent).toBe(sent);
    expect(await storedDraftEntry(page, target.segmentId)).toMatchObject({
      text: more,
      refused: 'conflict',
    });
    const reloaded = backgroundLoads(page);
    gate.release();
    await reloaded;
    await page.waitForTimeout(300);
    stop();

    await expect(row.locator('textarea')).toHaveValue(more);
    await expect(row.locator('.draft-notice[data-notice="conflict"]')).toBeVisible();
  });

  test('a second Vista while the first is on its way sends nothing', async ({ page }) => {
    const target = freeRow(await loadModuleJson(page), 11);
    await openModule(page);
    const row = await typeInto(page, target.segmentId, `${target.is}${SUFFIX}`);
    const { posts, release } = await holdSaves(page, 200, STUB_SAVED);
    const { asked, stop } = answerDialogs(page, true);
    const vista = row.getByRole('button', { name: 'Vista', exact: true });
    await vista.click();
    await expect.poll(() => posts.length).toBe(1);
    await vista.click();
    await row.locator('textarea').press('Control+s');
    await page.waitForTimeout(300);
    expect(posts).toHaveLength(1);
    const reloaded = backgroundLoads(page);
    release();
    await reloaded;
    stop();
    expect(asked).toEqual([]);
  });

  test('Escape closes the pane it was pressed in, not the first open one', async ({ page }) => {
    const data = await loadModuleJson(page);
    const order = (seg) => data.segments.findIndex((s) => s.segmentId === seg.segmentId);
    const [upper, lower] = [freeRow(data, 12), freeRow(data, 13)].sort(
      (a, b) => order(a) - order(b)
    );
    await openModule(page);
    const text = `${upper.is}${SUFFIX} efri`;
    const upperRow = await typeInto(page, upper.segmentId, text);
    const lowerRow = rowOf(page, lower.segmentId);
    await lowerRow.locator('.btn-edit').click();
    await lowerRow.locator('input[id^="note-"]').focus(); // in the lower pane, outside its text box

    const { asked, stop } = answerDialogs(page, false);
    await page.keyboard.press('Escape');
    await expect(lowerRow.locator('.edit-panel')).not.toHaveClass(/active/);
    stop();
    expect(asked).toEqual([]); // the lower pane held no change, and the upper one was not asked about
    await expect(upperRow.locator('.edit-panel')).toHaveClass(/active/);
    await expect(upperRow.locator('textarea')).toHaveValue(text);
  });

  test('opening another unit over an open one asks first, and takes no row along', async ({
    page,
  }) => {
    const target = freeRow(await loadModuleJson(page), 0);
    await openModule(page);
    const text = `${target.is}${SUFFIX}`;
    const row = await typeInto(page, target.segmentId, text);

    const cancel = answerDialogs(page, false);
    await page.evaluate(() => window.loadModule('m68663'));
    await expect.poll(() => cancel.asked).toEqual([UI.confirm.leaveDiscards(1)]);
    cancel.stop();
    await expect(row.locator('textarea')).toHaveValue(text);

    const ok = answerDialogs(page, true);
    const loaded = page.waitForResponse((r) =>
      r.url().endsWith(`/api/segment-editor/${BOOK}/${CHAPTER}/m68663/repetitions`)
    );
    await page.evaluate(() => window.loadModule('m68663'));
    await loaded;
    await page.waitForTimeout(300);
    ok.stop();
    const ids = await page
      .locator('#segments-body tr')
      .evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-segment-id')));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !id.startsWith('m68663:'))).toEqual([]);
    await expect(page.locator('.edit-panel.active')).toHaveCount(0);
  });

  test('„Nota þessa þýðingu“ asks before it replaces changed text', async ({ page }) => {
    const target = freeRow(await loadModuleJson(page), 1);
    const suggestion = {
      is_text: `${target.is}${SUFFIX} úr minni`,
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
    const text = `${target.is}${SUFFIX}`;
    const row = await typeInto(page, target.segmentId, text);

    const cancel = answerDialogs(page, false);
    await row.getByRole('button', { name: 'Nota þessa þýðingu' }).click();
    await expect.poll(() => cancel.asked).toEqual([UI.confirm.discardChanges]);
    cancel.stop();
    await expect(row.locator('textarea')).toHaveValue(text);

    const ok = answerDialogs(page, true);
    await row.getByRole('button', { name: 'Nota þessa þýðingu' }).click();
    await expect(row.locator('textarea')).toHaveValue(suggestion.is_text);
    ok.stop();
    expect(ok.asked).toEqual([UI.confirm.discardChanges]);
  });

  test('„Beita víðar“ sends nothing when the save before it did not land', async ({ page }) => {
    const target = freeRow(await loadModuleJson(page), 2);
    await openModule(page);
    const text = `${target.is}${SUFFIX}`;
    const row = await typeInto(page, target.segmentId, text);
    await page.route(
      `**${MODULE_URL}/edit`,
      (route) =>
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'HAS_DISCUSSION', message: 'stub' }),
        }),
      { times: 1 }
    );
    const previews = [];
    page.on('request', (r) => {
      if (r.url().includes('/propagation-preview')) previews.push(r.url());
    });
    const { asked, stop } = answerDialogs(page, true);
    const reloaded = backgroundLoads(page);
    await row.locator('.btn-propagate').click();
    await reloaded;
    await page.waitForTimeout(300);
    stop();

    expect(previews).toEqual([]);
    expect(asked).toEqual(['stub']); // the refusal's own message, and nothing about closing panes
    // Any refused save leaves the text in its pane, kept code or not.
    await expect(row.locator('.edit-panel')).toHaveClass(/active/);
    await expect(row.locator('textarea')).toHaveValue(text);
  });

  test('a draft the editor asks back comes back, also when the filter hides its row', async ({
    page,
  }) => {
    const target = freeRow(await loadModuleJson(page), 3);
    await openModule(page);
    const text = `${target.is}${SUFFIX} drög`;
    await typeInto(page, target.segmentId, text);
    await expect
      .poll(
        () =>
          page.evaluate(
            (t) =>
              Object.keys(localStorage).some(
                (k) => k.startsWith('seg-draft:') && localStorage.getItem(k).includes(t)
              ),
            text
          ),
        { timeout: 15000 }
      )
      .toBe(true);

    // Open the unit again through "Yfirlestrar", whose filter shows rows with a pending edit only.
    const ok = answerDialogs(page, true); // the leave prompt, then the recovery offer
    const background = backgroundLoads(page);
    await page.goto(`/editor?book=${BOOK}&chapter=${CHAPTER}&module=${MODULE}&view=reviews`);
    await background;
    await page.waitForTimeout(300);
    ok.stop();
    expect(ok.asked).toContain(UI.confirm.draftRecovery(1));
    await expect(page.locator('#filter-status')).toHaveValue('pending');
    const row = rowOf(page, target.segmentId);
    await expect(row.locator('.edit-panel')).toHaveClass(/active/);
    await expect(row.locator('textarea')).toHaveValue(text);
    await expect(row.locator('textarea')).toBeFocused(); // nobody was typing, so it is brought into view
  });

  test('right after a refused save, Escape and „Beita víðar“ treat the kept text as unsaved text', async ({
    page,
  }) => {
    const target = freeRow(await loadModuleJson(page), 4);
    await openModule(page);
    const text = `${target.is}${SUFFIX} bíður endurhleðslu`;
    const row = await typeInto(page, target.segmentId, text);
    await page.route(
      `**${MODULE_URL}/edit`,
      (route) =>
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'conflict', message: 'stub' }),
        }),
      { times: 1 }
    );
    // The reload that follows the refusal is held back: the pane is open, its text waits in the hold.
    const gate = await holdReload(page);
    const refusal = answerDialogs(page, true);
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    await expect.poll(() => refusal.asked.length).toBe(1);
    refusal.stop();
    await expect.poll(() => gate.held()).toBe(1);

    const inBox = answerDialogs(page, false);
    await row.locator('textarea').focus();
    await page.keyboard.press('Escape');
    await expect.poll(() => inBox.asked).toEqual([UI.draftNotice.discardKept]);
    inBox.stop();
    await expect(row.locator('textarea')).toHaveValue(text);

    const outside = answerDialogs(page, false);
    await row.locator('input[id^="note-"]').focus();
    await page.keyboard.press('Escape');
    await expect.poll(() => outside.asked).toEqual([UI.confirm.discardChanges]);
    outside.stop();
    await expect(row.locator('.edit-panel')).toHaveClass(/active/);
    await expect(row.locator('textarea')).toHaveValue(text);

    const previews = [];
    page.on('request', (r) => {
      if (r.url().includes('/propagation-preview')) previews.push(r.url());
    });
    await row.locator('.btn-propagate').click();
    await page.waitForTimeout(300);
    expect(previews).toEqual([]);

    // More typed while the reload is out is part of the kept text when the row is redrawn.
    const more = `${text} og áfram`;
    await row.locator('textarea').fill(more);
    const reloaded = backgroundLoads(page);
    gate.release();
    await reloaded;
    await page.waitForTimeout(300);
    await expect(row.locator('textarea')).toHaveValue(more);
    await expect(row.locator('.draft-notice[data-notice="conflict"]')).toBeVisible();
  });

  test('typing in a kept pane keeps the focus and the caret through a re-render', async ({
    page,
  }) => {
    const target = freeRow(await loadModuleJson(page), 5);
    await openModule(page);
    const text = `${target.is}${SUFFIX} geymt og skrifað`;
    const row = await typeInto(page, target.segmentId, text);
    await refuseNextSave(page, row, 'DUPLICATE_ID');
    await expect(row.locator('.draft-notice[data-notice="DUPLICATE_ID"]')).toBeVisible();
    await row.locator('textarea').evaluate((el) => {
      el.focus();
      el.setSelectionRange(2, 4);
    });
    await row.evaluate((tr) => (tr.dataset.before = '1'));
    const reloaded = backgroundLoads(page);
    await page.evaluate((m) => window.loadModule(m, { force: true }), MODULE);
    await reloaded;
    await page.waitForTimeout(300);

    await expect(row).not.toHaveAttribute('data-before', '1'); // the row was rebuilt under the caret
    const focus = await page.evaluate(() => {
      const el = document.activeElement;
      return { id: el && el.id, start: el && el.selectionStart, end: el && el.selectionEnd };
    });
    expect(focus).toEqual({
      id: await row.locator('textarea').getAttribute('id'),
      start: 2,
      end: 4,
    });
    await expect(row.locator('textarea')).toHaveValue(text);
  });

  test('a pane closed while its save was on its way is not left as unsaved', async ({ page }) => {
    const target = freeRow(await loadModuleJson(page), 6);
    await openModule(page);
    const row = await typeInto(page, target.segmentId, `${target.is}${SUFFIX}`);
    const { posts, release } = await holdSaves(page, 200, STUB_SAVED);
    const { asked, stop } = answerDialogs(page, true);
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    await expect.poll(() => posts.length).toBe(1);
    await row.getByRole('button', { name: 'Hætta við', exact: true }).click(); // the save-then-close habit
    await expect(row.locator('.edit-panel')).not.toHaveClass(/active/);
    const reloaded = backgroundLoads(page);
    release();
    await reloaded;
    await page.waitForTimeout(300);
    stop();

    expect(asked).toEqual([UI.confirm.discardChanges]); // the close asked; nothing offered a draft afterwards
    await expect(row.locator('.edit-panel')).not.toHaveClass(/active/);
    await expect(page.locator('#save-status-text')).toHaveText(UI.save.nothingUnsaved);
  });

  test('after the answer to a save, the next Vista is sent at once and reports what was done since', async ({
    page,
  }) => {
    const target = freeRow(await loadModuleJson(page), 7);
    await openModule(page);
    const sent = `${target.is}${SUFFIX}`;
    const row = await typeInto(page, target.segmentId, sent);
    const answer = {
      ...STUB_SAVED,
      editId: 4343,
      baseSha256: target.baseSha256,
      displayedEditId: 4343,
      displayedEditSha256: 'b'.repeat(64),
    };
    const { posts, release } = await holdSaves(page, 200, answer);
    const { stop } = answerDialogs(page, true);
    const vista = row.getByRole('button', { name: 'Vista', exact: true });
    await vista.click();
    await expect.poll(() => posts.length).toBe(1);
    // While the save is on its way: the last three letters are made bold (an assist, and a change of text).
    const box = row.locator('textarea');
    await box.evaluate((el) => el.setSelectionRange(el.value.length - 3, el.value.length));
    await box.press('Control+b');
    const gate = await holdReload(page); // the reload after the answer does not come back yet
    release();
    await expect(row.locator('.seg-save-ind')).toHaveText(UI.save.changed);
    await expect.poll(() => gate.held()).toBe(1);

    await vista.click(); // not dropped while the reload is out
    await expect.poll(() => posts.length).toBe(2);
    expect(posts[1].editedContent).toBe(await box.inputValue());
    expect(posts[1].displayedEditId).toBe(answer.displayedEditId);
    expect(posts[1].assists.map((a) => a.itemType)).toEqual(['markup-wrap']);
    expect(posts[0].assists).toEqual([]);
    const reloaded = backgroundLoads(page);
    gate.release();
    await reloaded;
    stop();
  });

  test('a row the filter hides goes when its pane closes, also after Endurstilla', async ({
    page,
  }) => {
    const target = freeRow(await loadModuleJson(page), 8);
    await openModule(page);
    const row = await typeInto(page, target.segmentId, `${target.is}${SUFFIX}`);
    await page.locator('#filter-type').selectOption('pending'); // the row has no pending edit; it stays
    await expect(row.locator('textarea')).toBeVisible();

    const { asked, stop } = answerDialogs(page, true);
    await row.locator('.btn-revert').click(); // Endurstilla: the pane stays open, so the row stays
    await expect(row.locator('textarea')).toHaveValue(target.is);
    await expect(row.locator('.edit-panel')).toHaveClass(/active/);
    await row.getByRole('button', { name: 'Hætta við', exact: true }).click(); // nothing changed: no question
    stop();
    expect(asked).toEqual([UI.confirm.discardChanges]);
    await expect(row).toHaveCount(0);
  });

  for (const discard of [
    {
      how: 'Endurstilla',
      run: (page, row) => row.locator('.btn-revert').click(),
      paneOpenAfter: true,
    },
    {
      how: 'Escape outside the text box',
      run: async (page, row) => {
        await row.locator('input[id^="note-"]').focus();
        await page.keyboard.press('Escape');
      },
      paneOpenAfter: false,
    },
  ]) {
    test(`a row left in place is rebuilt from the newer data when ${discard.how} discards its text`, async ({
      page,
    }) => {
      const target = freeRow(await loadModuleJson(page), 9);
      await openModule(page);
      const row = await typeInto(page, target.segmentId, `${target.is}${SUFFIX}`);
      // Every later serve names another base for the row, as if its file had changed. The row, left in place by
      // the reload, keeps the base its text was typed on.
      const NEWER = 'e'.repeat(64);
      await page.route(`**${MODULE_URL}`, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        const response = await route.fetch();
        const json = await response.json();
        json.segments.find((seg) => seg.segmentId === target.segmentId).baseSha256 = NEWER;
        await route.fulfill({ response, json });
      });
      const reloaded = backgroundLoads(page);
      await page.evaluate((m) => window.loadModule(m, { force: true }), MODULE);
      await reloaded;
      await page.waitForTimeout(300);
      await expect(row).toHaveAttribute('data-base-sha256', target.baseSha256);

      const { asked, stop } = answerDialogs(page, true);
      await discard.run(page, row);
      await expect(row).toHaveAttribute('data-base-sha256', NEWER); // rebuilt from what the reload brought
      stop();
      expect(asked).toEqual([UI.confirm.discardChanges]);
      await expect(row).not.toHaveAttribute('data-render-skipped', '');
      if (discard.paneOpenAfter) {
        await expect(row.locator('.edit-panel')).toHaveClass(/active/);
        await expect(row.locator('textarea')).toHaveValue(target.is);
      } else {
        await expect(row.locator('.edit-panel')).not.toHaveClass(/active/);
      }
    });
  }

  test('Ctrl+S outside a text box saves the pane holding the focus, not the first open one', async ({
    page,
  }) => {
    const data = await loadModuleJson(page);
    const order = (seg) => data.segments.findIndex((x) => x.segmentId === seg.segmentId);
    const [upper, lower] = [freeRow(data, 10), freeRow(data, 11)].sort(
      (a, b) => order(a) - order(b)
    );
    await openModule(page);
    await typeInto(page, upper.segmentId, `${upper.is}${SUFFIX} efri`);
    const lowerRow = await typeInto(page, lower.segmentId, `${lower.is}${SUFFIX} neðri`);
    const { posts, release } = await holdSaves(page, 200, STUB_SAVED);
    const { stop } = answerDialogs(page, true);
    await lowerRow.locator('input[id^="note-"]').focus();
    await page.keyboard.press('Control+s');
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0].segmentId).toBe(lower.segmentId);
    const reloaded = backgroundLoads(page);
    release();
    await reloaded;
    stop();
  });

  test('category and note are pre-filled from the editor’s own edit, never from another editor’s', async ({
    page,
  }) => {
    const data = await loadModuleJson(page);
    const theirs = freeRow(data, 12);
    const mine = freeRow(data, 13);
    // The first serve carries a rejected edit on each row: one by somebody else, one by this editor (the helper
    // names a user after its role). A rejected edit leaves the row open for editing.
    const rejected = (seg, id, username) => ({
      id,
      book: BOOK,
      chapter: 1,
      module_id: MODULE,
      segment_id: seg.segmentId,
      original_content: seg.is,
      edited_content: `${seg.is} (hafnað)`,
      category: 'accuracy',
      editor_note: 'athugasemd með höfnuðu breytingunni',
      editor_id: username,
      editor_username: username,
      status: 'rejected',
      reviewer_note: 'nei',
      created_at: '2026-11-13 10:00:00',
      applied_at: null,
      contentSha256: 'c'.repeat(64),
    });
    let served = 0;
    await page.route(`**${MODULE_URL}`, async (route) => {
      served++;
      if (served > 1 || route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const json = await response.json();
      json.edits[theirs.segmentId] = [rejected(theirs, 990001, 'annar-yfirlesari')];
      json.edits[mine.segmentId] = [rejected(mine, 990002, 'test-admin')];
      await route.fulfill({ response, json });
    });
    await openModule(page);

    const theirRow = rowOf(page, theirs.segmentId);
    await theirRow.locator('.btn-edit').click();
    await expect(theirRow.locator('select[id^="cat-"]')).toHaveValue('');
    await expect(theirRow.locator('input[id^="note-"]')).toHaveValue('');
    // Control: the editor's own rejected edit does pre-fill both.
    const myRow = rowOf(page, mine.segmentId);
    await myRow.locator('.btn-edit').click();
    await expect(myRow.locator('select[id^="cat-"]')).toHaveValue('accuracy');
    await expect(myRow.locator('input[id^="note-"]')).toHaveValue(
      'athugasemd með höfnuðu breytingunni'
    );
  });

  for (const wrote of [
    { rows: 1, reloads: true },
    { rows: 0, reloads: false },
  ]) {
    test(`„Beita víðar“ that wrote ${wrote.rows} row(s) ${wrote.reloads ? 'reloads the unit' : 'does not reload it'}`, async ({
      page,
    }) => {
      const data = await loadModuleJson(page);
      const target = freeRow(data, 0);
      const other = freeRow(data, 1);
      await openModule(page);
      const row = await typeInto(page, target.segmentId, `${target.is}${SUFFIX}`);
      // Stubs only: the save lands, the preview offers one place, and the propagation answers what it wrote.
      await page.route(`**${MODULE_URL}/edit`, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(STUB_SAVED),
        })
      );
      await page.route(
        (url) => url.pathname === `${MODULE_URL}/propagation-preview`,
        (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ eligible: [{ segmentId: other.segmentId }] }),
          })
      );
      await page.route(`**${MODULE_URL}/propagate`, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            created: wrote.rows ? [{ segmentId: other.segmentId }] : [],
            skipped: [],
          }),
        })
      );
      const { stop } = answerDialogs(page, true); // the propagate confirm
      const propagated = page.waitForResponse((r) => r.url().endsWith(`${MODULE_URL}/propagate`));
      await row.locator('.btn-propagate').click();
      await propagated;
      // The save's own reload has been and gone before the preview. Count the unit's serves from here.
      let serves = 0;
      page.on('request', (r) => {
        if (r.method() === 'GET' && r.url().endsWith(MODULE_URL)) serves++;
      });
      await page.waitForTimeout(700);
      stop();
      expect(serves).toBe(wrote.reloads ? 1 : 0);
    });
  }

  test('a replay refused with a code that is not a kept one comes back with the general notice', async ({
    page,
  }) => {
    const target = freeRow(await loadModuleJson(page), 2);
    await openModule(page);
    const typed = `${target.is}${SUFFIX}`;
    const row = await typeInto(page, target.segmentId, typed);
    let sent = 0;
    await page.route(`**${MODULE_URL}/edit`, (route) => {
      sent++;
      return sent === 1
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"stub"}' })
        : route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'HAS_DISCUSSION', message: 'stub' }),
          });
    });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    await expect(page.locator('.toast-error').first()).toBeVisible(); // the 5xx: queued for a replay
    // The replay fires after about a second; its refusal parks the text, whatever the code, and the unit reloads.
    await expect(row.locator('.draft-notice[data-notice="REFUSED"]')).toBeVisible({
      timeout: 10000,
    });
    await expect(row.locator('textarea')).toHaveValue(typed);
    expect(sent).toBe(2);
  });
});
