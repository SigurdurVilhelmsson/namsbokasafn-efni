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
