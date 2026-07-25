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

/**
 * §5a — page-auth: an anonymous browser hitting `/admin` (requirePageAuth →
 * ADMIN, server/routes/views.js) must be redirected to `/login` server-side
 * before any admin markup is ever sent — never a client-side-only guard that
 * flashes the admin shell before redirecting.
 *
 * §sweep — a console-error tripwire across the main authenticated editor
 * surfaces. Any `pageerror` or `console.error` here is a genuine page bug the
 * manual QA sweep would have caught; the assertion must not be weakened to
 * paper over a real finding.
 */
test.describe('§5a page-auth + console sweep', () => {
  test('§5a anon /admin redirects to login, no admin DOM painted', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: 'http://localhost:3456' });

    // Transport-level: requirePageAuth must 302 an anon GET /admin to /login
    // BEFORE any admin markup is ever written to the response body — proves a
    // flash is impossible (a client-side-only guard would instead 200 with
    // admin.html and redirect from JS, which the assertions below would catch).
    const resp = await context.request.get('/admin', { maxRedirects: 0 });
    expect(resp.status()).toBe(302);
    expect(resp.headers()['location']).toContain('/login');
    const body = await resp.text();
    // data-tab="users" is admin.html-only markup (server/views/admin.html) —
    // absent from login.html and every other view.
    expect(body).not.toContain('data-tab="users"');

    // Browser-level: the anon user actually lands on /login.
    const anon = await context.newPage();
    await anon.goto('/admin');
    await anon.waitForLoadState('networkidle');
    expect(anon.url()).toContain('/login');

    await context.close();
  });

  test('§sweep no console/page errors across editor surfaces', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    await loginAs(page, 'admin');
    for (const route of ['/editor', '/localization', '/library', '/admin']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
    }
    expect(errors).toEqual([]);
  });
});

/**
 * §4c — pipeline/apply controls are role-gated: `/editor`'s `#pipeline-panel`
 * and `#apply-panel` are shown only for head-editor/admin (client
 * `showPipelinePanel`/`showApplyPanel` in server/public/js/segment-editor.js,
 * gated on `getEffectiveRole()`; default `display:none` in the markup).
 *
 * This is read-only navigation — loading a module and reading panel
 * visibility depends on ROLE, not module content, so it carries no
 * fixture-mutation collision with the writer specs that also touch m68664.
 *
 * Both directions are asserted: hidden for `editor` (least-privilege), and
 * at least one panel visible for `head-editor` (role-sensitivity proof — so
 * the assertion isn't vacuously "always hidden").
 */
test.describe('§4c pipeline/apply controls are role-gated', () => {
  test('§4c editor does not see pipeline/apply panels', async ({ page }) => {
    await loginAs(page, 'editor');
    await page.goto('/editor?book=efnafraedi-2e&chapter=1&module=m68664');
    await page.waitForLoadState('networkidle');
    // Panel visibility is decided synchronously inside loadModule() right
    // after renderModule(), so waiting for the rendered segment list proves
    // the module (and therefore the panel gating) has finished loading.
    await expect(page.locator('.segment-row').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#pipeline-panel')).toBeHidden();
    await expect(page.locator('#apply-panel')).toBeHidden();
  });

  test('§4c head-editor DOES see them (role-sensitivity proof)', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await page.goto('/editor?book=efnafraedi-2e&chapter=1&module=m68664');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.segment-row').first()).toBeVisible({ timeout: 10000 });
    // opening a module triggers showApplyPanel/showPipelinePanel for privileged roles
    await expect(page.locator('#pipeline-panel, #apply-panel').first()).toBeVisible({
      timeout: 10000,
    });
  });
});
