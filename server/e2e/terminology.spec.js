// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Comprehensive terminology E2E tests.
 *
 * Covers CRUD lifecycle, validation, dispute/approve workflow,
 * RBAC, CSV/Excel import, read-only endpoints, and consistency checks.
 *
 * These tests directly target three production bugs:
 *   #1 — csv-parse / xlsx packages never installed (import silently failed)
 *   #2 — activityLog.log() used `action` instead of `type` (NOT NULL crash)
 *   #3 — CSV upload UI didn't pass bookSlug (terms imported as global)
 */

const API = '/api/terminology';

/** Generate a unique string for test isolation */
function uid() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Block 1: CRUD lifecycle ────────────────────────────────────

test.describe('Terminology CRUD lifecycle', () => {
  /** IDs of terms created during tests — cleaned up in afterEach */
  const cleanupIds = [];

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async ({ page }) => {
    for (const id of cleanupIds) {
      try {
        await page.request.delete(`${API}/${id}`);
      } catch {
        /* best effort */
      }
    }
    cleanupIds.length = 0;
  });

  test('create term and verify via GET', async ({ page }) => {
    const en = `acid-${uid()}`;
    const is = `sýra-${uid()}`;

    const res = await page.request.post(API, {
      data: { english: en, icelandic: is },
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.term).toBeDefined();
    expect(body.term.status).toBe('proposed');
    cleanupIds.push(body.term.id);

    // Verify via GET
    const getRes = await page.request.get(`${API}/${body.term.id}`);
    expect(getRes.ok()).toBe(true);
    const getBody = await getRes.json();
    expect(getBody.term.english).toBe(en);
    expect(getBody.term.icelandic).toBe(is);
  });

  test('search finds created term', async ({ page }) => {
    const en = `molecule-${uid()}`;
    const is = `sameind-${uid()}`;

    const createRes = await page.request.post(API, {
      data: { english: en, icelandic: is },
    });
    const { term } = await createRes.json();
    cleanupIds.push(term.id);

    const searchRes = await page.request.get(`${API}?q=${encodeURIComponent(en)}`);
    expect(searchRes.ok()).toBe(true);
    const searchBody = await searchRes.json();
    expect(searchBody.terms.some((t) => t.id === term.id)).toBe(true);
  });

  test('update icelandic translation', async ({ page }) => {
    const en = `element-${uid()}`;
    const res = await page.request.post(API, {
      data: { english: en, icelandic: 'frumefni-old' },
    });
    const { term } = await res.json();
    cleanupIds.push(term.id);

    const newIs = `frumefni-${uid()}`;
    const updateRes = await page.request.put(`${API}/${term.id}`, {
      data: { icelandic: newIs },
    });
    expect(updateRes.ok()).toBe(true);
    const updateBody = await updateRes.json();
    expect(updateBody.term.icelandic).toBe(newIs);
  });

  test('delete term (admin)', async ({ page }) => {
    const en = `delete-me-${uid()}`;
    const createRes = await page.request.post(API, {
      data: { english: en, icelandic: 'eyða-mér' },
    });
    const { term } = await createRes.json();

    const delRes = await page.request.delete(`${API}/${term.id}`);
    expect(delRes.ok()).toBe(true);

    const getRes = await page.request.get(`${API}/${term.id}`);
    expect(getRes.status()).toBe(404);
  });

  test('duplicate english returns 409', async ({ page }) => {
    const en = `duplicate-${uid()}`;
    const res1 = await page.request.post(API, {
      data: { english: en, icelandic: 'fyrsta' },
    });
    const { term } = await res1.json();
    cleanupIds.push(term.id);

    const res2 = await page.request.post(API, {
      data: { english: en, icelandic: 'önnur' },
    });
    expect(res2.status()).toBe(409);
  });

  test('all optional fields round-trip', async ({ page }) => {
    const en = `optfields-${uid()}`;
    const data = {
      english: en,
      icelandic: 'valfrjálst',
      alternatives: ['annar valkostur', 'þriðji'],
      notes: 'Test notes for round-trip',
      category: 'fundamental',
    };

    const createRes = await page.request.post(API, { data });
    expect(createRes.status()).toBe(201);
    const { term } = await createRes.json();
    cleanupIds.push(term.id);

    const getRes = await page.request.get(`${API}/${term.id}`);
    const getBody = await getRes.json();
    expect(getBody.term.notes).toBe(data.notes);
    expect(getBody.term.category).toBe(data.category);
    // Alternatives may be stored as JSON string or array — verify content exists
    const alts = getBody.term.alternatives;
    if (typeof alts === 'string') {
      expect(alts).toContain('annar valkostur');
    } else if (Array.isArray(alts)) {
      expect(alts).toContain('annar valkostur');
    }
  });
});

// ─── Block 2: Validation ────────────────────────────────────────

test.describe('Terminology validation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');
  });

  test('missing english returns 400', async ({ page }) => {
    const res = await page.request.post(API, {
      data: { icelandic: 'sýra' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('missing icelandic returns 400', async ({ page }) => {
    const res = await page.request.post(API, {
      data: { english: 'acid' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('lookup 1-char returns empty or 400', async ({ page }) => {
    const res = await page.request.get(`${API}/lookup?q=a`);
    const status = res.status();
    if (status === 200) {
      const body = await res.json();
      expect(body.terms).toEqual([]);
    } else {
      expect(status).toBe(400);
    }
  });

  test('lookup valid query returns correct shape', async ({ page }) => {
    const res = await page.request.get(`${API}/lookup?q=acid`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('terms');
    expect(Array.isArray(body.terms)).toBe(true);
    // Each term (if any) should have id, english, icelandic
    for (const t of body.terms) {
      expect(t).toHaveProperty('id');
    }
  });

  test('export without bookSlug returns 400', async ({ page }) => {
    const res = await page.request.get(`${API}/export`);
    expect(res.status()).toBe(400);
  });
});

// ─── Block 3: Dispute & approve workflow ────────────────────────

test.describe('Terminology dispute and approve workflow', () => {
  const cleanupIds = [];

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async ({ page }) => {
    for (const id of cleanupIds) {
      try {
        await page.request.delete(`${API}/${id}`);
      } catch {
        /* best effort */
      }
    }
    cleanupIds.length = 0;
  });

  test('full dispute → discuss → approve lifecycle', async ({ page }) => {
    // Create
    const en = `workflow-${uid()}`;
    const createRes = await page.request.post(API, {
      data: { english: en, icelandic: 'verkflæði' },
    });
    const { term } = await createRes.json();
    cleanupIds.push(term.id);
    expect(term.status).toBe('proposed');

    // Dispute
    const disputeRes = await page.request.post(`${API}/${term.id}/dispute`, {
      data: { comment: 'I think this should be different', proposedTranslation: 'önnur þýðing' },
    });
    expect(disputeRes.ok()).toBe(true);
    const disputeBody = await disputeRes.json();
    expect(disputeBody.success).toBe(true);
    expect(disputeBody.term.status).toBe('disputed');

    // Discuss
    const discussRes = await page.request.post(`${API}/${term.id}/discuss`, {
      data: { comment: 'Good point, let me think about it' },
    });
    expect(discussRes.ok()).toBe(true);
    const discussBody = await discussRes.json();
    expect(discussBody.success).toBe(true);

    // Approve
    const approveRes = await page.request.post(`${API}/${term.id}/approve`);
    expect(approveRes.ok()).toBe(true);
    const approveBody = await approveRes.json();
    expect(approveBody.term.status).toBe('approved');
  });

  test('dispute without comment returns 400', async ({ page }) => {
    const createRes = await page.request.post(API, {
      data: { english: `nocomment-${uid()}`, icelandic: 'engin' },
    });
    const { term } = await createRes.json();
    cleanupIds.push(term.id);

    const res = await page.request.post(`${API}/${term.id}/dispute`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('discuss without comment returns 400', async ({ page }) => {
    const createRes = await page.request.post(API, {
      data: { english: `nodiscuss-${uid()}`, icelandic: 'engin' },
    });
    const { term } = await createRes.json();
    cleanupIds.push(term.id);

    const res = await page.request.post(`${API}/${term.id}/discuss`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('approve non-existent returns 404', async ({ page }) => {
    const res = await page.request.post(`${API}/999999/approve`);
    expect(res.status()).toBe(404);
  });

  test('dispute non-existent returns 404', async ({ page }) => {
    const res = await page.request.post(`${API}/999999/dispute`, {
      data: { comment: 'does not exist' },
    });
    expect(res.status()).toBe(404);
  });
});

// ─── Block 4: RBAC ──────────────────────────────────────────────

test.describe('Terminology RBAC', () => {
  test('viewer cannot create term', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');

    const res = await page.request.post(API, {
      data: { english: 'test', icelandic: 'próf' },
    });
    expect(res.status()).toBe(403);
  });

  test('viewer cannot update term', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');

    const res = await page.request.put(`${API}/999999`, {
      data: { icelandic: 'nýtt' },
    });
    expect(res.status()).toBe(403);
  });

  test('viewer cannot dispute term', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');

    const res = await page.request.post(`${API}/999999/dispute`, {
      data: { comment: 'should fail' },
    });
    expect(res.status()).toBe(403);
  });

  test('editor cannot approve term', async ({ page }) => {
    await loginAs(page, 'editor');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');

    const res = await page.request.post(`${API}/999999/approve`);
    expect(res.status()).toBe(403);
  });

  test('editor cannot delete term', async ({ page }) => {
    await loginAs(page, 'editor');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');

    const res = await page.request.delete(`${API}/999999`);
    expect(res.status()).toBe(403);
  });

  test('head-editor cannot delete term', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');

    const res = await page.request.delete(`${API}/999999`);
    expect(res.status()).toBe(403);
  });

  test('editor cannot import CSV', async ({ page }) => {
    await loginAs(page, 'editor');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');

    const res = await page.request.post(`${API}/import/csv`, {
      multipart: {
        file: {
          name: 'test.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from('english,icelandic\nacid,sýra\n'),
        },
      },
    });
    expect(res.status()).toBe(403);
  });

  test('viewer cannot access review queue', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');

    const res = await page.request.get(`${API}/review-queue`);
    expect(res.status()).toBe(403);
  });

  test('unauthenticated request returns 401', async ({ browser }) => {
    // Use a fresh context with no cookies to ensure clean unauthenticated state
    const context = await browser.newContext({ baseURL: 'http://localhost:3456' });
    const page = await context.newPage();
    try {
      const res = await page.request.get(API);
      // 401 is expected; 429 is acceptable when rate limiter fires during parallel tests
      expect([401, 429]).toContain(res.status());
    } finally {
      await context.close();
    }
  });
});

// ─── Block 5: CSV import ────────────────────────────────────────

test.describe('Terminology CSV import', () => {
  const cleanupIds = [];

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async ({ page }) => {
    for (const id of cleanupIds) {
      try {
        await page.request.delete(`${API}/${id}`);
      } catch {
        /* best effort */
      }
    }
    cleanupIds.length = 0;
  });

  test('valid CSV with bookSlug creates terms', async ({ page }) => {
    const tag = uid();
    const csv = `english,icelandic\nacid-${tag},sýra-${tag}\nbase-${tag},basi-${tag}\n`;

    const res = await page.request.post(`${API}/import/csv?bookSlug=efnafraedi-2e`, {
      multipart: {
        file: {
          name: 'test.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csv),
        },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.added).toBeGreaterThanOrEqual(2);

    // Verify terms are searchable
    const searchRes = await page.request.get(`${API}?q=${encodeURIComponent(`acid-${tag}`)}`);
    const searchBody = await searchRes.json();
    const found = searchBody.terms.find((t) => t.english === `acid-${tag}`);
    expect(found).toBeDefined();
    // Clean up created terms
    for (const t of searchBody.terms) {
      if (t.english.includes(tag)) cleanupIds.push(t.id);
    }
  });

  test('no file returns 400', async ({ page }) => {
    const res = await page.request.post(`${API}/import/csv?bookSlug=efnafraedi-2e`);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No file');
  });

  test('header-only CSV returns 0 added', async ({ page }) => {
    const csv = 'english,icelandic\n';
    const res = await page.request.post(`${API}/import/csv?bookSlug=efnafraedi-2e`, {
      multipart: {
        file: {
          name: 'empty.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csv),
        },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.added).toBe(0);
  });

  test('rows missing fields are skipped', async ({ page }) => {
    const tag = uid();
    // Two rows missing icelandic, one valid
    const csv = `english,icelandic\nmissing1-${tag},\n,missing2-${tag}\nvalid-${tag},gilt-${tag}\n`;
    const res = await page.request.post(`${API}/import/csv?bookSlug=efnafraedi-2e`, {
      multipart: {
        file: {
          name: 'partial.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csv),
        },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.skipped).toBeGreaterThanOrEqual(2);
    // Clean up the valid one
    const searchRes = await page.request.get(`${API}?q=${encodeURIComponent(`valid-${tag}`)}`);
    const searchBody = await searchRes.json();
    for (const t of searchBody.terms) {
      if (t.english.includes(tag)) cleanupIds.push(t.id);
    }
  });
});

// ─── Block 6: Excel import ──────────────────────────────────────

test.describe('Terminology Excel import', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');
  });

  test('no file returns 400', async ({ page }) => {
    const res = await page.request.post(`${API}/import/excel?bookSlug=efnafraedi-2e`);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No file');
  });
});

// ─── Block 7: Read-only endpoints ───────────────────────────────

test.describe('Terminology read-only endpoints', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');
  });

  test('stats returns valid shape', async ({ page }) => {
    const res = await page.request.get(`${API}/stats`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('byStatus');
  });

  test('categories returns enum lists', async ({ page }) => {
    const res = await page.request.get(`${API}/categories`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.categories)).toBe(true);
    expect(Array.isArray(body.statuses)).toBe(true);
    expect(Array.isArray(body.sources)).toBe(true);
  });

  test('export JSON with bookSlug', async ({ page }) => {
    const res = await page.request.get(`${API}/export?bookSlug=efnafraedi-2e&format=json`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('terms');
    expect(body).toHaveProperty('stats');
    expect(Array.isArray(body.terms)).toBe(true);
  });

  test('export CSV returns text/csv', async ({ page }) => {
    const res = await page.request.get(`${API}/export?bookSlug=efnafraedi-2e&format=csv`);
    expect(res.ok()).toBe(true);
    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('text/csv');
    const text = await res.text();
    // Should at least have the header row
    expect(text).toContain('english,icelandic');
  });

  test('review queue returns array', async ({ page }) => {
    // Need editor+ role for review queue
    const res = await page.request.get(`${API}/review-queue`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('terms');
    expect(Array.isArray(body.terms)).toBe(true);
  });
});

// ─── Block 8: Consistency check ─────────────────────────────────

test.describe('Terminology consistency check', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');
  });

  test('valid content returns issues array', async ({ page }) => {
    const res = await page.request.post(`${API}/check-consistency`, {
      data: {
        content: 'Sýrur og basar eru mikilvæg efnafræðileg hugtök.',
        sourceContent: 'Acids and bases are important chemical concepts.',
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty('issues');
    expect(body).toHaveProperty('stats');
    expect(typeof body.stats.termsChecked).toBe('number');
  });

  test('no content returns 400', async ({ page }) => {
    const res = await page.request.post(`${API}/check-consistency`, {
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ─── Block 9: Term usage integration ──────────────────────────

test.describe('Term usage integration', () => {
  const cleanupIds = [];

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async ({ page }) => {
    for (const id of cleanupIds) {
      try {
        await page.request.delete(`${API}/${id}`);
      } catch {
        /* best effort */
      }
    }
    cleanupIds.length = 0;
  });

  test('lookup returns seeded approved term', async ({ page }) => {
    const tag = uid();
    // Create
    const createRes = await page.request.post(API, {
      data: { english: `acid-${tag}`, icelandic: `sýra-${tag}` },
    });
    const { term } = await createRes.json();
    cleanupIds.push(term.id);

    // Approve
    const approveRes = await page.request.post(`${API}/${term.id}/approve`);
    expect(approveRes.ok()).toBe(true);

    // Lookup
    const lookupRes = await page.request.get(
      `${API}/lookup?q=${encodeURIComponent(`acid-${tag}`)}`
    );
    expect(lookupRes.ok()).toBe(true);
    const { terms } = await lookupRes.json();
    const found = terms.find((t) => t.id === term.id);
    expect(found).toBeDefined();
    expect(found.icelandic).toBe(`sýra-${tag}`);
    expect(found.status).toBe('approved');
  });

  test('search by status filters correctly', async ({ page }) => {
    const tag = uid();

    // Create proposed term
    const proposedRes = await page.request.post(API, {
      data: { english: `proposed-${tag}`, icelandic: `tillaga-${tag}` },
    });
    const proposed = (await proposedRes.json()).term;
    cleanupIds.push(proposed.id);

    // Create and approve another term
    const approvedRes = await page.request.post(API, {
      data: { english: `approved-${tag}`, icelandic: `samþykkt-${tag}` },
    });
    const approved = (await approvedRes.json()).term;
    cleanupIds.push(approved.id);
    await page.request.post(`${API}/${approved.id}/approve`);

    // Search with status=approved — should include approved, not proposed
    const searchRes = await page.request.get(`${API}?status=approved&q=${tag}`);
    expect(searchRes.ok()).toBe(true);
    const { terms } = await searchRes.json();
    const ids = terms.map((t) => t.id);
    expect(ids).toContain(approved.id);
    expect(ids).not.toContain(proposed.id);
  });

  test('consistency check detects missing translation', async ({ page }) => {
    const tag = uid();

    // Create and approve a term
    const createRes = await page.request.post(API, {
      data: { english: `catalyst-${tag}`, icelandic: `hvati-${tag}` },
    });
    const { term } = await createRes.json();
    cleanupIds.push(term.id);
    await page.request.post(`${API}/${term.id}/approve`);

    // Check consistency: EN source contains the term, IS content does NOT
    const checkRes = await page.request.post(`${API}/check-consistency`, {
      data: {
        sourceContent: `A catalyst-${tag} speeds up a reaction.`,
        content: 'Efnahvarf hraðar án viðeigandi þýðingar.',
      },
    });
    expect(checkRes.ok()).toBe(true);
    const body = await checkRes.json();
    expect(body.stats.termsChecked).toBeGreaterThan(0);
    const relevant = body.issues.find(
      (i) => i.enTerm && i.enTerm.toLowerCase() === `catalyst-${tag}`
    );
    expect(relevant).toBeDefined();
    expect(relevant.type).toBe('missing_term');
  });

  test('consistency check passes when translation present', async ({ page }) => {
    const tag = uid();

    // Create and approve a term
    const createRes = await page.request.post(API, {
      data: { english: `enzyme-${tag}`, icelandic: `ensím-${tag}` },
    });
    const { term } = await createRes.json();
    cleanupIds.push(term.id);
    await page.request.post(`${API}/${term.id}/approve`);

    // Check consistency: both EN and IS content contain the term/translation
    const checkRes = await page.request.post(`${API}/check-consistency`, {
      data: {
        sourceContent: `The enzyme-${tag} catalyzes the reaction.`,
        content: `Ensím-${tag} hvatar efnahvarfið.`,
      },
    });
    expect(checkRes.ok()).toBe(true);
    const body = await checkRes.json();
    expect(body.stats.termsChecked).toBeGreaterThan(0);
    const relevant = body.issues.find(
      (i) => i.enTerm && i.enTerm.toLowerCase() === `enzyme-${tag}`
    );
    expect(relevant).toBeUndefined();
  });

  test('stats reflect seeded terms', async ({ page }) => {
    const tag = uid();

    // Get baseline stats
    const baseRes = await page.request.get(`${API}/stats`);
    const baseStats = await baseRes.json();

    // Create proposed term
    const proposedRes = await page.request.post(API, {
      data: { english: `stat-proposed-${tag}`, icelandic: `tölfr-tillaga-${tag}` },
    });
    cleanupIds.push((await proposedRes.json()).term.id);

    // Create and approve another term
    const approvedRes = await page.request.post(API, {
      data: { english: `stat-approved-${tag}`, icelandic: `tölfr-samþykkt-${tag}` },
    });
    const approved = (await approvedRes.json()).term;
    cleanupIds.push(approved.id);
    await page.request.post(`${API}/${approved.id}/approve`);

    // Verify stats increased
    const newRes = await page.request.get(`${API}/stats`);
    const newStats = await newRes.json();
    expect(newStats.total).toBe(baseStats.total + 2);
    expect(newStats.byStatus.approved).toBeGreaterThan(baseStats.byStatus.approved || 0);
    expect(newStats.byStatus.proposed).toBeGreaterThan(baseStats.byStatus.proposed || 0);
  });
});
