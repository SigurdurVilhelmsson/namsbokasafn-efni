/**
 * Heim, the front page (interface audit 2026-11-13, IA-4; register §C221):
 *
 *   HM-01  an editor sees the chapters assigned to them, and nobody with nothing assigned is told
 *          "Þú hefur lokið öllum verkefnum";
 *   SH-12  a guest is told they are a guest;
 *   HM-03  a reviewer's question and a rejection read differently, and name the text concerned;
 *   HM-04  the link opens the row, not only the module.
 *
 * The editor with a chapter is seeded by seed-fixture.js (provider id 90301, efnafraedi-2e chapter 5).
 */
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

const card = (page) => page.locator('#current-task-card');

async function openHeim(page, role, userId) {
  await loginAs(page, role, userId);
  const answered = page.waitForResponse((r) => r.url().endsWith('/api/my-work/today'));
  await page.goto('/');
  expect((await answered).status()).toBe(200);
}

test.describe('Heim says what applies to the reader (HM-01, SH-12)', () => {
  test('a guest is told they are a guest, not congratulated', async ({ page }) => {
    await openHeim(page, 'viewer');
    await expect(card(page)).toContainText('Þú ert gestur');
    await expect(page.locator('body')).not.toContainText('lokið öllum verkefnum');
    await expect(page.locator('#greeting-subtitle')).not.toContainText('vel gert');
  });

  test('an editor with no chapter is told so and offered the editor', async ({ page }) => {
    await openHeim(page, 'editor');
    await expect(card(page)).toContainText('Engum kafla úthlutað enn');
    await expect(card(page).getByRole('link', { name: 'Opna ritil' })).toHaveAttribute(
      'href',
      '/editor'
    );
    await expect(page.locator('#my-chapters-section')).toBeHidden();
    await expect(page.locator('body')).not.toContainText('lokið öllum verkefnum');
  });

  test('an editor with a chapter sees it, with a link into the editor', async ({ page }) => {
    await openHeim(page, 'editor', 90301);
    const chapters = page.locator('#my-chapters-section');
    await expect(chapters).toBeVisible();
    await expect(chapters).toContainText('Kaflarnir þínir');
    const link = chapters.locator('a.up-next-item');
    await expect(link).toHaveCount(1);
    await expect(link).toContainText('Kafli 5');
    await expect(link).toHaveAttribute('href', '/editor?book=efnafraedi-2e&chapter=5');
    await expect(card(page)).toContainText('Ekkert bíður svars frá þér');
  });

  test('control: a head editor with nothing waiting is still congratulated', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await page.route('**/api/my-work/today', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({
        response,
        json: { ...body, adminStats: { globalPendingCount: 0, readyToApplyCount: 0 } },
      });
    });
    await page.goto('/');
    await expect(card(page)).toContainText('Ekkert verkefni í dag!');
  });
});

test.describe("a reviewer's answer (HM-03) and its link (HM-04)", () => {
  test('a question and a rejection read differently and name the text', async ({ page }) => {
    await loginAs(page, 'editor');
    const task = (kind, id) => ({
      id,
      type: 'changes_requested',
      kind,
      book: '__e2e-fixture__',
      bookLabel: 'E2E Fixture',
      chapter: 1,
      section: 'm68664',
      reviewedBy: 'Yfirlesari',
      notes: kind === 'question' ? 'Nútíð eða þátíð?' : 'Rangt hugtak',
      excerpt: kind === 'question' ? 'Efnið er vatn' : 'Hafnaður texti',
      editorUrl: `/segment-editor?book=__e2e-fixture__&chapter=1&module=m68664&segment=s-${id}`,
      priority: 1,
    });
    await page.route('**/api/my-work/today', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const question = task('question', 1);
      const rejected = task('rejected', 2);
      await route.fulfill({
        response,
        json: {
          ...body,
          currentTask: question,
          upNext: [rejected],
          allTasks: [question, rejected],
          needsAttention: [question, rejected],
          quickStats: { ...body.quickStats, totalTasks: 2, changesRequested: 2 },
        },
      });
    });
    await page.goto('/');

    await expect(card(page)).toContainText('Spurning frá yfirlesara');
    await expect(card(page)).toContainText('Spurning frá Yfirlesari');
    await expect(card(page)).toContainText('Efnið er vatn');
    await expect(card(page)).toContainText('Nútíð eða þátíð?');
    const answer = card(page).getByRole('link', { name: 'Svara' });
    await expect(answer).toHaveAttribute('href', /segment=s-1$/);

    const next = page.locator('#up-next-list a.up-next-item');
    await expect(next).toHaveCount(1);
    await expect(next).toContainText('Hafnað');
    await expect(next).toHaveAttribute('href', /segment=s-2$/);
  });

  test('a link that names a segment opens the editor on that row', async ({ page }) => {
    await loginAs(page, 'editor');
    const res = await page.request.get('/api/segment-editor/__e2e-fixture__/1/m68664');
    expect(res.ok()).toBe(true);
    const { segments } = await res.json();
    // A row well inside the module, so it is not on screen when the module first draws.
    const target = segments[Math.floor(segments.length * 0.6)].segmentId;

    await page.goto(
      '/editor?book=__e2e-fixture__&chapter=1&module=m68664&segment=' + encodeURIComponent(target)
    );
    const cursor = page.locator('.segment-row.kbd-cursor');
    await expect(cursor).toHaveCount(1);
    await expect(cursor).toHaveAttribute('data-segment-id', target);
  });
});
