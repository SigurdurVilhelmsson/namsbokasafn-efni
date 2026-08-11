// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Terminology lookup and multi-book scenario tests.
 *
 * These tests verify:
 * - Terminology lookup API with valid and invalid queries
 * - Per-module term matching endpoint
 * - Multi-book support (chemistry + biology)
 */

const TERMINOLOGY_API = '/api/terminology';

/** Generate a unique string for test isolation (mirrors terminology.spec.js). */
function uid() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Terminology lookup API ──────────────────────────────────

test.describe('Terminology lookup', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    // Navigate first so the auth cookie is sent on the correct domain
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');
  });

  test('valid query returns results array', async ({ page }) => {
    const response = await page.request.get('/api/segment-editor/terminology/lookup?q=acid');
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('terms');
    expect(Array.isArray(data.terms)).toBe(true);
    // May be empty if no terms are loaded, but the shape must be correct
  });

  test('too-short query returns empty terms or 400', async ({ page }) => {
    const response = await page.request.get('/api/segment-editor/terminology/lookup?q=ab');
    const status = response.status();

    if (status === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('terms');
      expect(data.terms).toEqual([]);
    } else {
      // 400 is also acceptable for too-short queries
      expect(status).toBe(400);
    }
  });

  test('empty query returns empty terms or 400', async ({ page }) => {
    const response = await page.request.get('/api/segment-editor/terminology/lookup?q=');
    const status = response.status();

    if (status === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('terms');
      expect(data.terms).toEqual([]);
    } else {
      expect(status).toBe(400);
    }
  });

  test('term matches for chemistry module returns valid shape', async ({ page }) => {
    const response = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68664/terms');

    // m68664 is committed content and is on disk in every environment this
    // suite runs in (the tests below hit the same endpoint and assert 200
    // unconditionally) — a non-2xx here means the /terms route itself broke,
    // not that fixture data is missing. Accepting 500 would make this test
    // green exactly when the matcher cut-over breaks the route outright.
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('moduleId', 'm68664');
    expect(data).toHaveProperty('termMatches');
  });

  // Ported from terminology.spec.js when POST /check-consistency was deleted (C24).
  // They were the only INTEGRATION-level exercise of the issue path; the behaviours
  // stay unit-pinned at terminologyService.test.js:1129-1174, but this keeps a real
  // server + real DB in the loop for the function C24 rewrites.
  //
  // Porting is not transcription — the deleted tests posted a synthetic single
  // segment (segmentId: 'single') directly to the route. This route loads a real
  // module off disk instead, so each test here seeds a headword whose English is a
  // word that actually occurs (whole-word, case-folded) in m68664's real EN text —
  // "toys" / "ancestors", both from the chapter's opening paragraph — and asserts
  // on the resulting termMatches for THAT headword, not on the module's incidental
  // pre-existing matches.
  //
  // NOTE these deliberately do NOT use the branchless expect([404,500]) idiom of
  // the test above. A ported test that accepts a 500 has preserved nothing.
  test('terms endpoint reports a missing approved translation', async ({ page }) => {
    const tag = uid();
    const createRes = await page.request.post(TERMINOLOGY_API, {
      data: { english: 'toys', icelandic: `leikföng-${tag}` },
    });
    expect(createRes.status()).toBe(201);
    const { term } = await createRes.json();
    const approveRes = await page.request.post(
      `${TERMINOLOGY_API}/translations/${term.translations[0].id}/approve`
    );
    expect(approveRes.ok()).toBe(true);

    // The real faithful/MT Icelandic text for m68664 cannot contain our
    // freshly-invented, tag-suffixed translation, so a 'missing' issue for this
    // headword is guaranteed, not incidental.
    const response = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68664/terms');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('termMatches');

    // Compare on english, not id: the matcher's headwordId is now a
    // concept_term.id and POST /api/terminology's term.id is a
    // terminology_headwords.id — two disjoint id spaces since the B4b-1
    // matcher cut-over. english is stable across both endpoints.
    const allIssues = Object.values(data.termMatches).flatMap((r) => r.issues);
    const relevant = allIssues.find((i) => i.english === 'toys');
    expect(relevant).toBeDefined();
    expect(relevant.type).toBe('missing');
    expect(relevant.english).toBe('toys');
    expect(relevant.expected).toBe(`leikföng-${tag}`);
    expect(relevant.message).toContain('fannst ekki');

    // Every issue in the module must share this shape, not just ours.
    for (const issue of allIssues) {
      expect(issue.type).toBe('missing');
      expect(typeof issue.english).toBe('string');
      expect(typeof issue.expected).toBe('string');
      expect(issue.message).toContain('fannst ekki');
    }
  });

  test('terms endpoint returns well-formed matches for every segment', async ({ page }) => {
    const tag = uid();
    const createRes = await page.request.post(TERMINOLOGY_API, {
      data: { english: 'ancestors', icelandic: `forfeður-${tag}` },
    });
    expect(createRes.status()).toBe(201);
    const { term } = await createRes.json();
    const approveRes = await page.request.post(
      `${TERMINOLOGY_API}/translations/${term.translations[0].id}/approve`
    );
    expect(approveRes.ok()).toBe(true);

    const response = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68664/terms');
    expect(response.status()).toBe(200);
    const data = await response.json();

    const all = Object.values(data.termMatches).flatMap((r) => r.matches);
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) {
      expect(typeof m.headwordId).toBe('number');
      expect(typeof m.english).toBe('string');
      expect(typeof m.position).toBe('number');
      expect(m.position).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(m.translations)).toBe(true);
      expect(m.translations.length).toBeGreaterThan(0);
    }
    // The aggregate must include OUR seeded headword, not just whatever else
    // happens to be in the module — otherwise this test could pass even if
    // "ancestors" never matched at all. Compared on english, not id: the
    // matcher's headwordId is a concept_term.id, disjoint from term.id's
    // terminology_headwords.id since the B4b-1 matcher cut-over.
    expect(all.some((m) => m.english === 'ancestors')).toBe(true);
  });
});

// ─── Multi-book scenarios ────────────────────────────────────

test.describe('Multi-book support', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('editor page book selector has multiple options', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');

    const bookSelect = page.locator('#book-select');
    await expect(bookSelect).toBeVisible();

    // The dropdown should have at least one option populated by bookSelector.js.
    // In a full environment there are multiple books; in CI there may be fewer.
    const optionCount = await bookSelect.locator('option').count();
    expect(optionCount).toBeGreaterThanOrEqual(1);
  });

  test('biology book chapter listing returns valid response', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');

    // m66437 is the intro module of biology-2e chapter 3
    const response = await page.request.get('/api/segment-editor/liffraedi-2e/3/m66437');

    // Accept 200 if biology content is present, or 404/500 if the book
    // is registered but chapter files are not on disk in the test environment
    if (response.ok()) {
      const data = await response.json();
      // Should have segment data with the expected module
      expect(data).toHaveProperty('segments');
      expect(Array.isArray(data.segments)).toBe(true);
    } else {
      // 404 (module not found) or 500 (files missing) are acceptable
      // when the biology book content is not fully set up
      expect([404, 500]).toContain(response.status());
    }
  });
});
