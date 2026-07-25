// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * Role-based access control (RBAC) tests.
 *
 * Each test authenticates as a role that is BELOW the minimum required
 * for the endpoint, then asserts a 403 response. Using non-existent IDs
 * (999999) ensures the role check fires before any 404.
 */

// ─── Segment editor RBAC ─────────────────────────────────────

test.describe('Segment editor RBAC', () => {
  test('approve edit requires HEAD_EDITOR — editor gets 403', async ({ page }) => {
    await loginAs(page, 'editor');
    const resp = await page.request.post('/api/segment-editor/edit/999999/approve');
    expect(resp.status()).toBe(403);
  });

  test('reject edit requires HEAD_EDITOR — editor gets 403', async ({ page }) => {
    await loginAs(page, 'editor');
    const resp = await page.request.post('/api/segment-editor/edit/999999/reject');
    expect(resp.status()).toBe(403);
  });

  test('discuss edit requires HEAD_EDITOR — editor gets 403', async ({ page }) => {
    await loginAs(page, 'editor');
    const resp = await page.request.post('/api/segment-editor/edit/999999/discuss');
    expect(resp.status()).toBe(403);
  });

  test('unapprove edit requires HEAD_EDITOR — editor gets 403', async ({ page }) => {
    await loginAs(page, 'editor');
    const resp = await page.request.post('/api/segment-editor/edit/999999/unapprove');
    expect(resp.status()).toBe(403);
  });

  test('apply edits requires HEAD_EDITOR — editor gets 403', async ({ page }) => {
    await loginAs(page, 'editor');
    const resp = await page.request.post('/api/segment-editor/efnafraedi-2e/1/m68663/apply');
    expect(resp.status()).toBe(403);
  });

  test('complete review requires HEAD_EDITOR — editor gets 403', async ({ page }) => {
    await loginAs(page, 'editor');
    const resp = await page.request.post('/api/segment-editor/reviews/999999/complete');
    expect(resp.status()).toBe(403);
  });

  test('list reviews requires EDITOR — viewer gets 403', async ({ page }) => {
    await loginAs(page, 'viewer');
    const resp = await page.request.get('/api/segment-editor/reviews');
    expect(resp.status()).toBe(403);
  });

  test('delete edit requires EDITOR — viewer gets 403', async ({ page }) => {
    await loginAs(page, 'viewer');
    const resp = await page.request.delete('/api/segment-editor/edit/999999');
    expect(resp.status()).toBe(403);
  });
});

// ─── Admin RBAC ──────────────────────────────────────────────

test.describe('Admin RBAC', () => {
  test('update user requires ADMIN — head-editor gets 403', async ({ page }) => {
    await loginAs(page, 'head-editor');
    const resp = await page.request.put('/api/admin/users/1', {
      data: { role: 'editor' },
    });
    expect(resp.status()).toBe(403);
  });

  test('list books requires EDITOR — viewer gets 403', async ({ page }) => {
    await loginAs(page, 'viewer');
    const resp = await page.request.get('/api/admin/books');
    expect(resp.status()).toBe(403);
  });
});

// ─── Cross-book head-editor authorization (§0.3 / §1e) + no-session (§5b) ──
//
// The tests above assert MIN-ROLE gating (an under-privileged role is
// rejected). These assert BOOK-SCOPE gating: a head-editor authenticated
// for efnafraedi-2e/__e2e-fixture__ must still be rejected when acting on
// a book their token does not own (`requireHeadEditor(bookParam)` checks
// `user.books.includes(book)`).
//
// §0.3a deviates from the original brief, which targeted
// `POST /api/segment-editor/edit/:editId/approve`. That route is guarded by
// `requireHeadEditorFor(bookFromEditId)`, which — unlike `requireHeadEditor`
// — resolves the owning book via a DB lookup (`getEditById`) *before* the
// book-scope check runs. A nonsense editId (999999) makes the resolver
// throw ("Edit not found"), which `requireHeadEditorFor` turns into a 404,
// not a 403 — so that endpoint cannot be probed for book-scope with a
// throwaway id (verified by reading server/routes/segment-editor.js +
// server/middleware/requireRole.js; no liffraedi-2e edit row exists in the
// e2e fixture DB to resolve instead). Substituted with the `apply` route,
// which is guarded by the same `requireHeadEditor()` (book taken directly
// from the URL, no DB lookup) as §1e's restore route below — so the 403
// fires before any module/version id is ever used, same guarantee the
// brief intended. The `requireHeadEditorFor` resolver's OWN book-scope
// branch (as opposed to its 404-on-missing-resolver-target branch) remains
// unexercised by E2E; a real cross-book edit row would be needed to cover
// it — candidate follow-up, not done here (out of scope: only
// rbac.spec.js is touched).
test.describe('§0.3/§1e cross-book head-editor authorization', () => {
  const OTHER_BOOK = 'liffraedi-2e'; // NOT in the head-editor token's books

  test('§0.3a head-editor apply on a non-owned book → 403', async ({ page }) => {
    await loginAs(page, 'head-editor');
    const resp = await page.request.post(`/api/segment-editor/${OTHER_BOOK}/1/m99999/apply`);
    expect(resp.status()).toBe(403);
  });

  // Chapter is deliberately out-of-range (MAX_CHAPTERS = 99, server/constants.js)
  // rather than `1`: on the publish routes (server/routes/publication.js:132,
  // 187, 243) middleware order is requireAuth → requireHeadEditor('bookSlug') →
  // validateChapterParams → handler, i.e. authz runs BEFORE chapter validation.
  // So the cross-book head-editor below still gets its 403 from requireHeadEditor
  // regardless of chapter value, while admin (§0.3c, which bypasses the book
  // check) now gets a 400 from validateChapterParams and can never reach
  // publishMtPreview/runPipeline as an e2e side effect. `1` was only hermetic
  // while biology (liffraedi-2e) ch01 had no 02-mt-output; biology onboarding
  // is active, so this keeps the test hermetic regardless of that content state.
  test('§0.3d head-editor publish on a non-owned book → 403', async ({ page }) => {
    await loginAs(page, 'head-editor');
    const resp = await page.request.post(`/api/publication/${OTHER_BOOK}/999/mt-preview`);
    expect(resp.status()).toBe(403);
  });

  test('§0.3c admin publish is not blocked by book scope (not 403)', async ({ page }) => {
    await loginAs(page, 'admin');
    const resp = await page.request.post(`/api/publication/${OTHER_BOOK}/999/mt-preview`);
    // Out-of-range chapter (999) means admin hits validateChapterParams' 400
    // before ever reaching publishMtPreview — must never be the book-scope 403
    // (admins bypass requireHeadEditor's book check).
    expect(resp.status()).not.toBe(403);
  });

  test('§1e head-editor restore on a non-owned book → 403', async ({ page }) => {
    await loginAs(page, 'head-editor');
    const resp = await page.request.post(`/api/segment-editor/${OTHER_BOOK}/1/m99999/restore/1`, {
      data: { confirm: true },
    });
    expect(resp.status()).toBe(403);
  });

  test('§5b state-changing request with no session → rejected', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: 'http://localhost:3456' });
    const anon = await context.newPage();
    const resp = await anon.request.post('/api/segment-editor/efnafraedi-2e/1/m68663/apply');
    expect([401, 403]).toContain(resp.status());
    await context.close();
  });
});
