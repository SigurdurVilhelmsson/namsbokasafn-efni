// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');
const { MTA_R3_ROWS } = require('./helpers/segments');

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
    const posted = page.waitForRequest((r) => r.url().endsWith('/accept') && r.method() === 'POST');
    await acceptButtons.last().click();
    expect((await posted).postDataJSON().acceptOrigin).toBe('single');

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
    const posted = page.waitForRequest((r) => r.url().endsWith('/accept') && r.method() === 'POST');
    await page.keyboard.press('Control+Shift+Enter');
    expect((await posted).postDataJSON().acceptOrigin).toBe('keyboard-stream');
    await expect
      .poll(() => page.locator('#segments-body .btn-accept').count(), { timeout: 10000 })
      .toBe(before - 1);
    await expect(page.locator('#segments-body tr.kbd-cursor')).toHaveCount(1);
  });

  /**
   * MTA-R3: the row-render chain used to be
   * `if (latestEdit) … else if (acceptance) … else`, so a contested row never
   * offered "Staðfesta MT" — and had it, the chip and revoke button would have
   * been shadowed too, making the acceptance invisible and unrevokable.
   */
  test('MTA-R3: a rejected edit still offers Staðfesta MT, beside its history chip', async ({
    page,
  }) => {
    await openModule(page);
    page.on('dialog', (d) => d.accept('MTA-R3 próf'));

    // Three rows of its own (helpers/segments.js MTA_R3_ROWS; register §C230). It used to take the first row
    // offering "Staðfesta MT", which is also the row editor-workflow edits, and the two collided under parallel
    // workers. A row someone else has touched fails here, by name, instead of somewhere downstream.
    const state = await (
      await page.request.get(`/api/segment-editor/${BOOK}/${CHAPTER}/${MODULE}`)
    ).json();
    for (const id of Object.values(MTA_R3_ROWS)) {
      expect(state.edits[id] || [], `${id} must be MTA-R3's alone (§C230)`).toEqual([]);
      expect((state.acceptances || {})[id], `${id} must be MTA-R3's alone (§C230)`).toBeFalsy();
    }
    const rowOf = (id) => page.locator(`tr[id="row-${id.replace(/[^a-zA-Z0-9-]/g, '_')}"]`);
    const row = rowOf(MTA_R3_ROWS.target);

    // Give the target row a REJECTED edit.
    await row.locator('.btn-edit').click();
    const textarea = row.locator('textarea');
    // Append rather than replace: keeps any structural markers intact so the
    // save isn't blocked by segment-validation.
    await textarea.fill((await textarea.inputValue()) + ' MTA-R3.');
    await row.getByRole('button', { name: 'Vista', exact: true }).click();
    await expect(row.locator('.edit-status.pending')).toBeVisible({ timeout: 10000 });

    await row.locator('.btn-reject').click();
    await expect(row.locator('.edit-status.rejected')).toBeVisible({ timeout: 10000 });

    // THE FIX: contested, but the MT still stands and may be attested.
    await expect(row.locator('.btn-accept')).toBeVisible();

    // The reason is ON SCREEN, not in a title= tooltip (the whole argument for
    // widening the gate at all — an editor must see that a colleague contested
    // this text before attesting it).
    await expect(row.locator('.accept-context-hint')).toHaveText(
      'Breytingu var hafnað — vélþýðingin stendur óbreytt.'
    );

    // The branch's headline SAFETY property: the Ctrl+Shift+Enter stream is
    // deliberately narrower than the accept gate, so rapid-fire attestation can
    // never sweep a head editor's rejection. The cursor must skip this row even
    // though it now carries an accept button.
    //
    // Accepting the row just before it moves the stream's cursor to the next row the stream may accept
    // (acceptSegmentAndAdvance → nextUnhandledAfter, the same rule Ctrl+Shift+Enter advances by). It must jump over
    // the rejected row to the one after it. Asserting the exact landing row keeps the check strong wherever the
    // three rows sit: the old form pressed Ctrl+Shift+Enter on a fresh page, which only meant something while the
    // contested row happened to be the first one the stream would reach.
    await rowOf(MTA_R3_ROWS.before).locator('.btn-accept').click();
    await expect(rowOf(MTA_R3_ROWS.before).locator('.edit-status.accepted')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('#segments-body tr.kbd-cursor')).toHaveCount(1);
    await expect(rowOf(MTA_R3_ROWS.after)).toHaveClass(/kbd-cursor/);
    await expect(row).not.toHaveClass(/kbd-cursor/);

    await row.locator('.btn-accept').click();

    // Compound chip — acceptance NEXT TO the retained history, not instead of it.
    await expect(row.locator('.edit-status.accepted')).toBeVisible({ timeout: 10000 });
    await expect(row.locator('.edit-status.rejected')).toBeVisible();
    // ...and the state is escapable, which it was not before.
    const revoke = row.locator('button:has-text("Afturkalla staðfestingu")');
    await expect(revoke).toBeVisible();

    await revoke.click();
    await expect.poll(() => row.locator('.btn-accept').count(), { timeout: 10000 }).toBe(1);

    // Cleanup, ASSERTED — a silent teardown failure leaves a permanent rejected
    // edit on this shared fixture module and makes every other spec's view of
    // its early rows order-dependent. deleteSegmentEdit refuses anything but a
    // pending edit, so the rejected row must be reopened first.
    await row.locator('button:has-text("Opna aftur")').click();
    await expect(row.locator('.edit-status.pending')).toBeVisible({ timeout: 10000 });

    const data = await (
      await page.request.get(`/api/segment-editor/${BOOK}/${CHAPTER}/${MODULE}`)
    ).json();
    for (const list of Object.values(data.edits || {})) {
      for (const e of list) {
        if (typeof e.edited_content === 'string' && e.edited_content.endsWith(' MTA-R3.')) {
          const res = await page.request.delete(`/api/segment-editor/edit/${e.id}`);
          expect(res.status(), 'teardown DELETE must succeed').toBe(200);
        }
      }
    }

    // The row is virgin again: no history chip, accept offered.
    await page.reload();
    await expect(page.locator('#editor-container')).toBeVisible({ timeout: 15000 });
    await expect(row.locator('.edit-status')).toHaveCount(0);
    await expect(row.locator('.btn-accept')).toBeVisible();
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
