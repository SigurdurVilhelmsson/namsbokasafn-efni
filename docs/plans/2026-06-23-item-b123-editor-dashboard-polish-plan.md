# Items B-1/B-2/B-3 — Editor & Dashboard Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three independent UX fixes — Icelandic section title in the editor header (B-1), a queue-aware "Today" empty-state for reviewers (B-2), and a clearer "ready to publish" label (B-3).

**Architecture:** B-1 derives `titleIs` from the module's `title`-type segment (already in the editor payload) in `loadModuleForEditing`, and the frontend prefers it. B-2 extracts the empty-state decision into a pure `buildEmptyTaskMessage` helper (unit-testable) and makes `renderCurrentTask` queue-aware. B-3 is copy + tooltip changes in `my-work.html`.

**Tech Stack:** Vanilla browser JS, Node.js, Playwright (E2E + `page.evaluate` unit). No new dependencies.

**Design:** [`2026-06-23-item-b123-editor-dashboard-polish-design.md`](2026-06-23-item-b123-editor-dashboard-polish-design.md)

## Global Constraints

- All user-facing copy is **Icelandic**. Exact strings are given verbatim in each task.
- No schema change, no change to what counts as pending/ready (read-model untouched), no new dependencies.
- Translations are pipeline/Miðeind-sourced, never AI-generated — B-1 only *surfaces* an existing translated title segment.
- Branch: `feature/item-b123-editor-dashboard-polish` (already created off `main`, holds the design doc).
- E2E webServer auto-starts with the test JWT secret (`server/e2e/playwright.config.js`); kill any reused server on :3456 before a run so edited files reload.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `server/services/segmentParser.js` | `loadModuleForEditing` — add `titleIs` from the title segment. | Modify (~:267–279) |
| `server/public/js/segment-editor.js` | Header (`:527`) + breadcrumb (`:558`) prefer `titleIs`. | Modify |
| `server/views/my-work.html` | `buildEmptyTaskMessage` helper; queue-aware `renderCurrentTask`; B-3 label + tooltip. | Modify |
| `server/e2e/segment-editor.spec.js` | E2E: editor header shows Icelandic section title (B-1). | Modify |
| `server/e2e/smoke.spec.js` | `page.evaluate` unit of `buildEmptyTaskMessage` (B-2) + B-3 label/tooltip assertion. | Modify |

Tasks are independent and can be reviewed separately.

---

## Task 1: B-1 — Icelandic section title in the editor header

**Files:**
- Modify: `server/services/segmentParser.js` (`loadModuleForEditing` return, ~:267)
- Modify: `server/public/js/segment-editor.js` (`renderModule`, `:527` and `:557`)
- Test: `server/e2e/segment-editor.spec.js`

**Interfaces:**
- Consumes: `paired` segment array (each `{ segmentId, segmentType, en, is, ... }`) already built in `loadModuleForEditing`.
- Produces: `moduleData.titleIs` (string|null) in the GET-module response; header/breadcrumb prefer it.

- [ ] **Step 1: Write the failing E2E test**

Append to `server/e2e/segment-editor.spec.js` a new describe block (it can reuse the file's existing `loginAs` import):

```js
test.describe('B-1 Icelandic section title in editor header', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('module GET returns the translated section title', async ({ page }) => {
    // m68664 (efnafraedi-2e ch01) has a translated title segment: "Efnafræði í samhengi"
    const res = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68664');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.titleIs).toBe('Efnafræði í samhengi');
  });

  test('editor header shows the Icelandic title, not the module id', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');
    await page.locator('#book-select').selectOption('efnafraedi-2e');
    const chapterSelect = page.locator('#chapter-select');
    await expect(chapterSelect).toBeVisible({ timeout: 5000 });
    await expect.poll(() => chapterSelect.locator('option').count(), { timeout: 10000 }).toBeGreaterThan(1);
    await chapterSelect.selectOption('1');
    // Open the m68664 module card specifically
    await page.locator('.module-card[onclick*="m68664"]').click();
    await expect(page.locator('#module-title')).toContainText('Efnafræði í samhengi', { timeout: 10000 });
    await expect(page.locator('#module-title')).not.toContainText('Chemistry in Context');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js -g "Icelandic section title" --reporter=line`
Expected: FAIL — `body.titleIs` is `undefined` (not returned yet); header shows "Chemistry in Context".

- [ ] **Step 3: Add `titleIs` to `loadModuleForEditing`**

In `server/services/segmentParser.js`, in the `return {` block of `loadModuleForEditing` (~:267), add a `titleIs` field derived from the title segment. Insert just before `title:` (or right after it):

```js
  const titleSeg = paired.find((s) => s.segmentType === 'title');
  return {
    book,
    chapter,
    moduleId,
    isSource,
    title: structure ? structure.title?.text : moduleId,
    titleIs: titleSeg && titleSeg.is ? titleSeg.is : null,
    segments: paired,
    equations,
    segmentCount: paired.length,
    translatedCount: paired.filter((s) => s.hasTranslation).length,
    extractedAt: manifest?.extractedAt || null,
    sourceHash: manifest?.sourceHash || null,
  };
```

(The `const titleSeg = …` line goes above the `return`.)

- [ ] **Step 4: Prefer `titleIs` in the editor header + breadcrumb**

In `server/public/js/segment-editor.js`, `renderModule`:

Change `:527`:
```js
    titleEl.textContent = moduleData.title || moduleData.moduleId;
```
to:
```js
    titleEl.textContent = moduleData.titleIs || moduleData.title || moduleData.moduleId;
```

Change the head-editor id-tag guard `:528` so the muted id tag still appears when only `titleIs` is present:
```js
    if (isHeadEditorView && (moduleData.titleIs || moduleData.title)) {
```

Change the breadcrumb `:557–559`:
```js
      topbarTitle.textContent =
        moduleData.titleIs ||
        moduleData.title ||
        (moduleData.chapter === -1 ? 'Viðaukar' : 'Kafli ' + moduleData.chapter);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js -g "Icelandic section title" --reporter=line`
Expected: PASS (both tests).

- [ ] **Step 6: Run the full segment-editor spec (no regression)**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js --reporter=line`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add server/services/segmentParser.js server/public/js/segment-editor.js server/e2e/segment-editor.spec.js
git commit -m "feat(editor): show Icelandic section title in header (B-1)"
```

---

## Task 2: B-2 — Queue-aware "Today" empty-state

**Files:**
- Modify: `server/views/my-work.html` (`renderCurrentTask` `:1319`, its call site `:1282`, new helper, `window` exposure)
- Test: `server/e2e/smoke.spec.js`

**Interfaces:**
- Consumes: `todayData.currentTask`, `todayData.adminStats` (`{ globalPendingCount, readyToApplyCount }`), `todayData.user.role`.
- Produces: `window.buildEmptyTaskMessage(isReviewer, pendingCount, readyCount)` → `{ heading, body, actionLabel?, actionHref? }`.

- [ ] **Step 1: Write the failing test**

Append to `server/e2e/smoke.spec.js`, inside the `Authenticated pages (admin)` describe (after the `library` tests, before the closing `});` of that describe):

```js
  test('buildEmptyTaskMessage is queue-aware (B-2)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const fn = (args) => window.buildEmptyTaskMessage(args.r, args.p, args.k);

    const reviewerPending = await page.evaluate(fn, { r: true, p: 14, k: 0 });
    expect(reviewerPending.heading).toBe('Engin ritstjórnarverkefni í dag');
    expect(reviewerPending.body).toContain('14');
    expect(reviewerPending.body).toContain('úrskurðar');
    expect(reviewerPending.actionHref).toBe('/editor?view=reviews');

    const reviewerReady = await page.evaluate(fn, { r: true, p: 0, k: 3 });
    expect(reviewerReady.body).toContain('birtingar');
    expect(reviewerReady.actionHref).toBe('/editor?view=reviews');

    const reviewerIdle = await page.evaluate(fn, { r: true, p: 0, k: 0 });
    expect(reviewerIdle.heading).toBe('Ekkert verkefni í dag!');
    expect(reviewerIdle.actionHref).toBeUndefined();

    const editor = await page.evaluate(fn, { r: false, p: 0, k: 0 });
    expect(editor.heading).toBe('Ekkert verkefni í dag!');

    const singular = await page.evaluate(fn, { r: true, p: 1, k: 0 });
    expect(singular.body).toContain('1 breyting bíður');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test smoke.spec.js -g "buildEmptyTaskMessage" --reporter=line`
Expected: FAIL — `window.buildEmptyTaskMessage is not a function`.

- [ ] **Step 3: Add the pure helper + expose it**

In `server/views/my-work.html`, add this function just before `function renderCurrentTask(` (~:1319):

```js
    // B-2: decide the empty-"Today" message. Pure — unit-tested via page.evaluate.
    function buildEmptyTaskMessage(isReviewer, pendingCount, readyCount) {
      if (isReviewer && pendingCount > 0) {
        return {
          heading: 'Engin ritstjórnarverkefni í dag',
          body: pendingCount + (pendingCount === 1 ? ' breyting bíður' : ' breytingar bíða') + ' úrskurðar þíns.',
          actionLabel: 'Skoða úrlausnir',
          actionHref: '/editor?view=reviews',
        };
      }
      if (isReviewer && readyCount > 0) {
        return {
          heading: 'Engin ritstjórnarverkefni í dag',
          body: readyCount + (readyCount === 1 ? ' samþykkt breyting bíður' : ' samþykktar breytingar bíða') + ' birtingar.',
          actionLabel: 'Skoða úrlausnir',
          actionHref: '/editor?view=reviews',
        };
      }
      return {
        heading: 'Ekkert verkefni í dag!',
        body: 'Þú hefur lokið öllum verkefnum. Slakaðu á eða biddu eftir nýjum úthlutunum.',
      };
    }
    window.buildEmptyTaskMessage = buildEmptyTaskMessage;
```

- [ ] **Step 4: Make `renderCurrentTask` queue-aware**

In `server/views/my-work.html`, change the call site `:1282`:
```js
        renderCurrentTask(todayData.currentTask);
```
to:
```js
        renderCurrentTask(todayData.currentTask, todayData);
```

Replace the empty-state branch of `renderCurrentTask` (`:1319–1330`):
```js
    function renderCurrentTask(task) {
      var container = document.getElementById('current-task-card');

      if (!task) {
        container.innerHTML =
          '<div class="empty-task">' +
            '<div class="empty-icon">🎉</div>' +
            '<h3>Ekkert verkefni í dag!</h3>' +
            '<p>Þú hefur lokið öllum verkefnum. Slakaðu á eða biddu eftir nýjum úthlutanum.</p>' +
          '</div>';
        return;
      }
```
with:
```js
    function renderCurrentTask(task, todayData) {
      var container = document.getElementById('current-task-card');

      if (!task) {
        var stats = (todayData && todayData.adminStats) || null;
        var role = todayData && todayData.user && todayData.user.role;
        var isReviewer = !!stats && (role === 'admin' || role === 'head-editor');
        var msg = buildEmptyTaskMessage(
          isReviewer,
          stats ? (stats.globalPendingCount || 0) : 0,
          stats ? (stats.readyToApplyCount || 0) : 0
        );
        var action = msg.actionHref
          ? '<a href="' + msg.actionHref + '" class="btn btn-primary btn-sm">' + escapeHtml(msg.actionLabel) + '</a>'
          : '';
        container.innerHTML =
          '<div class="empty-task">' +
            (msg.actionHref ? '' : '<div class="empty-icon">🎉</div>') +
            '<h3>' + escapeHtml(msg.heading) + '</h3>' +
            '<p>' + escapeHtml(msg.body) + '</p>' +
            action +
          '</div>';
        return;
      }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test smoke.spec.js -g "buildEmptyTaskMessage" --reporter=line`
Expected: PASS.

- [ ] **Step 6: Run the home/my-work smoke test (no JS errors)**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test smoke.spec.js -g "home (my-work)" --reporter=line`
Expected: PASS (the page still renders without uncaught errors).

- [ ] **Step 7: Commit**

```bash
git add server/views/my-work.html server/e2e/smoke.spec.js
git commit -m "feat(dashboard): queue-aware Today empty-state for reviewers (B-2)"
```

---

## Task 3: B-3 — Clarify the "Tilbúið að beita" label

**Files:**
- Modify: `server/views/my-work.html` (quick-stat label `:1298`, list empty-state `:1796`)
- Test: `server/e2e/smoke.spec.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: a clearer label + tooltip on the 2nd quick-stat for reviewers.

- [ ] **Step 1: Write the failing test**

Append to `server/e2e/smoke.spec.js` a new describe block (head-editor sees the reviewer quick-stats):

```js
test.describe('B-3 ready-to-publish label', () => {
  test('quick-stat label is clarified with a tooltip', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const statItem = page.locator('#quick-stats .quick-stat-item:nth-child(2)');
    await expect(statItem.locator('.quick-stat-label')).toHaveText('Samþykkt, bíður birtingar', { timeout: 5000 });
    await expect(statItem).toHaveAttribute('title', /beita og birta/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test smoke.spec.js -g "ready-to-publish label" --reporter=line`
Expected: FAIL — label currently reads "Tilbúið að beita"; no `title` attribute.

- [ ] **Step 3: Relabel + add tooltip**

In `server/views/my-work.html`, the reviewer quick-stats block (`:1297–1298`), change:
```js
            document.getElementById('stat-pending').textContent = todayData.adminStats.readyToApplyCount;
            document.querySelector('#quick-stats .quick-stat-item:nth-child(2) .quick-stat-label').textContent = 'Tilbúið að beita';
```
to:
```js
            document.getElementById('stat-pending').textContent = todayData.adminStats.readyToApplyCount;
            document.querySelector('#quick-stats .quick-stat-item:nth-child(2) .quick-stat-label').textContent = 'Samþykkt, bíður birtingar';
            document.querySelector('#quick-stats .quick-stat-item:nth-child(2)').title = 'Samþykktar breytingar sem á eftir að beita og birta (Vista + Birta)';
```

Also update the matching list empty-state (`:1796`) for consistency:
```js
        listEl.innerHTML = '<div class="empty-state"><p>Ekkert tilbúið að beita</p></div>';
```
to:
```js
        listEl.innerHTML = '<div class="empty-state"><p>Ekkert bíður birtingar</p></div>';
```

(Leave the unrelated "Tilbúið til úthlutunar" heading at `:1114` untouched.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test smoke.spec.js -g "ready-to-publish label" --reporter=line`
Expected: PASS.

- [ ] **Step 5: Run the full smoke spec (no regression)**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test smoke.spec.js --reporter=line`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add server/views/my-work.html server/e2e/smoke.spec.js
git commit -m "feat(dashboard): clarify ready-to-publish label + tooltip (B-3)"
```

---

## Final verification

- [ ] **Lint:** `npx eslint server/services/segmentParser.js server/public/js/segment-editor.js` → clean. (HTML view files aren't linted by the JS config.)
- [ ] **Full E2E:** `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js smoke.spec.js --reporter=line` → all green.
- [ ] **Unit suite unaffected:** `npx vitest run --project server` → green (B-1 touches segmentParser; confirm no parser test regressed).

## Self-review notes (coverage vs. spec)

- B-1 (editor titleIs from title segment; header + breadcrumb prefer it; editor-only) → Task 1. ✅ Backend source corrected to the title segment (not enrichModules). Head-editor id-tag guard updated so the muted id still shows.
- B-2 (pure `buildEmptyTaskMessage`; queue-aware render; relax only when all queues empty; review-queue link) → Task 2. ✅
- B-3 (relabel + tooltip; consistent list empty-state; leave "til úthlutunar" alone) → Task 3. ✅
- Global: Icelandic copy verbatim; no schema/read-model/dependency change; translations only surfaced, never generated. ✅
