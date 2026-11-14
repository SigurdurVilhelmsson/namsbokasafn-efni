/**
 * "Yfirlestrar" lists the units with edits waiting for a decision (interface audit 2026-11-13, ED-08; register
 * §C222). It used to show a banner over the ordinary pickers and filter nothing. The server's list and its
 * scope are tested in server/__tests__/reviewWaitingList.test.js; this tests what the page does with it.
 */
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

const daysAgo = (n) =>
  new Date(Date.now() - n * 86400000 - 3600000).toISOString().slice(0, 19).replace('T', ' ');

async function stubList(page, modules) {
  await page.route('**/api/segment-editor/review-list', (route) =>
    route.fulfill({ json: { modules } })
  );
}

test.describe('"Yfirlestrar" lists the units with edits waiting', () => {
  test('one row per unit: book, chapter, section, how many wait, and since when', async ({
    page,
  }) => {
    await loginAs(page, 'head-editor');
    await stubList(page, [
      {
        book: '__e2e-fixture__',
        bookLabel: 'E2E Fixture',
        chapter: 1,
        moduleId: 'm68664',
        title: 'Fyrsti hlutinn',
        pendingCount: 3,
        oldestAt: daysAgo(2),
        url: '/editor?book=__e2e-fixture__&chapter=1&module=m68664&view=reviews',
      },
      {
        book: '__e2e-fixture__',
        bookLabel: 'E2E Fixture',
        chapter: -1,
        moduleId: 'm99999',
        title: null,
        pendingCount: 1,
        oldestAt: daysAgo(0),
        url: '/editor?book=__e2e-fixture__&chapter=-1&module=m99999&view=reviews',
      },
    ]);
    await page.goto('/editor?view=reviews');

    const rows = page.locator('#review-list tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('E2E Fixture');
    await expect(rows.nth(0)).toContainText('Kafli 1');
    await expect(rows.nth(0)).toContainText('3');
    await expect(rows.nth(0)).toContainText('fyrir 2 dögum');
    await expect(rows.nth(0).getByRole('link', { name: 'Fyrsti hlutinn' })).toHaveAttribute(
      'href',
      '/editor?book=__e2e-fixture__&chapter=1&module=m68664&view=reviews'
    );
    // A unit with no section title is named by its id; the appendices by their name.
    await expect(rows.nth(1)).toContainText('Viðaukar');
    await expect(rows.nth(1).getByRole('link', { name: 'm99999' })).toBeVisible();
    await expect(rows.nth(1)).toContainText('í dag');
  });

  test('a link opens the unit with only its pending edits shown', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await stubList(page, [
      {
        book: '__e2e-fixture__',
        bookLabel: 'E2E Fixture',
        chapter: 1,
        moduleId: 'm68664',
        title: 'Fyrsti hlutinn',
        pendingCount: 1,
        oldestAt: daysAgo(1),
        url: '/editor?book=__e2e-fixture__&chapter=1&module=m68664&view=reviews',
      },
    ]);
    await page.goto('/editor?view=reviews');
    await page.locator('#review-list').getByRole('link', { name: 'Fyrsti hlutinn' }).click();
    await expect(page).toHaveURL(/module=m68664/);
    await expect(page.locator('#filter-status')).toHaveValue('pending');
    await expect(page.locator('#review-list')).toHaveCount(0);
  });

  test('says so when nothing waits', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await stubList(page, []);
    await page.goto('/editor?view=reviews');
    await expect(page.locator('#review-list')).toContainText('Engar breytingar bíða yfirlestrar.');
  });

  test('control: the real list loads, as a table or the empty line, never an error', async ({
    page,
  }) => {
    await loginAs(page, 'admin');
    const answered = page.waitForResponse((r) =>
      r.url().endsWith('/api/segment-editor/review-list')
    );
    await page.goto('/editor?view=reviews');
    expect((await answered).status()).toBe(200);
    await expect(page.locator('#review-list table, #review-list .review-list-empty')).toHaveCount(
      1
    );
    await expect(page.locator('#review-list')).not.toContainText('Villa');
  });
});
