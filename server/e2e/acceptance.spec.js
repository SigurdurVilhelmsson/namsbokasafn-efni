// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * MT acceptance (item 20b): accept → chip + stats change; keyboard cursor +
 * accept-and-advance; revoke restores the unhandled state.
 */

const BOOK = '__e2e-fixture__';
const CHAPTER = '1';
const MODULE = 'm68664';

async function openModule(page) {
  await page.goto(`/editor?book=${BOOK}&chapter=${CHAPTER}&module=${MODULE}`);
  await expect(page.locator('#editor-container')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#segments-body tr').first()).toBeVisible({ timeout: 10000 });
}

test.describe('MT acceptance', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('click-accept renders the Staðfest chip and bumps the stats chip', async ({ page }) => {
    await openModule(page);

    const acceptButtons = page.locator('#segments-body .btn-accept');
    const before = await acceptButtons.count();
    expect(before).toBeGreaterThan(0);

    // Accept the LAST unhandled row (other specs edit early rows of m68664)
    await acceptButtons.last().click();

    await expect(page.locator('#segments-body .edit-status.accepted').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('#stats-bar')).toContainText('staðfest');
    // One fewer accept button after reload
    await expect
      .poll(() => page.locator('#segments-body .btn-accept').count(), { timeout: 10000 })
      .toBeLessThan(before);
  });

  test('Ctrl+Shift+Enter positions the cursor, then accepts and advances', async ({ page }) => {
    await openModule(page);
    const before = await page.locator('#segments-body .btn-accept').count();
    test.skip(before < 2, 'needs at least two unhandled segments');

    // Press 1: cursor appears, nothing accepted
    await page.keyboard.press('Control+Shift+Enter');
    await expect(page.locator('#segments-body tr.kbd-cursor')).toHaveCount(1);
    expect(await page.locator('#segments-body .btn-accept').count()).toBe(before);

    // Press 2: cursor row accepted, cursor advanced
    await page.keyboard.press('Control+Shift+Enter');
    await expect
      .poll(() => page.locator('#segments-body .btn-accept').count(), { timeout: 10000 })
      .toBe(before - 1);
    await expect(page.locator('#segments-body tr.kbd-cursor')).toHaveCount(1);
  });

  test('revoke returns the segments to unhandled (cleanup)', async ({ page }) => {
    await openModule(page);
    // Revoke every acceptance this spec created
    // (button text from UI.acceptance.revokeButton)
    page.on('dialog', (d) => d.accept());
    const revokeButtons = page.locator('#segments-body button:has-text("Afturkalla staðfestingu")');
    let remaining = await revokeButtons.count();
    while (remaining > 0) {
      await revokeButtons.first().click();
      // revokeAcceptance() does confirm() -> POST -> loadModule(force:true),
      // an async re-render; poll until the button count actually drops
      // before re-reading it at the top of the loop (a bare "some row is
      // visible" check races the reload and can leave `remaining` stale).
      await expect.poll(() => revokeButtons.count(), { timeout: 10000 }).toBeLessThan(remaining);
      remaining = await revokeButtons.count();
    }
    await expect(page.locator('#segments-body .edit-status.accepted')).toHaveCount(0);
  });
});
