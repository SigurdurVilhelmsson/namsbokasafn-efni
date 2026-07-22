const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

const API = '/api/segment-editor';
const BOOK = '__e2e-fixture__';
const CHAPTER = '1';
const MODULE = 'm68663';
const RUN_ID = Date.now();
const EDITOR_ID = 70000 + (RUN_ID % 10000);
const REVIEWER_ID = 80000 + (RUN_ID % 10000);
const MARKER = `[e2e-a4-${RUN_ID}]`;

test.describe.serial('§0.reg full editor→submit→approve→apply chain', () => {
  let segmentId, originalContent, editId, reviewId;

  test('§0.reg-1 editor saves an edit', async ({ page }) => {
    await loginAs(page, 'admin', EDITOR_ID);
    const data = await (await page.request.get(`${API}/${BOOK}/${CHAPTER}/${MODULE}`)).json();
    const seg = data.segments.find((s) => s.is && s.is.length > 0);
    expect(seg, 'fixture module must have a translated segment').toBeTruthy();
    segmentId = seg.segmentId;
    originalContent = seg.is;
    const res = await page.request.post(`${API}/${BOOK}/${CHAPTER}/${MODULE}/edit`, {
      data: {
        segmentId,
        originalContent,
        editedContent: `${originalContent} ${MARKER}`,
        category: 'terminology',
      },
    });
    expect(res.status()).toBe(200);
    editId = (await res.json()).editId;
    expect(editId).toBeTruthy();
  });

  test('§0.reg-2 editor submits the module for review', async ({ page }) => {
    await loginAs(page, 'admin', EDITOR_ID);
    const res = await page.request.post(`${API}/${BOOK}/${CHAPTER}/${MODULE}/submit`);
    if (res.status() === 409) {
      const q = await (await page.request.get(`${API}/review-queue?book=${BOOK}`)).json();
      reviewId = q.reviews.find((r) => r.module_id === MODULE).id;
    } else {
      expect(res.status()).toBe(200);
      reviewId = (await res.json()).reviewId;
    }
    expect(reviewId).toBeTruthy();
  });

  test('§0.reg-3 head-editor approves the edit', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);
    const res = await page.request.post(`${API}/edit/${editId}/approve`, {
      data: { note: `a4 ${MARKER}` },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  test('§0.reg-4 completing the review auto-applies to faithful', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);
    const res = await page.request.post(`${API}/reviews/${reviewId}/complete`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('approved');
    expect(data.applied.appliedCount).toBeGreaterThan(0);
  });

  test('§0.reg-5 the edit is present on reload', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);
    const data = await (await page.request.get(`${API}/${BOOK}/${CHAPTER}/${MODULE}`)).json();
    expect(data.segments.find((s) => s.segmentId === segmentId).is).toContain(MARKER);
  });
});
