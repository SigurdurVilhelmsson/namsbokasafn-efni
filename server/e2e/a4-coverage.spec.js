// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * A4 manual-QA coverage — automated regression tests for the checklist items
 * in docs/plans/2026-06-10-qa-checklist.md that are cheap to pin as E2E.
 *
 * §0.4a — stored XSS in a terminology `source` renders inert.
 *
 * `source` is free text: the create-term UI only offers it via a fixed
 * `<select>` (server/views/terminology.html), but the API applies no
 * server-side enum restriction (see createTerm/addTranslation in
 * server/services/terminologyService.js) — so an arbitrary string, including
 * markup, lands in the DB unmodified. The real render surface is the
 * terminology list: `searchTerms()` builds each `.term-card` and inserts
 * `formatSource(primarySource)` (server/views/terminology.html) into
 * `.term-source`'s innerHTML; `formatSource` delegates unknown values to the
 * shared `escapeHtml` (server/public/js/htmlUtils.js). This test proves that
 * path renders the payload as inert escaped text — never as a live element —
 * by both reading the actual rendered DOM and probing the render helper
 * directly.
 */
test.describe('§0.4a stored-XSS in a term source renders inert', () => {
  const uid = `e2e-xss-${Date.now()}`;
  const PAYLOAD = `</script><img src=x onerror="window.__xss_fired=true">`;
  let termId;

  test.afterEach(async ({ page }) => {
    if (termId) {
      try {
        await page.request.delete(`/api/terminology/${termId}`);
      } catch {
        /* best effort cleanup */
      }
      termId = null;
    }
  });

  test('§0.4a payload in source is escaped, no script executes', async ({ page }) => {
    await loginAs(page, 'admin');

    // Create a term whose translation `source` carries the XSS payload —
    // only reachable via the API (the UI's own form is a closed <select>).
    const res = await page.request.post('/api/terminology/', {
      data: {
        english: `${uid}-en`,
        icelandic: `${uid}-is`,
        source: PAYLOAD,
        subjects: ['chemistry'],
      },
    });
    expect(res.status()).toBe(201);
    termId = (await res.json()).term.id;

    let dialogFired = false;
    page.on('dialog', async (d) => {
      dialogFired = true;
      await d.dismiss();
    });

    // Load the real terminology list page — the actual render surface for
    // `source` (searchTerms() -> formatSource() -> escapeHtml() -> .term-source).
    await page.goto('/terminology');
    await page.waitForLoadState('networkidle');

    // Search for the created term so it appears in #terms-body.
    await page.fill('#search-input', `${uid}-en`);
    await page.click('.search-section .btn-primary');

    const card = page.locator('.term-card', { hasText: `${uid}-en` });
    await expect(card).toBeVisible();

    const sourceEl = card.locator('.term-source');
    await expect(sourceEl).toBeVisible();

    // Rendered as inert text: the raw markup shows up escaped, not as a live <img>.
    const sourceHtml = await sourceEl.innerHTML();
    expect(sourceHtml).not.toContain('<img');
    expect(sourceHtml).toContain('&lt;'); // proof of escaping
    // No actual <img> element was created inside the rendered source cell.
    await expect(sourceEl.locator('img')).toHaveCount(0);

    // Direct probe of the render helper too (same escaping the list uses on
    // this page; formatSource is defined in terminology.html's inline script
    // and falls through to escapeHtml for unmapped source values).
    const rendered = await page.evaluate((src) => {
      const fn = window.formatSource || window.escapeHtml;
      return fn ? fn(src) : null;
    }, PAYLOAD);
    expect(rendered, 'client render helper must exist').not.toBeNull();
    expect(rendered).not.toContain('<img');
    expect(rendered).toContain('&lt;');

    // No side effects: the injected script never ran, no dialog was spawned.
    expect(await page.evaluate(() => window.__xss_fired)).toBeFalsy();
    expect(dialogFired).toBe(false);
  });
});
