// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * The head editor's book glossary page (design §5.3): the layer, one headword's history and one
 * change's worklist.
 *
 * The API answers are stubbed with page.route, keyed on the request's pathname, so these tests read
 * neither the box's export status file nor the BÍN file (which exists on some boxes only). Every
 * "hidden" check first waits for a positive signal that the page rendered that answer, since the
 * elements start hidden and a bare not-visible check would pass before the script ran.
 */

const BOOK = 'efnafraedi-2e';
const LAYER = `/api/book-glossary/${BOOK}`;
const PAGE = `/book-glossary?book=${BOOK}`;
const PAYLOAD = '<img src=x onerror="window.__bg=1">';
const SEGMENT = 'm68822:para:fs-idm196674112';

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
    await expect(writeButtons).toHaveCount(0);

    // Control: a writable book offers the retry.
    writable = true;
    await page.reload();
    await expect(row).toBeVisible();
    await expect(row.locator('[data-action="retry-inflections"]')).toHaveCount(1);
    await expect(page.locator('#bg-readonly')).toBeHidden();
  });
});
