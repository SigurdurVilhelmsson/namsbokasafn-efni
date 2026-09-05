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
/** What decimalSeparatorWarnings computes from the above — the ONE owner of the rule. */
const DECIMAL_BLOCK_SUGGESTED = 'Hiti ofns 37,5 C';

/**
 * The correction an editor types. Carries a double quote and an angle bracket on
 * purpose: a card that builds `value="${text}"` inside an innerHTML string
 * truncates at the quote and injects at the '<'. Asserting the value ROUND-TRIPS
 * is what distinguishes a working card from one that merely renders an element.
 */
const DECIMAL_BLOCK_EDIT = 'Hiti ofns 37,5 C "gæði" <b>';

/**
 * ALCHEMIST's OTHER block — the sibling whose typing a save used to destroy.
 *
 * It is typed into and never saved, so it writes no figure_block_edit row and
 * leaves the sidecar pristine. That is what lets it share ALCHEMIST with the
 * decimal flow without breaking the one-figure-per-MUTATING-test rule, and what
 * keeps the first test's "asserted on a block NO test edits" guarantee true.
 */
const SIBLING_KEY = "Alchemist's workshop";
const SIBLING_MT = 'Verkstæði gullgerðarmanns';
const SIBLING_EDIT = 'Verkstæði gullgerðarmanns "í vinnslu" <b>';

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

  /**
   * The card shows the figure it is about ([USER] ruling A, 2026-09-04).
   *
   * Read-only, so it is exempt from the one-figure-per-test rule above.
   *
   * The fixture maps exactly ONE of the three figures
   * (books/__e2e-fixture__/media/image-mapping.json names ALCHEMIST only), which
   * makes this a two-sided measurement in one test: the mapped figure must show
   * an image and the two unmapped ones must show NOTHING. A card that rendered
   * an <img> unconditionally, and a client that rendered none at all, each fail
   * exactly one half — neither can pass both.
   */
  test('shows the translated figure, and only where one exists', async ({ page }) => {
    await openFixtureModule(page, 'm68664');

    const image = card(page, ALCHEMIST).locator('[data-figure-image]');
    await expect(image).toHaveCount(1);

    // The URL is the SERVER's — the client is forbidden from assembling one —
    // so assert the whole path, not just that some src is present.
    const src = await image.getAttribute('src');
    expect(src).toBe(`/api/segment-editor/__e2e-fixture__/1/m68664/figures/${ALCHEMIST}/image`);

    // ...and the route really serves the bytes. A 200 with a real SVG body is
    // the only thing that distinguishes a working <img> from a broken one:
    // Playwright reports a 404'd image as present and visible either way.
    const img = await page.request.get(src);
    expect(img.status()).toBe(200);
    expect(await img.text()).toContain('<svg');

    // The other half. These two have sidecars (their cards are here) but no
    // mapping entry, so they legitimately have no picture — and must render no
    // element rather than a broken one.
    for (const basename of [CHEMWEB, SCIMETHOD]) {
      await expect(card(page, basename).locator('[data-figure-image]')).toHaveCount(0);
    }
  });

  /**
   * ⑭ NUMBER LOCALIZATION, as the one-click editorial action [USER] ruled on
   * 2026-09-04. Icelandic writes `37.5` as `37,5`; the advisory check already
   * computed that string, and this is the path that applies it.
   *
   * ⚠️ One figure per mutating test, so this covers the WHOLE decimal flow on
   * ALCHEMIST rather than adding a fourth mutating test: warning → guard →
   * apply → cleared → a hand edit still round-trips. Applying the suggestion IS
   * a correction, so it subsumes the manual correction this test used to make.
   */
  test('a decimal warning is applied in one click, and the guard protects unsaved typing', async ({
    page,
  }) => {
    await openFixtureModule(page, 'm68664');
    const row = blockRow(page, ALCHEMIST, DECIMAL_BLOCK_KEY);
    const input = row.locator('[data-block-input]');
    const apply = row.locator('[data-block-apply]');

    // Precondition, stated rather than assumed: the block still holds the
    // UNCORRECTED MT text. Without this, a leaked edit from an earlier test
    // would make the warning legitimately absent and the assertions below would
    // read as a card defect.
    await expect(input).toHaveValue(DECIMAL_BLOCK_MT);

    // The suggestion is the payload's own value, so this fails if the card drops
    // warnings OR renders the wrong field of one.
    await expect(row.locator('[data-block-warning]')).toHaveCount(1);
    await expect(row.locator('[data-block-warning]')).toContainText(DECIMAL_BLOCK_SUGGESTED);

    // THE GUARD. The suggestion was computed server-side from the SAVED text, so
    // once the editor types, applying it would silently discard that typing.
    // Both directions: enabled on pristine input is the control — without it,
    // "disabled after typing" would also pass for a button disabled always.
    await expect(apply).toBeEnabled();
    await input.fill('Hiti ofns 37.5 C — í vinnslu');
    await expect(apply).toBeDisabled();
    await input.fill(DECIMAL_BLOCK_MT);
    await expect(apply).toBeEnabled();

    // Apply. The VALUE is what matters: a control that merely saved the input
    // unchanged would clear no warning and leave 37.5 in place.
    await apply.click();
    const after = blockRow(page, ALCHEMIST, DECIMAL_BLOCK_KEY);
    await expect(after.locator('[data-block-input]')).toHaveValue(DECIMAL_BLOCK_SUGGESTED);

    // Re-fetched, so the warning list is recomputed server-side from the saved
    // text — and the corrected text produces none.
    await expect(after.locator('[data-block-warning]')).toHaveCount(0);
    await expect(after.locator('[data-block-apply]')).toHaveCount(0);

    // A hand edit still round-trips verbatim through the POST and the re-render:
    // this value carries a double quote and a '<' on purpose, so a card that
    // built `value="${text}"` inside an innerHTML string would truncate or inject.
    await after.locator('[data-block-input]').fill(DECIMAL_BLOCK_EDIT);

    // 🔴 SIBLING SURVIVAL. Saving one block re-fetches the module's figures and
    // rebuilds EVERY card from the payload, which used to destroy text typed
    // into any other block — silently, with no warning and no draft.
    //
    // Typed and deliberately NEVER saved, which is what keeps this free of the
    // one-figure-per-mutating-test rule: no row is written for this block and
    // the sidecar is untouched, so the first test's "a block NO test edits"
    // guarantee still holds and this adds no cross-test leak.
    const sibling = blockRow(page, ALCHEMIST, SIBLING_KEY).locator('[data-block-input]');
    await expect(sibling).toHaveValue(SIBLING_MT); // precondition, stated
    await sibling.fill(SIBLING_EDIT);

    // ⚠️ SYNCHRONISE ON THE RE-FETCH, NOT ON THE SAVE. Every assertion below is
    // ALREADY TRUE the instant before the click — the text is in the input and
    // the marker is set by typing — so asserting straight after the click would
    // pass against a card that never rebuilt at all, which is precisely the bug.
    // loadFigures GETs /figures after the POST resolves; that response is the
    // only observable that the rebuild has actually happened.
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/m68664/figures') &&
          r.request().method() === 'GET' &&
          r.status() === 200
      ),
      after.locator('[data-block-save]').click(),
    ]);

    // The saved block takes the SERVER's value...
    await expect(
      blockRow(page, ALCHEMIST, DECIMAL_BLOCK_KEY).locator('[data-block-input]')
    ).toHaveValue(DECIMAL_BLOCK_EDIT);

    // ...and the sibling keeps what the editor typed, MARKED as unsaved. Both
    // halves are needed: the value alone cannot tell "carried across the rebuild"
    // from "the rebuild never ran", and the marker is what makes the state
    // visible instead of something the editor has to remember.
    const siblingAfter = blockRow(page, ALCHEMIST, SIBLING_KEY);
    await expect(siblingAfter.locator('[data-block-input]')).toHaveValue(SIBLING_EDIT);
    await expect(siblingAfter).toHaveAttribute('data-block-unsaved', '');

    // CONTROL: the block that WAS saved must not be marked unsaved, or the
    // marker would mean nothing — everything would carry it after every save.
    //
    // ⚠️ The one-argument form asserts ABSENCE. `not.toHaveAttribute(name, '')`
    // reads the same but only denies that exact VALUE, so a stray
    // data-block-unsaved="x" would sail through the control.
    await expect(blockRow(page, ALCHEMIST, DECIMAL_BLOCK_KEY)).not.toHaveAttribute(
      'data-block-unsaved'
    );
  });

  /**
   * Stand in for compose.py, which copies the sidecar's own renderHash into
   * composedHash after it writes the artwork ([USER] ruling C, 2026-09-04).
   *
   * ⚠️ It COPIES; it never hashes. Recomputing here would put a second
   * implementation of computeRenderHash in a THIRD language-site and make this
   * test capable of agreeing with itself while disagreeing with production.
   */
  function stampComposed(basename) {
    const side = JSON.parse(fs.readFileSync(sidecarFile(basename), 'utf-8'));
    expect(side.renderHash, 'nothing to stamp — was the figure approved?').toBeTruthy();
    fs.writeFileSync(
      sidecarFile(basename),
      `${JSON.stringify({ ...side, composedHash: side.renderHash }, null, 1)}\n`,
      'utf-8'
    );
  }

  test('approve, compose, edit — and the badge falls back to mt-preview on its own', async ({
    page,
  }) => {
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

    // 🔴 APPROVING ALONE DOES NOT TURN THE BADGE GREEN, and that is the ruling,
    // not a defect: nothing in this server runs the composer, so the published
    // SVG still carries the pre-approval text.
    //
    // ⚠️ WAIT ON THE RESPONSE, NOT ON THE BADGE. The badge reads MT-PREVIEW
    // BEFORE and AFTER this click — that is exactly what ruling C introduced —
    // so `expect(state).toHaveText('MT-PREVIEW')` cannot fail and therefore
    // synchronises nothing. Used as a wait it let stampComposed() read the
    // sidecar before applyApprovedFigureEdits had written renderHash, which is
    // a race that passed locally and failed in CI. An assertion that is true on
    // both sides of an action is not a synchronisation point.
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/figures/${SCIMETHOD}/state`) && r.request().method() === 'POST'
      ),
      fig.locator('[data-figure-approve]').click(),
    ]);
    await expect(state).toHaveText('MT-PREVIEW');

    // Compose, and only then does it go green. This is the CONTROL for the
    // assertion above: without it, "approving yields MT-PREVIEW" would be
    // equally consistent with an approval path that is simply broken.
    stampComposed(SCIMETHOD);
    await openFixtureModule(page, 'm68664');
    await expect(card(page, SCIMETHOD).locator('[data-figure-state]')).toHaveText('APPROVED');

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

    // Re-approving the CHANGED text re-hashes it — and the composedHash carried
    // forward from the first compose is now STALE, so the badge correctly stays
    // amber until the artwork is composed again. Same response wait, same
    // reason: MT-PREVIEW on both sides of the click.
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/figures/${SCIMETHOD}/state`) && r.request().method() === 'POST'
      ),
      card(page, SCIMETHOD).locator('[data-figure-approve]').click(),
    ]);
    await expect(card(page, SCIMETHOD).locator('[data-figure-state]')).toHaveText('MT-PREVIEW');

    stampComposed(SCIMETHOD);
    await openFixtureModule(page, 'm68664');
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
