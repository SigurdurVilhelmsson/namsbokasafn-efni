// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * §C210: the localization editor lets an editor set a category on a segment, and
 * sends it with the save.
 *
 * Every pending change carried `category: ''`: no control set it, and no save
 * payload sent it, so the editor's category filter and badges never had data. The
 * server side (validation, storage) is covered by
 * server/__tests__/localizationCategory.test.js; this spec covers the page.
 *
 * The module's API responses are STUBBED with page.route. The fixture book's
 * faithful files are gitignored and exist only as a side effect of other specs, so
 * a test that needed a real faithful file would depend on run order. The stubs
 * mirror the real loader's shape (segmentParser.loadModuleForLocalization), and
 * the save calls are captured so the test reads exactly what the page sent.
 */

const BOOK = '__e2e-fixture__';
const MODULE = 'm68664';
const SEG = `${MODULE}:para:c210-loc`;
const SEG_CSS = SEG.replace(/[^a-zA-Z0-9-]/g, '_'); // edCssId()
const API = `/api/localization-editor/${BOOK}`;

const moduleData = () => ({
  book: BOOK,
  chapter: 1,
  moduleId: MODULE,
  hasLocalized: false,
  lastModified: null,
  title: 'Stub module',
  segments: [
    {
      segmentId: SEG,
      moduleId: MODULE,
      segmentType: 'para',
      en: 'The temperature was 50 °F.',
      faithful: 'Hitinn var 50 °F.',
      localized: '',
      hasLocalized: false,
      hasFaithful: true,
    },
  ],
  equations: {},
  segmentCount: 1,
  faithfulCount: 1,
  localizedCount: 0,
});

/** Stub the module's endpoints; return the captured save bodies. */
async function stubModule(page) {
  const captured = { save: [], saveAll: [] };
  await page.route(`**${API}/1`, (route) =>
    route.fulfill({
      json: {
        modules: [
          {
            moduleId: MODULE,
            title: 'Stub module',
            section: '1.1',
            hasFaithful: true,
            hasLocalized: false,
          },
        ],
      },
    })
  );
  await page.route(`**${API}/1/${MODULE}`, (route) => route.fulfill({ json: moduleData() }));
  await page.route(`**${API}/1/${MODULE}/history*`, (route) =>
    route.fulfill({ json: { history: [] } })
  );
  await page.route(`**${API}/1/${MODULE}/pending-edits`, (route) =>
    route.fulfill({ json: { enforceLocalizationReview: false, edits: [] } })
  );
  await page.route(`**${API}/1/${MODULE}/save`, (route) => {
    captured.save.push(route.request().postDataJSON());
    return route.fulfill({ json: { success: true, lastModified: 1 } });
  });
  await page.route(`**${API}/1/${MODULE}/save-all`, (route) => {
    const body = route.request().postDataJSON();
    captured.saveAll.push(body);
    return route.fulfill({
      json: { success: true, saved: body.segments.length, lastModified: 1 },
    });
  });
  return captured;
}

async function openModule(page) {
  await page.goto('/localization');
  await page.waitForLoadState('networkidle');
  await page.locator('#ed-book-select').selectOption(BOOK);
  const chapterSelect = page.locator('#ed-chapter-select');
  await expect
    .poll(() => chapterSelect.locator('option').count(), { timeout: 10000 })
    .toBeGreaterThan(1);
  await chapterSelect.selectOption('1');
  await page.locator('#modules-list .module-item').first().click();
  await expect(page.locator(`#row-${SEG_CSS}`)).toBeVisible({ timeout: 10000 });
}

test.describe('§C210 localization category', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('a segment row offers a category, and a single save sends it', async ({ page }) => {
    const captured = await stubModule(page);
    await openModule(page);

    const picker = page.locator(`#cat-${SEG_CSS}`);
    await expect(picker).toBeVisible({ timeout: 5000 });
    await picker.selectOption('unit-conversion');
    await page.locator(`#ta-${SEG_CSS}`).fill('Hitinn var 10 °C.');
    await page.locator(`#row-${SEG_CSS} .btn-save-seg`).click();

    await expect.poll(() => captured.save.length, { timeout: 5000 }).toBe(1);
    expect(captured.save[0]).toMatchObject({
      segmentId: SEG,
      content: 'Hitinn var 10 °C.',
      category: 'unit-conversion',
    });
  });

  test('after a save, the row shows the category badge and the filter finds it', async ({
    page,
  }) => {
    await stubModule(page);
    await openModule(page);
    await page.locator(`#cat-${SEG_CSS}`).selectOption('unit-conversion');
    await page.locator(`#ta-${SEG_CSS}`).fill('Hitinn var 10 °C.');
    await page.locator(`#row-${SEG_CSS} .btn-save-seg`).click();

    const row = page.locator(`#row-${SEG_CSS}`);
    await expect(row.locator('.seg-category-badge.unit-conversion')).toBeVisible({
      timeout: 5000,
    });
    // The saved category still matches the filter (it used to match unsaved changes only).
    await page.locator('#filter-category').selectOption('unit-conversion');
    await expect(row).toBeVisible();
    await page.locator('#filter-category').selectOption('formatting');
    await expect(row).toHaveCount(0);
  });

  test('"Vista allt" sends each changed segment with its category', async ({ page }) => {
    const captured = await stubModule(page);
    await openModule(page);
    await page.locator(`#cat-${SEG_CSS}`).selectOption('formatting');
    await page.locator(`#ta-${SEG_CSS}`).fill('Hitinn var 10 °C, sniðið lagað.');
    await page.locator('#btn-save-all').click();

    await expect.poll(() => captured.saveAll.length, { timeout: 5000 }).toBe(1);
    expect(captured.saveAll[0].segments).toEqual([
      { segmentId: SEG, content: 'Hitinn var 10 °C, sniðið lagað.', category: 'formatting' },
    ]);
  });
});
