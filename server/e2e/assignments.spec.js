/**
 * Úthlutanir: one assignee per chapter ([USER] 2026-11-14; interface audit 2026-11-13, AS-01 and AS-02).
 *
 * Before: changing a chapter's dropdown from one editor to another added a second assignee, the page went on
 * showing one name, and "— Óúthlutað —" removed one of the two at a time.
 *
 * The two editors and chapter 9's two rows come from seed-fixture.js. This spec owns chapters 7, 8 and 9 of
 * efnafraedi-2e's assignments.
 *
 * The assign gate (G1.13 spec §6.5) gives a chemistry chapter only to an editor with a consent decision and a
 * licence clause on record, which seed-fixture.js plants for both, and only while the book is served from the Fable
 * layer (server/lib/servedLayer.js; spec of 2026-11-24, §6.7), which chemistry is. The gate no longer reads the
 * suggestion view's switch. This spec still runs in playwright.config.js's `chromium-after-switch-on` project, after
 * the project that runs suggestion-view.spec.js, an ordering kept from when it did. An editor the gate refuses
 * is a disabled line "Name — reason" in the dropdown, so a refusal shows here as a missing label.
 */
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

const BOOK = 'efnafraedi-2e';
const EDITOR_A = 'E2E Úthlutun A';
const EDITOR_B = 'E2E Úthlutun B';

/** The names holding a chapter, as the server has them. */
async function holders(page, chapter) {
  const res = await page.request.get('/api/admin/assignments/' + BOOK);
  expect(res.ok()).toBe(true);
  const data = await res.json();
  return data.assignments
    .filter((a) => a.chapter === chapter)
    .map((a) => a.user_name)
    .sort();
}

const selectFor = (page, chapter) =>
  page.locator('select.assign-select[data-chapter="' + chapter + '"]');
const shownIn = (page, chapter) => selectFor(page, chapter).locator('option:checked');

async function openAssignments(page) {
  await loginAs(page, 'admin');
  await page.goto('/assignments?book=' + BOOK);
  await expect(selectFor(page, 7)).toBeVisible();
}

/** Choose a line of a chapter's dropdown and wait for the page to have reloaded its table. */
async function choose(page, chapter, label) {
  const reloaded = page.waitForResponse(
    (r) => r.url().endsWith('/api/admin/assignments/' + BOOK) && r.request().method() === 'GET'
  );
  await selectFor(page, chapter).selectOption({ label });
  await reloaded;
}

test.describe('Úthlutanir: one assignee per chapter', () => {
  // Fail here, with the cause, rather than as a timeout on a label the gate has disabled.
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await loginAs(page, 'admin');
      const res = await page.request.get('/api/admin/books/' + BOOK + '/suggestion-view');
      expect(res.ok(), await res.text()).toBe(true);
      expect(
        (await res.json()).enabled,
        'the suggestion view must be on before this spec assigns (spec §6.5). It runs in the ' +
          '`chromium-after-switch-on` project, which depends on `chromium`, where suggestion-view.spec.js ' +
          'switches the view on: run the whole suite (CI=1 npm run test:e2e), not this file with --no-deps'
      ).toBe(true);
    } finally {
      await context.close();
    }
  });

  test('choosing another editor replaces the first; "— Óúthlutað —" then leaves nobody', async ({
    page,
  }) => {
    await openAssignments(page);

    await choose(page, 7, EDITOR_A);
    await expect(shownIn(page, 7)).toHaveText(EDITOR_A);
    expect(await holders(page, 7)).toEqual([EDITOR_A]);

    await choose(page, 7, EDITOR_B);
    await expect(shownIn(page, 7)).toHaveText(EDITOR_B);
    expect(await holders(page, 7)).toEqual([EDITOR_B]);

    await choose(page, 7, '— Óúthlutað —');
    await expect(shownIn(page, 7)).toHaveText('— Óúthlutað —');
    expect(await holders(page, 7)).toEqual([]);
  });

  test('a chapter that holds two editors names both, and choosing one keeps only that one', async ({
    page,
  }) => {
    await openAssignments(page);
    expect(await holders(page, 9)).toEqual([EDITOR_A, EDITOR_B]);

    const row = page.locator('tr', { has: selectFor(page, 9) });
    const note = row.locator('.assign-several');
    await expect(note).toContainText(EDITOR_A);
    await expect(note).toContainText(EDITOR_B);
    // No name is shown as the choice made while two hold the chapter.
    await expect(shownIn(page, 9)).toHaveText('— Veldu einn —');

    await choose(page, 9, EDITOR_A);
    await expect(shownIn(page, 9)).toHaveText(EDITOR_A);
    await expect(
      page.locator('tr', { has: selectFor(page, 9) }).locator('.assign-several')
    ).toHaveCount(0);
    expect(await holders(page, 9)).toEqual([EDITOR_A]);
  });

  test("Stjórnandi's user dialog takes a chapter from its holder and names the previous editor", async ({
    page,
  }) => {
    await loginAs(page, 'admin');
    const list = await (await page.request.get('/api/admin/assignments/' + BOOK)).json();
    const editorA = list.editors.find((e) => e.name === EDITOR_A);
    const given = await page.request.post('/api/admin/assignments/' + BOOK + '/8', {
      data: { userId: editorA.id },
    });
    expect(given.ok()).toBe(true);
    expect(await holders(page, 8)).toEqual([EDITOR_A]);

    await page.goto('/admin');
    await page.locator('#users-tbody tr', { hasText: EDITOR_B }).click();
    // The dialog lists the books of the catalogue table, which the throwaway database does not hold, so the
    // book's line is added here. What is under test is what the dialog does with the answer.
    await page.locator('#assign-book').evaluate((el, slug) => el.add(new Option(slug, slug)), BOOK);
    await page.selectOption('#assign-book', BOOK);
    await page.fill('#assign-chapter', '8');
    await page.getByRole('button', { name: 'Úthluta', exact: true }).click();

    await expect(page.locator('.admin-toast').last()).toContainText(
      'Fyrri yfirlesari: ' + EDITOR_A
    );
    expect(await holders(page, 8)).toEqual([EDITOR_B]);
  });

  test('the page says where editors come from only when the list is held to book access', async ({
    page,
  }) => {
    await openAssignments(page);
    await expect(page.locator('#assign-editors-hint')).toBeHidden();

    // The same answer with the server's flag set: the hint appears.
    await page.route('**/api/admin/assignments/' + BOOK, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, editorsLimited: true } });
    });
    await page.reload();
    await expect(selectFor(page, 7)).toBeVisible();
    await expect(page.locator('#assign-editors-hint')).toBeVisible();
    await expect(page.locator('#assign-editors-hint')).toContainText('bókaheimild');
  });
});
