// @ts-check
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Figure-text review card (Task 8).
 *
 * The card is the editor's surface onto a translated figure: the Icelandic text
 * blocks live in a COMMITTED sidecar, the review state lives in SQLite, and
 * "is this approved?" is DERIVED from both. The spec below exercises that
 * derivation rather than a stored label — an approved figure whose blocks then
 * change must fall back to mt-preview on its own.
 *
 * ⚠️ These tests MUTATE a tracked file. Approving or flagging a figure runs
 * applyApprovedFigureEdits(), which rewrites
 * books/__e2e-fixture__/figure-text/<basename>.is.json with a state and a
 * renderHash. Every test therefore rewrites the pristine bytes before AND after
 * itself, so a run leaves the git tree clean — the same standard
 * global-teardown.js holds the .locked markers to.
 *
 * ⚠️ The pristine text is a CONSTANT here, never a snapshot of the file taken at
 * run time: a previous hard-killed run leaves the file dirty, and snapshotting
 * would faithfully restore that dirt. The committed file must be byte-identical
 * to these constants (asserted by `sidecarIsPristine` in the first test).
 */

const FIXTURE_DIR = path.join(__dirname, '..', '..', 'books', '__e2e-fixture__', 'figure-text');

/**
 * ONE FIGURE PER MUTATING TEST. The sidecar is restored between tests, but the
 * DATABASE is not: figure_block_edit and figure_review rows live for the whole
 * run. Two tests sharing a figure therefore leak into each other — and the leak
 * is silent, because a re-saved IDENTICAL value leaves the render hash unmoved
 * and the badge legitimately stays 'approved'. That is not a product defect and
 * chasing it as one costs a round; the fix is isolation, not a retry.
 */
const ALCHEMIST = 'CNX_Chem_01_01_Alchemist';
const CHEMWEB = 'CNX_Chem_01_01_ChemWeb';
const SCIMETHOD = 'CNX_Chem_01_01_SciMethod';

/**
 * The decimal block is deliberate: '37.5' fires decimalSeparatorWarnings (Icelandic
 * inverts the separator) so the card's warning rendering is executed by a real
 * payload rather than left untested. Verified against the real checker that these
 * exact strings produce ONE decimal warning and ZERO caption warnings, so an extra
 * warning in the DOM is a defect and not fixture noise.
 */
const DECIMAL_BLOCK_KEY = 'Furnace temperature 37.5 C';
const DECIMAL_BLOCK_MT = 'Hiti ofns 37.5 C';

/**
 * The correction an editor types. Carries a double quote and an angle bracket on
 * purpose: a card that builds `value="${text}"` inside an innerHTML string
 * truncates at the quote and injects at the '<'. Asserting the value ROUND-TRIPS
 * is what distinguishes a working card from one that merely renders an element.
 */
const DECIMAL_BLOCK_EDIT = 'Hiti ofns 37,5 C "gæði" <b>';

/** The derivation test's own figure and block — touched by no other test. */
const HYPOTHESIS_KEY = 'Form hypothesis';
const HYPOTHESIS_MT = 'Setja fram tilgátu';
const HYPOTHESIS_EDIT = 'Setja fram tilgátu "A" <b>';

const PRISTINE = {
  [ALCHEMIST]: `{
 "version": 1,
 "basename": "CNX_Chem_01_01_Alchemist",
 "blocks": {
  "Alchemist's workshop": "Verkstæði gullgerðarmanns",
  "Furnace temperature 37.5 C": "Hiti ofns 37.5 C"
 }
}
`,
  [CHEMWEB]: `{
 "version": 1,
 "basename": "CNX_Chem_01_01_ChemWeb",
 "blocks": {
  "Chemistry": "Efnafræði",
  "Biochemistry and molecular biology": "Lífefnafræði og sameindalíffræði"
 }
}
`,
  [SCIMETHOD]: `{
 "version": 1,
 "basename": "CNX_Chem_01_01_SciMethod",
 "blocks": {
  "Observation and curiosity": "Athugun og forvitni",
  "Form hypothesis": "Setja fram tilgátu"
 }
}
`,
};

const sidecarFile = (basename) => path.join(FIXTURE_DIR, `${basename}.is.json`);

function writePristineSidecars() {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  for (const [basename, body] of Object.entries(PRISTINE)) {
    fs.writeFileSync(sidecarFile(basename), body, 'utf-8');
  }
}

/** True when the COMMITTED bytes equal the constants above — a drifted fixture is a defect. */
function sidecarIsPristine(basename) {
  return fs.readFileSync(sidecarFile(basename), 'utf-8') === PRISTINE[basename];
}

/** Open __e2e-fixture__ chapter 1, module `moduleId`, and wait for its segments. */
async function openFixtureModule(page, moduleId) {
  await page.goto('/editor');
  await page.waitForLoadState('networkidle');
  await page.locator('#book-select').selectOption('__e2e-fixture__');
  const chapterSelect = page.locator('#chapter-select');
  await expect(chapterSelect).toBeVisible({ timeout: 5000 });
  // Chapters arrive via an async fetch — poll rather than count once (> 1
  // because the first option is the placeholder), same as segment-editor.spec.js.
  await expect
    .poll(() => chapterSelect.locator('option').count(), { timeout: 10000 })
    .toBeGreaterThan(1);
  await chapterSelect.selectOption('1');
  await page.locator(`.module-card[title^="${moduleId}"]`).click();
  await expect(page.locator('.segment-row').first()).toBeVisible({ timeout: 10000 });
}

const card = (page, basename) => page.locator(`[data-figure-card="${basename}"]`);
const blockRow = (page, basename, key) =>
  card(page, basename).locator(`li:has([data-block-key="${key}"])`);

test.describe('Figure review card', () => {
  /**
   * Runs BEFORE the first beforeEach, so it reads the COMMITTED bytes — the one
   * moment at which this comparison is not vacuous. It fails if the tracked
   * fixture and the constants above have drifted apart (someone edited the JSON
   * and not the spec, or the reverse), which is exactly the drift that would
   * make every later run leave the git tree dirty.
   */
  test.beforeAll(() => {
    for (const basename of Object.keys(PRISTINE)) {
      expect(
        sidecarIsPristine(basename),
        `committed ${basename}.is.json differs from this spec's PRISTINE constant`
      ).toBe(true);
    }
  });

  test.beforeEach(async ({ page }) => {
    writePristineSidecars();
    await loginAs(page, 'admin');
  });

  // Restore even when the test failed mid-flow: an approve already rewrote the file.
  test.afterEach(() => writePristineSidecars());

  test('the card renders the figures the API actually returns', async ({ page }) => {
    await openFixtureModule(page, 'm68664');

    // POSITIVE CONTROL. A missing card has two possible causes — no client code,
    // or a sidecar the route skipped (readSidecar returns null for ABSENT and for
    // MALFORMED alike). Pinning the API's answer first makes a red below
    // unambiguously the client's fault, which is what makes the RED "for the
    // right reason".
    const res = await page.request.get('/api/segment-editor/__e2e-fixture__/1/m68664/figures');
    expect(res.ok()).toBe(true);
    const { figures } = await res.json();
    expect(figures.map((f) => f.basename).sort()).toEqual([ALCHEMIST, CHEMWEB, SCIMETHOD]);

    // m68664 carries FOUR figures; only the three with a sidecar are reviewable.
    // Asserting the count binds that skip — a card per figure would be wrong.
    await expect(page.locator('[data-figure-card]')).toHaveCount(3);
    await expect(card(page, ALCHEMIST)).toBeVisible();

    // The block VALUE, not merely the presence of an input: the editor's
    // corrections overlay the MT text, and a card that renders the raw sidecar
    // would look identical while showing the wrong string. Asserted on a block
    // NO test edits, so this stays true whatever order the file runs in.
    const input = card(page, ALCHEMIST).locator(`[data-block-key="Alchemist's workshop"]`);
    await expect(input).toHaveValue('Verkstæði gullgerðarmanns');
  });

  test('a decimal warning renders and clears when the block is corrected', async ({ page }) => {
    await openFixtureModule(page, 'm68664');
    const row = blockRow(page, ALCHEMIST, DECIMAL_BLOCK_KEY);

    // Precondition, stated rather than assumed: the block still holds the
    // UNCORRECTED MT text. Without this, a leaked edit from an earlier test
    // would make the warning legitimately absent and the assertion below would
    // read as a card defect.
    await expect(row.locator('[data-block-input]')).toHaveValue(DECIMAL_BLOCK_MT);

    // The suggestion is the payload's own value, so this fails if the card drops
    // warnings OR renders the wrong field of one.
    await expect(row.locator('[data-block-warning]')).toHaveCount(1);
    await expect(row.locator('[data-block-warning]')).toContainText('Hiti ofns 37,5 C');

    await row.locator('[data-block-input]').fill(DECIMAL_BLOCK_EDIT);
    await row.locator('[data-block-save]').click();

    // Re-fetched, so the warning list is recomputed server-side from the saved text.
    await expect(
      blockRow(page, ALCHEMIST, DECIMAL_BLOCK_KEY).locator('[data-block-warning]')
    ).toHaveCount(0);
  });

  test('approve, edit, and the badge falls back to mt-preview on its own', async ({ page }) => {
    await openFixtureModule(page, 'm68664');
    const fig = card(page, SCIMETHOD);
    const state = fig.locator('[data-figure-state]');

    // No review row and no state in the sidecar -> the day-one state.
    await expect(state).toHaveText('MT-PREVIEW');
    // The value must be the UNEDITED one, or the "changed" edit below could be a
    // no-op whose unmoved hash leaves the badge legitimately APPROVED.
    await expect(
      blockRow(page, SCIMETHOD, HYPOTHESIS_KEY).locator('[data-block-input]')
    ).toHaveValue(HYPOTHESIS_MT);

    await fig.locator('[data-figure-approve]').click();
    await expect(state).toHaveText('APPROVED');

    // THE POINT OF THE FEATURE. Changing a block after approval must revert the
    // badge with nothing stored to say so: the renderHash no longer matches the
    // blocks. A card that guessed locally would still read APPROVED here.
    const row = blockRow(page, SCIMETHOD, HYPOTHESIS_KEY);
    await row.locator('[data-block-input]').fill(HYPOTHESIS_EDIT);
    await row.locator('[data-block-save]').click();
    await expect(card(page, SCIMETHOD).locator('[data-figure-state]')).toHaveText('MT-PREVIEW');

    // And the edit round-trips through the server verbatim — the quote and the
    // '<' survive both the POST and the re-render.
    await expect(
      blockRow(page, SCIMETHOD, HYPOTHESIS_KEY).locator('[data-block-input]')
    ).toHaveValue(HYPOTHESIS_EDIT);

    // Approving the CHANGED text re-hashes it, so the badge sticks this time.
    await card(page, SCIMETHOD).locator('[data-figure-approve]').click();
    await expect(card(page, SCIMETHOD).locator('[data-figure-state]')).toHaveText('APPROVED');
  });

  test('flagging a figure shows its note', async ({ page }) => {
    await openFixtureModule(page, 'm68664');
    const fig = card(page, CHEMWEB);

    // `note` is returned by every figure payload and, before this assertion, was
    // bound by NO test — its removal would have silently emptied this card with
    // a green suite. It is only ever non-null once a review row exists, so the
    // E2E flow is the one place that can bind it.
    const NOTE = 'Röng þýðing á "Chemistry" — sjá <kafla 1>';
    await fig.locator('[data-figure-note-input]').fill(NOTE);
    await fig.locator('[data-figure-flag]').click();

    await expect(card(page, CHEMWEB).locator('[data-figure-state]')).toHaveText('FLAGGED');
    await expect(card(page, CHEMWEB).locator('[data-figure-note]')).toHaveText(NOTE);
  });

  test('a module whose figures have no sidecar shows no cards', async ({ page }) => {
    await openFixtureModule(page, 'm68664');
    await expect(page.locator('[data-figure-card]')).toHaveCount(3);

    // m68663's one figure has no sidecar, so it is not reviewable. This also
    // pins that the card container is CLEARED between modules — stale cards
    // would otherwise offer to approve a figure the open module does not have.
    await openFixtureModule(page, 'm68663');
    await expect(page.locator('[data-figure-card]')).toHaveCount(0);
  });
});
