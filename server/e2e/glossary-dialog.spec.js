/**
 * Orðasafn's term dialog (interface audit 2026-11-13, TE-01, TE-02 and TE-04) and the correction of a
 * translation ([USER] 2026-11-14, docs/decisions/2026-11-14-glossary-translation-corrections.md).
 *
 *   TE-01  "Breyta orðhausu" (now "Breyta flettiorði") showed the translation's fields as editable and saved
 *          only two headword fields.
 *   TE-02  after "Bæta við þýðingu" was cancelled, "Vista" on a new term posted to /null/translations.
 *   TE-04  text in "Aðrar þýðingar" was thrown away.
 *
 * Every term is created through the API with a unique English word, and deleted after the test.
 */
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

const API = '/api/terminology';

function uid() {
  return `e2e-dlg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const created = [];

test.afterEach(async ({ page }) => {
  await loginAs(page, 'admin');
  for (const id of created.splice(0)) {
    await page.request.delete(`${API}/${id}`).catch(() => {});
  }
});

/** Create a term as `role` and return { id, english, translationId }. */
async function makeTerm(page, role, icelandic) {
  await loginAs(page, role);
  const english = uid();
  const res = await page.request.post(API, { data: { english, icelandic } });
  expect(res.status()).toBe(201);
  const { term } = await res.json();
  created.push(term.id);
  return { id: term.id, english, translationId: term.translations[0].id };
}

async function getTerm(page, id) {
  const res = await page.request.get(`${API}/${id}`);
  expect(res.ok()).toBe(true);
  return (await res.json()).term;
}

/** Open Orðasafn as `role` with the detail dialog of headword `id`. */
async function openDetail(page, role, id) {
  await loginAs(page, role);
  await page.goto('/terminology');
  await page.waitForFunction(() => typeof window.showTermDetail === 'function');
  await page.evaluate((termId) => window.showTermDetail(termId), id);
  await expect(page.locator('#detail-modal')).toBeVisible();
}

/** Fail the test on any browser alert: each of these flows should save without one. */
function failOnAlert(page) {
  page.on('dialog', async (dialog) => {
    const message = dialog.message();
    await dialog.dismiss();
    throw new Error('Unexpected alert: ' + message);
  });
}

const termModal = (page) => page.locator('#term-modal');
const field = (page, id) => page.locator('#' + id);

test.describe('the term dialog shows only what it saves', () => {
  test('"Breyta flettiorði" edits the part of speech and the English definition, and nothing else (TE-01)', async ({
    page,
  }) => {
    const term = await makeTerm(page, 'admin', 'upphafleg-þýðing');
    await openDetail(page, 'admin', term.id);
    failOnAlert(page);

    await page.locator('#detail-modal').getByRole('button', { name: 'Breyta flettiorði' }).click();
    await expect(termModal(page)).toBeVisible();
    await expect(field(page, 'term-english')).toBeDisabled();
    // The translation's fields are not offered, since this dialog does not save them.
    for (const id of ['term-icelandic', 'term-alternatives', 'term-definition-is', 'term-notes']) {
      await expect(field(page, id)).toBeHidden();
    }

    await field(page, 'term-pos').fill('n');
    await field(page, 'term-definition-en').fill('An English definition');
    await termModal(page).getByRole('button', { name: 'Vista' }).click();

    // The detail opens again on what was saved.
    await expect(page.locator('#detail-modal')).toBeVisible();
    // The page says "flettiorð" ([USER] 2026-11-14), not the calque "orðhaus".
    await expect(page.locator('body')).not.toContainText('orðhaus');
    await expect(page.locator('#detail-pos')).toHaveText('n');
    const saved = await getTerm(page, term.id);
    expect(saved.pos).toBe('n');
    expect(saved.definitionEn).toBe('An English definition');
    expect(saved.translations[0].icelandic).toBe('upphafleg-þýðing');
  });

  test('a new term saves after "Bæta við þýðingu" was cancelled (TE-02)', async ({ page }) => {
    const term = await makeTerm(page, 'admin', 'eitthvað');
    await openDetail(page, 'admin', term.id);
    failOnAlert(page);

    await page.locator('#detail-modal').getByRole('button', { name: 'Bæta við þýðingu' }).click();
    await expect(termModal(page)).toBeVisible();
    await termModal(page).getByRole('button', { name: 'Hætta við' }).click();

    await page.locator('button', { hasText: 'Bæta við' }).first().click();
    await expect(field(page, 'term-english')).toBeEnabled();
    const english = uid();
    await field(page, 'term-english').fill(english);
    await field(page, 'term-icelandic').fill('nýtt-orð');
    const posted = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === API
    );
    await termModal(page).getByRole('button', { name: 'Vista' }).click();
    const response = await posted;
    expect(response.status()).toBe(201);
    created.push((await response.json()).term.id);
    await expect(termModal(page)).toBeHidden();
  });

  test('"Aðrar þýðingar" become translations of the new term (TE-04)', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/terminology');
    failOnAlert(page);

    await page.locator('button', { hasText: 'Bæta við' }).first().click();
    const english = uid();
    await field(page, 'term-english').fill(english);
    await field(page, 'term-icelandic').fill('fyrsta');
    // A repeat and the main translation itself are not added twice.
    await field(page, 'term-alternatives').fill('önnur, þriðja , önnur, fyrsta');
    const posted = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === API
    );
    await termModal(page).getByRole('button', { name: 'Vista' }).click();
    const id = (await (await posted).json()).term.id;
    created.push(id);
    await expect(termModal(page)).toBeHidden();

    await expect
      .poll(async () => (await getTerm(page, id)).translations.map((t) => t.icelandic).sort())
      .toEqual(['fyrsta', 'önnur', 'þriðja']);
  });
});

test.describe('correcting a translation (the proposer until approved; a head editor while unapproved)', () => {
  const correctButton = (page) =>
    page.locator('#detail-translations').getByRole('button', { name: 'Leiðrétta' });

  test('an editor corrects their own proposed translation', async ({ page }) => {
    const term = await makeTerm(page, 'editor', 'stafsetningarvila');
    await openDetail(page, 'editor', term.id);
    failOnAlert(page);

    await correctButton(page).click();
    await expect(termModal(page)).toBeVisible();
    await expect(page.locator('#modal-title')).toContainText('Leiðrétta þýðingu');
    await expect(field(page, 'term-icelandic')).toHaveValue('stafsetningarvila');
    // A correction does not offer the headword's own fields.
    await expect(field(page, 'term-pos')).toBeHidden();
    await expect(field(page, 'term-definition-en')).toBeHidden();

    await field(page, 'term-icelandic').fill('stafsetningarvilla');
    await field(page, 'term-notes').fill('lagað');
    await termModal(page).getByRole('button', { name: 'Vista' }).click();

    await expect(page.locator('#detail-translations')).toContainText('stafsetningarvilla');
    const saved = (await getTerm(page, term.id)).translations[0];
    expect(saved.icelandic).toBe('stafsetningarvilla');
    expect(saved.notes).toBe('lagað');
    expect(saved.status).toBe('proposed');
  });

  test("an editor is offered no correction of someone else's translation, nor of their own once approved", async ({
    page,
  }) => {
    const others = await makeTerm(page, 'admin', 'annarra');
    await openDetail(page, 'editor', others.id);
    await expect(page.locator('#detail-translations')).toContainText('annarra');
    await expect(correctButton(page)).toHaveCount(0);

    const own = await makeTerm(page, 'editor', 'mín');
    await openDetail(page, 'editor', own.id);
    await expect(correctButton(page)).toHaveCount(1);

    await loginAs(page, 'admin');
    const approved = await page.request.post(`${API}/translations/${own.translationId}/approve`);
    expect(approved.ok()).toBe(true);
    await openDetail(page, 'editor', own.id);
    await expect(page.locator('#detail-translations')).toContainText('mín');
    await expect(correctButton(page)).toHaveCount(0);
  });

  test("a head editor corrects someone else's proposed translation, and not an approved one", async ({
    page,
  }) => {
    const term = await makeTerm(page, 'editor', 'tillaga-yfirlesara');
    await openDetail(page, 'head-editor', term.id);
    failOnAlert(page);
    await correctButton(page).click();
    await field(page, 'term-icelandic').fill('leiðrétt-af-ritstjóra');
    await termModal(page).getByRole('button', { name: 'Vista' }).click();
    await expect(page.locator('#detail-translations')).toContainText('leiðrétt-af-ritstjóra');

    await loginAs(page, 'admin');
    expect(
      (await page.request.post(`${API}/translations/${term.translationId}/approve`)).ok()
    ).toBe(true);
    await openDetail(page, 'head-editor', term.id);
    await expect(correctButton(page)).toHaveCount(0);
  });
});
