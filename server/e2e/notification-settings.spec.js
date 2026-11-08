// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * §C210: the Home page's notification settings ("Stillingar") are reachable again.
 *
 * my-work.html kept a full settings modal — openSettingsModal(), the preference
 * list built from GET /api/notifications/preferences, and savePreferences(), even
 * with a visitor branch added on 2026-10-24 — but the 2026-02-20 Home redesign
 * (5cc964375) dropped the only button that opened it. The preferences are live:
 * they decide whether an in-app notification is created at all
 * (notifications.isNotificationEnabled). So the button is restored, not the modal
 * removed.
 *
 * E2E sessions carry no users row, so the preferences route treats them as
 * visitors: GET still lists the categories, and a save is answered with the
 * visitor message. A MEMBER's save is covered server-side by
 * server/__tests__/visitorSessions.test.js ("still saves a member's preferences").
 */

async function openHome(page) {
  await loginAs(page, 'editor');
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

test.describe('§C210 notification settings on Heim', () => {
  test('a "Stillingar" button opens the settings with the notification categories', async ({
    page,
  }) => {
    await openHome(page);
    const button = page.locator('#settings-btn');
    await expect(button).toBeVisible({ timeout: 5000 });
    await button.click();

    const modal = page.locator('#settings-modal');
    await expect(modal).toBeVisible();
    // The list is built from GET /api/notifications/preferences.
    await expect(modal.locator('.preference-item').first()).toBeVisible({ timeout: 5000 });
    expect(await modal.locator('.preference-item').count()).toBeGreaterThan(0);
  });

  test('"Hætta við" closes the settings', async ({ page }) => {
    await openHome(page);
    await page.locator('#settings-btn').click();
    const modal = page.locator('#settings-modal');
    await expect(modal).toBeVisible();
    await modal.locator('.modal-footer .btn-secondary').click();
    await expect(modal).toBeHidden();
  });

  test('saving reaches the server: a session with no account is told guests get no notifications', async ({
    page,
  }) => {
    await openHome(page);
    await page.locator('#settings-btn').click();
    const modal = page.locator('#settings-modal');
    await expect(modal.locator('.preference-item').first()).toBeVisible({ timeout: 5000 });

    const put = page.waitForResponse(
      (r) => r.url().endsWith('/api/notifications/preferences') && r.request().method() === 'PUT'
    );
    await modal.locator('.modal-footer .btn-primary').click();
    expect((await put).status()).toBe(403); // the visitor answer, from the real route

    await expect(page.locator('.toast')).toContainText('Gestir fá engar tilkynningar');
    await expect(modal).toBeHidden();
  });
});
