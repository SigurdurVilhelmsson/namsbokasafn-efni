# §C222 "Merkja sem lokið" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-shot "Senda til yfirlestrar" with a repeatable "Merkja sem lokið". Each press is a recorded moment (an activity-log row; for a consenting editor, the research event `module-submit`) and never a status.

**Architecture:** A new route `POST /:book/:chapter/:moduleId/done` writes an activity row and then the research event. It creates no `module_reviews` row. The `/submit` route is deleted; the old review loop's service functions stay for `/reviews/:id/complete`. The editor shows the viewer's own latest press, read from the activity log through the module GET. The status page's per-person figures skip the new type.

**Tech Stack:** Express (CommonJS) in `server/`, better-sqlite3, vanilla browser JS, Vitest (ESM test files using `createRequire`), Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-11-17-c222-unit-done-signal-design.md` (approved 2026-11-17). Read it first; this plan argues from it.

## Global Constraints

- The activity type string is exactly `module_marked_done`. The research event type stays exactly `module-submit`, with detail exactly `{ openEditIds }`: no `reviewId`, no other key.
- **Open edits** = rows in `segment_edits` for (book, chapter, module_id), by any editor, where `status IN ('pending','discuss')` OR (`status = 'approved'` AND `applied_at IS NULL`), ordered by `id`.
- The eight Icelandic strings are [USER]-approved and copied verbatim:
  1. button `Merkja sem lokið`
  2. tooltip `Skráir að þú hafir lokið við þennan hluta. Breytingar fara til yfirlestrar um leið og þær eru vistaðar.`
  3. confirm `Merkja þennan hluta sem lokið? Þú getur haldið áfram að breyta honum á eftir.`
  4. trace `Merkt sem lokið ` + the date
  5. refused, unsaved text: `Óvistaður texti er í hlutanum. Vistaðu hann eða hentu honum áður en þú merkir hlutann sem lokið.`
  6. refused, not recorded: `Ekki tókst að skrá að hlutanum sé lokið. Reyndu aftur.`
  7. activity description `<username> merkti <moduleId> sem lokið`
  8. Heim `Vistað ` + the date

  No other new user-visible string. In particular, `module_marked_done` is **not** added to `ACTIVITY_TYPES` or `formatActivityType`, because a filter label would be a ninth, unapproved string; the old type was in neither.
- No status, anywhere: no badge, no lock, no withdraw, nothing that a later edit clears. The trace shows only the viewer's own presses.
- Server code is CommonJS. Test files are ESM: `import` vitest and Node builtins, and `createRequire(import.meta.url)` for server modules. Copy the header from `server/__tests__/researchReviewEvents.test.js` (env before any server require).
- Run `npm test` from the repo root. CI also runs `npm run lint`, `npm run format:check` and the E2E job (`cd server && npm run test:e2e`). All four are the gate.
- Commit messages end with the session's two attribution lines. Nothing is pushed without [USER]'s go. One branch, one PR ([USER] 2026-11-14, answer 13).

## Review Focus

1. **Numeric user ids.** E2E and Microsoft tokens give `req.user.id` as a number. The activity row stores `String(req.user.id)`, so the trace query must bind `String(req.user.id)` too, or every press is invisible to its own author. → Task 1, test `numeric user id: the trace finds the press`.
2. **Appendices (chapter `-1`).** The route writes `chapter: String(req.chapterNum)`. The trace query must compare the same string, or presses in appendices never show. → Task 1, test `appendices: a press shows in the unit's trace`.
3. **`chapter-metadata` repeats across chapters (§C209).** One module id lives in every chapter. A press in chapter 1 must not appear as chapter 2's trace, and its `openEditIds` must not include chapter 2's edits. → Task 1, test `chapter-metadata: a press is held to its chapter`.
4. **Two presses in the same second.** `created_at` has one-second resolution. Both presses must record, and the trace must be the later one: order by `id`, never `created_at`. → Task 1, test `two presses in one second: both recorded, trace is the later row`.
5. **A viewer (guest/visitor session) presses.** `requireBookAccess()` must refuse with 403 and write nothing: no activity row, no event. → Task 1, test `a viewer is refused and nothing is written`.

---

### Task 1: The `/done` act on the server, and every caller of `/submit` retargeted

**Files:**
- Modify: `server/services/activityLog.js` (new export `MODULE_MARKED_DONE`, a new prepared statement and function)
- Modify: `server/services/segmentEditorService.js` (new `openEditIds`; `submitModuleForReview` untouched)
- Modify: `server/services/researchEmission.js:742-752` (`emitSubmit`)
- Modify: `server/routes/segment-editor.js` (add `/done`; delete the `/submit` route at `:1304-1347`; module GET at `:418-424` adds `myLastDoneAt`)
- Create: `server/__tests__/unitDoneRoute.test.js`
- Modify: `server/__tests__/researchReviewEvents.test.js` (`:83`, the `submit:` case at `:323-342`)
- Modify: `server/__tests__/researchConsentStates.test.js` (`:105`, `:194`, the `SPACE` map at `:200-211`)
- Modify: `server/__tests__/reviewRoutesNoBefore.test.js` (`:73`, the `submit` case at `:188-196`, the keys pin at `:198-205`)
- Modify: `server/__tests__/researchApplyEvents.test.js` (`:109`, `approvedReview` at `:183-194`)
- Modify: `server/e2e/editor-workflow.spec.js` (the `editor submits module for review` test at `:89-102`, header comment `:10`)
- Modify: `server/e2e/review-cycle.spec.js` (the submit, queue and complete tests at `:87-145`, header `:5-12`, the stamping comments at `:255-262` and `:383-385`)

**Interfaces:**
- Produces:
  - `activityLog.MODULE_MARKED_DONE === 'module_marked_done'`
  - `activityLog.latestOfTypeByUser(type: string, userId: string, book: string, chapter: string, section: string) -> string|null`: the `created_at` (SQLite UTC, `"YYYY-MM-DD HH:MM:SS"`) of the newest matching row by `id DESC`; `null` when there is none. Every argument is bound as given; callers pass strings.
  - `segmentEditorService.openEditIds(book: string, chapter: number, moduleId: string) -> number[]`
  - `researchEmission.emitSubmit(req, { openEditIds: number[] }) -> void` (never throws)
  - `POST /api/segment-editor/:book/:chapter/:moduleId/done`: `200 { success: true, doneAt: string }`, where `doneAt` is the row's `created_at` as above; `500 { error: 'Not recorded', code: 'DONE_NOT_RECORDED' }` when `activityLog.log` returns `null`
  - Module GET body gains `myLastDoneAt: string|null` (same format)

- [ ] **Step 1: Write the failing tests in `server/__tests__/unitDoneRoute.test.js`**

  Harness: as `researchReviewEvents.test.js`, with a real migrated DB in a temp dir, `writeModule` under a temp books root, and handlers through `handlerFor(router, …)` and `invoke`. Consent `p-a` with `consent(makeUser('p-a'))`. `p-n` is a user with no consent (as `researchConsentStates.test.js` makes one). Take `eventMark()` before each act. Plant edit rows where a case needs statuses that saves cannot reach (`UPDATE segment_edits SET status=…, applied_at=…`).

  ```js
  it('a second press succeeds (ED-07)', async () => {
    const r1 = await press(A); const r2 = await press(A);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(Object.keys(r2.body).sort()).toEqual(['doneAt', 'success']);
  });
  it('a press with no open edits answers 200 and records openEditIds: []', …
    expect(eventsSince(mark)[0].detail).toEqual({ openEditIds: [] }));
  it('creates no module_reviews row and stamps no review_id', …
    expect(count('module_reviews')).toBe(before);
    expect(db.prepare('SELECT COUNT(*) n FROM segment_edits WHERE review_id IS NOT NULL').get().n).toBe(0));
  it('module-submit for a consenting editor carries exactly the open set, any editor', …
    // planted: pending (A), discuss (B), approved+unapplied (B), approved+applied, rejected, superseded
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ event_type: 'module-submit', segment_id: null, served_version_id: null });
    expect(ev[0].detail).toEqual({ openEditIds: [pendingA, discussB, approvedUnappliedB] }));
  it('a non-consenting editor: the activity row is written, no research event', …
    expect(activityRows('p-n')).toHaveLength(1); expect(eventsSince(mark)).toHaveLength(0));
  it('a failed activity write answers 500 DONE_NOT_RECORDED and records no event', …
    // vi.spyOn(activityLog, 'log').mockReturnValueOnce(null)
    expect(r.status).toBe(500); expect(r.body.code).toBe('DONE_NOT_RECORDED');
    expect(eventsSince(mark)).toHaveLength(0));
  it("the module GET carries the viewer's own latest press only", …
    // B presses; A's GET → myLastDoneAt null; A presses; A's GET → A's doneAt; B's GET → B's doneAt
  );
  it('the activity description is the approved string', …
    expect(row.description).toBe('p-a merkti m97302 sem lokið'));
  it('the /submit route is gone', () =>
    expect(router.stack.some((l) => l.route && l.route.path === '/:book/:chapter/:moduleId/submit')).toBe(false));
  // Review Focus 1–5:
  it('numeric user id: the trace finds the press', …   // user { id: 88001, … }
  it('appendices: a press shows in the unit\'s trace', … // writeModule chapterDir 'appendices', chapter param 'appendices'
  it('chapter-metadata: a press is held to its chapter', … // module in ch01 and ch02; press ch01; ch02 GET → null;
                                                           // ch01's openEditIds hold no ch02 edit
  it('two presses in one second: both recorded, trace is the later row', … // compare by row id
  it('a viewer is refused and nothing is written', …    // role 'viewer' → 403; 0 activity rows, 0 events
  ```

  Use a module id of its own (`m97302`), not `researchReviewEvents`' `m97301`.

- [ ] **Step 2: Run them to see them fail**

  Run: `npx vitest run server/__tests__/unitDoneRoute.test.js`
  Expected: FAIL. `handlerFor` finds no `/done` route, and `myLastDoneAt` is undefined.

- [ ] **Step 3: Implement the three service pieces**

  - `activityLog.js`: export `MODULE_MARKED_DONE`. Add the statement `SELECT created_at FROM activity_log WHERE type = ? AND user_id = ? AND book = ? AND chapter = ? AND section = ? ORDER BY id DESC LIMIT 1` and `latestOfTypeByUser` over it. Leave `ACTIVITY_TYPES` and `search` alone.
  - `segmentEditorService.js`: `openEditIds` runs the Global Constraints predicate. Export it.
  - `researchEmission.js`: `emitSubmit(req, { openEditIds })` with detail `{ openEditIds }`. Update its JSDoc.

- [ ] **Step 4: Replace the `/submit` route with `/done`, and add `myLastDoneAt` to the module GET**

  Same middleware as the deleted route: `requireAuth, validateBookChapter, requireBookAccess(), validateModule`. Order inside the handler:
  1. `ids = segmentEditor.openEditIds(book, req.chapterNum, moduleId)`
  2. `row = activityLog.log({ type: MODULE_MARKED_DONE, userId: String(req.user.id), username, book, chapter: String(req.chapterNum), section: moduleId, description: `${username} merkti ${moduleId} sem lokið` })`
  3. `row === null` → `500 DONE_NOT_RECORDED`, and stop: no research event.
  4. `researchEmission.emitSubmit(req, { openEditIds: ids })`
  5. `res.json({ success: true, doneAt: activityLog.latestOfTypeByUser(MODULE_MARKED_DONE, String(req.user.id), book, String(req.chapterNum), moduleId) })`

  Any thrown error → 500 with `{ error: err.message }`. The module GET adds `myLastDoneAt` from the same call with the reader's id, inside the existing `try`.

- [ ] **Step 5: Run the new file to see it pass**

  Run: `npx vitest run server/__tests__/unitDoneRoute.test.js`
  Expected: PASS, every case.

- [ ] **Step 6: Retarget the four unit files that drove `/submit`**

  - `researchReviewEvents`: `submit:` becomes `done: handlerFor(router, 'post', '/:book/:chapter/:moduleId/done')`. The `submit: the edit ids it stamped` case becomes `done: the open edit ids`: `body` keys `['doneAt','success']`, `event_type: 'module-submit'`, and `detail` equal to `{ openEditIds }` read with the Global Constraints predicate. Header line 2 says "done" instead of "submit".
  - `researchConsentStates`: `h.submit` becomes `h.done` (the scenario's last act still yields `module-submit`). Add `openEditIds: 'segment_edits'` to `SPACE`. Keep `stampedEditIds` and `reviewId` there only if the file still meets those keys; otherwise remove them.
  - `reviewRoutesNoBefore`: `submit` becomes `done`; the case expects keys `['doneAt','success']`. The keys pin adds `expect(keys.has('openEditIds')).toBe(false)`.
  - `researchApplyEvents`: drop the `submit` handler. `approvedReview` creates its review with `segmentEditor.submitModuleForReview({ book, chapter, moduleId, submittedBy: PA.id, submittedByUsername: PA.username })` and reads `.id`. Then check every case whose `eventMark()` precedes `approvedReview`: its expected event list loses the `module-submit` that the route used to write.

- [ ] **Step 7: Retarget the two E2E specs' API steps**

  - `editor-workflow.spec.js`: the test becomes `editor marks the unit done, twice`. It POSTs `${API}/done` twice, and both answer 200 with `success: true` and a string `doneAt`. Delete the 409 branch. Header line 10 says "marks the unit done".
  - `review-cycle.spec.js`: the cycle becomes save → done → approve → **`POST ${API}/${BOOK}/${CHAPTER}/${MODULE}/apply`** (expect `success` and `appliedCount > 0`) → reload → restore. Delete the queue test and the complete test (no screen reaches `/reviews/:id/complete`; its unit tests stay). Drop `reviewId`. Rewrite the header's flow line, and date-note the two "a module submit stamps every open edit" comments: `done` stamps nothing, and the placement stays.

- [ ] **Step 8: Run the touched unit files, then the whole suite**

  Run: `npx vitest run server/__tests__/unitDoneRoute.test.js server/__tests__/researchReviewEvents.test.js server/__tests__/researchConsentStates.test.js server/__tests__/reviewRoutesNoBefore.test.js server/__tests__/researchApplyEvents.test.js server/__tests__/segmentEditorService.test.js`
  Expected: PASS.
  Run: `npm test`
  Expected: the failing set equals `main`'s failing set by name (diff the two lists; see memory `engineering-lessons`). Any new red is this task's.

- [ ] **Step 9: Commit**

  ```bash
  git add server/services/activityLog.js server/services/segmentEditorService.js server/services/researchEmission.js \
    server/routes/segment-editor.js server/__tests__/unitDoneRoute.test.js server/__tests__/researchReviewEvents.test.js \
    server/__tests__/researchConsentStates.test.js server/__tests__/reviewRoutesNoBefore.test.js \
    server/__tests__/researchApplyEvents.test.js server/e2e/editor-workflow.spec.js server/e2e/review-cycle.spec.js
  git commit -m "feat(segment-editor): §C222 /done replaces /submit; a press is a recorded moment"
  ```

---

### Task 2: Per-person figures skip presses

**Files:**
- Create: `server/lib/teamMetrics.js`
- Modify: `server/routes/status.js:582-645` (the per-user block of `GET /analytics`)
- Create: `server/__tests__/teamMetrics.test.js`

**Interfaces:**
- Consumes: `activityLog.MODULE_MARKED_DONE` (Task 1)
- Produces: `teamMetricsFrom(activities: object[], now: Date) -> object[]`. `activities` are `activityLog.search` rows. The result is today's `analytics.teamMetrics`: the same objects and the same sort, with `module_marked_done` rows skipped before any count.

- [ ] **Step 1: Write the failing tests**

  ```js
  it('a press adds nothing: a user whose only rows are presses is absent', () =>
    expect(teamMetricsFrom([row('module_marked_done', 'p-a')], NOW)).toEqual([]));
  it('control: a save still counts', () =>
    expect(teamMetricsFrom([row('segment_edit_saved', 'p-a')], NOW)[0]).toMatchObject({ username: 'p-a', totalActions: 1, submissions: 1 }));
  it('a press beside a save leaves the save\'s figures as they were', …
    expect(...[0].totalActions).toBe(1));
  it('rows older than 30 days are skipped, as before', …);
  ```

- [ ] **Step 2: Run them to see them fail**

  Run: `npx vitest run server/__tests__/teamMetrics.test.js`
  Expected: FAIL, "Cannot find module '../lib/teamMetrics'".

- [ ] **Step 3: Move the per-user loop from `status.js` into `teamMetricsFrom` unchanged, add the skip, and call it from the route**

  The route keeps its own `try`/`catch` and its `activityLog.search({ books: readableLogBooks(req.user), limit: 1000 })`. Requiring `../services/activityLog` from `lib/` is safe: its DB opens lazily, on the first statement.

- [ ] **Step 4: Run the tests to see them pass**

  Run: `npx vitest run server/__tests__/teamMetrics.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add server/lib/teamMetrics.js server/routes/status.js server/__tests__/teamMetrics.test.js
  git commit -m "feat(status): per-person figures skip module_marked_done (§C222, §9 (a))"
  ```

---

### Task 3: The editor's button, trace and unsaved-text refusal

**Files:**
- Modify: `server/views/segment-editor.html:1891-1897` (the button; a trace element beside it)
- Modify: `server/public/js/ui-strings.js` (`:75-77`, `:96`, `:331-332`; new keys)
- Modify: `server/public/js/segment-editor.js` (the listener at `:3426-3463`; the header render near `:1590`)
- Modify: `server/__tests__/servedBaseClientPins.test.js:259-279`
- Create: `server/e2e/unit-done.spec.js`

**Interfaces:**
- Consumes: `POST …/done` → `{ success, doneAt }`; module GET `myLastDoneAt` (Task 1)
- Produces: the DOM ids `btn-done` and `done-trace`. Strings `UI.confirm.markDone` (string 3), `UI.alert.doneUnsaved` (string 5), `UI.alert.doneNotRecorded` (string 6), and `UI.segmentEditor.doneTrace(when: string) -> string` (string 4 + `when`). Removed: `UI.confirm.submitForReview`, `UI.alert.noChanges`, `UI.segmentEditor.sentForReview`, `UI.segmentEditor.viewReview`.

- [ ] **Step 1: Write the failing E2E spec `server/e2e/unit-done.spec.js`**

  Copy `UI` loading, `openModule`, `rowOf`, `typeInto` and `answerDialogs` from `unsaved-text.spec.js`. Use run-unique admin ids (`89000 + (Date.now() % 1000)` and the next one), so a reused local DB holds no earlier press.

  ```js
  test('the button says "Merkja sem lokið" and the old one is gone', …
    await expect(page.locator('#btn-done')).toHaveText('Merkja sem lokið');
    await expect(page.locator('#btn-done')).toHaveAttribute('title', UI_TOOLTIP);  // string 2 verbatim
    await expect(page.getByText('Senda til yfirlestrar')).toHaveCount(0));
  test('a press with no edits asks, records, and shows the trace; a second press records again', …
    // answerDialogs(page, true); count POST /done responses
    await expect.poll(() => dialogs.asked).toEqual([UI.confirm.markDone]);
    await expect(page.locator('#done-trace')).toContainText('Merkt sem lokið ');
    // second click → 2 responses, both 200; the trace is still shown
  );
  test('declining the confirm records nothing', … // answerDialogs(page, false); 0 POST /done
  );
  test('unsaved text refuses the press before asking, and sends nothing', …
    await typeInto(page, segId, text + ' ó');
    await page.locator('#btn-done').click();
    await expect.poll(() => dialogs.asked).toEqual([UI.alert.doneUnsaved]);  // no confirm asked
    // 0 POST /done
  );
  test('a refused press says it was not recorded', …
    // page.route('**/done', r => r.fulfill({ status: 500, json: { error: 'Not recorded', code: 'DONE_NOT_RECORDED' } }))
    await expect.poll(() => dialogs.asked).toEqual([UI.confirm.markDone, UI.alert.doneNotRecorded]));
  ```

- [ ] **Step 2: Run it to see it fail**

  Run: `cd server && npx playwright test --config=e2e/playwright.config.js e2e/unit-done.spec.js`
  Expected: FAIL: no `#btn-done`.

- [ ] **Step 3: Implement the page**

  - HTML: the button `id="btn-done"` (same classes) with string 1, and `title` set to string 2. After it, `<span id="done-trace" hidden></span>` in small muted text (`var(--text-xs)`, `var(--text-muted)`).
  - `ui-strings.js`: add the four keys and remove the four old ones (Interfaces).
  - `segment-editor.js`:
    - `function unsavedBlocksDone() -> boolean`: true if any id in `dirtyEdits` has `paneTextChanged(id)`, or any pane in `paneState` is `refused`, or `heldDrafts.size > 0`, or `savesInFlight.size > 0`.
    - `function renderDoneTrace(raw: string|null)`: hidden when `raw` is null; otherwise it shows `UI.segmentEditor.doneTrace(vhFormatDate(raw))`. Call it from the module-header render with `moduleData.myLastDoneAt`.
    - The listener goes **where the submit listener was** (after `reopenEdit`, before `function openUnit(`), so `servedBaseClientPins`' slices still bound it. If `unsavedBlocksDone()`, alert string 5 and return. Then `confirm(UI.confirm.markDone)`, then `const unit = openUnit();`, disable the button, and POST. On success, `if (openUnit() === unit) renderDoneTrace(body.doneAt)`. On any failure, `alert(UI.alert.doneNotRecorded)`. Re-enable in `finally`. No toast, no reload (the press changes no edit).

- [ ] **Step 4: Update `servedBaseClientPins.test.js`**

  Remove `submit` from the `bodies` of `the review actions, revoke and submit reload through reloadIfOpen`, and rename it `the review actions and revoke reload through reloadIfOpen`. The `reopenEdit` slice ends at `getElementById('btn-done')`. Add:

  ```js
  it('the done press paints the trace only on the unit it was pressed in, and reloads nothing', () => {
    const done = code(src.slice(src.indexOf("getElementById('btn-done').addEventListener"), src.indexOf('function openUnit(')));
    expect(done).toContain('const unit = openUnit();');
    expect(done).toMatch(/openUnit\(\) === unit/);
    expect(done).not.toMatch(/loadModule\(|reloadIfOpen\(/);
  });
  ```

  The `loadModule(currentModuleId` count of 7 is unchanged: the submit listener reloaded through `reloadIfOpen`, not `loadModule`.

- [ ] **Step 5: Run the pins and the spec to see them pass**

  Run: `npx vitest run server/__tests__/servedBaseClientPins.test.js`, then the Step 2 Playwright command.
  Expected: PASS for both.

- [ ] **Step 6: Commit**

  ```bash
  git add server/views/segment-editor.html server/public/js/ui-strings.js server/public/js/segment-editor.js \
    server/__tests__/servedBaseClientPins.test.js server/e2e/unit-done.spec.js
  git commit -m "feat(editor): §C222 Merkja sem lokið, its trace and the unsaved-text refusal"
  ```

---

### Task 4: Heim says "Vistað" (HM-02's label)

**Files:**
- Modify: `server/views/my-work.html:1491`
- Modify: `server/e2e/front-page.spec.js` (a new test)

- [ ] **Step 1: Write the failing test**

  In `front-page.spec.js`, log in as `editor`. Route-stub `**/api/my-work` so that `pendingSubmissions` holds one row (`bookLabel`, `chapter: 1`, `section: 'm68664'`, `submittedAt: '2026-11-17 10:00:00'`, `daysPending: 0`). Go to `/`, click `Nákvæmt yfirlit`, and then:

  ```js
  await expect(page.locator('#submissions-list')).toContainText('Vistað ');
  await expect(page.locator('#submissions-list')).not.toContainText('Sent ');
  ```

- [ ] **Step 2: Run it to see it fail**

  Run: `cd server && npx playwright test --config=e2e/playwright.config.js e2e/front-page.spec.js`
  Expected: the new test FAILS on `Vistað `.

- [ ] **Step 3: Change `'<span>Sent '` to `'<span>Vistað '` at `my-work.html:1491`**

- [ ] **Step 4: Run it to see it pass** (the same command). Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add server/views/my-work.html server/e2e/front-page.spec.js
  git commit -m "fix(heim): a saved edit reads Vistað, not Sent (HM-02's label, §C222)"
  ```

---

### Task 5: Records, and the full gate

**Files:**
- Modify: `docs/superpowers/specs/2026-11-03-served-version-and-event-log-design.md` (an `✏️ AMENDED 2026-11-17` block, near its event table)
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C222, §C221, and a new entry for the old loop's removal)

- [ ] **Step 1: Write the amendment block in the 2026-11-03 spec.** Three things, in plain terms. `module-submit` is now written by `POST …/done`, at each press, with detail `{ openEditIds }` under the predicate above. `review-complete` has no screen, by [USER]'s ruling of 2026-11-17. Production `research.db` held 0 events of any type on 2026-11-17, so no old-shape row exists. Cite the §C222 design spec by path. Leave the frozen table itself as it is.

- [ ] **Step 2: Update the register.**
  - Under §C222: the button is built, with the PR number. Remove "Not built" from the 2026-11-17 ruling's bullet, and point to the design spec.
  - Under §C221: HM-02's label is done; its grouping half is still open.
  - A new §C entry: the old review loop (`submitModuleForReview`, `completeModuleReview`, `emitReviewComplete`, `/reviews…`, `/review-queue`, `module_reviews`, the 3 stale production rows) is reachable from tests only, and removing it is open work. Its trigger is any change to the review routes.

  Status lives only in the register. Write no counts and no green/red verdicts.

- [ ] **Step 3: Run the full gate.**

  Run: `npm run lint && npm run format:check`. Expected: exit 0.
  Run: `npm test`. Expected: the failing set equals `main`'s by name.
  Run: `cd server && npm run test:e2e`. Expected: all pass. A single red on `unsaved-text.spec.js`'s "Beita víðar" reload count is §C228's known race; re-run it once and record the result in §C228.

- [ ] **Step 4: Commit**

  ```bash
  git add docs/superpowers/specs/2026-11-03-served-version-and-event-log-design.md docs/plans/2026-07-21-post-item17-followup-campaign.md
  git commit -m "docs: §C222 built; module-submit's new trigger amended into the 2026-11-03 design"
  ```

- [ ] **Step 5: Stop for [USER].** Report the gate's output, then ask before pushing and opening the PR.
