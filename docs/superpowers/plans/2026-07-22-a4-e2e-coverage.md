# A4 E2E coverage — PR 1 (efni) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add A4-row-tagged Playwright E2E tests to `server/e2e/` that machine-verify the robust high-value subset of the A4 QA gate (§0–§5), so the deploy gate becomes an auditable green set.

**Architecture:** New `server/e2e/a4-coverage.spec.js` for the cross-cutting flows, plus targeted extensions to `rbac.spec.js` and `segment-editor.spec.js`. Auth via the existing minted-JWT cookie helper (`loginAs`); mutating flows driven API-first (the codebase idiom — `review-cycle.spec.js`). Every test title begins with its A4 row id (`§0.3a …`).

**Tech Stack:** Playwright (`@playwright/test`), the efni E2E harness (`server/e2e/`, `:3456`, throwaway `e2e-sessions.db`), role-cookie auth.

**Design spec:** `docs/superpowers/specs/2026-07-22-a4-e2e-coverage-design.md`.

## Scope decisions (recon-driven — carry to final review)

- **§4a/§4b DROPPED (finding, not a test):** the `/` my-work "current task" header renders the raw `module_id` (`server/views/my-work.html:1249`, `task.section` = unresolved id from `server/routes/my-work.js:86`), and the task URL carries `module=mNNNNN` (`my-work.js:51-60`). These rows describe behavior the app does not have → a passing coverage test is impossible. Task 8 logs this as a UX finding; do NOT write §4a/§4b tests.
- **§2 (localization review tier) + §3 (assignment enforcement) DEFERRED to a follow-up "PR 1b":** both need persistent `book_settings` toggles on the single shared E2E server/DB (cross-spec-parallel leak hazard), and §3 additionally needs a seeded DB user whose `provider_id` matches the JWT `sub` plus an assignment row — no existing E2E seeding idiom (`seed-fixture.js` seeds no users/settings). Their logic is already unit-covered (`assignmentEnforcement.test.js`, `localizationReviewService.test.js`). PR 1b will register a dedicated fixture book (e.g. `__e2e-enforce__`) + seed a user in `seed-fixture.js` to isolate the toggles. Out of scope here.
- **Already-green rows NOT re-tested:** §4d (`concurrent-editing.spec`), §5d (`smoke.spec`), CSP (`csp.spec`), the §0.3 basics already in `rbac.spec`.

## Global Constraints

- **Auth helper (verbatim idiom):** `const { loginAs } = require('./helpers/auth');` then `await loginAs(page, role, userId?)` where role ∈ `'admin'|'head-editor'|'editor'|'viewer'`. Cookie = `auth_token`, domain `localhost`. Switch actor by calling `loginAs` again. `head-editor` tokens carry `books: ['efnafraedi-2e','__e2e-fixture__']` (so acting on `liffraedi-2e` is genuinely cross-book → 403). `admin` bypasses book scope.
- **API idiom:** call endpoints via `page.request.<method>(path, {data|multipart})` — the injected cookie rides along. Unauthenticated = a fresh `browser.newContext({ baseURL: 'http://localhost:3456' })` with no cookie.
- **Run-unique IDs:** `const RUN_ID = Date.now();` then derive userIds (`70000 + (RUN_ID % 10000)`) and content markers (`[e2e-${RUN_ID}]`) — mirrors `review-cycle.spec.js`/`concurrent-editing.spec.js`. (Do not use `Math.random` for the numeric userId; the offset-mod idiom is the codebase standard.)
- **Fixture facts:** book `__e2e-fixture__`, chapter `1`, module `m68663` (11 segments, has `03-faithful-translation/ch01/m68663-*`). `efnafraedi-2e` ch1 m68664 = translated section, m68667 has `[[MATH:N]]`. `liffraedi-2e` is registered but content may be absent (tolerant asserts).
- **Non-vacuous proof:** these assert existing behavior, so each test PASSES immediately. Prove it is non-vacuous with a **mutation check**: temporarily break the guard/behavior, run the focused test, confirm it goes RED, then revert. Record the mutation + red output in the task report. A coverage test with no mutation check is a plan failure.
- **Tagging:** every test title starts with its A4 row id, e.g. `test('§0.3a headY approve on Book X → 403', …)`.
- **Command:** `npm run test:e2e` (full E2E); focused: `npx playwright test --config=e2e/playwright.config.js <spec> -g '<title grep>'`. Kill `:3456` first if a stale server is up. Run the FULL Vitest suite (`npm test`, repo root) once before the final commit too.
- **Branch:** `feat/a4-e2e-coverage`. Base current `main`.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- **Create** `server/e2e/a4-coverage.spec.js` — Tasks 1, 4, 5, 6, 7 (new cross-cutting flows).
- **Modify** `server/e2e/rbac.spec.js` — Task 2 (cross-book authz + no-session).
- **Modify** `server/e2e/segment-editor.spec.js` — Task 3 (preview guards).

---

## Task 1: `a4-coverage.spec.js` scaffold + §0.reg full approve/apply chain

**Files:** Create `server/e2e/a4-coverage.spec.js`.
**Interfaces:** Consumes `loginAs`. Endpoints (base `API='/api/segment-editor'`): `GET ${API}/:book/:ch/:module` → `{segments:[{segmentId,is,...}]}`; `POST ${API}/:book/:ch/:module/edit` `{segmentId,originalContent,editedContent,category}` → `{editId}`; `POST ${API}/:book/:ch/:module/submit` → `{reviewId}` (or 409 → look up via `GET ${API}/review-queue?book=`); `POST ${API}/edit/:editId/approve` `{note}` → `{success:true}`; `POST ${API}/reviews/:reviewId/complete` → `{status:'approved',applied:{appliedCount}}`.

- [ ] **Step 1: Write the test** (mirror `review-cycle.spec.js`, but assert the WHOLE chain as one serial flow — this is the §0.reg gap "full chain not asserted as one flow"):

```js
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

const API = '/api/segment-editor';
const BOOK = '__e2e-fixture__';
const CHAPTER = '1';
const MODULE = 'm68663';
const RUN_ID = Date.now();
const EDITOR_ID = 70000 + (RUN_ID % 10000);
const REVIEWER_ID = 80000 + (RUN_ID % 10000);
const MARKER = `[e2e-a4-${RUN_ID}]`;

test.describe.serial('§0.reg full editor→submit→approve→apply chain', () => {
  let segmentId, originalContent, editId, reviewId;

  test('§0.reg-1 editor saves an edit', async ({ page }) => {
    await loginAs(page, 'admin', EDITOR_ID);
    const data = await (await page.request.get(`${API}/${BOOK}/${CHAPTER}/${MODULE}`)).json();
    const seg = data.segments.find((s) => s.is && s.is.length > 0);
    expect(seg, 'fixture module must have a translated segment').toBeTruthy();
    segmentId = seg.segmentId;
    originalContent = seg.is;
    const res = await page.request.post(`${API}/${BOOK}/${CHAPTER}/${MODULE}/edit`, {
      data: { segmentId, originalContent, editedContent: `${originalContent} ${MARKER}`, category: 'terminology' },
    });
    expect(res.status()).toBe(200);
    editId = (await res.json()).editId;
    expect(editId).toBeTruthy();
  });

  test('§0.reg-2 editor submits the module for review', async ({ page }) => {
    await loginAs(page, 'admin', EDITOR_ID);
    const res = await page.request.post(`${API}/${BOOK}/${CHAPTER}/${MODULE}/submit`);
    if (res.status() === 409) {
      const q = await (await page.request.get(`${API}/review-queue?book=${BOOK}`)).json();
      reviewId = q.reviews.find((r) => r.module_id === MODULE).id;
    } else {
      expect(res.status()).toBe(200);
      reviewId = (await res.json()).reviewId;
    }
    expect(reviewId).toBeTruthy();
  });

  test('§0.reg-3 head-editor approves the edit', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);
    const res = await page.request.post(`${API}/edit/${editId}/approve`, { data: { note: `a4 ${MARKER}` } });
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  test('§0.reg-4 completing the review auto-applies to faithful', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);
    const res = await page.request.post(`${API}/reviews/${reviewId}/complete`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('approved');
    expect(data.applied.appliedCount).toBeGreaterThan(0);
  });

  test('§0.reg-5 the edit is present on reload', async ({ page }) => {
    await loginAs(page, 'admin', REVIEWER_ID);
    const data = await (await page.request.get(`${API}/${BOOK}/${CHAPTER}/${MODULE}`)).json();
    expect(data.segments.find((s) => s.segmentId === segmentId).is).toContain(MARKER);
  });
});
```

- [ ] **Step 2: Run — expect PASS** (behavior exists): `npx playwright test --config=e2e/playwright.config.js a4-coverage.spec.js -g '§0.reg'`. Expected: 5 passed. (If red, the fixture module lacks a translated segment — stop and report, don't weaken the test.)
- [ ] **Step 3: Mutation check (non-vacuous proof)** — temporarily edit `server/routes/segment-editor.js` `/reviews/:id/complete` handler to skip the apply (e.g. return before `applyApprovedEdits`), rerun `-g '§0.reg-4'`, confirm it goes **RED** on `appliedCount > 0`, then `git checkout server/routes/segment-editor.js`. Record the red output.
- [ ] **Step 4: Full E2E** — `npm run test:e2e` → all green (no regressions from the shared fixture edit).
- [ ] **Step 5: Commit**

```bash
git add server/e2e/a4-coverage.spec.js
git commit -m "test(e2e): §0.reg full approve/apply chain as one flow (A4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `rbac.spec.js` — §0.3 cross-book authz + §1e cross-book restore + §5b no-session

**Files:** Modify `server/e2e/rbac.spec.js`.
**Interfaces:** Consumes `loginAs`. `head-editor` books = `['efnafraedi-2e','__e2e-fixture__']`, so `liffraedi-2e` is a book they do NOT own. Endpoints: `POST /api/segment-editor/edit/:id/approve`; `POST /api/publication/:book/:ch/:track` (publish, head-editor-scoped); `POST /api/segment-editor/:book/:ch/:module/restore/:version` `{confirm:true}` (requireHeadEditor).

- [ ] **Step 1: Write the tests** (append to `rbac.spec.js`, mirror its `loginAs → page.request → expect 403` idiom; use a nonsense id where the action target doesn't matter — the 403 fires at the auth layer before the id is used):

```js
test.describe('§0.3/§1e cross-book head-editor authorization', () => {
  const OTHER_BOOK = 'liffraedi-2e'; // NOT in the head-editor token's books

  test('§0.3a head-editor approve on a non-owned book → 403', async ({ page }) => {
    await loginAs(page, 'head-editor');
    const resp = await page.request.post('/api/segment-editor/edit/999999/approve', { data: { note: 'x' } });
    expect(resp.status()).toBe(403);
  });

  test('§0.3d head-editor publish on a non-owned book → 403', async ({ page }) => {
    await loginAs(page, 'head-editor');
    const resp = await page.request.post(`/api/publication/${OTHER_BOOK}/1/mt-preview`);
    expect(resp.status()).toBe(403);
  });

  test('§0.3c admin publish is not blocked by book scope (not 403)', async ({ page }) => {
    await loginAs(page, 'admin');
    const resp = await page.request.post(`/api/publication/${OTHER_BOOK}/1/mt-preview`);
    expect(resp.status()).not.toBe(403); // may 400/404/500 on content, but never the authz 403
  });

  test('§1e head-editor restore on a non-owned book → 403', async ({ page }) => {
    await loginAs(page, 'head-editor');
    const resp = await page.request.post(`/api/segment-editor/${OTHER_BOOK}/1/m99999/restore/1`, {
      data: { confirm: true },
    });
    expect(resp.status()).toBe(403);
  });

  test('§5b state-changing request with no session → rejected', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: 'http://localhost:3456' });
    const anon = await context.newPage();
    const resp = await anon.request.post('/api/segment-editor/efnafraedi-2e/1/m68663/apply');
    expect([401, 403]).toContain(resp.status());
    await context.close();
  });
});
```

- [ ] **Step 2: Run — expect PASS:** `npx playwright test --config=e2e/playwright.config.js rbac.spec.js -g '§0.3|§1e|§5b'`. (Confirm `/api/publication/:book/:ch/:track` is the real publish path — grep `server/routes/publication.js`; if the segment differs, use the actual mount. The 403 must come from the book-scope middleware, not a 404.)
- [ ] **Step 3: Mutation check** — in `server/middleware/requireRole.js`, temporarily make `requireHeadEditor`/`requireHeadEditorFor` skip the `user.books.includes` check (return `next()`), rerun `-g '§0.3a'`, confirm RED (now 404/500 not 403), revert. Record.
- [ ] **Step 4: Full E2E** → green.
- [ ] **Step 5: Commit** `test(e2e): §0.3 cross-book authz + §1e restore + §5b no-session (A4)` + trailer.

---

## Task 3: `segment-editor.spec.js` — §0.1 preview guards

**Files:** Modify `server/e2e/segment-editor.spec.js`.
**Interfaces:** `GET /api/segment-editor/:book/:ch/:module/preview?track=` (requireAuth, requireRole EDITOR, validateBookChapter, validateModule). `VALID_TRACKS=['mt-preview','faithful','localized']`. `validateModule` regex `^(m\d{5}|chapter-metadata)$`.

- [ ] **Step 1: Write the tests** (append; note the path-traversal is via the `track` QUERY param — a `..` path SEGMENT is normalized by the client before it reaches the server, so test the module-id guard with a transmittable-but-invalid value like `m123`):

```js
test.describe('§0.1 live-preview guards', () => {
  test('§0.1a preview of a real module is not an invalid-input 400', async ({ page }) => {
    await loginAs(page, 'editor');
    const resp = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m68664/preview');
    expect(resp.status()).not.toBe(400); // 200 if inject ran, else 404 "run inject" — never a validation 400
  });

  test('§0.1b traversal track query is rejected 400', async ({ page }) => {
    await loginAs(page, 'editor');
    const resp = await page.request.get(
      '/api/segment-editor/efnafraedi-2e/1/m68664/preview?track=..%2F..%2F..%2Fetc%2Fpasswd'
    );
    expect(resp.status()).toBe(400);
  });

  test('§0.1c malformed module id is rejected 400', async ({ page }) => {
    await loginAs(page, 'editor');
    const resp = await page.request.get('/api/segment-editor/efnafraedi-2e/1/m123/preview');
    expect(resp.status()).toBe(400); // fails ^(m\d{5}|chapter-metadata)$
  });
});
```

- [ ] **Step 2: Run — expect PASS:** `-g '§0.1'`.
- [ ] **Step 3: Mutation check** — temporarily widen `VALID_TRACKS` (add `'..'`) OR loosen `validateModule`'s regex in `server/middleware/validateParams.js`; rerun the matching test; confirm RED; revert. Record.
- [ ] **Step 4: Full E2E** → green.
- [ ] **Step 5: Commit** `test(e2e): §0.1 preview track/module traversal guards (A4)` + trailer.

---

## Task 4: `a4-coverage.spec.js` — §0.4a stored-XSS rendered inert

**Files:** Modify `server/e2e/a4-coverage.spec.js`.
**Interfaces:** `POST /api/terminology/` `{english,icelandic,source,...}` → `201 {term:{id}}` (free-text `source` accepted only via API; the UI is a `<select>`). List render: `/editor` terminology panel or the terminology page renders source via `formatSource(src)` → `escapeHtml`. Cleanup: `DELETE /api/terminology/:id`.

- [ ] **Step 1: Write the test** (create the term with an XSS `source` via API, then load the terminology UI and assert the payload is inert — no dialog, no `window.__xss`, and the payload appears as escaped text. The implementer must open `server/views/terminology.html` to confirm the exact list container/search selector; the assertion below targets the documented `.term-source`/`.translation-meta` render + a global side-effect probe, which does not depend on the search path):

```js
test.describe('§0.4a stored-XSS in a term source renders inert', () => {
  const uid = `e2e-xss-${Date.now()}`;
  const PAYLOAD = `</script><img src=x onerror="window.__xss_fired=true">`;
  let termId;

  test.afterEach(async ({ page }) => {
    if (termId) { try { await page.request.delete(`/api/terminology/${termId}`); } catch {} }
  });

  test('§0.4a payload in source is escaped, no script executes', async ({ page }) => {
    await loginAs(page, 'admin');
    const res = await page.request.post('/api/terminology/', {
      data: { english: `${uid}-en`, icelandic: `${uid}-is`, source: PAYLOAD, subjects: ['chemistry'] },
    });
    expect(res.status()).toBe(201);
    termId = (await res.json()).term.id;

    let dialogFired = false;
    page.on('dialog', async (d) => { dialogFired = true; await d.dismiss(); });

    // Load the terminology surface; the created term is retrievable and rendered client-side.
    await page.goto('/editor');
    await page.waitForLoadState('networkidle');
    // Probe the client renderer directly with the stored value (formatSource is the render path).
    const rendered = await page.evaluate((src) => {
      // formatSource is defined in terminology.html's inline script scope; fall back to escapeHtml.
      const fn = window.formatSource || window.escapeHtml;
      return fn ? fn(src) : null;
    }, PAYLOAD);
    expect(rendered, 'client render helper must exist').not.toBeNull();
    expect(rendered).not.toContain('<img'); // escaped, not a live tag
    expect(rendered).toContain('&lt;'); // proof of escaping
    expect(await page.evaluate(() => window.__xss_fired)).toBeFalsy();
    expect(dialogFired).toBe(false);
  });
});
```

*(If `formatSource`/`escapeHtml` are not on `window` at `/editor`, the implementer loads the page that defines them — check `server/views/terminology.html` vs the `/editor` terminology panel — and adjusts `page.goto`. The assertion contract stays: rendered payload is escaped, `window.__xss_fired` never set.)*

- [ ] **Step 2: Run — expect PASS:** `-g '§0.4a'`.
- [ ] **Step 3: Mutation check** — temporarily make the client `escapeHtml` (`server/public/js/htmlUtils.js`) return its input unescaped; rerun; confirm RED (`<img` present / no `&lt;`); revert. Record.
- [ ] **Step 4: Full E2E** → green.
- [ ] **Step 5: Commit** `test(e2e): §0.4a stored-XSS term source renders inert (A4)` + trailer.

---

## Task 5: `a4-coverage.spec.js` — §5a page-auth redirect (no admin flash) + console-error sweep

**Files:** Modify `server/e2e/a4-coverage.spec.js`.
**Interfaces:** `/admin` (requirePageAuth → ADMIN); anon → redirect to `/login`. Console capture idiom: `page.on('pageerror'|'console')`.

- [ ] **Step 1: Write the tests:**

```js
test.describe('§5a page-auth + console sweep', () => {
  test('§5a anon /admin redirects to login, no admin DOM painted', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: 'http://localhost:3456' });
    const anon = await context.newPage();
    await anon.goto('/admin');
    await anon.waitForLoadState('networkidle');
    expect(anon.url()).toContain('/login');
    // admin-only controls never rendered
    expect(await anon.locator('#register-btn, button.tab[data-tab="users"]').count()).toBe(0);
    await context.close();
  });

  test('§sweep no console/page errors across editor surfaces', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await loginAs(page, 'admin');
    for (const route of ['/editor', '/localization', '/library', '/admin']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
    }
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect PASS:** `-g '§5a|§sweep'`. (If the sweep surfaces a real console error, that is a **finding** — report it; do not silence the assertion. It may reveal a genuine page bug the manual sweep would have caught.)
- [ ] **Step 3: Mutation check** — for §5a, temporarily change the `/admin` `requirePageAuth` role to `EDITOR`; confirm the anon test still redirects (page-auth) — instead mutate by removing the redirect (serve the page) and confirm RED (url no longer `/login`); revert. Record.
- [ ] **Step 4: Full E2E** → green.
- [ ] **Step 5: Commit** `test(e2e): §5a page-auth no-flash + console-error sweep (A4)` + trailer.

---

## Task 6: `a4-coverage.spec.js` — §4c pipeline/apply panels hidden for editor role

**Files:** Modify `server/e2e/a4-coverage.spec.js`.
**Interfaces:** `/editor` (segment-editor.html): `#pipeline-panel` + `#apply-panel` shown only for head-editor/admin (client `showPipelinePanel`/`showApplyPanel`). `/library` (books.html): `#pipeline-actions` shown only for head-editor/admin.

- [ ] **Step 1: Write the test** (navigate an existing module as `editor`, assert the head-editor-only panels are not visible; then as `head-editor`, assert at least one becomes visible — proving the assertion is role-sensitive, not just "always hidden"):

```js
test.describe('§4c pipeline/apply controls are role-gated', () => {
  test('§4c editor does not see pipeline/apply panels', async ({ page }) => {
    await loginAs(page, 'editor');
    await page.goto('/editor?book=efnafraedi-2e&chapter=1&module=m68664');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#pipeline-panel')).toBeHidden();
    await expect(page.locator('#apply-panel')).toBeHidden();
  });

  test('§4c head-editor DOES see them (role-sensitivity proof)', async ({ page }) => {
    await loginAs(page, 'head-editor');
    await page.goto('/editor?book=efnafraedi-2e&chapter=1&module=m68664');
    await page.waitForLoadState('networkidle');
    // opening a module triggers showApplyPanel/showPipelinePanel for privileged roles
    await expect(page.locator('#pipeline-panel, #apply-panel').first()).toBeVisible({ timeout: 10000 });
  });
});
```

*(If a panel only renders after a module is fully loaded, reuse the `openFirstEditor`-style waits from `segment-editor.spec.js` — the implementer mirrors that navigation. The contract: hidden for `editor`, visible for `head-editor`.)*

- [ ] **Step 2: Run — expect PASS:** `-g '§4c'`.
- [ ] **Step 3: Mutation check** — temporarily change `showPipelinePanel`/`showApplyPanel` (`server/public/js/segment-editor.js`) to always show; confirm the editor test goes RED; revert. Record.
- [ ] **Step 4: Full E2E** → green.
- [ ] **Step 5: Commit** `test(e2e): §4c pipeline/apply panels hidden for editor role (A4)` + trailer.

---

## Task 7: `a4-coverage.spec.js` — §1b/§1d restore round-trip + version_restored activity

**Files:** Modify `server/e2e/a4-coverage.spec.js`.
**Interfaces:** `GET /api/segment-editor/:book/:ch/:module/versions` → `{versions:[{version,applied_by,applied_at}]}`; `POST .../restore/:version` `{confirm:true}` → `{success:true,restoredVersion,snapshotVersion,segmentsRestored}` (requireHeadEditor); `GET /api/activity/section/:book/:ch/:section` → activity rows incl. `type:'version_restored'`. Depends on a module that has ≥1 applied version — Task 1's chain applies one to `__e2e-fixture__ m68663`, so run this AFTER a version exists (serial, or apply one here).

- [ ] **Step 1: Write the test** (self-contained: apply an edit to create version history, then restore, asserting the revert + the activity event; head-editor owns `__e2e-fixture__`):

```js
test.describe.serial('§1b/§1d restore round-trip', () => {
  const BOOK = '__e2e-fixture__', CHAPTER = '1', MODULE = 'm68663';
  const RID = Date.now();
  const HE_ID = 90000 + (RID % 10000);
  const MARK = `[e2e-restore-${RID}]`;
  let segmentId, baseline;

  test('§1b-setup apply an edit to create a version', async ({ page }) => {
    await loginAs(page, 'admin', HE_ID);
    const API = `/api/segment-editor/${BOOK}/${CHAPTER}/${MODULE}`;
    const data = await (await page.request.get(API)).json();
    const seg = data.segments.find((s) => s.is && s.is.length > 0);
    segmentId = seg.segmentId; baseline = seg.is;
    const edit = await (await page.request.post(`${API}/edit`, {
      data: { segmentId, originalContent: baseline, editedContent: `${baseline} ${MARK}`, category: 'other' },
    })).json();
    await page.request.post(`/api/segment-editor/edit/${edit.editId}/approve`, { data: { note: 'x' } });
    const sub = await page.request.post(`${API}/submit`);
    let reviewId = sub.status() === 409
      ? (await (await page.request.get(`/api/segment-editor/review-queue?book=${BOOK}`)).json()).reviews.find((r) => r.module_id === MODULE).id
      : (await sub.json()).reviewId;
    const done = await page.request.post(`/api/segment-editor/reviews/${reviewId}/complete`);
    expect((await done.json()).applied.appliedCount).toBeGreaterThan(0);
  });

  test('§1b restore to the prior version reverts the content', async ({ page }) => {
    await loginAs(page, 'head-editor'); // owns __e2e-fixture__
    const API = `/api/segment-editor/${BOOK}/${CHAPTER}/${MODULE}`;
    const versions = (await (await page.request.get(`${API}/versions`)).json()).versions;
    expect(versions.length).toBeGreaterThan(0);
    const target = versions[versions.length - 1].version; // the pre-edit snapshot
    const res = await page.request.post(`${API}/restore/${target}`, { data: { confirm: true } });
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);
    const after = (await (await page.request.get(API)).json()).segments.find((s) => s.segmentId === segmentId);
    expect(after.is).not.toContain(MARK); // reverted
  });

  test('§1b restore without confirm is rejected 400', async ({ page }) => {
    await loginAs(page, 'head-editor');
    const res = await page.request.post(`/api/segment-editor/${BOOK}/${CHAPTER}/${MODULE}/restore/1`, { data: {} });
    expect(res.status()).toBe(400);
  });

  test('§1d version_restored appears in the activity log', async ({ page }) => {
    await loginAs(page, 'head-editor');
    const res = await page.request.get(`/api/activity/section/${BOOK}/${CHAPTER}/${MODULE}`);
    expect(res.status()).toBe(200);
    const acts = await res.json();
    const rows = Array.isArray(acts) ? acts : acts.activities || acts.rows || [];
    expect(rows.some((a) => (a.type || a.activity_type) === 'version_restored')).toBe(true);
  });
});
```

*(The implementer confirms the activity response shape from `server/routes/activity.js` and the `:section` param name, adjusting the `rows`/`type` extraction to match — the contract is: a `version_restored` row exists after the restore.)*

- [ ] **Step 2: Run — expect PASS:** `-g '§1b|§1d'`.
- [ ] **Step 3: Mutation check** — temporarily make `contentVersionService.restoreVersion` not write the file (skip the faithful write); confirm §1b goes RED (content still contains `MARK`); revert. Record.
- [ ] **Step 4: Full E2E** → green.
- [ ] **Step 5: Commit** `test(e2e): §1b/§1d restore round-trip + version_restored activity (A4)` + trailer.

---

## Task 8: Full gate + findings log + whole-branch review + PR

- [ ] **Step 1: Full gates** — from repo root: `npm test` (Vitest, all green) and `npm run test:e2e` (all green). Any newly-red existing spec is a real regression — fix, don't weaken.
- [ ] **Step 2: Tag map + register** — in `docs/plans/2026-07-22-a4-execution-runbook.md` note which rows are now 🟢 (the ones this PR added: §0.1, §0.3, §0.4a, §0.reg, §1b/1d/1e, §4c, §5a/5b + console sweep). In `docs/plans/2026-07-21-post-item17-followup-campaign.md` under A4, mark **PR 1 delivered** and record the two findings: (a) **§4a/§4b UX gap** — my-work "current task" header renders the raw `module_id` (`my-work.html:1249`), not a section title (log as a new low-severity UX item); (b) **§2/§3 deferred to PR 1b** (shared-DB toggle isolation + DB-user seeding).
- [ ] **Step 3: Commit docs** — `docs(a4): PR 1 E2E coverage delivered; log §4a/b finding + §2/§3 → PR 1b` + trailer.
- [ ] **Step 4: Whole-branch adversarial review + PR** — run the campaign's whole-branch review (lenses: test non-vacuousness / did every test get a mutation check / A4-row-tag accuracy / no shared-fixture leak across specs / no already-green row re-tested). Triage, then open the PR (lead merges). **PR body MUST state:** which A4 rows are now machine-verified; that §4a/§4b are a logged finding (not covered because the app lacks the behavior); that §2/§3 are deferred to PR 1b with reasons; that this is test-only (no app-code change, nothing to deploy) but still sits behind the A4 deploy gate.

---

## Self-Review

**Spec coverage:** design spec PR-1 rows → §0.reg (T1), §0.3/§1e/§5b (T2), §0.1 (T3), §0.4a (T4), §5a+console (T5), §4c (T6), §1b/1d (T7), gate+findings+review (T8). Deferred per scope decision: §2/§3 (PR 1b), §4a/§4b (finding). ✅
**Placeholder scan:** UI-selector uncertainties (terminology render surface T4, activity shape T7, panel-load timing T6) are flagged as implementer-confirms-against-named-file with an explicit invariant contract, not TODOs. No bare TBD.
**Type consistency:** endpoint paths and response keys (`editId`, `reviewId`, `applied.appliedCount`, `versions[].version`, `type:'version_restored'`) are used identically across tasks and match the recon. `loginAs(page, role, userId?)` signature consistent throughout.
