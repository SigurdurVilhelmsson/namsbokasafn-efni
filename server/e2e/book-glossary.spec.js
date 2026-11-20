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
const SEGMENT = 'm68822:para:fs-idm196674112';
// The seeded concept (seed-fixture.js, plan ruling Q10).
const SALT = 'salt bridge';
const SALT_IS = 'saltbrú';
const NEEDS_CONFIRM =
  'Þessi breyting víkur til hliðar ákvörðun um orðanotkun verksins. Staðfestu til að halda áfram.';

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
    await page.locator('#bg-history [data-action="worklist"]').click();
    const item = page.locator(`#bg-worklist [data-segment-id="${SEGMENT}"]`);
    await expect(item).toContainText(PAYLOAD);
    await expect(item.locator('mark')).toHaveText('saltbrú');
    await expect(item.locator('a.bg-open')).toHaveAttribute('href', /^\/editor\?book=/);

    await expect(page.locator('#bg-layer img, #bg-history img, #bg-worklist img')).toHaveCount(0);
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
    /** @type {any[]} */
    const bodies = [];
    await page.route('**/api/book-glossary/**', (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      if (request.method() !== 'POST' || pathname !== `${LAYER}/entries`) return route.continue();
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
    await dialog.locator('input[name="bg-mode"][value="replace"]').check();
    await page.locator('#bg-icelandic').fill('jónabrú-e2e');
    await page.locator('#bg-reason').fill('E2E: staðfesting prófuð');
    await page.locator('#bg-submit').click();

    await expect(confirm).toBeVisible();
    await expect(page.locator('#bg-house-style .bg-is')).toHaveText('zhús');
    expect(bodies).toHaveLength(1);
    expect(bodies[0].confirmHouseStyle).not.toBe(true);

    await confirm.click();
    await expect.poll(() => bodies.length).toBe(2);
    expect(bodies[1]).toEqual({ ...bodies[0], confirmHouseStyle: true });
    await expect(dialog).toBeHidden();
  });
});
