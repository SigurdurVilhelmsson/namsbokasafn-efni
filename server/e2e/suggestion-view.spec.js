// @ts-check
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const Database = require('better-sqlite3');
const { loginAs } = require('./helpers/auth');
const segmentValidation = require('../public/js/segment-validation');
const suggestionLogs = require('../lib/suggestionLogs');

const UI = new Function(
  `${fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ui-strings.js'), 'utf8')}; return UI;`
)();

/**
 * G1.23, the editors' AI suggestion view, end to end (spec §9.4–9.6): a real browser, a real server
 * and the real efnafraedi-2e chapter 2 content, which this spec owns (helpers/segments.js).
 *
 * THE ORDER IS THE POINT, so the file runs serially: (1) the dedicated editor opens m68684 while the
 * view is off; (2) an admin switches the view on for the book; (3) the dedicated editor opens m68693.
 * A module gets suggestions only if it opened strictly after the first switch-on, and only a serve to
 * a user whose users row holds an assignment for the chapter opens it. The dedicated editor
 * (seed-fixture.js, provider id SUGGESTION_EDITOR_ID) is the only such user, so NOTHING may serve
 * m68693 to that id before step (3): a page.request.get counts as a serve. Reads before the switch-on
 * are made as admin, who has no users row.
 *
 * NEEDS A FRESH E2E DB (CI=1, so the web server re-seeds it). Rejections, left-open closures and the
 * openings are permanent for a DB, so a second pass over the same DB cannot pass; step (1) checks for
 * that and says so. For the same reason --repeat-each cannot repeat this spec: run it again instead.
 *
 * WRITES (DB only): edits on four rows, two of them approved (admin), one MT acceptance, two
 * rejections. The first edit writes the MT edit-lock marker beside m68693's MT output, which
 * global-teardown sweeps because this run created it. An approval writes only its DB row: nothing
 * here applies an edit to disk.
 *
 * Every "not shown" is paired with a group that IS shown, in the same module (spec §9.6): CONTROL is a
 * row no test touches, so its group is offered through the whole run. Rows are located by segment id;
 * values are asserted whole (a textarea's exact value, a tag's exact text, an op id list), never by a
 * phrase that could also occur elsewhere on the page (spec §9.4).
 */
const BOOK = 'efnafraedi-2e';
const CHAPTER = 2;
const M84 = 'm68684';
const M93 = 'm68693';
const SUGGESTION_EDITOR_ID = 90123; // seed-fixture.js: provider_id '90123', assigned efnafraedi-2e chapter 2
const E2E_DB = path.join(__dirname, '..', '..', 'pipeline-output', 'e2e-sessions.db');

// The segments (index decision 16; measured 2026-11-09 and again for this spec on 2026-11-10).
const S = {
  beforeSwitchOn: 'm68684:para:eip-557', // `product` 1, in a module opened before the switch-on
  one: 'm68693:para:para-00002', // `molecular-structure` 1
  two: 'm68693:para:fs-idm94827440', // `atom` 2
  takeOneLeaveOne: 'm68693:para:fs-idp29766960', // `isomers` 1, `molecular-structure` 1
  dependent: 'm68693:para:fs-idm89120384', // `spatial-isomers` 1, then `isomers` 1
  stadfesta: 'm68693:para:fs-idm100378720', // `isomers` 1
  typingOver: 'm68693:para:fs-idm177313504', // `structural-isomer` 1, `spatial-isomers` 1
  hafna: 'm68693:alt:fs-idp204316880-alt', // `lewis-structure` 1, its only group
  dirtyHafna: 'm68693:alt:fs-idm139132560-alt', // `lewis-structure` 1 (Review Focus 1)
  refusedSave: 'm68693:para:fs-idm102332384', // `atom` 3 (Review Focus 3)
};
// Never touched by any test: its one group is offered through the whole run (spec §9.6).
const CONTROL = 'm68693:glossary-term:fs-idp55104-term';
const CONTROL_RULING = 'isomers';
// The double-click guard's tests (spec ✏️ AMENDED 2026-11-11) use rows no earlier test touches, and none of them
// writes to the DB: Nota stays on the screen until Vista, which they never press, and their rejects are stubbed. So
// they may share these rows.
const G = {
  caption1: 'm68693:caption:CNX_Chem_02_04_Isomers-caption', // `structural-isomer` 1
  caption2: 'm68693:caption:CNX_Chem_02_04_Isomers2-caption', // `spatial-isomers` 1
  alt: 'm68693:alt:fs-idm155370112-alt', // `lewis-structure` 1
  glossSpatial: 'm68693:glossary-term:fs-idm54570400-term', // `spatial-isomers` 1
  glossStructural: 'm68693:glossary-term:fs-idp1084128-term', // `structural-isomer` 1
  atom3: 'm68693:para:fs-idp51085424', // `atom` 3
  solution: 'm68693:solution:fs-idm187478032', // `structural-isomer` 1
};

const moduleUrl = (m) => `/api/segment-editor/${BOOK}/${CHAPTER}/${m}`;
const groupKey = (segmentId, rulingId) => `${segmentId}#0|${rulingId}`;
const rowOf = (page, segmentId) =>
  page.locator(`#segments-body tr[data-segment-id="${segmentId}"]`);
/** The row's IS display (`#is-…`), not the pane's preview, which draws the same swaps without buttons. */
const isDisplay = (row) => row.locator('td.col-is > [id^="is-"]');
/** The row's ruling lines (`#sugg-…`), present only on a row whose segment carries suggestions. */
const rulings = (row) => row.locator('td.col-is > .sugg-rulings');
const swapsOf = (row, key) => isDisplay(row).locator(`.sugg-swap[data-group-key="${key}"]`);
const rulingOf = (row, key) => rulings(row).locator(`.sugg-ruling[data-group-key="${key}"]`);
const notaOn = (swap) => swap.getByRole('button', { name: UI.suggestions.notaTitle, exact: true });
const hafnaOn = (swap) =>
  swap.getByRole('button', { name: UI.suggestions.hafnaTitle, exact: true });

/** `text` with its ONE occurrence of `find` replaced: a find that is absent or repeated fails here. */
function replacedOnce(text, find, replace) {
  expect(text.split(find).length - 1, `"${find}" occurs exactly once`).toBe(1);
  return text.replace(find, replace);
}

/** A text the client will save without asking: a structural warning raises a confirm, auto-dismissed. */
function expectSavable(seg, text) {
  const v = segmentValidation.validateStructure(seg.en, seg.is, text);
  expect({ blocked: v.blocked, warnings: v.warnings }).toEqual({ blocked: null, warnings: null });
}

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
/** The op ids closed on one m68693 segment in `table`, sorted, with the act for left-open rows. */
const closedOps = (table, segmentId) =>
  dbAll(
    `SELECT op_id, occurrence${table === 'suggestion_left_open' ? ', finishing_act' : ''}
       FROM ${table} WHERE book = ? AND chapter = ? AND module_id = ? AND segment_id = ?
      ORDER BY op_id`,
    BOOK,
    CHAPTER,
    M93,
    segmentId
  );

/**
 * Both background loads (/terms, /repetitions), each of which re-renders the table. Each waits for its response's
 * body, not its headers: the page re-renders only once it has read the body, and each re-render starts the
 * double-click guard's pause (spec ✏️ AMENDED 2026-11-11).
 */
const backgroundLoads = (page, moduleId) =>
  Promise.all(
    ['terms', 'repetitions'].map((load) =>
      page
        .waitForResponse((r) => r.url().endsWith(`${moduleUrl(moduleId)}/${load}`))
        .then((r) => r.finished())
    )
  );

/**
 * The double-click guard's pause (spec ✏️ AMENDED 2026-11-11): while <html> carries data-sugg-paused, every Nota and
 * Hafna ignores a click. The value of the pause is the client's SUGGESTION_PAUSE_MS.
 */
const PAUSE_MS = 500;
const paused = (page) => page.locator('html[data-sugg-paused]');

/**
 * Installed in every page before its scripts (test.beforeEach): records each click on a suggestion button. A capture
 * listener on window runs before any listener on document, so it sees every click, with its time and whether the
 * pause was on; a bubble listener on window sees only the clicks that reached the button. A click the guard
 * swallows is therefore seen and never delivered.
 */
function recordSuggestionClicks() {
  const clicks = { seen: [], pausedAt: [], delivered: 0 };
  window.__suggClicks = clicks;
  const onButton = (e) => e.target instanceof Element && e.target.closest('.sugg-btn');
  window.addEventListener(
    'click',
    (e) => {
      if (!onButton(e)) return;
      clicks.seen.push(e.timeStamp);
      clicks.pausedAt.push(document.documentElement.hasAttribute('data-sugg-paused'));
    },
    true
  );
  window.addEventListener('click', (e) => {
    if (onButton(e)) clicks.delivered++;
  });
}
const suggClicks = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__suggClicks)));
/** Short poll steps for a click's record: the default (100, 250, 500 ms) would spend much of the pause waiting. */
const CLICK_POLL = [10, 20, 50, 100];

/**
 * Click a suggestion button that the test means to act. It waits for the pause to end, and retries a click the pause
 * swallowed: a background re-render can still land between the wait and the click, and a swallowed click ran no
 * handler, so clicking again is safe. Three swallows in a row fail here, not lines later.
 */
async function clickSuggestion(page, button) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(paused(page)).toHaveCount(0);
    const before = await suggClicks(page);
    await button.click();
    await expect
      .poll(async () => (await suggClicks(page)).seen.length, { intervals: CLICK_POLL })
      .toBe(before.seen.length + 1);
    const after = await suggClicks(page);
    if (after.delivered === before.delivered + 1) return after;
  }
  throw new Error('the double-click guard swallowed a suggestion click three times in a row');
}

/**
 * A raw click on a suggestion button, for a test that expects the guard to swallow it. `before` is the page's click
 * record read BEFORE the event that starts the pause, so no read sits between that event and this click. Returns the
 * record of the click (`at`: its event time, `pausedAt`: whether the pause was showing) and whether it was delivered.
 */
async function rawSuggestionClick(page, button, before) {
  // A real mouse click at the button's centre, without Playwright's actionability waits (scrolling, stability),
  // which can cost a large part of the pause: one in-page step scrolls the button into view and measures it.
  const at = await button.evaluate((el) => {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(at.x, at.y);
  await expect
    .poll(async () => (await suggClicks(page)).seen.length, {
      message: 'the click landed on the button',
      intervals: CLICK_POLL,
    })
    .toBe(before.seen.length + 1);
  const after = await suggClicks(page);
  return {
    at: after.seen[after.seen.length - 1],
    pausedAt: after.pausedAt[after.pausedAt.length - 1],
    delivered: after.delivered > before.delivered,
    seen: after.seen,
  };
}

/** The page's clock (performance.now, the clock of an event's timeStamp). */
const pageNow = (page) => page.evaluate(() => performance.now());

/** Fail as "too slow", not as "guard broken", when the harness's click came after the pause would have ended. */
function expectWithinPause(gap, what) {
  console.log(`[double-click guard] ${what}: ${Math.round(gap)} ms of the ${PAUSE_MS} ms pause`); // the headroom
  expect(
    gap,
    `${what} came ${Math.round(gap)} ms after the event that starts the pause, which is not within ${PAUSE_MS} ms: this runner is too slow for the test`
  ).toBeLessThan(PAUSE_MS);
}

/** A reject stub that writes nothing: it records each request and, once `gate` resolves, answers as a fresh reject. */
async function stubReject(page, gate = Promise.resolve()) {
  const sent = [];
  await page.route(`**${moduleUrl(M93)}/suggestions/reject`, async (route) => {
    sent.push(route.request().postDataJSON());
    await gate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ inserted: 1, alreadyClosed: 0 }),
    });
  });
  return sent;
}

/** The served segment `segmentId` of m68693. */
async function servedSegment(page, segmentId) {
  return (await moduleJson(page, M93)).segments.find((s) => s.segmentId === segmentId);
}

/** Open a module from the URL; interact only after both background re-renders (served-base-client's openModule). */
async function openModule(page, moduleId) {
  const background = backgroundLoads(page, moduleId);
  await page.goto(`/editor?book=${BOOK}&chapter=${CHAPTER}&module=${moduleId}`);
  await expect(page.locator('#editor-container')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 10000 });
  await background;
}

/** Count the module GETs this page makes (served-base-client.spec.js's counter); the page's routes outlive a reload. */
async function countModuleGets(page, moduleId) {
  const counter = { gets: 0 };
  await page.route(`**${moduleUrl(moduleId)}`, (route) => {
    if (route.request().method() === 'GET') counter.gets++;
    return route.continue();
  });
  return counter;
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

/** A head editor's approval, with the admin login (requireHeadEditorFor passes it without a book row). */
async function approveAsAdmin(browser, editId) {
  return asAdmin(browser, async (request) => {
    const res = await request.post(`/api/segment-editor/edit/${editId}/approve`, { data: {} });
    return { status: res.status(), body: await res.json() };
  });
}

/** Click the row's Vista and wait for the save, the module reload it triggers, and that reload's re-renders. */
async function vista(page, row, moduleId) {
  const url = moduleUrl(moduleId);
  const posted = page.waitForRequest(
    (r) => r.url().endsWith(`${url}/edit`) && r.method() === 'POST'
  );
  const saved = page.waitForResponse((r) => r.url().endsWith(`${url}/edit`));
  const reloaded = page.waitForResponse(
    (r) => r.url().endsWith(url) && r.request().method() === 'GET'
  );
  const background = backgroundLoads(page, moduleId);
  await row.getByRole('button', { name: 'Vista', exact: true }).click();
  const body = (await posted).postDataJSON();
  expect((await saved).status()).toBe(200);
  await reloaded;
  await background;
  return body;
}

/** The draft entry stored for `segmentId` under any tab's key, reduced to its text and ai-suggestion op ids. */
async function storedDraft(page, segmentId) {
  return page.evaluate((id) => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('seg-draft:')) {
        const v = JSON.parse(localStorage.getItem(key) || 'null');
        const e = v && v.segments && v.segments[id];
        if (e) {
          return {
            text: e.text,
            refused: e.refused,
            ops: (e.assists || []).filter((a) => a.itemType === 'ai-suggestion').map((a) => a.opId),
          };
        }
      }
    }
    return null;
  }, segmentId);
}

/** The group no test touches is still offered (the shown half of every "not shown"; spec §9.6). */
async function expectControlShown(page) {
  const row = rowOf(page, CONTROL);
  await expect(swapsOf(row, groupKey(CONTROL, CONTROL_RULING))).toHaveCount(1);
  await expect(rulingOf(row, groupKey(CONTROL, CONTROL_RULING))).toHaveCount(1);
}

/** The accepted words drawn as tags in the row's IS display, each followed by its GG tag. */
async function expectTags(row, words) {
  await expect(isDisplay(row).locator('.sugg-accepted')).toHaveText(words);
  await expect(isDisplay(row).locator('.sugg-accepted + .sugg-tag')).toHaveText(
    words.map(() => UI.suggestions.tag)
  );
}

test.describe('G1.23 suggestion view on efnafraedi-2e ch02 (spec §9.4–9.6)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(recordSuggestionClicks);
  });

  test('(1) the dedicated editor opens m68684 while the view is still off', async ({
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
    // The serve opened the module (so its later "nothing shown" is the opening's time, not a missing opening).
    expect(openingRows(M84)).toHaveLength(1);
    expect(openingRows(M93)).toHaveLength(0);
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

  test('(3) the dedicated editor opens m68693 after the switch-on, and its groups show', async ({
    page,
  }) => {
    expect(openingRows(M93)).toHaveLength(0);
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    // The first serve to this user, so it opens the module; the switch-on's response came back before this
    // request was sent, so the opening is later (strictly: eligibility below would fail otherwise).
    await openModule(page, M93);
    expect(openingRows(M93)).toHaveLength(1);
    const row = rowOf(page, S.one);
    const swap = swapsOf(row, groupKey(S.one, 'molecular-structure'));
    await expect(swap).toHaveCount(1);
    await expect(swap.locator('.sugg-old')).toHaveText('sameindaformgerðir');
    await expect(swap.locator('.sugg-new')).toHaveText('sameindabyggingar');
    await expect(rulingOf(row, groupKey(S.one, 'molecular-structure'))).toHaveCount(1);
    await expectControlShown(page);
  });

  test('eligibility: m68684, opened before the switch-on, shows nothing while m68693 does (spec §9.5)', async ({
    page,
  }) => {
    // Pinned first: m68684's eip-557 HAS a kept group whose integrity check would pass, so the only thing
    // that can withhold it is the module's opening time.
    const log = suggestionLogs.readModuleLog({ book: BOOK, chapter: CHAPTER, moduleId: M84 });
    expect(log.ok).toBe(true);
    const kept = suggestionLogs.keptGroups(log).get(`${S.beforeSwitchOn}#0`) || [];
    expect(kept.map((g) => [g.rulingId, g.changes.length])).toEqual([['product', 1]]);

    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const m84 = await moduleJson(page, M84); // already opened in (1): this serve opens nothing
    const served = m84.segments.find((s) => s.segmentId === S.beforeSwitchOn);
    expect(served.baseSha256).toBe(
      suggestionLogs.firstBeforeSha256(log, S.beforeSwitchOn, served.occurrence)
    );
    expect(m84.segments.filter((s) => s.suggestions).map((s) => s.segmentId)).toEqual([]);

    await openModule(page, M84);
    const row = rowOf(page, S.beforeSwitchOn);
    await expect(row).toHaveCount(1);
    await expect(isDisplay(row).locator('.sugg-swap')).toHaveCount(0);
    await expect(rulings(row)).toHaveCount(0);
    await expect(page.locator('#segments-body .sugg-swap')).toHaveCount(0);

    // The shown half: the module opened after the switch-on.
    await openModule(page, M93);
    await expect(swapsOf(rowOf(page, S.one), groupKey(S.one, 'molecular-structure'))).toHaveCount(
      1
    );
    await expectControlShown(page);
  });

  test('one-change group: Nota fetches nothing, a reload before Vista restores the draft, Vista saves the accepted list, and the GG tag shows after a reload', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const seg = (await moduleJson(page, M93)).segments.find((s) => s.segmentId === S.one);
    const key = groupKey(S.one, 'molecular-structure');
    const op = seg.suggestions.groups.find((g) => g.key === key).changes[0].opId;
    expect(op).toBe('ch02/m68693/002.op6');
    const taken = replacedOnce(seg.is, 'sameindaformgerðir', 'sameindabyggingar');
    expectSavable(seg, taken);

    const counter = await countModuleGets(page, M93);
    await openModule(page, M93);
    const gets = counter.gets;
    expect(gets).toBeGreaterThanOrEqual(1); // control: the counter sees the open's GET
    const row = rowOf(page, S.one);
    await clickSuggestion(page, notaOn(swapsOf(row, key)));

    const ta = row.locator('textarea');
    await expect(ta).toHaveValue(taken);
    await expect(row.locator('.edit-panel')).toHaveClass(/\bactive\b/);
    await expectTags(row, ['sameindabyggingar']);
    await expect(swapsOf(row, key)).toHaveCount(0);
    await expect(rulingOf(row, key)).toHaveCount(0);
    await expect(row.getByRole('button', { name: UI.suggestions.notaTitle })).toHaveCount(0);
    expect(counter.gets).toBe(gets); // Nota sends nothing and reloads nothing

    // The draft timer writes the pane, the accepted item included.
    await expect
      .poll(() => storedDraft(page, S.one), { timeout: 15000 })
      .toEqual({ text: taken, refused: null, ops: [op] });

    // F5: accept the leave prompt and the recovery offer, decline the re-renders' closePanels
    // (accepting one would discard the restored pane; opening-unrecorded.spec.js's handler).
    const asked = [];
    const answer = (d) => {
      asked.push(d.type() === 'beforeunload' ? 'beforeunload' : d.message());
      const take = d.type() === 'beforeunload' || d.message() === UI.confirm.draftRecovery(1);
      (take ? d.accept() : d.dismiss()).catch(() => {});
    };
    page.on('dialog', answer);
    const background = backgroundLoads(page, M93);
    await page.reload();
    await background;
    page.off('dialog', answer);
    expect(asked).toContain(UI.confirm.draftRecovery(1));
    expect(counter.gets).toBe(gets + 1); // control: the counter sees a reload's GET
    await expect(ta).toHaveValue(taken);
    await expect(row.locator('.edit-panel')).toHaveClass(/\bactive\b/);
    await expectTags(row, ['sameindabyggingar']); // the restored pane still holds the accept
    await expect(swapsOf(row, key)).toHaveCount(0);

    const body = await vista(page, row, M93);
    expect(body.editedContent).toBe(taken);
    expect(body.acceptedSuggestions).toEqual([{ opId: op, occurrence: 0 }]);

    const after = await moduleJson(page, M93);
    const edit = after.edits[S.one][0];
    expect([edit.status, edit.edited_content, edit.accepted_suggestions]).toEqual([
      'pending',
      taken,
      JSON.stringify([{ opId: op, occurrence: 0 }]),
    ]);
    const served = after.segments.find((s) => s.segmentId === S.one).suggestions;
    expect(served.groups).toEqual([]);
    expect(served.tagged.map((c) => [c.opId, c.replace])).toEqual([[op, 'sameindabyggingar']]);

    await page.reload();
    await expect(row.locator('.edit-panel')).not.toHaveClass(/\bactive\b/);
    await expectTags(row, ['sameindabyggingar']);
    await expect(swapsOf(row, key)).toHaveCount(0);
    await expect(row.locator('.sugg-btn')).toHaveCount(0);
    await expectControlShown(page);
  });

  test("a head editor's approval of the para-00002 edit removes its GG tag after a reload (spec §9.4)", async ({
    page,
    browser,
  }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    await openModule(page, M93);
    const row = rowOf(page, S.one);
    await expectTags(row, ['sameindabyggingar']); // control: the tag is there before the approval

    const edit = (await moduleJson(page, M93)).edits[S.one][0];
    expect(edit.status).toBe('pending');
    const approved = await approveAsAdmin(browser, edit.id);
    expect([approved.status, approved.body.edit.status]).toEqual([200, 'approved']);

    await page.reload();
    await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 10000 });
    await expect(isDisplay(row).locator('.sugg-accepted')).toHaveCount(0);
    await expect(isDisplay(row).locator('.sugg-tag')).toHaveCount(0);
    await expect(isDisplay(row).locator('.sugg-swap')).toHaveCount(0);
    // The row shows the approved text, drawn plain.
    const plain = await page.evaluate((t) => window.renderMarkdownPreview(t), edit.edited_content);
    expect(await isDisplay(row).innerHTML()).toBe(plain);
    await expectControlShown(page);
    // The approved edit took the row's only group, so nothing was left open.
    expect(closedOps('suggestion_left_open', S.one)).toEqual([]);
    const served = (await moduleJson(page, M93)).segments.find((s) => s.segmentId === S.one);
    expect(served.suggestions).toBeUndefined();
  });

  test('two-change group: Nota báðar takes both words, and each carries its GG tag', async ({
    page,
  }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const seg = (await moduleJson(page, M93)).segments.find((s) => s.segmentId === S.two);
    const key = groupKey(S.two, 'atom');
    const taken = replacedOnce(replacedOnce(seg.is, 'frumeindir', 'atóm'), 'frumeindum', 'atómum');

    const counter = await countModuleGets(page, M93);
    await openModule(page, M93);
    const gets = counter.gets;
    const row = rowOf(page, S.two);
    await expect(swapsOf(row, key)).toHaveCount(2);
    await expect(swapsOf(row, key).locator('.sugg-num')).toHaveText(['1', '1']);
    await clickSuggestion(
      page,
      rulingOf(row, key).getByRole('button', { name: UI.suggestions.notaBadar, exact: true })
    );

    await expect(row.locator('textarea')).toHaveValue(taken);
    // Longest replace first (R22): atóm also occurs inside atómum, and both are tagged.
    await expectTags(row, ['atóm', 'atómum']);
    await expect(swapsOf(row, key)).toHaveCount(0);
    await expect(rulingOf(row, key)).toHaveCount(0);
    expect(counter.gets).toBe(gets);
    await expectControlShown(page);
  });

  test('left open on approval: take isomers, leave molecular-structure; the approval closes the one left', async ({
    page,
    browser,
  }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const seg = (await moduleJson(page, M93)).segments.find(
      (s) => s.segmentId === S.takeOneLeaveOne
    );
    const iso = groupKey(S.takeOneLeaveOne, 'isomers');
    const mol = groupKey(S.takeOneLeaveOne, 'molecular-structure');
    const taken = replacedOnce(seg.is, 'ísómerur', 'hverfur');
    expectSavable(seg, taken);

    await openModule(page, M93);
    const row = rowOf(page, S.takeOneLeaveOne);
    // Two one-change groups on one row: two buttons share the name, so each is scoped by its key (R26).
    await expect(swapsOf(row, iso)).toHaveCount(1);
    await expect(swapsOf(row, mol)).toHaveCount(1);
    await clickSuggestion(page, notaOn(swapsOf(row, iso)));
    await expect(row.locator('textarea')).toHaveValue(taken);
    await expectTags(row, ['hverfur']);
    await expect(swapsOf(row, iso)).toHaveCount(0);
    await expect(swapsOf(row, mol)).toHaveCount(1); // the one left, still offered

    const body = await vista(page, row, M93);
    expect(body.acceptedSuggestions).toEqual([{ opId: 'ch02/m68693/002.op7', occurrence: 0 }]);
    const edit = (await moduleJson(page, M93)).edits[S.takeOneLeaveOne][0];
    expect([edit.status, edit.accepted_suggestions]).toEqual([
      'pending',
      JSON.stringify([{ opId: 'ch02/m68693/002.op7', occurrence: 0 }]),
    ]);
    expect(closedOps('suggestion_left_open', S.takeOneLeaveOne)).toEqual([]);

    const approved = await approveAsAdmin(browser, edit.id);
    expect(approved.status).toBe(200);
    // Exactly the group the edit did not take, by op id.
    expect(closedOps('suggestion_left_open', S.takeOneLeaveOne)).toEqual([
      { op_id: 'ch02/m68693/002.op8', occurrence: 0, finishing_act: 'approval' },
    ]);

    await page.reload();
    await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 10000 });
    await expect(swapsOf(row, mol)).toHaveCount(0);
    await expect(isDisplay(row).locator('.sugg-swap')).toHaveCount(0);
    await expect(isDisplay(row).locator('.sugg-tag')).toHaveCount(0); // approved: no tags either
    await expectControlShown(page);
  });

  test('dependent group: isomers is offered only once spatial-isomers is taken', async ({
    page,
  }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const seg = (await moduleJson(page, M93)).segments.find((s) => s.segmentId === S.dependent);
    const spatial = groupKey(S.dependent, 'spatial-isomers');
    const iso = groupKey(S.dependent, 'isomers');
    // ísómerum also occurs inside rúmísómerum, so isomers places only after spatial-isomers.
    expect(seg.is.split('ísómerum').length - 1).toBe(2);
    const step1 = replacedOnce(seg.is, 'rúmísómerum', 'rúmhverfum');
    const step2 = replacedOnce(step1, 'ísómerum', 'hverfum');
    expectSavable(seg, step2);

    await openModule(page, M93);
    const row = rowOf(page, S.dependent);
    await expect(swapsOf(row, spatial)).toHaveCount(1); // the shown half, on the same row
    await expect(swapsOf(row, iso)).toHaveCount(0);
    await expect(rulingOf(row, iso)).toHaveCount(0);

    await clickSuggestion(page, notaOn(swapsOf(row, spatial)));
    await expect(row.locator('textarea')).toHaveValue(step1);
    await expect(swapsOf(row, iso)).toHaveCount(1);
    await expect(swapsOf(row, iso).locator('.sugg-old')).toHaveText('ísómerum');
    await expect(rulingOf(row, iso)).toHaveCount(1);

    await clickSuggestion(page, notaOn(swapsOf(row, iso)));
    await expect(row.locator('textarea')).toHaveValue(step2);
    await expectTags(row, ['hverfum', 'rúmhverfum']);
    await expect(isDisplay(row).locator('.sugg-swap')).toHaveCount(0);

    const body = await vista(page, row, M93);
    expect(body.acceptedSuggestions).toEqual([
      { opId: 'ch02/m68693/003.op3', occurrence: 0 },
      { opId: 'ch02/m68693/003.op4', occurrence: 0 },
    ]);
    const edit = (await moduleJson(page, M93)).edits[S.dependent][0];
    expect(edit.accepted_suggestions).toBe(
      JSON.stringify([
        { opId: 'ch02/m68693/003.op3', occurrence: 0 },
        { opId: 'ch02/m68693/003.op4', occurrence: 0 },
      ])
    );
    await expectTags(row, ['hverfum', 'rúmhverfum']); // after the save's reload, from the saved list
    await expect(isDisplay(row).locator('.sugg-swap')).toHaveCount(0);
    await expectControlShown(page);
  });

  test('left open on Staðfesta MT: the acceptance closes the group, which stays hidden', async ({
    page,
  }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const key = groupKey(S.stadfesta, 'isomers');
    await openModule(page, M93);
    const row = rowOf(page, S.stadfesta);
    await expect(swapsOf(row, key)).toHaveCount(1);

    const accepted = page.waitForResponse((r) => r.url().endsWith(`${moduleUrl(M93)}/accept`));
    const reloaded = page.waitForResponse(
      (r) => r.url().endsWith(moduleUrl(M93)) && r.request().method() === 'GET'
    );
    const background = backgroundLoads(page, M93);
    await row.locator('button.btn-accept').click();
    expect((await accepted).status()).toBe(200);
    await reloaded;
    await background;

    await expect(row.locator('.edit-status.accepted')).toHaveCount(1);
    await expect(swapsOf(row, key)).toHaveCount(0);
    await expect(isDisplay(row).locator('.sugg-swap')).toHaveCount(0);
    await expectControlShown(page);
    expect(closedOps('suggestion_left_open', S.stadfesta)).toEqual([
      { op_id: 'ch02/m68693/003.op5', occurrence: 0, finishing_act: 'stadfesta-mt' },
    ]);

    await page.reload();
    await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 10000 });
    await expect(isDisplay(row).locator('.sugg-swap')).toHaveCount(0);
    await expectControlShown(page);
  });

  test('typing over a word hides its group, the sibling group stays, and nothing is closed', async ({
    page,
  }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const seg = (await moduleJson(page, M93)).segments.find((s) => s.segmentId === S.typingOver);
    const structural = groupKey(S.typingOver, 'structural-isomer');
    const spatial = groupKey(S.typingOver, 'spatial-isomers');
    const typedOver = replacedOnce(seg.is, 'formgerðarísómerur', 'formgerðarhverfur');

    await openModule(page, M93);
    const row = rowOf(page, S.typingOver);
    await expect(swapsOf(row, structural)).toHaveCount(1);
    await expect(swapsOf(row, spatial)).toHaveCount(1);
    await expect(rulingOf(row, spatial).locator('.sugg-num')).toHaveText('2');

    await row.locator('.btn-edit').click();
    const ta = row.locator('textarea');
    await expect(ta).toHaveValue(seg.is);
    await ta.fill(typedOver);
    await expect(swapsOf(row, structural)).toHaveCount(0);
    await expect(rulingOf(row, structural)).toHaveCount(0);
    await expect(swapsOf(row, spatial)).toHaveCount(1); // the sibling, renumbered
    await expect(rulingOf(row, spatial).locator('.sugg-num')).toHaveText('1');
    await expect(ta).toHaveValue(typedOver);

    // Control: the word typed back brings the group back. Typing over hid it; it closed nothing.
    await ta.fill(seg.is);
    await expect(swapsOf(row, structural)).toHaveCount(1);
    expect(closedOps('suggestion_rejections', S.typingOver)).toEqual([]);
    expect(closedOps('suggestion_left_open', S.typingOver)).toEqual([]);
  });

  test('Review Focus 1: Hafna on a dirty pane keeps the typed text and the open pane', async ({
    page,
  }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const seg = (await moduleJson(page, M93)).segments.find((s) => s.segmentId === S.dirtyHafna);
    const key = groupKey(S.dirtyHafna, 'lewis-structure');
    const counter = await countModuleGets(page, M93);
    await openModule(page, M93);
    const row = rowOf(page, S.dirtyHafna);

    await row.locator('.btn-edit').click();
    const ta = row.locator('textarea');
    await expect(ta).toHaveValue(seg.is);
    // A typed text that leaves the group's word intact, so the group is still offered. (Not End + type:
    // in a wrapped textarea End is the end of the visual line, measured.)
    const typed = `${seg.is} rf1`;
    await ta.fill(typed);
    await expect(ta).toHaveValue(typed);
    await expect(swapsOf(row, key)).toHaveCount(1);

    const gets = counter.gets;
    const rejected = page.waitForResponse((r) =>
      r.url().endsWith(`${moduleUrl(M93)}/suggestions/reject`)
    );
    await clickSuggestion(page, hafnaOn(swapsOf(row, key)));
    expect((await rejected).status()).toBe(200);
    await expect(swapsOf(row, key)).toHaveCount(0);
    await expect(rulingOf(row, key)).toHaveCount(0);
    await expect(ta).toHaveValue(typed);
    await expect(row.locator('.edit-panel')).toHaveClass(/\bactive\b/);
    expect(counter.gets).toBe(gets);
    expect(closedOps('suggestion_rejections', S.dirtyHafna).map((r) => r.op_id)).toEqual([
      'ch02/m68693/003.op6',
    ]);
    await expectControlShown(page);
  });

  test('Review Focus 3: a refused save after Nota allar keeps the text and its accepted items, and a real Vista then saves them', async ({
    page,
  }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const seg = (await moduleJson(page, M93)).segments.find((s) => s.segmentId === S.refusedSave);
    const key = groupKey(S.refusedSave, 'atom');
    const ops = ['ch02/m68693/001.op12', 'ch02/m68693/001.op13', 'ch02/m68693/001.op14'];
    const words = ['kolefnisatóm', 'vetnisatóm', 'súrefnisatóm'];
    const taken = replacedOnce(
      replacedOnce(
        replacedOnce(seg.is, 'kolefnisfrumeindir', 'kolefnisatóm'),
        'vetnisfrumeindir',
        'vetnisatóm'
      ),
      'súrefnisfrumeindir',
      'súrefnisatóm'
    );
    expectSavable(seg, taken);

    await openModule(page, M93);
    const row = rowOf(page, S.refusedSave);
    await clickSuggestion(
      page,
      rulingOf(row, key).getByRole('button', { name: UI.suggestions.notaAllar(3), exact: true })
    );
    const ta = row.locator('textarea');
    await expect(ta).toHaveValue(taken);
    await expectTags(row, words);

    // The save is refused STALE_BASE (stubbed once): keepText holds the pane and reloads the module.
    const sent = [];
    await page.route(
      `**${moduleUrl(M93)}/edit`,
      (route) => {
        sent.push(route.request().postDataJSON());
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'STALE_BASE', message: 'stub' }),
        });
      },
      { times: 1 }
    );
    const alerts = [];
    const acceptAll = (d) => {
      alerts.push(d.type());
      d.accept().catch(() => {});
    };
    page.on('dialog', acceptAll);
    const reloaded = page.waitForResponse(
      (r) => r.url().endsWith(moduleUrl(M93)) && r.request().method() === 'GET'
    );
    const background = backgroundLoads(page, M93);
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    await reloaded;
    await background;
    expect(sent).toHaveLength(1);
    expect(sent[0].acceptedSuggestions.map((e) => e.opId).sort()).toEqual(ops);
    await expect(row.locator('.draft-notice[data-notice="STALE_BASE"]')).toBeVisible();
    await expect(ta).toHaveValue(taken);
    await expectTags(row, words);
    expect(await storedDraft(page, S.refusedSave)).toEqual({
      text: taken,
      refused: 'STALE_BASE',
      ops,
    });
    expect((await moduleJson(page, M93)).edits[S.refusedSave]).toBeUndefined(); // nothing written

    // F5: the kept text comes back unasked, its tags drawn.
    const background2 = backgroundLoads(page, M93);
    await page.reload();
    await background2;
    await expect(row.locator('.draft-notice[data-notice="STALE_BASE"]')).toBeVisible();
    await expect(ta).toHaveValue(taken);
    await expectTags(row, words);
    page.off('dialog', acceptAll);
    expect(alerts.length).toBeGreaterThanOrEqual(1); // the refusal's alert

    // A real Vista (the stub was used up) saves the accepted list.
    const body = await vista(page, row, M93);
    expect(body.acceptedSuggestions.map((e) => e.opId).sort()).toEqual(ops);
    const edit = (await moduleJson(page, M93)).edits[S.refusedSave][0];
    expect([edit.status, edit.edited_content, edit.accepted_suggestions]).toEqual([
      'pending',
      taken,
      JSON.stringify(ops.map((opId) => ({ opId, occurrence: 0 }))),
    ]);
    await expectTags(row, words);
  });

  test('a failed reject alerts and leaves the group offered', async ({ page }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const key = groupKey(S.hafna, 'lewis-structure');
    await openModule(page, M93);
    const row = rowOf(page, S.hafna);
    await expect(swapsOf(row, key)).toHaveCount(1);

    const rejectUrl = `**${moduleUrl(M93)}/suggestions/reject`;
    await page.route(
      rejectUrl,
      (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'stub' }),
        }),
      { times: 1 }
    );
    // opening-unrecorded.spec.js's openWithStub: start the click, answer the alert, then await the click.
    const dialog = page.waitForEvent('dialog');
    const click = clickSuggestion(page, hafnaOn(swapsOf(row, key)));
    const d = await dialog;
    const message = d.message();
    await d.accept();
    await click;
    await page.unroute(rejectUrl);

    expect(message).toBe(UI.suggestions.rejectFailed);
    await expect(swapsOf(row, key)).toHaveCount(1);
    await expect(notaOn(swapsOf(row, key))).toHaveCount(1);
    await expect(hafnaOn(swapsOf(row, key))).toHaveCount(1);
    await expect(rulingOf(row, key)).toHaveCount(1);
    expect(closedOps('suggestion_rejections', S.hafna)).toEqual([]);
  });

  test('Hafna on the last group redraws the row plain with no module GET; it stays gone after a reload and for a second editor', async ({
    page,
    browser,
  }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const seg = (await moduleJson(page, M93)).segments.find((s) => s.segmentId === S.hafna);
    const key = groupKey(S.hafna, 'lewis-structure');
    const counter = await countModuleGets(page, M93);
    await openModule(page, M93);
    const gets = counter.gets;
    expect(gets).toBeGreaterThanOrEqual(1); // control: the counter sees the open's GET
    const row = rowOf(page, S.hafna);
    await expect(swapsOf(row, key)).toHaveCount(1);

    const rejected = page.waitForResponse((r) =>
      r.url().endsWith(`${moduleUrl(M93)}/suggestions/reject`)
    );
    await clickSuggestion(page, hafnaOn(swapsOf(row, key)));
    const res = await rejected;
    expect([res.status(), await res.json()]).toEqual([200, { inserted: 1, alreadyClosed: 0 }]);

    // Its only group gone: no swap, no tag, no button, no ruling line; the text drawn plain.
    await expect(isDisplay(row).locator('.sugg-swap')).toHaveCount(0);
    await expect(isDisplay(row).locator('.sugg-tag')).toHaveCount(0);
    await expect(row.locator('.sugg-btn')).toHaveCount(0);
    await expect(rulings(row).locator('.sugg-ruling')).toHaveCount(0);
    const plain = await page.evaluate((t) => window.renderMarkdownPreview(t), seg.is);
    expect(await isDisplay(row).innerHTML()).toBe(plain);
    expect(counter.gets).toBe(gets);
    await expectControlShown(page);
    expect(closedOps('suggestion_rejections', S.hafna)).toEqual([
      { op_id: 'ch02/m68693/003.op2', occurrence: 0 },
    ]);

    // The IN-PAGE half of Review Focus 4: a wholesale renderSegments() (what loadTermData and
    // loadRepetitions call) redraws from the mutated moduleData and must not bring the group back. The
    // #filter-type select's change handler IS renderSegments (segment-editor.js: addEventListener('change',
    // renderSegments)) and fetches nothing. 'title' drops this alt row (so the redraw demonstrably ran),
    // 'all' redraws it from moduleData.
    const filter = page.locator('#filter-type');
    await filter.selectOption('title');
    await expect(row).toHaveCount(0); // control: the table really was rebuilt
    await filter.selectOption('all');
    await expect(row).toHaveCount(1); // the row itself exists again, redrawn
    await expect(isDisplay(row).locator('.sugg-swap')).toHaveCount(0);
    await expect(isDisplay(row).locator('.sugg-tag')).toHaveCount(0);
    await expect(row.locator('.sugg-btn')).toHaveCount(0);
    await expect(rulings(row).locator('.sugg-ruling')).toHaveCount(0);
    expect(await isDisplay(row).innerHTML()).toBe(plain);
    await expectControlShown(page); // a sibling row still shows its swap after the same redraw
    expect(counter.gets).toBe(gets); // the redraw was in-page: no module GET

    await page.reload();
    await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 10000 });
    expect(counter.gets).toBe(gets + 1); // control: the counter sees a reload's GET
    await expect(isDisplay(row).locator('.sugg-swap')).toHaveCount(0);
    await expectControlShown(page);
    const served = (await moduleJson(page, M93)).segments;
    expect(served.find((s) => s.segmentId === S.hafna).suggestions).toBeUndefined();
    expect(served.find((s) => s.segmentId === CONTROL).suggestions.groups).toHaveLength(1);

    // A second editor (the default editor login: no users row, so its serve opens nothing).
    const other = await browser.newContext();
    try {
      const page2 = await other.newPage();
      await loginAs(page2, 'editor');
      await openModule(page2, M93);
      await expect(isDisplay(rowOf(page2, S.hafna)).locator('.sugg-swap')).toHaveCount(0);
      await expect(rulings(rowOf(page2, S.hafna)).locator('.sugg-ruling')).toHaveCount(0);
      await expectControlShown(page2);
    } finally {
      await other.close();
    }
  });

  // ── The double-click guard (spec ✏️ AMENDED 2026-11-11): one test per event that starts the pause. ──

  test('double-click guard: Hafna clicked at once after a Nota is ignored, and the same Hafna after the pause acts', async ({
    page,
  }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const segA = await servedSegment(page, G.caption1);
    const sent = await stubReject(page);
    await openModule(page, M93);
    const rowA = rowOf(page, G.caption1);
    const rowB = rowOf(page, G.caption2);
    const keyA = groupKey(G.caption1, 'structural-isomer');
    const keyB = groupKey(G.caption2, 'spatial-isomers');
    await expect(swapsOf(rowB, keyB)).toHaveCount(1);

    // The misclick a double click makes: a Nota, then at once a Hafna that the redraw brought near the pointer.
    await expect(paused(page)).toHaveCount(0);
    await expect(hafnaOn(swapsOf(rowB, keyB))).toHaveCSS('opacity', '1'); // control for the dim below
    const afterNota = await clickSuggestion(page, notaOn(swapsOf(rowA, keyA)));
    const second = await rawSuggestionClick(page, hafnaOn(swapsOf(rowB, keyB)), afterNota);
    expectWithinPause(second.at - second.seen[second.seen.length - 2], 'the Hafna click');
    expect(second.delivered, 'the Hafna reached no handler').toBe(false);
    expect(second.pausedAt, 'the pause was on when it was clicked').toBe(true);
    // [USER]'s choice: the paused buttons are dimmed (the swallowed click restarted the pause, so it still runs).
    await expect(hafnaOn(swapsOf(rowB, keyB))).toHaveCSS('opacity', '0.45');
    await expect(rowA.locator('textarea')).toHaveValue(
      replacedOnce(segA.is, 'formgerðarísómerur', 'byggingarhverfur')
    ); // control: the Nota itself acted
    await expect(swapsOf(rowB, keyB)).toHaveCount(1);

    // Control: the same Hafna, after the pause, sends one request and the group leaves the row.
    await clickSuggestion(page, hafnaOn(swapsOf(rowB, keyB)));
    await expect(swapsOf(rowB, keyB)).toHaveCount(0);
    expect(sent.map((b) => [b.segmentId, b.groupKey])).toEqual([[G.caption2, keyB]]);
  });

  test("double-click guard: Hafna's late answer pauses the buttons, so a click just after its redraw is ignored", async ({
    page,
  }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const segD = await servedSegment(page, G.glossSpatial);
    let release;
    const sent = await stubReject(
      page,
      new Promise((resolve) => {
        release = resolve;
      })
    );
    await openModule(page, M93);
    const rowC = rowOf(page, G.alt);
    const rowD = rowOf(page, G.glossSpatial);
    const keyC = groupKey(G.alt, 'lewis-structure');
    const keyD = groupKey(G.glossSpatial, 'spatial-isomers');
    await expect(swapsOf(rowD, keyD)).toHaveCount(1);

    await clickSuggestion(page, hafnaOn(swapsOf(rowC, keyC)));
    await expect.poll(() => sent.length).toBe(1); // the answer is held
    // The click's own pause runs out while the answer is held, so only the answer can start it again.
    await expect(paused(page)).toHaveCount(0);
    await expect(swapsOf(rowC, keyC)).toHaveCount(1); // control: not redrawn yet
    const before = await suggClicks(page);
    release();
    await page
      .waitForFunction(() => document.documentElement.hasAttribute('data-sugg-paused'), null, {
        polling: 'raf',
        timeout: 3000,
      })
      .catch(() => {
        throw new Error("Hafna's answer did not start the pause");
      });
    const click = await rawSuggestionClick(page, notaOn(swapsOf(rowD, keyD)), before);
    expect(
      click.pausedAt,
      'the Nota click landed inside the pause: this runner is too slow if not'
    ).toBe(true);
    expect(click.delivered, 'the Nota reached no handler').toBe(false);
    await expect(swapsOf(rowC, keyC)).toHaveCount(0); // the answer redrew row C
    await expect(rowD.locator('.edit-panel')).not.toHaveClass(/\bactive\b/);
    await expect(swapsOf(rowD, keyD)).toHaveCount(1);

    // Control: the same Nota, after the pause, acts.
    await clickSuggestion(page, notaOn(swapsOf(rowD, keyD)));
    await expect(rowD.locator('textarea')).toHaveValue(
      replacedOnce(segD.is, 'rúmísómerur', 'rúmhverfur')
    );
    expect(sent).toHaveLength(1);
  });

  test('double-click guard: a full table redraw pauses the buttons, though nothing was clicked', async ({
    page,
  }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const seg = await servedSegment(page, G.atom3);
    const taken = replacedOnce(
      replacedOnce(
        replacedOnce(seg.is, 'kolefnisfrumeindir', 'kolefnisatóm'),
        'vetnisfrumeindir',
        'vetnisatóm'
      ),
      'súrefnisfrumeindir',
      'súrefnisatóm'
    );
    await openModule(page, M93);
    const row = rowOf(page, G.atom3);
    const key = groupKey(G.atom3, 'atom');
    const notaAllar = rulingOf(row, key).getByRole('button', {
      name: UI.suggestions.notaAllar(3),
      exact: true,
    });
    await expect(notaAllar).toHaveCount(1);
    await expect(paused(page)).toHaveCount(0);

    // #filter-type's change handler is renderSegments, and selectOption fires change, never click.
    const filter = page.locator('#filter-type');
    await filter.selectOption('title');
    await expect(row).toHaveCount(0); // control: the table really was rebuilt
    const before = await suggClicks(page);
    const redrawFrom = await pageNow(page);
    await filter.selectOption('all');
    const click = await rawSuggestionClick(page, notaAllar, before);
    expectWithinPause(click.at - redrawFrom, 'the Nota allar click');
    expect(click.delivered, 'Nota allar reached no handler').toBe(false);
    await expect(row.locator('.edit-panel')).not.toHaveClass(/\bactive\b/);
    await expect(rulingOf(row, key)).toHaveCount(1);

    // Control: after the pause, the same button acts.
    await clickSuggestion(page, notaAllar);
    await expect(row.locator('textarea')).toHaveValue(taken);
  });

  test('double-click guard: Escape closing a pane pauses the buttons', async ({ page }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const seg = await servedSegment(page, G.glossStructural);
    await openModule(page, M93);
    const paneRow = rowOf(page, G.solution);
    const row = rowOf(page, G.glossStructural);
    const key = groupKey(G.glossStructural, 'structural-isomer');
    await expect(swapsOf(row, key)).toHaveCount(1);

    await paneRow.locator('.btn-edit').click();
    await expect(paneRow.locator('.edit-panel')).toHaveClass(/\bactive\b/);
    await expect(paused(page)).toHaveCount(0); // the Edit click's own pause is over
    const before = await suggClicks(page);
    const closedFrom = await pageNow(page);
    await page.keyboard.press('Escape'); // a clean pane: it closes, asking nothing
    const click = await rawSuggestionClick(page, notaOn(swapsOf(row, key)), before);
    expectWithinPause(click.at - closedFrom, 'the Nota click');
    await expect(paneRow.locator('.edit-panel')).not.toHaveClass(/\bactive\b/); // control: Escape closed it
    expect(click.delivered, 'the Nota reached no handler').toBe(false);
    await expect(row.locator('.edit-panel')).not.toHaveClass(/\bactive\b/);

    // Control: after the pause, the same Nota acts.
    await clickSuggestion(page, notaOn(swapsOf(row, key)));
    await expect(row.locator('textarea')).toHaveValue(
      replacedOnce(seg.is, 'byggingarisómera', 'byggingarhverfa')
    );
  });

  test('double-click guard: Ctrl+S on a pane with nothing to save closes it and pauses the buttons', async ({
    page,
  }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const seg = await servedSegment(page, G.glossStructural);
    await openModule(page, M93);
    const paneRow = rowOf(page, G.solution);
    const row = rowOf(page, G.glossStructural);
    const key = groupKey(G.glossStructural, 'structural-isomer');
    await expect(swapsOf(row, key)).toHaveCount(1);
    const edits = [];
    page.on('request', (r) => {
      if (r.url().endsWith(`${moduleUrl(M93)}/edit`)) edits.push(r.method());
    });

    await paneRow.locator('.btn-edit').click();
    await expect(paneRow.locator('.edit-panel')).toHaveClass(/\bactive\b/);
    await expect(paused(page)).toHaveCount(0); // the Edit click's own pause is over
    const before = await suggClicks(page);
    const closedFrom = await pageNow(page);
    await page.keyboard.press('Control+s'); // nothing to save: saveEdit closes the pane and sends nothing
    const click = await rawSuggestionClick(page, notaOn(swapsOf(row, key)), before);
    expectWithinPause(click.at - closedFrom, 'the Nota click');
    await expect(paneRow.locator('.edit-panel')).not.toHaveClass(/\bactive\b/); // control: Ctrl+S closed it
    expect(click.delivered, 'the Nota reached no handler').toBe(false);
    await expect(row.locator('.edit-panel')).not.toHaveClass(/\bactive\b/);
    expect(edits).toEqual([]);

    // Control: after the pause, the same Nota acts.
    await clickSuggestion(page, notaOn(swapsOf(row, key)));
    await expect(row.locator('textarea')).toHaveValue(
      replacedOnce(seg.is, 'byggingarisómera', 'byggingarhverfa')
    );
  });

  test('Hætta við after Nota on a typed pane asks once, then brings back the text and the group, and keeps nothing (§C216)', async ({
    page,
  }) => {
    await loginAs(page, 'editor', SUGGESTION_EDITOR_ID);
    const seg = await servedSegment(page, G.solution);
    const key = groupKey(G.solution, 'structural-isomer');
    const op = seg.suggestions.groups.find((g) => g.key === key).changes[0].opId;
    await openModule(page, M93);
    const row = rowOf(page, G.solution);

    await row.locator('.btn-edit').click();
    const ta = row.locator('textarea');
    await expect(ta).toHaveValue(seg.is);
    const typed = `${seg.is} rf2`; // leaves the group's word intact, so the group is still offered
    await ta.fill(typed);
    await expect(swapsOf(row, key)).toHaveCount(1);
    await clickSuggestion(page, notaOn(swapsOf(row, key)));
    const taken = replacedOnce(typed, 'byggingarfásætur', 'byggingarhverfur');
    await expect(ta).toHaveValue(taken);
    await expectTags(row, ['byggingarhverfur']);
    await expect(swapsOf(row, key)).toHaveCount(0);
    // Control for the draft's absence below: the draft held the typed text and the accept.
    await expect
      .poll(() => storedDraft(page, G.solution), { timeout: 15000 })
      .toEqual({ text: taken, refused: null, ops: [op] });

    // Hætta við asks before it throws changed text away (unsaved-text.spec.js, ED-04). OK is the discard this test
    // is about: the accept goes with the typed text, like any unsaved change.
    const asked = [];
    page.on('dialog', (d) => {
      asked.push(d.message());
      d.accept().catch(() => {});
    });
    await row.getByRole('button', { name: 'Hætta við', exact: true }).click();
    await expect(row.locator('.edit-panel')).not.toHaveClass(/\bactive\b/);
    expect(asked).toEqual([UI.confirm.discardChanges]);
    await expect(ta).toHaveValue(seg.is);
    await expect(swapsOf(row, key)).toHaveCount(1);
    await expect(isDisplay(row).locator('.sugg-accepted')).toHaveCount(0);
    await expect.poll(() => storedDraft(page, G.solution)).toBeNull();
    expect(closedOps('suggestion_rejections', G.solution)).toEqual([]);
    expect(closedOps('suggestion_left_open', G.solution)).toEqual([]);
    expect((await moduleJson(page, M93)).edits[G.solution]).toBeUndefined();
    await expectControlShown(page);
  });
});
