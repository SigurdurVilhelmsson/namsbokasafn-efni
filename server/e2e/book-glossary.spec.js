// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * The head editor's book glossary page (design §5.3): the layer, one headword's history and one
 * change's worklist.
 *
 * The rendering tests stub the API answers with page.route, keyed on the request's pathname, so they
 * read neither the box's export status file nor the BÍN file (which exists on some boxes only). The
 * round trip runs against the real server and the real chemistry text, on the concept the E2E seed
 * adds for it (seed-fixture.js, plan ruling Q10). Every "hidden" or "absent" check first waits for a
 * positive, id-keyed signal that the page rendered that answer, since the elements start hidden and
 * a bare not-visible check would pass before the script ran.
 */

const BOOK = 'efnafraedi-2e';
const LAYER = `/api/book-glossary/${BOOK}`;
const PAGE = `/book-glossary?book=${BOOK}`;
const PAYLOAD = '<img src=x onerror="window.__bg=1">';
const PAYLOAD_AFTER = '<svg onload="window.__bg=2">';
const SEGMENT = 'm68822:para:fs-idm196674112';
// The seeded concept (seed-fixture.js, plan ruling Q10).
const SALT = 'salt bridge';
const SALT_IS = 'saltbrú';
const NEEDS_CONFIRM =
  'Þessi breyting víkur til hliðar ákvörðun um orðanotkun verksins. Staðfestu til að halda áfram.';
const PREFERENCE =
  'Bókin hefur valið þýðingu fyrir þetta orð. Síðan getur ekki breytt því vali; biddu forritara um að gera það.';

function layerAnswer(over) {
  return {
    book: BOOK,
    exclusions: [],
    entries: [],
    hold: { held: false, since: null, recordError: false },
    writable: true,
    ...over,
  };
}

function entry(over) {
  return {
    conceptId: 990001,
    english: ['salt bridge'],
    icelandic: 'saltbrú',
    reason: 'prófun',
    source: null,
    createdBy: 'Test Head-editor',
    createdAt: '2026-11-20T14:02:00Z',
    updatedBy: null,
    updatedAt: null,
    inflections: { state: 'forms', count: 2 },
    ...over,
  };
}

/** A worklist answer with no rows, for a stubbed change whose worklist the page opens. */
function emptyWorklist(/** @type {number} */ changeId) {
  return {
    changeId,
    action: 'entry-change',
    kind: 'change',
    reason: null,
    english: [SALT],
    old: [{ icelandic: SALT_IS, inflected: false }],
    newIcelandic: 'jónabrú-e2e',
    units: 1,
    unreadable: [],
    chapters: [],
    total: 0,
  };
}

/**
 * Fulfil GET requests whose pathname is a key of `answers` (a value, or a function returning one);
 * let every other request through to the server.
 */
async function stub(page, answers) {
  await page.route('**/api/book-glossary/**', (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() !== 'GET' || !(pathname in answers)) return route.continue();
    const answer = answers[pathname];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(typeof answer === 'function' ? answer() : answer),
    });
  });
}

/**
 * Re-runnable start, through the head editor's own cookie: remove a 'salt bridge' entry an earlier
 * run left behind, with the exclusions it claims, and undo a 'salt bridge' exclusion left on its
 * own. On a fresh E2E database there is nothing to remove.
 */
async function cleanSaltBridge(page) {
  const res = await page.request.get(LAYER);
  expect(res.status()).toBe(200);
  const { entries, exclusions } = await res.json();
  for (const e of entries.filter((x) => x.english.includes(SALT))) {
    const undoExclusions = exclusions.filter((x) => x.claimedBy === e.conceptId).map((x) => x.id);
    const removed = await page.request.post(`${LAYER}/entries/${e.conceptId}/remove`, {
      data: { reason: 'e2e pre-clean', undoExclusions },
    });
    expect(removed.status()).toBe(200);
  }
  for (const x of exclusions.filter((x) => x.english === SALT && x.claimedBy == null)) {
    const undone = await page.request.post(`${LAYER}/exclusions/${x.id}/undo`, {
      data: { reason: 'e2e pre-clean' },
    });
    expect(undone.status()).toBe(200);
  }
}

/** Look a headword up on the page. */
async function lookUp(page, english) {
  await page.locator('#bg-lookup-input').fill(english);
  await page.locator('#bg-lookup-button').click();
}

/** The look-up's winner slot: its Icelandic, compared whole. */
function winnerText(page) {
  return page.locator('#bg-lookup-result .bg-winner .bg-is');
}

/** The page has rendered the layer answer for BOOK. */
async function layerRendered(page) {
  await expect(page.locator('#bg-layer')).toHaveAttribute('data-loaded-book', BOOK);
}

test.describe('the book glossary page', () => {
  test('markup in the layer, the history and the worklist renders as text', async ({ page }) => {
    await loginAs(page, 'head-editor');
    const excerptText = `Í ${PAYLOAD} er saltbrú á milli`;
    const start = excerptText.indexOf('saltbrú');
    await stub(page, {
      [LAYER]: layerAnswer({ entries: [entry({ icelandic: PAYLOAD, reason: PAYLOAD })] }),
      [`${LAYER}/history`]: {
        history: [
          {
            id: 8,
            at: '2026-11-20T15:00:00Z',
            by: 'Test Head-editor',
            action: 'entry-change',
            english: 'salt bridge',
            before: { english: ['salt bridge'], icelandic: PAYLOAD, inflections: [] },
            after: { english: ['salt bridge'], icelandic: PAYLOAD_AFTER },
            reason: 'prófun',
            source: null,
            worklist: false,
          },
          {
            id: 7,
            at: '2026-11-20T14:02:00Z',
            by: 'Test Head-editor',
            action: 'entry-add',
            english: 'salt bridge',
            before: null,
            after: { english: ['salt bridge'], icelandic: PAYLOAD, replaces: [1] },
            reason: PAYLOAD,
            source: null,
            worklist: true,
          },
        ],
      },
      [`${LAYER}/worklist`]: {
        changeId: 7,
        action: 'entry-add',
        kind: 'replacement',
        reason: null,
        english: ['salt bridge'],
        old: [{ icelandic: 'saltbrú', inflected: false }],
        newIcelandic: 'jónabrú',
        units: 1,
        unreadable: [],
        chapters: [
          {
            chapter: 17,
            items: [
              {
                moduleId: 'm68822',
                segmentId: SEGMENT,
                english: 'salt bridge',
                excerpt: {
                  text: excerptText,
                  start,
                  length: 'saltbrú'.length,
                  cutBefore: false,
                  cutAfter: false,
                },
                link: `/editor?book=${BOOK}&chapter=17&module=m68822&segment=${encodeURIComponent(SEGMENT)}`,
              },
            ],
          },
        ],
        total: 1,
      },
    });

    await page.goto(PAGE);
    const row = page.locator('#bg-layer [data-concept-id="990001"]');
    await expect(row).toContainText(PAYLOAD);

    // Saga → Verkefnalisti: the only way to an old change's worklist.
    await row.locator('[data-action="history"]').click();
    await expect(page.locator('#bg-history')).toContainText(PAYLOAD);
    // What each row changed, whole, at the row's own detail line: the Icelandic the row holds.
    await expect(page.locator('#bg-history [data-change-id="8"] .bg-detail')).toHaveText(
      `Þýðing: ${PAYLOAD} → ${PAYLOAD_AFTER}`
    );
    await expect(page.locator('#bg-history [data-change-id="7"] .bg-detail')).toHaveText(
      `Þýðing: ${PAYLOAD}`
    );
    await page.locator('#bg-history [data-change-id="7"] [data-action="worklist"]').click();
    const item = page.locator(`#bg-worklist [data-segment-id="${SEGMENT}"]`);
    await expect(item).toContainText(PAYLOAD);
    await expect(item.locator('mark')).toHaveText('saltbrú');
    await expect(item.locator('a.bg-open')).toHaveAttribute('href', /^\/editor\?book=/);

    await expect(
      page.locator('#bg-layer img, #bg-history img, #bg-history svg, #bg-worklist img')
    ).toHaveCount(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).__bg)).toBeUndefined();
  });

  test('an editor is sent away from the page', async ({ page }) => {
    await loginAs(page, 'editor');
    await page.goto('/book-glossary');
    await expect(page).toHaveURL(/\/$/);
  });

  test('the hold banner shows only while the export is held', async ({ page }) => {
    await loginAs(page, 'head-editor');
    let held = true;
    await stub(page, {
      [LAYER]: () => ({
        book: BOOK,
        exclusions: [],
        entries: [],
        hold: { held, since: '2026-11-20T14:02:00Z', recordError: false },
      }),
    });

    await page.goto(PAGE);
    await layerRendered(page);
    await expect(page.locator('#bg-hold-banner')).toBeVisible();

    held = false;
    await page.reload();
    await layerRendered(page);
    await expect(page.locator('#bg-hold-banner')).toBeHidden();
  });

  test('a book with no glossary directory is read-only', async ({ page }) => {
    await loginAs(page, 'head-editor');
    let writable = false;
    await stub(page, {
      [LAYER]: () =>
        layerAnswer({
          writable,
          entries: [entry({ inflections: { state: 'exact-only', reason: null } })],
        }),
    });
    const row = page.locator('#bg-layer [data-concept-id="990001"]');
    // Q13: nothing but the history and worklist buttons for a book the write routes refuse.
    const writeButtons = page.locator(
      '#bg-layer [data-action]:not([data-action="history"]):not([data-action="worklist"])'
    );

    await page.goto(PAGE);
    await expect(row).toBeVisible();
    await expect(page.locator('#bg-readonly')).toBeVisible();
    await expect(row.locator('[data-action="retry-inflections"]')).toHaveCount(0);
    await expect(row.locator('[data-action="change-entry"]')).toHaveCount(0);
    await expect(row.locator('[data-action="remove-entry"]')).toHaveCount(0);
    await expect(writeButtons).toHaveCount(0);

    // Control: a writable book offers the retry, and a change and a removal of the entry.
    writable = true;
    await page.reload();
    await expect(row).toBeVisible();
    await expect(row.locator('[data-action="retry-inflections"]')).toHaveCount(1);
    await expect(row.locator('[data-action="change-entry"]')).toHaveCount(1);
    await expect(row.locator('[data-action="remove-entry"]')).toHaveCount(1);
    await expect(page.locator('#bg-readonly')).toBeHidden();
  });

  // ── §C244 pile D: committed tests for behaviour that was checked once by hand ──

  // §C244 M14: the look-up panel honours the read-only rule (Q13) too, not only the layer.
  test('the look-up offers no write action for a read-only book', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await cleanSaltBridge(page);
    let writable = false;
    await stub(page, { [LAYER]: () => layerAnswer({ writable }) });
    const result = page.locator('#bg-lookup-result');
    const writes = result.locator(
      '.bg-actions [data-action]:not([data-action="history"]):not([data-action="worklist"])'
    );

    await page.goto(PAGE);
    await lookUp(page, SALT);
    await expect(winnerText(page)).toHaveText(SALT_IS);
    await expect(writes).toHaveCount(0);

    // Control: a writable book's look-up offers Setja þýðingu bókar.
    writable = true;
    await page.reload();
    await lookUp(page, SALT);
    await expect(winnerText(page)).toHaveText(SALT_IS);
    await expect(result.locator('[data-action="set-icelandic"]')).toHaveCount(1);
  });

  // §C244 T5d: a whole-headword exclusion and a one-row exclusion, as the layer shows them.
  test('exclusion rows say what they exclude', async ({ page }) => {
    await loginAs(page, 'head-editor');
    const exclusion = (/** @type {object} */ over) => ({
      id: 1,
      english: SALT,
      conceptId: 0,
      icelandic: null,
      claimedBy: null,
      reason: 'prófun',
      source: null,
      createdBy: 'Test Head-editor',
      createdAt: '2026-11-20T14:02:00Z',
      ...over,
    });
    await stub(page, {
      [LAYER]: layerAnswer({
        exclusions: [
          exclusion({ id: 1 }),
          exclusion({ id: 2, english: 'zrow', conceptId: 4242, icelandic: 'zröð' }),
        ],
      }),
    });
    await page.goto(PAGE);
    await layerRendered(page);
    const [excluded, whole] = /** @type {string[]} */ (
      await page.evaluate('[UI.bookGlossary.excluded, UI.bookGlossary.wholeHeadword]')
    );
    await expect(page.locator('#bg-layer [data-exclusion-id="1"] > .bg-head')).toHaveText(
      `${SALT} — ${excluded}${whole}`
    );
    await expect(page.locator('#bg-layer [data-exclusion-id="2"] > .bg-head')).toHaveText(
      `zrow — ${excluded}: zröð`
    );
  });

  // §C244 T5d: the banner also says when the committed record could not be written.
  test('the banner says when the record could not be written', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await stub(page, {
      [LAYER]: layerAnswer({ hold: { held: false, since: null, recordError: true } }),
    });
    await page.goto(PAGE);
    await layerRendered(page);
    await expect(page.locator('#bg-hold-banner')).toHaveText(
      String(await page.evaluate('UI.bookGlossary.recordError'))
    );
  });

  // §C244 T5d: plan ruling Q11 opens ?book= only on a book the user holds.
  test('?book= naming a book the user does not hold opens a held book instead', async ({
    page,
  }) => {
    await loginAs(page, 'head-editor');
    /** @type {string[]} */
    const asked = [];
    page.on('request', (r) => {
      const { pathname } = new URL(r.url());
      if (pathname.startsWith('/api/book-glossary/')) asked.push(pathname);
    });
    await page.goto('/book-glossary?book=liffraedi-2e');
    // Control: a held book's layer was read and shown.
    await expect(page.locator('#bg-layer')).toHaveAttribute('data-loaded-book', /.+/);
    await expect(page.locator('#bg-book-select')).not.toHaveValue('liffraedi-2e');
    expect(asked.filter((p) => p.startsWith('/api/book-glossary/liffraedi-2e'))).toEqual([]);
  });

  // §C244 T6d: a change with nothing edited says so and sends nothing.
  test('a change with no edit sends nothing', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await stub(page, { [LAYER]: layerAnswer({ entries: [entry()] }) });
    let posts = 0;
    await page.route('**/api/book-glossary/**', (route) => {
      if (route.request().method() === 'POST') posts += 1;
      return route.fallback();
    });
    await page.goto(PAGE);
    await page
      .locator('#bg-layer [data-concept-id="990001"] > .bg-actions [data-action="change-entry"]')
      .click();
    await page.locator('#bg-reason').fill('E2E: engin breyting');
    await page.locator('#bg-submit').click();
    await expect(page.locator('#bg-action-error')).toHaveText(
      String(await page.evaluate('UI.bookGlossary.unchanged'))
    );
    expect(posts).toBe(0);
  });

  // §C244 T6d (design G2): the worklist opens for a change of Icelandic, not for a forms-only one.
  test('an Icelandic change opens its worklist and a forms-only change does not', async ({
    page,
  }) => {
    await loginAs(page, 'head-editor');
    await stub(page, {
      [LAYER]: layerAnswer({ entries: [entry()] }),
      [`${LAYER}/worklist`]: emptyWorklist(5),
    });
    await page.route('**/api/book-glossary/**', (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      if (request.method() !== 'POST' || pathname !== `${LAYER}/entries/990001/change`) {
        return route.fallback();
      }
      const icelandicChanged = request.postDataJSON().icelandic != null;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'changed',
          conceptId: 990001,
          icelandicChanged,
          changeId: icelandicChanged ? 5 : 6,
        }),
      });
    });
    const actions = page.locator('#bg-layer [data-concept-id="990001"] > .bg-actions');
    const worklist = page.locator('#bg-worklist');
    await page.goto(PAGE);
    const savedText = String(await page.evaluate('UI.bookGlossary.saved'));

    await actions.locator('[data-action="change-entry"]').click();
    await page.locator('#bg-forms').fill('salt bridge\nsalt bridges');
    await page.locator('#bg-reason').fill('E2E: aðeins form');
    await page.locator('#bg-submit').click();
    // Control: the write was answered and the layer read again (the worklist would open first).
    await expect(page.locator('#bg-status')).toHaveText(savedText);
    await expect(worklist).toBeHidden();

    await actions.locator('[data-action="change-entry"]').click();
    await page.locator('#bg-icelandic').fill('jónabrú-e2e');
    await page.locator('#bg-reason').fill('E2E: íslenska breytt');
    await page.locator('#bg-submit').click();
    await expect(worklist).toBeVisible();
  });

  // §C244 T6d (design G2): an add alongside replaces nothing, so it opens no worklist.
  test('an add alongside opens no worklist', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await cleanSaltBridge(page);
    await stub(page, { [`${LAYER}/worklist`]: emptyWorklist(7) });
    await page.route('**/api/book-glossary/**', (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      if (request.method() !== 'POST' || pathname !== `${LAYER}/entries`) return route.fallback();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'added', conceptId: 1, changeId: 7 }),
      });
    });
    await page.goto(PAGE);
    const savedText = String(await page.evaluate('UI.bookGlossary.saved'));
    await lookUp(page, SALT);
    await expect(winnerText(page)).toHaveText(SALT_IS);
    await page.locator('#bg-lookup-result [data-action="set-icelandic"]').click();
    await page.locator('#bg-action-dialog input[name="bg-mode"][value="add"]').check();
    await page.locator('#bg-icelandic').fill('jónabrú-e2e');
    await page.locator('#bg-reason').fill('E2E: til hliðar');
    await page.locator('#bg-submit').click();
    // Control: the write was answered and the layer read again.
    await expect(page.locator('#bg-status')).toHaveText(savedText);
    await expect(page.locator('#bg-worklist')).toBeHidden();
  });

  // §C244 T6d: editing the dialog makes a body waiting for confirmation stale, so it is dropped.
  test('an edit drops a pending house-style confirmation', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await cleanSaltBridge(page);
    await page.route('**/api/book-glossary/**', (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      if (request.method() !== 'POST' || pathname !== `${LAYER}/entries`) return route.fallback();
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: NEEDS_CONFIRM,
          refusal: 'needs-confirm',
          houseStyle: [{ conceptId: 1, english: SALT, icelandic: 'zhús' }],
        }),
      });
    });
    const confirm = page.locator('#bg-confirm-house-style');
    await page.goto(PAGE);
    await lookUp(page, SALT);
    await expect(winnerText(page)).toHaveText(SALT_IS);
    await page.locator('#bg-lookup-result [data-action="set-icelandic"]').click();
    await page.locator('#bg-icelandic').fill('jónabrú-e2e');
    await page.locator('#bg-reason').fill('E2E: staðfesting');
    await page.locator('#bg-submit').click();
    // Control: the answer armed the confirmation.
    await expect(confirm).toBeVisible();

    await page.locator('#bg-reason').fill('E2E: staðfesting, breytt');
    await expect(confirm).toBeHidden();
    await expect(page.locator('#bg-house-style')).toBeHidden();
  });

  // §C244 T6f: an answer that wrote nothing, arriving after its dialog was given up, says nothing
  // in the dialog open now.
  test('a late unchanged answer leaves a later dialog alone', async ({ page }) => {
    const held = await holdFirstEntryWrite(page, { status: 200, body: { status: 'unchanged' } });
    await abandonForAnother(page, held);

    held.release();
    await expect(page.locator('#bg-submit')).toBeEnabled();
    await expect(page.locator('#bg-action-title')).toHaveText(await excludeHeadwordTitle(page));
    await expect(page.locator('#bg-action-error')).toHaveText('');
  });

  // §C244 T6f: a write whose book was switched away from while it ran refreshes nothing on the
  // book now shown.
  test('a write answered after a book switch refreshes nothing', async ({ page }) => {
    const held = await holdFirstEntryWrite(page, {
      status: 201,
      body: { status: 'added', conceptId: 1, changeId: 1 },
    });
    await page.goto(PAGE);
    await lookUp(page, SALT);
    await expect(winnerText(page)).toHaveText(SALT_IS);
    await page.locator('#bg-lookup-result [data-action="set-icelandic"]').click();
    await page.locator('#bg-icelandic').fill('jónabrú-e2e');
    await page.locator('#bg-reason').fill('E2E: bók skipt');
    await page.locator('#bg-submit').click();
    await expect.poll(() => held.posts).toBe(1);

    await page.locator('#bg-book-select').selectOption('__e2e-fixture__');
    await expect(page.locator('#bg-layer')).toHaveAttribute('data-loaded-book', '__e2e-fixture__');
    /** @type {string[]} */
    const reads = [];
    page.on('request', (r) => {
      if (r.method() === 'GET' && new URL(r.url()).pathname.startsWith('/api/book-glossary/')) {
        reads.push(new URL(r.url()).pathname);
      }
    });
    const answered = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `${LAYER}/entries`
    );
    held.release();
    await answered;
    // The page handles the answer within a few ticks; a refresh would be requested in that time.
    await page.waitForTimeout(500);
    expect(reads).toEqual([]);
    await expect(page.locator('#bg-status')).toHaveText('');
  });

  // §C244 M16/T6c: Útiloka orðið, Útiloka línu and Afturkalla, against the real server. (The retry
  // has its own tests below, on a stubbed lookup.)
  test('exclude the headword, exclude one row, and undo each', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await cleanSaltBridge(page);
    await page.goto(PAGE);
    const exclusionAdded = () =>
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && new URL(r.url()).pathname === `${LAYER}/exclusions`
      );
    /** Undo the exclusion with this id through its own row, and see the row go. */
    const undo = async (/** @type {number} */ id) => {
      const row = page.locator(`#bg-layer [data-exclusion-id="${id}"]`);
      await row.locator(':scope > .bg-actions [data-action="undo-exclusion"]').click();
      await page.locator('#bg-reason').fill('E2E: tekið til baka');
      await page.locator('#bg-submit').click();
      await expect(row).toHaveCount(0);
    };

    // Útiloka orðið: the whole headword.
    await lookUp(page, SALT);
    await expect(winnerText(page)).toHaveText(SALT_IS);
    await page.locator('#bg-lookup-result [data-action="exclude-headword"]').click();
    await page.locator('#bg-reason').fill('E2E: allt orðið útilokað');
    let answered = exclusionAdded();
    await page.locator('#bg-submit').click();
    const whole = await (await answered).json();
    expect(whole.status).toBe('added');
    await expect(
      page.locator(`#bg-layer [data-exclusion-id="${whole.id}"] > .bg-head .bg-whole`)
    ).toBeVisible();
    await undo(whole.id);

    // Útiloka línu: the seeded concept's row only.
    await lookUp(page, SALT);
    await expect(winnerText(page)).toHaveText(SALT_IS);
    await page.locator('#bg-lookup-result [data-action="exclude-row"]').first().click();
    await page.locator('#bg-reason').fill('E2E: ein lína útilokuð');
    answered = exclusionAdded();
    await page.locator('#bg-submit').click();
    const one = await (await answered).json();
    expect(one.status).toBe('added');
    await expect(
      page.locator(`#bg-layer [data-exclusion-id="${one.id}"] > .bg-head .bg-is`)
    ).toHaveText(SALT_IS);
    await undo(one.id);
  });

  test('look up, replace, see the worklist row, undo', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await cleanSaltBridge(page);
    await page.goto(PAGE);
    const dialog = page.locator('#bg-action-dialog');
    const worklistRow = page.locator(`#bg-worklist [data-segment-id="${SEGMENT}"]`);

    await lookUp(page, SALT);
    await expect(winnerText(page)).toHaveText(SALT_IS);

    // Setja þýðingu bókar, replacing the seeded concept (the winner, checked by default).
    await page.locator('#bg-lookup-result [data-action="set-icelandic"]').click();
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="bg-mode"][value="replace"]').check();
    await page.locator('#bg-icelandic').fill('jónabrú-e2e');
    await page.locator('#bg-reason').fill('E2E: útskipting prófuð');
    const answered = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `${LAYER}/entries`
    );
    await page.locator('#bg-submit').click();
    const added = await (await answered).json();
    expect(added.status).toBe('added');

    // The worklist opens for the change: one id-keyed row, never a count.
    await expect(worklistRow).toBeVisible();
    const href = await worklistRow.locator('a.bg-open').getAttribute('href');
    const link = new URL(String(href), 'http://localhost').searchParams;
    expect({
      book: link.get('book'),
      chapter: link.get('chapter'),
      module: link.get('module'),
      segment: link.get('segment'),
    }).toEqual({ book: BOOK, chapter: '17', module: 'm68822', segment: SEGMENT });
    // The look-up reloaded: the book's own entry wins now.
    await expect(winnerText(page)).toHaveText('jónabrú-e2e');

    // Saga → Verkefnalisti on the entry-add row reaches the same list.
    await page.locator('#bg-worklist .bg-close').click();
    await expect(worklistRow).toHaveCount(0);
    const entryRow = page.locator(`#bg-layer [data-concept-id="${added.conceptId}"]`);
    // The entry's own action bar: a claimed exclusion nested in the row has a Saga button too.
    const entryActions = entryRow.locator(':scope > .bg-actions');
    await entryActions.locator('[data-action="history"]').click();
    await page
      .locator(`#bg-history [data-change-id="${added.changeId}"] [data-action="worklist"]`)
      .click();
    await expect(worklistRow).toBeVisible();

    // Fjarlægja, undoing the exclusion the entry claims (checked by default, plan ruling Q7).
    await entryActions.locator('[data-action="remove-entry"]').click();
    const undo = dialog.locator('input[name="bg-undo"]');
    await expect(undo).toHaveCount(1);
    await expect(undo).toBeChecked();
    await page.locator('#bg-reason').fill('E2E: tekið til baka');
    await page.locator('#bg-submit').click();
    await expect(entryRow).toHaveCount(0);
    await lookUp(page, SALT);
    await expect(winnerText(page)).toHaveText(SALT_IS);
  });

  test('a house-style override is sent only after confirmation', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await cleanSaltBridge(page);
    // §C244 T6e: the stubbed 201 below is a replacement, so the page opens its worklist; answer
    // that from a stub too, never from the real server's change 1.
    await stub(page, { [`${LAYER}/worklist`]: emptyWorklist(1) });
    /** @type {any[]} */
    const bodies = [];
    await page.route('**/api/book-glossary/**', (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      if (request.method() !== 'POST' || pathname !== `${LAYER}/entries`) return route.fallback();
      bodies.push(request.postDataJSON());
      const first = bodies.length === 1;
      return route.fulfill({
        status: first ? 409 : 201,
        contentType: 'application/json',
        body: JSON.stringify(
          first
            ? {
                error: NEEDS_CONFIRM,
                refusal: 'needs-confirm',
                houseStyle: [{ conceptId: 1, english: SALT, icelandic: 'zhús' }],
              }
            : { status: 'added', conceptId: 1, changeId: 1 }
        ),
      });
    });
    await page.goto(PAGE);
    const dialog = page.locator('#bg-action-dialog');
    const confirm = page.locator('#bg-confirm-house-style');

    await lookUp(page, SALT);
    await expect(winnerText(page)).toHaveText(SALT_IS);
    await page.locator('#bg-lookup-result [data-action="set-icelandic"]').click();
    // Nothing to confirm before the server has asked. Checked before any field is touched, since
    // an edit hides the button on its own.
    await expect(dialog).toBeVisible();
    await expect(confirm).toBeHidden();
    await dialog.locator('input[name="bg-mode"][value="replace"]').check();
    await page.locator('#bg-icelandic').fill('jónabrú-e2e');
    await page.locator('#bg-reason').fill('E2E: staðfesting prófuð');
    await page.locator('#bg-submit').click();

    await expect(confirm).toBeVisible();
    // §C244 T6d: the dialog says why it asks.
    await expect(page.locator('#bg-action-error')).toHaveText(NEEDS_CONFIRM);
    await expect(page.locator('#bg-house-style .bg-is')).toHaveText('zhús');
    expect(bodies).toHaveLength(1);
    expect(bodies[0].confirmHouseStyle).not.toBe(true);

    await confirm.click();
    await expect.poll(() => bodies.length).toBe(2);
    expect(bodies[1]).toEqual({ ...bodies[0], confirmHouseStyle: true });
    await expect(dialog).toBeHidden();
  });

  test('a preference refusal offers no confirmation, even after a needs-confirm', async ({
    page,
  }) => {
    await loginAs(page, 'head-editor');
    await cleanSaltBridge(page);
    /** @type {any[]} */
    const bodies = [];
    await page.route('**/api/book-glossary/**', (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      if (request.method() !== 'POST' || pathname !== `${LAYER}/entries`) return route.continue();
      bodies.push(request.postDataJSON());
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify(
          bodies.length === 1
            ? {
                error: NEEDS_CONFIRM,
                refusal: 'needs-confirm',
                houseStyle: [{ conceptId: 1, english: SALT, icelandic: 'zhús' }],
              }
            : { error: PREFERENCE, refusal: 'preference' }
        ),
      });
    });
    await page.goto(PAGE);
    const confirm = page.locator('#bg-confirm-house-style');

    await lookUp(page, SALT);
    await expect(winnerText(page)).toHaveText(SALT_IS);
    await page.locator('#bg-lookup-result [data-action="set-icelandic"]').click();
    await page.locator('#bg-icelandic').fill('jónabrú-e2e');
    await page.locator('#bg-reason').fill('E2E: val bókarinnar prófað');
    await page.locator('#bg-submit').click();
    // Control: the first answer armed the confirmation.
    await expect(confirm).toBeVisible();

    // Vista again with no edit in between (an edit would drop the confirmation on its own).
    await page.locator('#bg-submit').click();
    await expect(page.locator('#bg-action-error')).toHaveText(PREFERENCE);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].confirmHouseStyle).not.toBe(true);
    // Design §5.3: a preference refusal offers no way past it.
    await expect(confirm).toBeHidden();
    await expect(page.locator('#bg-house-style')).toBeHidden();
  });

  test('an unchanged answer to a forms change says how case is changed', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await stub(page, { [LAYER]: layerAnswer({ entries: [entry()] }) });
    /** @type {any[]} */
    const bodies = [];
    // Registered after stub(), so it runs first and hands every other request back to it.
    await page.route('**/api/book-glossary/**', (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      if (request.method() !== 'POST' || pathname !== `${LAYER}/entries/990001/change`) {
        return route.fallback();
      }
      bodies.push(request.postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'unchanged' }),
      });
    });
    await page.goto(PAGE);

    const row = page.locator('#bg-layer [data-concept-id="990001"]');
    await row.locator('[data-action="change-entry"]').click();
    await page.locator('#bg-forms').fill('Salt bridge');
    await page.locator('#bg-reason').fill('E2E: hástafur');
    await page.locator('#bg-submit').click();

    // §C243 R8: the strings come from UI.bookGlossary, a top-level const (so not on window).
    const expected = await page.evaluate(
      'UI.bookGlossary.unchanged + " " + UI.bookGlossary.caseHint'
    );
    await expect(page.locator('#bg-action-error')).toHaveText(String(expected));
    expect(bodies).toEqual([{ forms: ['Salt bridge'], reason: 'E2E: hástafur' }]);
  });

  test("a late needs-confirm does not arm a later dialog's confirmation", async ({ page }) => {
    const held = await holdFirstEntryWrite(page, {
      status: 409,
      body: {
        error: NEEDS_CONFIRM,
        refusal: 'needs-confirm',
        houseStyle: [{ conceptId: 1, english: SALT, icelandic: 'zhús' }],
      },
    });
    await abandonForAnother(page, held);

    held.release();
    // The answer has been handled once the request's buttons are enabled again.
    await expect(page.locator('#bg-submit')).toBeEnabled();
    await expect(page.locator('#bg-action-title')).toHaveText(await excludeHeadwordTitle(page));
    await expect(page.locator('#bg-confirm-house-style')).toBeHidden();
    await expect(page.locator('#bg-house-style')).toBeHidden();
    await expect(page.locator('#bg-action-error')).toHaveText('');
  });

  test('a late success refreshes the layer and leaves a later dialog open', async ({ page }) => {
    const held = await holdFirstEntryWrite(page, {
      status: 201,
      body: { status: 'added', conceptId: 1, changeId: 1 },
    });
    await abandonForAnother(page, held);

    held.release();
    await expect(page.locator('#bg-submit')).toBeEnabled();
    // The write happened, so the layer is read again; the open dialog is not the one that sent it.
    await expect(page.locator('#bg-status')).toHaveText(
      String(await page.evaluate('UI.bookGlossary.saved'))
    );
    await expect(page.locator('#bg-action-dialog')).toBeVisible();
    await expect(page.locator('#bg-action-title')).toHaveText(await excludeHeadwordTitle(page));
    await expect(page.locator('#bg-worklist')).toBeHidden();
  });

  // §C244 N8: this is the CHANGED-answer case (null → several-words); the unchanged case, the one
  // that caught N1, is the next test.
  test('a retry whose answer changes re-enables the button and clears the status', async ({
    page,
  }) => {
    const scene = await retryScene(page, null);
    // Control: the first answer is the one shown.
    await expect(scene.inflections).toContainText(await scene.label(null));

    scene.reason = 'several-words';
    await scene.retry();
    await expect(scene.inflections).toContainText(await scene.label('several-words'));
    await expect(scene.button).toBeEnabled();
    // §C244 N9: empty, not merely "not the retry's text", which an error message would also pass.
    await expect(page.locator('#bg-status')).toHaveText('');
  });

  test('a retry whose answer is the one already shown re-enables the button and clears the status', async ({
    page,
  }) => {
    // §C244 N1: "several-words" is set before the BÍN pass, so the entry is never pending.
    const scene = await retryScene(page, 'several-words');
    await expect(scene.inflections).toContainText(await scene.label('several-words'));
    const reads = scene.reads;

    await scene.retry();
    // Control: the layer was read again, and its answer is the one already shown.
    await expect.poll(() => scene.reads).toBeGreaterThan(reads);
    await expect(scene.button).toBeEnabled();
    await expect(scene.inflections).toContainText(await scene.label('several-words'));
    // §C244 N9: empty, not merely "not the retry's text".
    await expect(page.locator('#bg-status')).toHaveText('');
  });

  // §C244 N7: a failed re-read used to end the chain silently, leaving the retry button disabled
  // and the status line blank.
  test('a retry whose re-read fails re-enables the button and says the read failed', async ({
    page,
  }) => {
    const scene = await retryScene(page, 'several-words');
    let failing = false;
    let failed = 0;
    // Registered last, so it runs first: while `failing`, the layer read answers 500.
    await page.route('**/api/book-glossary/**', (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      if (!failing || request.method() !== 'GET' || pathname !== LAYER) return route.fallback();
      failed += 1;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Villa á þjóni' }),
      });
    });

    failing = true;
    await scene.retry();
    // Control: the re-read happened and failed.
    await expect.poll(() => failed).toBeGreaterThan(0);
    const loadError = String(await page.evaluate('UI.bookGlossary.loadError'));
    await expect(page.locator('#bg-status')).toHaveText(loadError + 'Villa á þjóni');
    await expect(scene.button).toBeEnabled();
  });

  // §C244 N2: the page opens with an entry whose lookup is still running (a write just before, or
  // a book switch); the layer is read again until it settles, as after a write.
  test('an entry pending when the page opens is read again until it settles', async ({ page }) => {
    await loginAs(page, 'head-editor');
    let reads = 0;
    await stub(page, {
      [LAYER]: () => {
        reads += 1;
        const inflections = reads === 1 ? { state: 'pending' } : { state: 'forms', count: 2 };
        return layerAnswer({ entries: [entry({ inflections })] });
      },
    });
    const line = page.locator('#bg-layer [data-concept-id="990001"] .bg-inflections');
    const label = async (/** @type {object} */ state) =>
      String(
        await page.evaluate(
          `UI.bookGlossary.inflections + bookGlossaryView.inflectionLabel(${JSON.stringify(state)})`
        )
      );

    await page.goto(PAGE);
    // Control: the first answer, pending, is the one shown.
    await expect(line).toContainText(await label({ state: 'pending' }));
    await expect(line).toContainText(await label({ state: 'forms', count: 2 }));
  });

  // §C244 M6: the new history row used to appear only when Saga was clicked again.
  test('an open history panel is read again after a write', async ({ page }) => {
    await loginAs(page, 'head-editor');
    const rows = [historyRow(1, 'entry-add')];
    await stub(page, {
      [LAYER]: layerAnswer({ entries: [entry()] }),
      [`${LAYER}/history`]: () => ({ history: [...rows].reverse() }),
    });
    await page.route('**/api/book-glossary/**', (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      if (request.method() !== 'POST' || pathname !== `${LAYER}/entries/990001/change`) {
        return route.fallback();
      }
      rows.push(historyRow(2, 'entry-change'));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'changed',
          conceptId: 990001,
          icelandicChanged: false,
          changeId: 2,
        }),
      });
    });
    const actions = page.locator('#bg-layer [data-concept-id="990001"] > .bg-actions');

    await page.goto(PAGE);
    await actions.locator('[data-action="history"]').click();
    // Control: the panel shows the history as it was.
    await expect(page.locator('#bg-history [data-change-id="1"]')).toBeVisible();

    await actions.locator('[data-action="change-entry"]').click();
    await page.locator('#bg-forms').fill('salt bridge\nsalt bridges');
    await page.locator('#bg-reason').fill('E2E: sagan lesin aftur');
    await page.locator('#bg-submit').click();
    // Control: the write was answered (the dialog closes only then).
    await expect(page.locator('#bg-action-dialog')).toBeHidden();
    await expect(page.locator('#bg-history [data-change-id="2"]')).toBeVisible();
  });
});

/**
 * One history row as GET …/history answers it, for the seeded 'salt bridge' entry.
 *
 * @param {number} id
 * @param {'entry-add'|'entry-change'} action
 */
function historyRow(id, action) {
  return {
    id,
    at: `2026-11-26T1${id}:00:00Z`,
    by: 'Test Head-editor',
    action,
    english: SALT,
    before: action === 'entry-add' ? null : { english: [SALT], icelandic: SALT_IS },
    after: {
      english: action === 'entry-add' ? [SALT] : [SALT, 'salt bridges'],
      icelandic: SALT_IS,
    },
    reason: 'prófun',
    source: null,
    worklist: false,
  };
}

/**
 * Log in and open PAGE on one entry whose inflection state is exact-only with `scene.reason`, read
 * afresh on each layer read, and answer its retry with 202. Returns the scene: the entry's
 * inflection line and retry button, the retry's status text, a label from book-glossary-view.js,
 * the reads and retries counted, and `retry()`, which clicks the button and waits for the retry to
 * have started.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string|null} reason
 */
async function retryScene(page, reason) {
  await loginAs(page, 'head-editor');
  const row = page.locator('#bg-layer [data-concept-id="990001"]');
  const button = row.locator('[data-action="retry-inflections"]');
  const status = page.locator('#bg-status');
  const scene = {
    reason,
    reads: 0,
    posts: 0,
    inflections: row.locator('.bg-inflections'),
    button,
    started: '',
    /** "Beygingar: " and the line's label for exact-only with `r`, from the page's own scripts. */
    label: async (/** @type {string|null} */ r) =>
      String(
        await page.evaluate(
          `UI.bookGlossary.inflections + bookGlossaryView.inflectionLabel(${JSON.stringify({ state: 'exact-only', reason: r })})`
        )
      ),
    retry: async () => {
      const posts = scene.posts;
      await button.click();
      // Control: the retry reached the stub and started. A POST that missed it would fail on the
      // real server, whose error branch re-enables the button and says so in the status line.
      await expect(button).toBeDisabled();
      await expect(status).toHaveText(scene.started);
      expect(scene.posts).toBe(posts + 1);
    },
  };
  await stub(page, {
    [LAYER]: () => {
      scene.reads += 1;
      return layerAnswer({
        entries: [entry({ inflections: { state: 'exact-only', reason: scene.reason } })],
      });
    },
  });
  // Registered after stub(), so it runs first and hands every other request back to it.
  await page.route('**/api/book-glossary/**', (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() !== 'POST' || pathname !== `${LAYER}/entries/990001/inflections`) {
      return route.fallback();
    }
    scene.posts += 1;
    return route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'scheduled', conceptId: 990001 }),
    });
  });
  await page.goto(PAGE);
  await expect(button).toBeEnabled();
  scene.started = String(await page.evaluate('UI.bookGlossary.retryStarted'));
  return scene;
}

/**
 * Log in, hold the first POST to …/entries until `release()` is called, then answer it with
 * `answer` ({status, body}); every other request reaches the server.
 */
async function holdFirstEntryWrite(page, answer) {
  await loginAs(page, 'head-editor');
  await cleanSaltBridge(page);
  const held = { posts: 0, release: () => {} };
  const released = new Promise((resolve) => {
    held.release = () => resolve(undefined);
  });
  await page.route('**/api/book-glossary/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() !== 'POST' || pathname !== `${LAYER}/entries`) return route.continue();
    held.posts += 1;
    await released;
    return route.fulfill({
      status: answer.status,
      contentType: 'application/json',
      body: JSON.stringify(answer.body),
    });
  });
  return held;
}

/**
 * Submit Setja þýðingu bókar, give up on it with Escape while its request is held, and open
 * Útiloka orðið instead.
 */
async function abandonForAnother(page, held) {
  const dialog = page.locator('#bg-action-dialog');
  await page.goto(PAGE);
  await lookUp(page, SALT);
  await expect(winnerText(page)).toHaveText(SALT_IS);
  await page.locator('#bg-lookup-result [data-action="set-icelandic"]').click();
  await page.locator('#bg-icelandic').fill('jónabrú-e2e');
  await page.locator('#bg-reason').fill('E2E: svar sem berst seint');
  await page.locator('#bg-submit').click();
  await expect.poll(() => held.posts).toBe(1);
  await page.locator('#bg-reason').press('Escape');
  await expect(dialog).toBeHidden();
  await page.locator('#bg-lookup-result [data-action="exclude-headword"]').click();
  await expect(page.locator('#bg-action-title')).toHaveText(await excludeHeadwordTitle(page));
  // Control: the first request is still running.
  await expect(page.locator('#bg-submit')).toBeDisabled();
}

/** The Útiloka orðið dialog's title for SALT, from UI.bookGlossary. */
async function excludeHeadwordTitle(page) {
  return String(
    await page.evaluate(`UI.bookGlossary.excludeHeadwordTitle(${JSON.stringify(SALT)})`)
  );
}
