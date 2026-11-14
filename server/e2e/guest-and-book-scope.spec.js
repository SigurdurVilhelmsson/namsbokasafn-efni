/**
 * What the pages show for the reads that are now held to a book, or given without their people
 * ([USER] 2026-11-14, answers 5, 6 and 8). The server's side is in
 * server/__tests__/activityLogBookScope.test.js and guestReadsWithoutNames.test.js.
 */
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

const BOOK = 'efnafraedi-2e';

test.describe('Framvinda: the timeline of a book the reader does not work on', () => {
  test('an editor without the book is told why there is no timeline', async ({ page }) => {
    // The helper's editor has no account row, so works on no book.
    await loginAs(page, 'editor');
    await page.goto('/progress?book=' + BOOK);
    await page.getByRole('tab', { name: 'Tímalína' }).click();

    await expect(page.locator('#timeline-list')).toContainText(
      'Tímalínan er aðeins sýnileg þeim sem vinna við þessa bók.'
    );
  });

  test('control: an admin gets the timeline, with no such line', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/progress?book=' + BOOK);
    const answered = page.waitForResponse((r) => r.url().includes('/api/status/activity/timeline'));
    await page.getByRole('tab', { name: 'Tímalína' }).click();
    expect((await answered).status()).toBe(200);
    await expect(page.locator('#timeline-list')).not.toContainText('þeim sem vinna við þessa bók');
  });
});

test.describe('Orðasafn: a headword, for a guest', () => {
  test('the discussion is left out for a guest and shown to an editor', async ({ page }) => {
    // An admin makes a headword with one comment.
    await loginAs(page, 'admin');
    const english = 'gestaprof' + Date.now();
    const created = await page.request.post('/api/terminology', {
      data: { english, icelandic: 'gestapróf', subjects: ['chemistry'] },
    });
    expect(created.ok()).toBe(true);
    const id = (await created.json()).term.id;
    const said = await page.request.post('/api/terminology/' + id + '/discuss', {
      data: { comment: 'Athugasemd sem gestur á ekki að sjá' },
    });
    expect(said.ok()).toBe(true);

    // A guest opens it: the translation is there, the discussion section is not.
    await loginAs(page, 'viewer');
    await page.goto('/terminology');
    await page.evaluate((termId) => window.showTermDetail(termId), id);
    await expect(page.locator('#detail-modal')).toBeVisible();
    await expect(page.locator('#detail-translations')).toContainText('gestapróf');
    await expect(page.locator('#detail-modal .discussion-section')).toBeHidden();
    await expect(page.locator('#detail-modal')).not.toContainText('Athugasemd sem gestur');

    // Control: an editor sees the section and the comment.
    await loginAs(page, 'editor');
    await page.goto('/terminology');
    await page.evaluate((termId) => window.showTermDetail(termId), id);
    await expect(page.locator('#detail-modal .discussion-section')).toBeVisible();
    await expect(page.locator('#discussions-list')).toContainText(
      'Athugasemd sem gestur á ekki að sjá'
    );
  });
});

test.describe('Stjórnandi: adding a user', () => {
  test('the dialog says that a person already signed in has to sign in again', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Bæta við', exact: true }).click();
    await expect(page.locator('#add-user-signin-note')).toBeVisible();
    await expect(page.locator('#add-user-signin-note')).toContainText('skrá sig út og aftur inn');
  });
});
