// @ts-check
const path = require('path');
const { test, expect } = require('@playwright/test');
const Database = require('better-sqlite3');
const { loginAs } = require('./helpers/auth');

/**
 * G1.23, the editors' AI suggestion view, on the real efnafraedi-2e chapter 2 content (helpers/segments.js),
 * as it behaves since chemistry serves the Fable layer (spec of 2026-11-24, Task 9, Ruling 18).
 *
 * WHY THIS SPEC NO LONGER EXPECTS SUGGESTIONS: the suggestion groups describe the MT text the AI read, and a
 * Fable-served book (servedLayer.js; efnafraedi-2e is the only study book) shows its editors Fable's text, not
 * that MT. So suggestionView.eligibility() answers 'fable-layer' for the book whatever the view's switch says,
 * and a chemistry editor is offered no group, no swap, no ruling line and no Nota/Hafna button. The earlier
 * form of this file drove those controls on this very chapter; the client side of the feature stays covered by
 * the client pin tests and the stubbed unit tests, and it returns here when a study book is served from the MT
 * layer. There is deliberately NO layer override, env var or test hook in server code to bring the old
 * behaviour back: such a switch, mis-set on the server, would serve MT text to chemistry editors.
 *
 * WHAT IS KEPT: everything that does not depend on suggestions being offered. The switch's admin route (a
 * slug-confirmed first switch-on, read back) still works, and a dedicated editor's serve still records the
 * module's opening. WHAT IS NEW: with the switch ON, the editor shows no suggestion UI, paired in every test
 * with proof that the page and its segments really loaded, so an absence cannot be an empty page.
 *
 * The file runs serially (the switch-on in (2) must follow (1)) and needs a FRESH E2E DB (CI=1, so the web
 * server re-seeds it): step (1) checks for that and says so. WRITES (DB only): the switch row and the
 * dedicated editor's openings. Nothing here edits, accepts or rejects a segment.
 */
const BOOK = 'efnafraedi-2e';
const CHAPTER = 2;
const M84 = 'm68684';
const M93 = 'm68693';
const SUGGESTION_EDITOR_ID = 90123; // seed-fixture.js: provider_id '90123', assigned efnafraedi-2e chapter 2
const E2E_DB = path.join(__dirname, '..', '..', 'pipeline-output', 'e2e-sessions.db');

// Segments whose rows carried groups when the view was offered to chemistry (measured 2026-11-09/10). They are
// the rows a regression would light up, and each is located by its segment id.
const S = {
  beforeSwitchOn: 'm68684:para:eip-557', // `product` 1, in a module opened before the switch-on
  one: 'm68693:para:para-00002', // `molecular-structure` 1, the old test (3)'s row
  two: 'm68693:para:fs-idm94827440', // `atom` 2
  control: 'm68693:glossary-term:fs-idp55104-term', // `isomers` 1, the old always-offered control row
};

const moduleUrl = (m) => `/api/segment-editor/${BOOK}/${CHAPTER}/${m}`;
const rowOf = (page, segmentId) =>
  page.locator(`#segments-body tr[data-segment-id="${segmentId}"]`);
/** Every element the suggestion view draws: a swap, a ruling line, the line's container, a Nota/Hafna button. */
const SUGGESTION_UI =
  '.sugg-swap, .sugg-ruling, .sugg-rulings, .sugg-btn, .sugg-tag, .sugg-accepted';

/** Read-only rows of the run's DB (better-sqlite3 resolves from server/node_modules). */
function dbAll(sql, ...params) {
  const db = new Database(E2E_DB, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}
const openingRows = (moduleId) =>
  dbAll(
    'SELECT module_id FROM module_openings WHERE book = ? AND chapter = ? AND module_id = ?',
    BOOK,
    CHAPTER,
    moduleId
  );
/** Closed suggestion ops of the chapter in `table`: nothing here may close one. */
const closedCount = (table) =>
  dbAll(`SELECT COUNT(*) AS n FROM ${table} WHERE book = ? AND chapter = ?`, BOOK, CHAPTER)[0].n;

/**
 * Both background loads (/terms, /repetitions), each of which re-renders the table. Each waits for its response's
 * body, not its headers: the page re-renders only once it has read the body.
 */
const backgroundLoads = (page, moduleId) =>
  Promise.all(
    ['terms', 'repetitions'].map((load) =>
      page
        .waitForResponse((r) => r.url().endsWith(`${moduleUrl(moduleId)}/${load}`))
        .then((r) => r.finished())
    )
  );

/** Open a module from the URL; interact only after both background re-renders (served-base-client's openModule). */
async function openModule(page, moduleId) {
  const background = backgroundLoads(page, moduleId);
  await page.goto(`/editor?book=${BOOK}&chapter=${CHAPTER}&module=${moduleId}`);
  await expect(page.locator('#editor-container')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 10000 });
  await background;
}

async function moduleJson(page, moduleId) {
  const res = await page.request.get(moduleUrl(moduleId));
  expect(res.ok()).toBe(true);
  return res.json();
}

/** A fresh context logged in as the default admin (no users row, so it opens nothing); fn gets its request. */
async function asAdmin(browser, fn) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await loginAs(page, 'admin');
    return await fn(page.request);
  } finally {
    await context.close();
  }
}

/**
 * The module as a chemistry editor is served it, with the positive control that makes "no suggestions" mean
 * something: the segments are really there, including the rows that used to carry groups.
 */
async function expectServedWithoutSuggestions(page, moduleId, rowIds) {
  const served = await moduleJson(page, moduleId);
  expect(served.segments.length, 'the module served its segments').toBeGreaterThan(0);
  const ids = served.segments.map((s) => s.segmentId);
  for (const id of rowIds) expect(ids, `${id} is served`).toContain(id);
  expect(served.segments.filter((s) => s.suggestions).map((s) => s.segmentId)).toEqual([]);
  return served;
}

/** The page's table really rendered those rows, and none of them carries any suggestion UI. */
async function expectRenderedWithoutSuggestions(page, rowIds) {
  const rows = await page.locator('#segments-body tr[data-segment-id]').count();
  expect(rows, 'the table rendered segment rows').toBeGreaterThan(0);
  for (const id of rowIds) {
    const row = rowOf(page, id);
    await expect(row).toHaveCount(1);
    await expect(row.locator('td.col-is > [id^="is-"]')).not.toHaveText('');
    await expect(row.locator(SUGGESTION_UI)).toHaveCount(0);
  }
  await expect(page.locator('#segments-body').locator(SUGGESTION_UI)).toHaveCount(0);
}

test.describe('G1.23 suggestion view on efnafraedi-2e ch02, a Fable-served book (spec of 2026-11-24, Task 9)', () => {
  test.describe.configure({ mode: 'serial' });

  test('(1) the dedicated editor opens m68684 while the view is still off, and sees no suggestions', async ({
    page,
    browser,
  }) => {
    // A reused DB fails here, loudly, instead of further down on state an earlier pass consumed.
    const state = await asAdmin(browser, async (r) =>
      (await r.get(`/api/admin/books/${BOOK}/suggestion-view`)).json()
    );
    expect(state, 'this spec needs a fresh E2E DB: run it with CI=1').toEqual({
      book: BOOK,
      enabled: false,
    });
    expect(openingRows(M84)).toHaveLength(0);
    expect(openingRows(M93)).toHaveLength(0);

    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    await openModule(page, M84);
    await expect(rowOf(page, S.beforeSwitchOn)).toHaveCount(1);
    // The serve opened the module: a serve to the assigned editor records its opening whatever the layer.
    expect(openingRows(M84)).toHaveLength(1);
    expect(openingRows(M93)).toHaveLength(0);
    await expectRenderedWithoutSuggestions(page, [S.beforeSwitchOn]);
  });

  test('(2) an admin switches the view on for the book, confirming its slug', async ({
    browser,
  }) => {
    const result = await asAdmin(browser, async (r) => {
      const url = `/api/admin/books/${BOOK}/suggestion-view`;
      const unconfirmed = await r.post(url, { data: { enabled: true } });
      const afterRefusal = await (await r.get(url)).json();
      const confirmed = await r.post(url, { data: { enabled: true, confirmBook: BOOK } });
      return {
        unconfirmed: { status: unconfirmed.status(), code: (await unconfirmed.json()).code },
        afterRefusal,
        confirmed: { status: confirmed.status(), body: await confirmed.json() },
        after: await (await r.get(url)).json(),
      };
    });
    // Control: the first switch-on needs the typed slug, and the refusal switched nothing on.
    expect(result.unconfirmed).toEqual({ status: 400, code: 'CONFIRM_REQUIRED' });
    expect(result.afterRefusal).toEqual({ book: BOOK, enabled: false });
    expect(result.confirmed).toEqual({ status: 200, body: { book: BOOK, enabled: true } });
    expect(result.after).toEqual({ book: BOOK, enabled: true });
  });

  test('(3) with the switch on, m68693 opens for the dedicated editor and shows no suggestion groups', async ({
    page,
  }) => {
    expect(openingRows(M93)).toHaveLength(0);
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    // The first serve to this user, after the switch-on: with the MT layer it would be eligible (the opening
    // is strictly later than the switch-on). Under Fable serving the layer rule refuses it first.
    await openModule(page, M93);
    expect(openingRows(M93)).toHaveLength(1);
    await expectRenderedWithoutSuggestions(page, [S.one, S.two, S.control]);
    await expectServedWithoutSuggestions(page, M93, [S.one, S.two, S.control]);
  });

  test('the switch being on changes nothing for m68684 or m68693, and a reload still shows no groups', async ({
    page,
  }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    await expectServedWithoutSuggestions(page, M84, [S.beforeSwitchOn]);
    await expectServedWithoutSuggestions(page, M93, [S.one, S.two, S.control]);

    await openModule(page, M84);
    await expectRenderedWithoutSuggestions(page, [S.beforeSwitchOn]);
    await openModule(page, M93);
    await expectRenderedWithoutSuggestions(page, [S.one, S.two, S.control]);

    await page.reload();
    await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 10000 });
    await expectRenderedWithoutSuggestions(page, [S.one, S.two, S.control]);
  });

  test('a second editor with no assignment sees no groups either, and nothing was closed', async ({
    browser,
  }) => {
    const other = await browser.newContext();
    try {
      const page = await other.newPage();
      await loginAs(page, 'editor'); // the default editor login: no users row, so its serve opens nothing
      await openModule(page, M93);
      await expectRenderedWithoutSuggestions(page, [S.one, S.control]);
      await expectServedWithoutSuggestions(page, M93, [S.one, S.control]);
    } finally {
      await other.close();
    }
    // No act of this spec closes a suggestion op, and a Fable serve offers none to close.
    expect(closedCount('suggestion_rejections')).toBe(0);
    expect(closedCount('suggestion_left_open')).toBe(0);
  });
});
