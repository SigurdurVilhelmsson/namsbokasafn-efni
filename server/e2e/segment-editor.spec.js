// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Segment editor workflow tests.
 *
 * Tests the core segment editing flow:
 * - Page loads with chapter/module selectors
 * - Module list appears for a known book/chapter
 * - Segment table renders when a module is loaded
 */

test.describe('Segment editor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('editor page loads with book selector', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');

    // Should have book and chapter selects
    const bookSelect = page.locator('#book-select, select').first();
    await expect(bookSelect).toBeVisible();
  });

  test('selecting a book populates chapter dropdown', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');

    // Select "efnafraedi-2e" book
    const bookSelect = page.locator('#book-select');
    if (await bookSelect.isVisible()) {
      await bookSelect.selectOption('efnafraedi-2e');

      // Wait for chapter dropdown to populate
      const chapterSelect = page.locator('#chapter-select');
      await expect(chapterSelect).toBeVisible({ timeout: 5000 });

      // Chapters load via an async fetch after the book is selected, so poll
      // until options appear instead of counting once — a one-shot count
      // raced the fetch and flaked on slow CI runners (> 1 because the first
      // option is the placeholder).
      await expect
        .poll(() => chapterSelect.locator('option').count(), { timeout: 10000 })
        .toBeGreaterThan(1);
    }
  });

  test('loading a chapter shows module list', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');

    const bookSelect = page.locator('#book-select');
    if (await bookSelect.isVisible()) {
      await bookSelect.selectOption('efnafraedi-2e');

      const chapterSelect = page.locator('#chapter-select');
      await expect(chapterSelect).toBeVisible({ timeout: 5000 });

      // Select first chapter (usually "1")
      const options = chapterSelect.locator('option:not([value=""])');
      const firstValue = await options.first().getAttribute('value');
      if (firstValue) {
        await chapterSelect.selectOption(firstValue);

        // Module list should appear
        const moduleContainer = page.locator('#module-list, .module-list, .module-card').first();
        await expect(moduleContainer).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('no console errors during editor interaction', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/editor');
    await page.waitForLoadState('networkidle');

    // Give scripts time to initialize
    await page.waitForTimeout(1000);

    expect(errors).toEqual([]);
  });
});

/** Load the first module of efnafraedi-2e ch01 and open the first edit panel. */
async function openFirstEditor(page) {
  await page.goto('/editor');
  await page.waitForLoadState('networkidle');
  await page.locator('#book-select').selectOption('efnafraedi-2e');
  const chapterSelect = page.locator('#chapter-select');
  await expect(chapterSelect).toBeVisible({ timeout: 5000 });
  await expect
    .poll(() => chapterSelect.locator('option').count(), { timeout: 10000 })
    .toBeGreaterThan(1);
  const firstCh = await chapterSelect
    .locator('option:not([value=""])')
    .first()
    .getAttribute('value');
  await chapterSelect.selectOption(firstCh);
  await page.locator('.module-card').first().click();
  await expect(page.locator('.segment-row').first()).toBeVisible({ timeout: 10000 });
  await page.locator('.btn-edit').first().click();
  await expect(page.locator('.edit-panel.active textarea').first()).toBeVisible({ timeout: 5000 });
}

test.describe('B-4 marker overlay', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('opening the editor renders a marker backdrop that tracks input', async ({ page }) => {
    await openFirstEditor(page);
    const ta = page.locator('.edit-panel.active textarea').first();
    const wrap = ta.locator('xpath=ancestor::div[contains(@class,"editor-overlay-wrap")]');
    const backdrop = wrap.locator('.marker-backdrop');
    await expect(backdrop).toHaveCount(1);
    await ta.fill('próf [[MATH:1]] texti');
    await ta.dispatchEvent('input');
    await expect(backdrop.locator('.marker-hl-atom')).toHaveText('[[MATH:1]]');
  });
});

test.describe('B-4 Endurstilla revert button', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('Endurstilla reverts dirty content and keeps the panel open', async ({ page }) => {
    await openFirstEditor(page);
    const panel = page.locator('.edit-panel.active').first();
    const ta = panel.locator('textarea');
    const original = await ta.inputValue();
    await ta.fill(original + ' BREYTING-XYZ');
    await ta.dispatchEvent('input');
    await panel.locator('.btn-revert').click();
    await expect(ta).toHaveValue(original);
    await expect(panel).toBeVisible(); // panel stays open
  });
});

test.describe('B-4 renderMarkdownPreview bracket/brace family', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');
  });

  const render = (page, s) => page.evaluate((x) => window.renderMarkdownPreview(x), s);

  test('renders [[sub:]] and [[sup:]] as sub/sup', async ({ page }) => {
    expect(await render(page, 'H[[sub:2]]O')).toContain('<sub>2</sub>');
    expect(await render(page, 'Ca[[sup:2+]]')).toContain('<sup>2+</sup>');
  });

  test('renders [[i:]] and [[b:]] as em/strong', async ({ page }) => {
    expect(await render(page, '[[i:orð]]')).toContain('<em>orð</em>');
    expect(await render(page, '[[b:orð]]')).toContain('<strong>orð</strong>');
  });

  test('renders [[xref:text|id]] keeping the display text', async ({ page }) => {
    const out = await render(page, '[[xref:Mynd 5.2|CNX_Chem_05_02]]');
    expect(out).toContain('Mynd 5.2');
    expect(out).not.toContain('[[xref:'); // not raw
  });

  test('renders {{term}} and {{fn}} without leaving raw braces', async ({ page }) => {
    expect(await render(page, '{{term}}atóm{{/term}}')).not.toContain('{{term}}');
    expect(await render(page, '{{fn}}nóta{{/fn}}')).not.toContain('{{fn}}');
  });

  test('does not leave a no-text [[xref:id]] raw (ordering safe)', async ({ page }) => {
    const out = await render(page, 'Sjá [[xref:fs-idm222]] hér');
    expect(out).not.toContain('[[xref:fs-idm222]]');
  });

  test('EN pane renders the bracket family (not raw) like the IS pane', async ({ page }) => {
    // load a module without opening the edit panel
    await page.locator('#book-select').selectOption('efnafraedi-2e');
    const chapterSelect = page.locator('#chapter-select');
    await expect(chapterSelect).toBeVisible({ timeout: 5000 });
    await expect
      .poll(() => chapterSelect.locator('option').count(), { timeout: 10000 })
      .toBeGreaterThan(1);
    const firstCh = await chapterSelect
      .locator('option:not([value=""])')
      .first()
      .getAttribute('value');
    await chapterSelect.selectOption(firstCh);
    await page.locator('.module-card').first().click();
    await expect(page.locator('.segment-row').first()).toBeVisible({ timeout: 10000 });
    const joined = (await page.locator('.col-en').allInnerTexts()).join('\n');
    // ch01 EN content contains [[i:]] and [[MATH:]]; after rendering, the raw
    // bracket prefixes must not appear as literal text in the EN column.
    expect(joined).not.toContain('[[i:');
    expect(joined).not.toContain('[[sub:');
  });
});

test.describe('B-4 save-block revert hint', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('corrupting a structural marker shows a block message with a revert hint', async ({
    page,
  }) => {
    // Load m68667 from efnafraedi-2e ch01 — corpus-confirmed to have [[MATH:N]] segments.
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');
    await page.locator('#book-select').selectOption('efnafraedi-2e');
    const chapterSelect = page.locator('#chapter-select');
    await expect(chapterSelect).toBeVisible({ timeout: 5000 });
    await expect
      .poll(() => chapterSelect.locator('option').count(), { timeout: 10000 })
      .toBeGreaterThan(1);
    // ch01 is the first option
    const firstCh = await chapterSelect
      .locator('option:not([value=""])')
      .first()
      .getAttribute('value');
    await chapterSelect.selectOption(firstCh);
    // Open m68667 specifically (has [[MATH:N]] markers)
    await page.locator('.module-card[title^="m68667"]').click();
    await expect(page.locator('.segment-row').first()).toBeVisible({ timeout: 10000 });

    // Find a segment row whose EN cell renders a math placeholder — guaranteed in m68667
    const mathRow = page
      .locator('.segment-row')
      .filter({ has: page.locator('.col-en .math-placeholder') })
      .first();
    await expect(mathRow).toBeVisible({ timeout: 5000 });

    // Open its edit panel
    await mathRow.locator('.btn-edit').click();
    const panel = mathRow.locator('.edit-panel.active');
    await expect(panel.locator('textarea')).toBeVisible({ timeout: 5000 });

    // Replace IS content with text that omits the [[MATH:N]] marker
    const ta = panel.locator('textarea');
    await ta.fill('texti án stærðfræðimerkis');
    await ta.dispatchEvent('input');

    // Capture the dialog BEFORE clicking Vista
    let dialogMessage = '';
    page.once('dialog', async (d) => {
      dialogMessage = d.message();
      await d.accept();
    });
    await panel.locator('.btn-primary').click();

    // The block MUST have fired (m68667 has [[MATH:N]] markers that are required)
    expect(dialogMessage).not.toBe('');
    expect(dialogMessage).toContain('Ekki hægt að vista');
    expect(dialogMessage).toContain('Endurstilla');
  });
});

test.describe('B-1 Icelandic section title in editor header', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('module GET returns the translated section title', async ({ page }) => {
    // m68664 (efnafraedi-2e ch01) has a translated title segment: "Efnafræði í samhengi"
    const res = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68664');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.titleIs).toBe('Efnafræði í samhengi');
  });

  test('editor header shows the Icelandic title, not the module id', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');
    await page.locator('#book-select').selectOption('efnafraedi-2e');
    const chapterSelect = page.locator('#chapter-select');
    await expect(chapterSelect).toBeVisible({ timeout: 5000 });
    await expect
      .poll(() => chapterSelect.locator('option').count(), { timeout: 10000 })
      .toBeGreaterThan(1);
    await chapterSelect.selectOption('1');
    // Open the m68664 module card specifically
    await page.locator('.module-card[onclick*="m68664"]').click();
    await expect(page.locator('#module-title')).toContainText('Efnafræði í samhengi', {
      timeout: 10000,
    });
    await expect(page.locator('#module-title')).not.toContainText('Chemistry in Context');
  });
});

test.describe('E2E fixture book', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('fixture book module loads with segments', async ({ page }) => {
    const res = await page.request.get('/api/segment-editor/__e2e-fixture__/1/m68664');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.moduleId).toBe('m68664');
    expect(Array.isArray(body.segments)).toBe(true);
    expect(body.segments.length).toBeGreaterThan(0);
  });
});

test.describe('O segment propagation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('preview returns occurrences for a recurring objectives intro', async ({ page }) => {
    // m68664 ch01 segment auto-2 is the "By the end of this section…" abstract,
    // which recurs across chapter intro modules.
    const res = await page.request.get(
      '/api/segment-editor/efnafraedi-2e/1/m68664/propagation-preview?segmentId=' +
        encodeURIComponent('m68664:abstract:auto-2')
    );
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('eligible');
    expect(body).toHaveProperty('skipped');
    expect(Array.isArray(body.eligible)).toBe(true);
    // the EN recurs, so at least one occurrence (eligible or skipped) exists
    expect(body.eligible.length + body.skipped.length).toBeGreaterThan(0);
  });

  test('preview classifies against saved pending edit, not stale file text (bug O-crit)', async ({
    page,
  }) => {
    // Discriminating regression test for the critical bug: preview used seg.is
    // (file text) while propagate used the saved pending edit.  When the editor
    // saves a unique translation the file is NOT updated, so preview would see
    // every occurrence as already-matches (if file text matched) or conflict
    // (if a prior E2E propagate run left pending edits).  Either way eligible=0.
    // After the fix, preview reads the latest non-rejected edit from the SOURCE
    // segment, so occurrences that differ from that text become eligible.
    //
    // ORDERING NOTE: this test must run BEFORE the "propagate endpoint" sibling
    // below.  The propagate test writes [e2e-propagation-test] pending edits onto
    // all occurrence segments; once those edits exist, occurrences classify as
    // 'conflict' (not 'eligible') and this test would see eligible=0.  With a
    // fresh throwaway DB per run there are no cross-run leftovers, but within-run
    // ordering still matters.

    const uniqueText = `Markmiðstexti ${Date.now()}`;

    // Step 1: save a unique translation as a pending edit on the SOURCE segment.
    const editRes = await page.request.post('/api/segment-editor/efnafraedi-2e/1/m68664/edit', {
      data: {
        segmentId: 'm68664:abstract:auto-2',
        originalContent: '',
        editedContent: uniqueText,
        category: 'readability',
        editorNote: 'e2e-critfix-O',
      },
    });
    expect(editRes.ok(), `edit POST failed: ${editRes.status()}`).toBe(true);

    // Step 2: fetch propagation preview — must see eligible > 0.
    // Under the bug: propagatedText = seg.is (stale file text, e.g. "Í lok þessa
    //   kafla…"); occurrence currentIs also = that stale text → already-matches →
    //   eligible = 0.
    // After the fix: propagatedText = latestEditedText = uniqueText (the just-saved
    //   pending edit); occurrence currentIs = stale file text → eligible → eligible > 0.
    const previewRes = await page.request.get(
      '/api/segment-editor/efnafraedi-2e/1/m68664/propagation-preview?segmentId=' +
        encodeURIComponent('m68664:abstract:auto-2')
    );
    expect(previewRes.ok(), `preview GET failed: ${previewRes.status()}`).toBe(true);
    const preview = await previewRes.json();

    expect(Array.isArray(preview.eligible), 'eligible must be an array').toBe(true);
    expect(Array.isArray(preview.skipped), 'skipped must be an array').toBe(true);

    // The unique text (per-run timestamp) cannot appear in ANY occurrence's file
    // text.  Therefore every occurrence must be eligible — none already-matches.
    //
    // Under the bug: propagatedText = seg.is (stale file text, shared by many
    //   occurrences) → occurrences whose IS text equals the stale source text
    //   classify as already-matches instead of eligible.
    // After the fix: propagatedText = latestEditedText (the unique saved edit) →
    //   no occurrence can match → ALL occurrences are eligible (or conflict if a
    //   prior test left a different pending edit, but none here after cleanup).
    const alreadyMatches = preview.skipped.filter((s) => s.reason === 'already-matches');
    expect(
      alreadyMatches.length,
      `expected 0 already-matches but got ${alreadyMatches.length} — ` +
        `bug present: preview used stale file text so occurrences sharing the old IS text were skipped`
    ).toBe(0);
    // And at least some eligible (sanity: the EN recurs across the book).
    expect(preview.eligible.length, `expected eligible > 0 but got 0`).toBeGreaterThan(0);
  });

  test('propagate endpoint is wired end-to-end and returns created/skipped', async ({ page }) => {
    // End-to-end wiring check. The deterministic "creates edits for eligible /
    // skips conflicts" logic is covered by propagationService unit tests; this
    // asserts the route is reachable and returns the right shape regardless of
    // current DB state (eligible counts vary within a run — assert the contract,
    // not a count, so it never silently skips).
    // NOTE: this test writes [e2e-propagation-test] pending edits onto occurrence
    // segments, making them 'conflict' for subsequent previews.  It runs LAST
    // within this describe block deliberately (see O-crit test above).
    const res = await page.request.post('/api/segment-editor/efnafraedi-2e/1/m68664/propagate', {
      data: {
        segmentId: 'm68664:abstract:auto-2',
        editedContent: 'Þegar þú hefur lokið þessum hluta [e2e-propagation-test]',
        category: 'readability',
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.created)).toBe(true);
    expect(Array.isArray(body.skipped)).toBe(true);
    // Every occurrence is accounted for as either created or skipped.
    expect(body.created.length + body.skipped.length).toBeGreaterThan(0);
  });
});

test.describe('§0.1 live-preview guards', () => {
  test('§0.1a preview of a real module renders expected HTML', async ({ page }) => {
    await loginAs(page, 'editor');
    const resp = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68664/preview');
    // m68664.cnxml (mt-preview track) is tracked in git, so it exists on any
    // fresh clone — hard-pin 200, not just "not 400" (that also passed for a
    // broken-renderer 500). Confirm the body is genuinely rendered HTML, not
    // just a 200 with an empty/error payload.
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type']).toContain('text/html');
    const body = await resp.text();
    expect(body).toContain('<article class="cnx-module');
    expect(body).toContain('data-module-id="m68664"');
  });

  test('§0.1b traversal track query is rejected 400', async ({ page }) => {
    await loginAs(page, 'editor');
    const resp = await page.request.get(
      '/api/segment-editor/efnafraedi-2e/1/m68664/preview?track=..%2F..%2F..%2Fetc%2Fpasswd'
    );
    expect(resp.status()).toBe(400);
  });

  test('§0.1c malformed module id is rejected 400', async ({ page }) => {
    await loginAs(page, 'editor');
    const resp = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m123/preview');
    expect(resp.status()).toBe(400); // fails ^(m\d{5}|chapter-metadata)$
  });
});
