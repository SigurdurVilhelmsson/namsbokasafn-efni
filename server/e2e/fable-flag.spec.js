// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Spec of 2026-11-24 (Fable layer serving), Task 11: the meaning flag and the comparison, on the real
 * efnafraedi-2e chapter 2 content. Writes nothing: the editor opens unit m68685 and reads.
 *
 * WHY THIS UNIT AND THIS EDITOR: dedicated editor 90123 (seed-fixture.js) is assigned chapter 2, and no other spec
 * opens m68685, so its opening is recorded by THIS spec's first serve, with no in-flight row anywhere on the unit.
 * That matters: a flag is withheld on any segment that held human text when the unit opened (Task 6b), so a unit
 * another spec had edited would show no flag. (m68684/m68693 belong to suggestion-view.spec.js, which counts their
 * openings.)
 *
 * THE SEGMENTS (books/efnafraedi-2e/02-mt-fable/ch02/m68685-tags.jsonl, a tags line at occurrence 0):
 *   FLAGGED   m68685:para:fs-idp22389648 carries the tags meaning+fluency;
 *   CONTROL   m68685:caption:CNX_Chem_02_01_Dalton2-caption carries `fluency` only: Fable changed it, and it is
 *             not flagged. Without this row, "no flag" could mean the page never rendered one at all.
 */
const BOOK = 'efnafraedi-2e';
const CHAPTER = 2;
const MODULE = 'm68685';
const EDITOR_ID = 90123;
const FLAGGED = 'm68685:para:fs-idp22389648';
const CONTROL = 'm68685:caption:CNX_Chem_02_01_Dalton2-caption';
const MODULE_URL = `/api/segment-editor/${BOOK}/${CHAPTER}/${MODULE}`;

const rowOf = (page, segmentId) =>
  page.locator(`#segments-body tr[data-segment-id="${segmentId}"]`);

async function openUnit(page) {
  await page.goto(`/editor?book=${BOOK}&chapter=${CHAPTER}&module=${MODULE}`);
  await expect(page.locator('#editor-container')).toBeVisible({ timeout: 15000 });
  await expect(rowOf(page, FLAGGED)).toHaveCount(1, { timeout: 10000 });
}

test.describe('Fable meaning flag and comparison on m68685', () => {
  test.describe.configure({ mode: 'serial' });

  test('a flagged segment shows the flag, opens the comparison once, and closes back to the row', async ({
    page,
  }) => {
    await loginAs(page, 'editor', EDITOR_ID);
    await openUnit(page);

    // The module is served from Fable's layer, and the label says so.
    await expect(page.locator('#module-meta')).toContainText(
      'Upphafstexti, yfirfarinn af gervigreind'
    );

    const row = rowOf(page, FLAGGED);
    const flag = row.locator('.fable-flag');
    await expect(flag).toHaveCount(1);
    await expect(flag).toContainText('Gervigreindin breytti merkingu þessa bútar.');
    const comparison = row.locator('[data-fable-comparison]');
    await expect(comparison).toBeHidden();

    const posts = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith(`${MODULE_URL}/fable-comparison-opened`)) {
        posts.push(r.postDataJSON());
      }
    });
    const button = row.locator('.fable-flag-btn');
    await expect(button).toHaveText('Sýna hvað breyttist');
    const answered = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/fable-comparison-opened')
    );
    // A double click: the second click lands while the first request is in flight, and does nothing.
    await button.dblclick();
    const response = await answered;
    expect(response.status()).toBe(204);

    await expect(comparison).toBeVisible();
    await expect(comparison).toContainText('Fyrir yfirferð gervigreindar → eftir yfirferð');
    // The diff marks something: Fable's text differs from the text it started from, by construction.
    await expect(comparison.locator('del, ins').first()).toBeVisible();
    // Read-only: nothing in the panel can be typed into.
    await expect(comparison.locator('textarea, input, [contenteditable="true"]')).toHaveCount(0);
    expect(posts).toEqual([{ segmentId: FLAGGED, occurrence: 0 }]);

    // Closing goes back to the row and records nothing.
    await button.click();
    await expect(comparison).toBeHidden();
    expect(posts).toHaveLength(1);
  });

  test('a segment Fable changed without a meaning tag shows no flag and no comparison', async ({
    page,
  }) => {
    await loginAs(page, 'editor', EDITOR_ID);
    await openUnit(page);
    // Positive control: the unflagged row really rendered, with text.
    const control = rowOf(page, CONTROL);
    await expect(control).toHaveCount(1);
    await expect(control.locator('td.col-is > [id^="is-"]')).not.toHaveText('');
    await expect(control.locator('.fable-flag, [data-fable-comparison]')).toHaveCount(0);
    // And the flag is not a page-wide artefact: the flagged row still has exactly one.
    await expect(rowOf(page, FLAGGED).locator('.fable-flag')).toHaveCount(1);
  });
});
