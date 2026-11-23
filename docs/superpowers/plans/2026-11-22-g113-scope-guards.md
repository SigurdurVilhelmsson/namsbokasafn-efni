# G1.13 Scope Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every book but chemistry to non-admin writes, make chemistry's chapter enforcement permanent and fail-closed, stop propagation from writing into chapters the editor does not hold, and refuse any assignment until the editor's consent decision and signed licence clause are recorded.

**Architecture:** There are three new server modules:
- `server/lib/editorScope.js`: the allowlist and the closed-book middleware.
- `server/services/assignmentGate.js`: the refusal reasons.
- `server/services/licenceClauses.js`: the licence record.

A route census test walks every mounted router from a new mount table (`server/routes/apiMounts.js`). Each write route must carry the closed-book guard or be listed as exempt with a reason. Enforcement becomes permanent through `userService.isAssignmentEnforced` returning true for study books. Every existing fail-open branch in `hasChapterAccess` sits under `!enforce`, so that one change closes them all.

**Tech Stack:** Node 22, Express, better-sqlite3 (`server/`, CommonJS), Vitest (unit), Playwright (E2E, `server/`'s `test:e2e`).

**Spec:** `docs/superpowers/specs/2026-11-22-g113-scope-guards-design.md` (approved 2026-11-22, calls 1–12, and its `✏️ AMENDED 2026-11-22` block). Read both; the plan argues from the spec.

**Branch:** `feat/g113-scope-guards`, cut from `docs/g113-scope-guards-design`, so the PR carries the spec, this plan and the code. One PR (spec §12 allows two; one is chosen because the E2E recalibration in Task 7 serves both halves).

## Global Constraints

- `server/` is CommonJS. Test files `import` vitest and node builtins and use `createRequire(import.meta.url)` for server modules; copy the header from `server/__tests__/importConcepts.test.js`.
- Route tests follow `server/__tests__/crossBookAuthz.test.js`:
  - set `SESSIONS_DB_PATH` (a `mkdtempSync` dir) and `JWT_SECRET` before any server `require`;
  - mount the real routers on `express()`;
  - `listen(0)`, then `fetch` with `authorization: Bearer <jwt>` signed with issuer `namsbokasafn-pipeline`.
- `EDITOR_WRITABLE_BOOKS` is `Object.freeze(['efnafraedi-2e'])`. It is an enforceable value: it changes only together with `server/__tests__/editorScope.test.js`.
- Study books are `STUDY_BOOKS` in `server/lib/researchScope.js`; never restate the list.
- Refusal codes are English (`BOOK_CLOSED`, `STUDY_BOOK_ALWAYS_ENFORCED`, `CHAPTER_UNKNOWN`, `ASSIGNMENT_REFUSED`, `BAD_DATE`, `FUTURE_DATE`, `REASON_REQUIRED`, `USER_NOT_FOUND`). User-facing messages are Icelandic; their exact wording is the builder's (spec §12). Model them on `server/lib/heldBookWrites.js`'s messages.
- A migration never throws: `up()` wraps everything and `console.warn`s, as in `server/migrations/059-retention-runs.js` (CLAUDE.md § Tech Stack).
- No editor's real name, email, grant or fund in code, tests, comments or commits. Test users get invented names.
- **Every new test is run against the code with its behaviour broken before it is trusted.** Copy the file to a golden copy in the scratchpad, mutate it, run the test red, restore from the golden copy, and `cmp`. Never use `git checkout -- <file>` or `git stash` for the restore (CLAUDE.md § the mutation-test rule).
- Run from the repo root: `npm test`, `npm run lint`, `npm run format:check`. E2E runs separately: `cd server && CI=1 npm run test:e2e`. `npm test` does not run E2E, and CI runs both.
- No test count, migration count or CI verdict goes into any committed prose.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `--no-verify`.

## Review Focus

1. **A row-keyed write whose row does not exist** (an edit, acceptance, review, section or suggestion id that is unknown) must answer 404 from the guard and must never pass as "not closed". Test: Task 2, `editorScopeRoutes.test.js`, "row-derived book, unknown id".
2. **The admin's multi-chapter assign** (`POST /api/admin/users/:id/chapters` with `chapters: [3, 4]`) where the gate refuses must write no row for any chapter. Test: Task 6, "multi-chapter assign refused writes nothing".
3. **Chapters given as `'appendices'`, `'-1'`, `'0'` or `0`** are compared as numbers everywhere, and `0` is a chapter, never "no chapter". Tests: Task 3 (T4 cases), Task 4 (`scopeOccurrences`) and Task 6 (`chapter-not-editable` via `'0'`).
4. **A licence date that is well-formed but not real** (`2026-02-30`) is refused. Today's date in UTC is accepted, and tomorrow is refused. Test: Task 5, `licenceClauseRoutes.test.js`.
5. **A pipeline route whose body has no `book`, or a non-string `book`,** never reaches the handler for a non-admin. Test: Task 2, "body-derived book, missing".

---

### Task 1: The allowlist, the closed-book middleware, and role labels

**Files:**
- Create: `server/lib/editorScope.js`
- Modify: `server/middleware/requireRole.js` (`requireRole` at line 23, `requireBookAccess` at line 238)
- Test: `server/__tests__/editorScope.test.js`

**Interfaces:**
- Consumes: `isStudyBook(book)` from `server/lib/researchScope.js`; `ROLES` from `server/constants.js`.
- Produces:
  - `EDITOR_WRITABLE_BOOKS: readonly string[]`
  - `isEditorWritableBook(book: unknown): boolean`. This is true only for a string on the list; use `includes` after a `typeof` check, so `'__proto__'` and `undefined` are false.
  - `isAlwaysEnforced(book: string): boolean`, which is `isStudyBook(book)`. It is the one rule that Task 3's `isAssignmentEnforced` and G-1d both call.
  - `BOOK_CLOSED_MESSAGE: string` (Icelandic: the book is not open for editing).
  - `refuseClosedBookForNonAdmins(bookOf: (req) => string, label: 'param' | 'body' | 'row'): ExpressMiddleware`. The returned function carries `.editorScopeGuard = label`. Its behaviour:
    - an admin passes;
    - if `bookOf` throws, it answers `404 { error: err.message }`, in `requireHeadEditorFor`'s style;
    - if `!isEditorWritableBook(book)`, it answers `403 { error: 'BOOK_CLOSED', message: BOOK_CLOSED_MESSAGE }`;
    - otherwise it calls `next()`.
  - In `requireRole.js`, the function `requireRole(minimumRole)` returns carries `.minimumRole = minimumRole` (so `requireAdmin()` carries `'admin'`). The function `requireBookAccess()` returns carries `.bookAccessGuard = true`. The census in Task 2 reads both.

- [ ] **Step 1: Write the failing tests** in `editorScope.test.js`:

```js
it('the allowlist is chemistry only, frozen', () => {
  expect(EDITOR_WRITABLE_BOOKS).toEqual(['efnafraedi-2e']);
  expect(Object.isFrozen(EDITOR_WRITABLE_BOOKS)).toBe(true);
});
it.each(['liffraedi-2e', '__e2e-fixture__', 'lifraen-efnafraedi', undefined, '__proto__', ['efnafraedi-2e']])(
  'isEditorWritableBook(%j) is false', (b) => expect(isEditorWritableBook(b)).toBe(false));
it('isAlwaysEnforced follows STUDY_BOOKS', () => {
  expect(isAlwaysEnforced('efnafraedi-2e')).toBe(true);
  expect(isAlwaysEnforced('liffraedi-2e')).toBe(false);
});
// Middleware, driven with a fake req/res (the heldBookWrites.test.js style):
// editor and head-editor on 'liffraedi-2e' → status 403, body.error 'BOOK_CLOSED'
// admin on 'liffraedi-2e' → next() called, no status
// editor on 'efnafraedi-2e' → next() called
// bookOf throwing new Error('Edit not found') → 404 { error: 'Edit not found' }
// guard.editorScopeGuard === 'row' for label 'row'
it('labels', () => {
  expect(requireRole(ROLES.ADMIN).minimumRole).toBe('admin');
  expect(requireAdmin().minimumRole).toBe('admin');
  expect(requireBookAccess().bookAccessGuard).toBe(true);
});
```

- [ ] **Step 2: Run them and see them fail.** `npx vitest run server/__tests__/editorScope.test.js` should FAIL with "Cannot find module '../lib/editorScope'".
- [ ] **Step 3: Implement `server/lib/editorScope.js`** with a header comment in `heldBookWrites.js`'s style, marked "⚠️ AN ENFORCEABLE VALUE", that cites spec §6.1. Add the two labels in `requireRole.js`.
- [ ] **Step 4: Run them and see them pass.** Then mutate `isEditorWritableBook` to return `true` and confirm the tests go red. Restore from the golden copy and `cmp`.
- [ ] **Step 5: Commit** `feat(g113): editor-writable allowlist and closed-book middleware (spec §6.1)`.

---

### Task 2: The mount table, the route census, and the guard on every book-writing route

**Files:**
- Create: `server/routes/apiMounts.js`, `server/lib/editorScopeExempt.js`, `server/__tests__/editorScopeCensus.test.js`, `server/__tests__/editorScopeRoutes.test.js`
- Modify: `server/index.js:237-268` (the API mounts) and these route files: `segment-editor.js`, `localization-editor.js`, `book-glossary.js` (its `writeGuard` array, line 223), `suggestions.js`, `sections.js`, `admin.js` (the two `requireHeadEditor('book')` assignment routes), `pipeline.js`, `pipeline-status.js` and `publication.js`.
- Modify (recalibration): `server/__tests__/crossBookAuthz.test.js`, and any file the full suite names in Step 7.

**Interfaces:**
- Consumes: `refuseClosedBookForNonAdmins`, `.minimumRole` and `.bookAccessGuard` from Task 1.
- Produces:
  - `API_MOUNTS: ReadonlyArray<{ prefix: string, router: import('express').Router }>`. It lists every `/api/*` router from `index.js:239-268`, in today's order.
  - `EDITOR_SCOPE_EXEMPT: Readonly<Record<string, string>>`, keyed `'<METHOD> <prefix><path>'`. A route path of `/` contributes nothing, so the key is `'POST /api/feedback'`, not `'POST /api/feedback/'`. Each value is a reason.
  - `ADMIN_ONLY = 'admin-only'`, the reason string the census checks against `.minimumRole`.

**The census rule** (spec §6.1). Every non-GET, non-HEAD route on a router in `API_MOUNTS`, plus `require('../routes/views')` mounted at `''`, must meet one of two conditions:
- (a) a handle in its stack, or in the router-level middleware registered before it, carries `editorScopeGuard`;
- (b) its key is in `EDITOR_SCOPE_EXEMPT`.

These do not count as passing, and each fails by name:
- an `ADMIN_ONLY` entry whose stack has no handle with `minimumRole === 'admin'`;
- a route both guarded and exempt;
- an exempt key that names no route;
- a nested router (a route-less layer whose `handle.stack` exists);
- an `_all` method.

Every route, of any method, that carries `bookAccessGuard` has `:chapter` in its path (spec §6.2). Every `require('./routes/…')` in `server/index.js` is `./routes/apiMounts` or `./routes/views`.

**What is exempt** (the file lists explicit keys; copy each from the census's own failure message):

| Group | Reason |
|---|---|
| `requireAdmin()` / `requireRole(ROLES.ADMIN)` routes: `/api/admin/{catalogue/*, books/register, books/:slug/*, users, users/:id, users/:id/books*, users/:id/chapters*, assignments/:book/enforcement, books/:book/suggestion-view, migrate}`, `/api/status/:book/sync`, `/api/status/:book/:chapter/sync`, `/api/localization-editor/settings/:book`, `/api/pipeline-status/:bookSlug/:chapterNum/{advance,revert}` | `ADMIN_ONLY` |
| every `/api/terminology/*` write | `G1.17: the shared concept model, which takes no book (spec §4)` |
| `POST /api/auth/logout`, `PUT /api/profile` | `the caller's own session or profile; no book` |
| `/api/notifications/*` writes | `the caller's own notifications; no book` |
| `POST /api/research/consent`, `POST /api/research/consent/withdraw` | `the caller's own consent decision; no book` |
| `POST /api/feedback` | `the public feedback form (spec §6.1)` |
| `POST /api/feedback/:id/{status,resolve,priority,assign,respond}` | `reader feedback triage: writes no book's text or editorial record` |

**Where every other write route gets its book.** Place the guard after the route's auth or role middleware (so `req.user` is set) and after any loader it reads from, and before validation and the handler:
- `segment-editor.js`:
  - `/:book/:chapter/:moduleId/*` routes → `'param'` (`req.params.book`);
  - `DELETE /edit/:editId` and `/edit/:editId/{approve,reject,discuss,unapprove,return-to-pending,comment}` → `'row'` via the existing `bookFromEditId`;
  - `/reviews/:reviewId/complete` → `'row'` via `bookFromReviewId`;
  - `/acceptance/:id/revoke` → `'row'` via a new `bookFromAcceptanceId(req)` that uses `acceptanceService.getAcceptanceById` and throws `'Acceptance not found'` when there is none.
- `localization-editor.js`: `/loc-edit/:editId/*` → `'row'` via `bookFromLocEditId`; `/:book/...` → `'param'`.
- `book-glossary.js`: append the guard to `writeGuard` → `'param'`.
- `suggestions.js`: `/scan-book/:bookSlug` → `'param'` (`req.params.bookSlug`); the others → `'row'` (`req.section.bookSlug`, after `requireHeadEditorOfSection`).
- `sections.js`: all six → `'row'` (`req.sectionData.bookSlug`, after `loadSection`).
- `admin.js`: `POST` and `DELETE /assignments/:book/:chapter` → `'param'`.
- `pipeline.js`: `/inject`, `/render` and `/run` → `'body'` (`req.body?.book`, after `requireHeadEditorFor`).
- `pipeline-status.js`: `POST` and `DELETE /:bookSlug/:chapterNum/lock` → `'param'` (`req.params.bookSlug`).
- `publication.js`: the three tracks → `'param'` (`req.params.bookSlug`).

- [ ] **Step 1: Write the census test** in `editorScopeCensus.test.js`, with the env set first and the routers required as in `heldBookWrites.test.js:17-21`:

```js
it('every write route is guarded or exempt with a reason', () => expect(unclassified()).toEqual([]));
it('every admin-only exemption is admin-only in code', () => expect(falseAdminOnly()).toEqual([]));
it('no exempt key is stale, none is also guarded', () => {
  expect(staleExempt()).toEqual([]);
  expect(guardedAndExempt()).toEqual([]);
});
it('no nested router and no all-method route', () => expect(unwalkable()).toEqual([]));
it('every route with requireBookAccess has :chapter in its path (spec §6.2)', () =>
  expect(bookAccessWithoutChapter()).toEqual([]));
it('index.js mounts routers only through apiMounts and views', () =>
  expect(routeRequiresIn('server/index.js').sort()).toEqual(['./routes/apiMounts', './routes/views']));
it('control: a planted router with an unguarded POST is named', () => {
  const r = express.Router();
  r.post('/:book/x', (q, s) => s.end());
  expect(unclassified([{ prefix: '/api/planted', router: r }])).toEqual(['POST /api/planted/:book/x']);
});
it('control: an admin-only key on a non-admin route is named', () => { /* plant both, expect the key */ });
```

- [ ] **Step 2: Run it and see it fail.** `npx vitest run server/__tests__/editorScopeCensus.test.js` should FAIL. It cannot find `apiMounts`, and once that exists, `unclassified()` lists the unguarded routes.
- [ ] **Step 3: Create `apiMounts.js` and change `index.js`.** Keep the three limiter lines (`/api/auth/login`, `/api/auth/callback`, `app.post('/api/feedback', publicSubmitLimiter)`) before one loop: `for (const { prefix, router } of API_MOUNTS) app.use(prefix, router);`. Delete the `*Routes = require(...)` lines it replaces; `viewRoutes` stays.
- [ ] **Step 4: Create `editorScopeExempt.js`** from the table above, and wire the guard per the list above. Run the census until it passes.
- [ ] **Step 5: Write `editorScopeRoutes.test.js`** (T2, T9, Review Focus 1 and 5). It mounts the routers for segment-editor, sections and pipeline. Its users:
  - `ED`: editor, with a users row and no chapter rows;
  - `HE_LIF`: head editor of `liffraedi-2e`;
  - `HE_CHEM`: head editor of `efnafraedi-2e`;
  - `ADM`: admin.

  Its cases:
  - **param book:** `POST /api/segment-editor/liffraedi-2e/1/m68664/edit` as `HE_LIF` → 403 `BOOK_CLOSED`; as `ADM` → `body.error !== 'BOOK_CLOSED'`.
  - **body book:** `POST /api/pipeline/inject {book:'liffraedi-2e', chapter:9999}` as `HE_LIF` → 403 `BOOK_CLOSED`.
  - **body book, missing:** `POST /api/pipeline/inject {chapter:9999}` and `{book: 42, chapter:9999}` as `HE_CHEM` → 400 or 403, never 2xx. Chapter 9999 makes `validateParams` refuse any request that clears authz, so no job can start (the `crossBookAuthz.test.js` safety).
  - **row-derived book:** a planted `segment_edits` row in `liffraedi-2e`. `POST /api/segment-editor/edit/<id>/comment` as `ED` → 403 `BOOK_CLOSED`.
  - **row-derived book, unknown id:** `POST /api/segment-editor/edit/999999/comment` as `ED` → 404.
  - **T9:** a chemistry section with `ED` as its assigned reviewer and status in progress. `POST /api/sections/<id>/submit-review` as `ED` → not 403. A comment on a chemistry edit by `ED`, who holds no chapter row → not 403.
- [ ] **Step 6: Run both files and see them pass.** Then mutate: remove the guard from `/edit/:editId/comment`. The census names that route and the row-derived case goes red. Restore from the golden copy and `cmp`.
- [ ] **Step 7: Recalibrate.** Run `npm test`. Each red that pins a non-admin write to a non-allowlisted book now expects 403 `BOOK_CLOSED`, with a comment citing spec §6.1. Known: `crossBookAuthz.test.js`'s `liffraedi-2e` write cases (its GET cases keep their expectations). Any red of another kind is a defect in this task's code: fix the code, never the test. List the recalibrated files in the commit body.
- [ ] **Step 8: Commit** `feat(g113): route census and the closed-book guard on every book write (spec §6.1, §6.7)`.

---

### Task 3: A study book is always enforced

**Files:**
- Modify:
  - `server/services/userService.js:586` (`isAssignmentEnforced`);
  - `server/middleware/requireRole.js:268` (the chapter-less path);
  - `server/routes/admin.js:1099` (the toggle) and `:1078` (`GET /assignments/:book` adds `enforcementLocked`);
  - `server/public/js/assignments.js:370-375,433-450` (the locked toggle);
  - `server/scripts/read-research-preconditions.js:214-235` (`readG1d`).
- Create: `server/__tests__/studyBookEnforced.test.js`, `server/__tests__/helpers/plantAssignment.cjs`
- Modify (recalibration): `server/__tests__/readResearchPreconditions.test.js` and the files listed in Step 6.

**Interfaces:**
- Consumes: `isAlwaysEnforced` (Task 1).
- Produces:
  - `isAssignmentEnforced(book)` returns `true` when `isAlwaysEnforced(book)`, before any DB read. `hasChapterAccess` is unchanged: its every fail-open branch is under `!enforce`, which this makes false for study books (T4 proves it).
  - `requireBookAccess`: `const chapter = req.chapterNum ?? req.params.chapter;`. When `chapter` is `undefined`, `null` or `''` and `isAlwaysEnforced(book)`, it answers 403 `{ error: 'CHAPTER_UNKNOWN', message }`. A non-study book keeps today's pass-through.
  - Toggle route: `enabled === false` for a study book → 409 `{ error: 'STUDY_BOOK_ALWAYS_ENFORCED', message }`, and nothing is written.
  - `GET /api/admin/assignments/:book` adds `enforcementLocked: isAlwaysEnforced(book)`.
  - `readG1d` returns `studyBookEnforced: isAlwaysEnforced(book) || stored` and a new `studyBookEnforcedStored: stored`.
  - `server/__tests__/helpers/plantAssignment.cjs` exports `plantAssignment(conn, { userId, book, chapter, assignedBy = 'test' })`, an `INSERT OR IGNORE` into `user_chapter_assignments`. Fixtures plant state; they never call the gate. Task 6 adds `plantAssignable` to the same file.

- [ ] **Step 1: Write the failing tests** in `studyBookEnforced.test.js`, on a `freshMigratedDb()` handed to `userService._setTestDb`:

```js
it.each([[null], [0], [1]])('T3: chemistry is enforced with book_settings row %s', (v) => {
  /* plant row v (null = no row) */ expect(userService.isAssignmentEnforced('efnafraedi-2e')).toBe(true);
});
it('T3: a non-study book follows its row', () => { /* 'testbook': 0 → false, 1 → true */ });
it('T4: chemistry, no row for the chapter → false', ...);
it('T4: chemistry, null user → false', ...);
it('T4: chemistry, assignment table dropped → throws ASSIGNMENT_TABLE_UNAVAILABLE', ...);
it('T4: chemistry, users table dropped → throws ASSIGNMENT_TABLE_UNAVAILABLE', ...);
it.each([['0', 0], ['-1', -1], [-1, -1]])('T4: chapter %j is checked, not skipped', (asked, planted) => {
  /* no row → false; plantAssignment at `planted` → true */
});
it('chapter-less path: an editor on chemistry with no chapter → 403 CHAPTER_UNKNOWN', ...);
it('chapter-less path: a non-study book passes as before', ...);
it('T5: the toggle refuses to turn chemistry off (409) and writes nothing', ...);
it('T5: the toggle still turns a non-study book off', ...);
it('GET assignments reports enforcementLocked for chemistry', ...);
```

  In `readResearchPreconditions.test.js`, a chemistry row at 0 now reads `studyBookEnforced: true, studyBookEnforcedStored: false`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement** the interfaces above. On the assignments page, when `enforcementLocked` is set, the toggle is checked and disabled, with an Icelandic note saying it is always on for the research book.
- [ ] **Step 4: Run them and see them pass.** Then mutate `isAssignmentEnforced` to drop the study-book line. T3 and T4 go red. Restore from the golden copy and `cmp`.
- [ ] **Step 5: Run `npm test`.**
- [ ] **Step 6: Recalibrate.** The server suite was measured on 2026-11-22 against `4e2dcbbcc`'s code with `isAssignmentEnforced('efnafraedi-2e')` forced to `true`. Five tests in four files went red. The same four files pass on the unforced code (the control), so the probe caused all five. The reds:
  - `featureFlags.test.js`: two tests, "the snapshot for chemistry, every flag by value" and "each flag follows its own source…". The enforcement flag now reports `true` for chemistry; update the expected value and say why (spec §6.2).
  - `moduleOpeningRoute.test.js`: "…an editor with zero rows while enforcement is off and colleagues hold rows…". Its subject is the old fail-open in chemistry.
  - `moduleOpenings.test.js`: "the zero-row editor's no is the predicate's own: the fail-open neighbour would have let them in". The neighbour no longer exists in chemistry.
  - `userService.test.js`: "hasChapterAccess returns true when no assignments (backward compat)". Its subject is the toggle-off rule.

  This measurement covers enforcement only. The closed-book reds belong to Task 2, Step 7, and the gate's to Task 6.

  For each: where the test's subject is something other than access (a save, an accept, a research event), plant the editor's row with `plantAssignment` (and a `users` row if it has none). Where the test's subject is the old fail-open in chemistry, move that case to `'testbook'` at the service level, so the toggle logic stays covered (spec T10, as amended). Anything else red is a defect in this task.
- [ ] **Step 7: Commit** `feat(g113): a study book is always enforced, fails closed, and cannot be switched off (spec §6.2)`.

---

### Task 4: Propagation checks each target

**Files:**
- Modify: `server/services/userService.js` (add `canWriteChapter`), `server/services/propagationService.js` (add `scopeOccurrences`), and `server/routes/segment-editor.js` (preview, line 1883; apply, line 1936).
- Create: `server/__tests__/propagationScope.test.js`
- Modify (test): `server/__tests__/servedPropagation.test.js` (the file that already drives `POST /propagate`).

**Interfaces:**
- Consumes: `hasChapterAccess`, `findByProviderId`, `refuseClosedBookForNonAdmins`.
- Produces:
  - `canWriteChapter({ user, book, chapter }): boolean`. `user` is `req.user` (`{ id, role, books }`, the token's), because the middleware decides admin and head editor from the token (spec AMENDED 2026-11-22). The rule:
    - `role === 'admin'` → true;
    - `role === 'head-editor' && books.includes(book)` → true;
    - otherwise `hasChapterAccess(findByProviderId(user.id)?.id ?? null, book, chapter)`, which may throw `ASSIGNMENT_TABLE_UNAVAILABLE`.

    It never tests `chapter` by truthiness.
  - `scopeOccurrences(occurrences, mayWrite: (chapter: number) => boolean): { inScope: object[], skipped: object[] }`:
    - `occ.chapter === 0` → skipped `{ moduleId, segmentId, chapter: 0, reason: 'chapter-not-editable' }`, for everyone;
    - `!mayWrite(occ.chapter)` → skipped with `reason: 'not-your-chapter'`;
    - `inScope` keeps the input objects unchanged (`createPropagatedEdits` validates their fields).
  - Both routes build `mayWrite` from `canWriteChapter`, memoised per chapter in a `Map`. Both put the scope skips first in `skipped`. Apply passes `inScope` to `createPropagatedEdits`, and returns and emits `skipped: [...scope.skipped, ...created.skipped]` (the research event carries scope skips too: the spec §12 choice, made here). `ASSIGNMENT_TABLE_UNAVAILABLE` → 503, as in the middleware.
  - The preview route gains `refuseClosedBookForNonAdmins((req) => req.params.book, 'param')` after `requireRole(ROLES.EDITOR)` (§6.3 parity; the census does not demand it on a GET).

- [ ] **Step 1: Write the failing tests** (T6) in `propagationScope.test.js`:

```js
const occ = (chapter) => ({ chapter, moduleId: `m${chapter}`, segmentId: 's' });
it('an editor holding ch2: only ch2 is in scope; ch3 and -1 not-your-chapter; ch0 chapter-not-editable', () => {
  const { inScope, skipped } = scopeOccurrences([occ(2), occ(3), occ(0), occ(-1)], (c) => c === 2);
  expect(inScope.map((o) => o.chapter)).toEqual([2]);
  expect(skipped.map((s) => [s.chapter ?? null, s.reason])).toEqual(
    [[3, 'not-your-chapter'], [0, 'chapter-not-editable'], [-1, 'not-your-chapter']]);
});
it('the head editor reaches 2, 3 and -1, and ch0 is still skipped', () => { /* mayWrite = () => true */ });
it('canWriteChapter: admin, head editor of the book, head editor of another book, editor with and without a row', ...);
it('canWriteChapter: chapter 0 with a row at 0 is checked (not skipped by truthiness)', ...);
```

  In `servedPropagation.test.js`, an editor holding only the source chapter propagates to a target in another chapter. Preview and apply both list it as `not-your-chapter`, and no `segment_edits` row is written for it.
- [ ] **Step 2: Run them and see them fail. Step 3: Implement. Step 4: Run them and see them pass.** Then mutate `scopeOccurrences` to drop the ch0 branch; the T6 case goes red. Restore from the golden copy and `cmp`.
- [ ] **Step 5: Commit** `feat(g113): propagation skips chapters the editor does not hold, and ch00 for everyone (spec §6.3)`.

---

### Task 5: The licence-clause record

**Files:**
- Create: `server/migrations/060-editor-licence-clauses.js`, `server/services/licenceClauses.js`, `server/__tests__/migration060.test.js`, `server/__tests__/licenceClauseRoutes.test.js`
- Modify:
  - `server/services/migrationRunner.js:91` (append 060);
  - `server/lib/schemaHealth.js` (`EXPECTED_SCHEMA.tables`);
  - `server/lib/editorialRetentionScope.js` (the entry and the header comment);
  - `server/__tests__/editorialRetentionScope.test.js` (lines 72-75 and 132);
  - `server/__tests__/editorialRetention.test.js` (beside "a users row is never changed", line 453);
  - `server/routes/admin.js` (three routes);
  - `server/views/admin.html` (the user dialog, near line 750);
  - `server/lib/editorScopeExempt.js` (two `ADMIN_ONLY` keys).

**Interfaces:**
- The migration's DDL (the decision; spec §6.4):

```sql
CREATE TABLE IF NOT EXISTS editor_licence_clauses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,            -- users.id, deliberately no FOREIGN KEY (spec §6.4)
  signed_on TEXT NOT NULL CHECK (signed_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  recorded_by TEXT NOT NULL,           -- the recording admin's username (spec §10 call 12)
  recorded_at_ms INTEGER NOT NULL CHECK (recorded_at_ms > 0)
);
CREATE INDEX IF NOT EXISTS idx_editor_licence_clauses_user ON editor_licence_clauses (user_id, id);
CREATE TRIGGER IF NOT EXISTS editor_licence_clauses_append_only BEFORE UPDATE ON editor_licence_clauses
BEGIN SELECT RAISE(ABORT, 'editor_licence_clauses is append-only'); END;
```

- `licenceClauses.js`:
  - `isRealDate(s): boolean`, which round-trips through `Date.UTC`;
  - `recordClause(conn, { userId, signedOn, recordedBy, nowMs }): { id }`. It throws an `Error` with `.code` `'BAD_DATE'` or `'FUTURE_DATE'`. "Future" means `signedOn > new Date(nowMs).toISOString().slice(0, 10)`.
  - `clausesFor(conn, userId): Array<{ id, signedOn, recordedBy, recordedAtMs }>`;
  - `latestSignedOn(conn, userId): string | null`;
  - `hasClause(conn, userId): boolean`;
  - `removeClause(conn, { userId, rowId }): boolean`, which is false when the row is not this user's.
- Routes, all `requireAuth, requireAdmin()`:
  - `GET /api/admin/users/:id/licence-clause` → `{ rows }`.
  - `POST /api/admin/users/:id/licence-clause { signedOn }`: 404 `USER_NOT_FOUND` when no users row exists (`userService.findById`); 400 `BAD_DATE` or `FUTURE_DATE`; otherwise 201 `{ id, signedOn }`. `recordedBy` is `req.user.username`.
  - `DELETE /api/admin/users/:id/licence-clause/:rowId { reason }`:
    - a trimmed reason under 10 characters → 400 `REASON_REQUIRED`;
    - a row that is not this user's → 404;
    - otherwise `activityLog.log({ type: 'licence_clause_removed', userId: req.user.id, username: req.user.username, description })`, where `description` names the row id and the reason, then 200 `{ removed }`.
- The retention entry, exactly as spec §6.4: `editor_licence_clauses: { action: 'keep', person: [integer('user_id', null), text('recorded_by', null)], times: [] }`.

- [ ] **Step 1: Write the failing tests:**
  - `migration060.test.js`, modelled on `migration059.test.js`: the table, columns, index and trigger exist; an `UPDATE` throws `append-only`; `signed_on '2026-1-1'` violates the CHECK; running it twice is a no-op; `up()` on a broken state warns and does not throw.
  - `editorialRetentionScope.test.js`: 34 becomes 35; `byAction('keep')` is `['editor_licence_clauses', 'users']`.
  - `editorialRetention.test.js`: "a licence-clause row comes through the named and consent steps unchanged, while the consent step deletes the research_consent row beside it". Use the existing consent-step test's setup at line 833 for the step's preconditions.
  - `licenceClauseRoutes.test.js` (Review Focus 4): `'2026-02-30'` and `'2026-13-01'` → 400 `BAD_DATE`; tomorrow (UTC) → 400 `FUTURE_DATE`; today → 201; an unknown user → 404; an editor or head-editor caller → 403; DELETE with `reason: 'short'` → 400; a good DELETE writes one `activity_log` row whose description contains the row id; GET lists newest last.
- [ ] **Step 2: Run them and see them fail. Step 3: Implement**, including the users-page field: "Leyfisákvæði undirritað <date>" or its absence, plus a date input and a button. **Step 4: Run them and see them pass.** Then mutate the retention entry to `action: 'consent'`; the scope pin goes red. Restore from the golden copy and `cmp`.
- [ ] **Step 5: Run `npm test`. Commit** `feat(g113): editor_licence_clauses, kept permanently, recorded by admins (spec §6.4)`.

---

### Task 6: The assign gate

**Files:**
- Create: `server/services/assignmentGate.js`, `server/__tests__/assignmentGate.test.js`
- Modify:
  - `server/services/userService.js` (`assignChapter` at 706, `setChapterAssignee` at 783, and a new export `assignmentRefusalFor`);
  - `server/routes/admin.js` (`POST /users/:id/chapters` at 993, `POST /assignments/:book/:chapter` at 1191, `GET /assignments/:book` at ~1067);
  - `server/public/js/assignments.js`.
- Modify (fixtures): every test that calls `userService.assignChapter(` to set up state switches to `plantAssignment`. The files are `myWorkToday`, `moduleOpeningRoute`, `moduleRouteSuggestions`, `researchBoundary`, `adminAssignAppendices`, `moduleOpenings`, `activityLogBookScope`, `chapterOneAssignee`, `researchRouteCapture`, `servedWriteLock` and `researchModuleOpened`. `userService.test.js`'s own `assignChapter` tests use `plantAssignable` first.

**Interfaces:**
- Consumes:
  - `isEditorWritableBook`;
  - `isStudyBook`;
  - `currentSwitchValue(conn, book, 'suggestion-view')` from `server/lib/bookSwitches.js`;
  - `hasClause` (Task 5);
  - `plantAssignment` (Task 3).
- Produces:
  - In `server/__tests__/helpers/plantAssignment.cjs`, `plantAssignable(conn, { userId, book })`. It inserts:
    - a `research_consent` row (`decision 'declined'`, `interval_id NULL`, `consent_text_version 'test'`, `consent_text_sha256 '0'.repeat(64)`, `given_at_ms Date.now()`);
    - an `editor_licence_clauses` row;
    - for a study book, a `book_switch_events` row (`'suggestion-view'`, value 1).
  - `assignmentRefusal(conn, { userId, book, chapter }): null | Reason`. `chapter` may be `undefined` (the page's per-editor listing). It returns the first reason that applies, in this order:
    1. `'book-closed'`: `!isEditorWritableBook(book)`.
    2. `'chapter-not-editable'`: `isStudyBook(book) && chapter !== undefined && Number(chapter) === 0` (§6.6).
    3. `'bypass-role'`: `users.role === 'admin'`, or `users.role === 'head-editor'` with a `user_book_access` row for `book` whose `role_for_book = 'head-editor'`. This is the token's rule, since `auth.js` builds `books` from `getHeadEditorBooks`.
    4. `'no-consent-decision'` (study books): no `research_consent` row for the user, of any decision.
    5. `'no-licence-clause'`: `!hasClause(conn, userId)`.
    6. `'suggestion-view-off'` (study books): `!currentSwitchValue(conn, book, 'suggestion-view')`.
  - `REFUSAL_MESSAGES: Readonly<Record<Reason, string>>` (Icelandic).
  - `assignChapter` and `setChapterAssignee` call `assignmentRefusal(db, …)` before any write. `setChapterAssignee` does so inside its transaction. A refusal throws `Object.assign(new Error('assignment refused: ' + reason), { code: 'ASSIGNMENT_REFUSED', reason })`.
  - `userService.assignmentRefusalFor(userId, book, chapter)` is the same check on `getDb()`, for routes.
  - The routes map `ASSIGNMENT_REFUSED` to 409 `{ error: 'ASSIGNMENT_REFUSED', reason, message }`. `POST /users/:id/chapters` checks every chapter with `assignmentRefusalFor` before its loop and refuses the whole request on the first refusal.
  - `GET /assignments/:book`: each editor gains `licenceSignedOn` and `refusal`, the latter being `assignmentRefusalFor(id, book)` with no chapter. The page marks unassignable editors with their reason and shows a refused assign's message.

- [ ] **Step 1: Write the failing tests** (T7, Review Focus 2) in `assignmentGate.test.js`:

```js
it.each(['book-closed', 'chapter-not-editable', 'bypass-role', 'no-consent-decision',
         'no-licence-clause', 'suggestion-view-off'])('refuses with %s, through both routes and setChapterAssignee, writing no row', ...);
it('a declined consent row plus a licence row, view on → assigned', ...);
it('a head editor of another book is not bypass-role in chemistry', ...);
it('chapter "0" through POST /api/admin/assignments/efnafraedi-2e/0 → 409 chapter-not-editable', ...);
it('multi-chapter assign refused writes nothing', () => {
  /* POST /api/admin/users/:id/chapters {bookSlug:'efnafraedi-2e', chapters:[3, 4]} for an editor
     with no licence → 409 no-licence-clause; user_chapter_assignments has no row for either */
});
it('removing an assignment is not gated', ...);
it('GET assignments lists each editor with refusal and licenceSignedOn', ...);
```

- [ ] **Step 2: Run them and see them fail. Step 3: Implement**, then switch the fixtures to `plantAssignment`. **Step 4: Run them and see them pass.** Then mutate the gate to skip reason 4; the `no-consent-decision` case goes red. Restore from the golden copy and `cmp`.
- [ ] **Step 5: Run `npm test`. Commit** `feat(g113): assigning refuses without a consent decision, a licence clause and the suggestion view (spec §6.5, §6.6)`.

---

### Task 7: The E2E recalibration

**Files:**
- Modify: `server/e2e/seed-fixture.js`, `server/e2e/playwright.config.js`, `server/e2e/assignments.spec.js`, `server/e2e/editor-workflow.spec.js`, `server/e2e/localization-editor.spec.js`, `server/e2e/ux-phase2.spec.js`, and any spec the run names in Step 6.

**What changes, and why:**
- **The fixture book `__e2e-fixture__` is closed now** (it is not on the allowlist, and it must not be added). Its non-admin writes move as follows:
  - `localization-editor.spec.js`'s two `POST /save rejects …` tests sign in as admin. They test body validation, not roles.
  - `editor-workflow.spec.js` moves from the fixture book to `efnafraedi-2e`, in a chapter and module no other spec owns. Ownership is recorded in `seed-fixture.js`'s comments; chapters 1, 2, 5, 7, 8 and 9 are taken, and re-check against the comments. Seed a `users` row for its editor (provider `'88001'`) with an assignment row for that chapter. Its head editor (88002) passes by the token's `books`.
- **Editors who save in chemistry** need a `users` row and an assignment row: `ux-phase2.spec.js`'s 88010 and its default editor, in the M5 block's chapter. Seed them in `seed-fixture.js` and record the ownership. A users row with an assignment makes that editor's serves open modules (research rows), so choose chapters whose modules no spec asserts openings on.
- **The gate:**
  - Seed a `research_consent` row (declined) and an `editor_licence_clauses` row for the two assignment editors (providers `'90201'` and `'90202'`).
  - The suggestion view must be on before `assignments.spec.js` assigns. `suggestion-view.spec.js` needs it off until its step (2), and never turns it off afterwards. So `playwright.config.js` gets two projects: `chromium` (`testIgnore: 'assignments.spec.js'`) and `chromium-after-switch-on` (`testMatch: 'assignments.spec.js'`, `dependencies: ['chromium']`).
  - `assignments.spec.js` gets a `beforeAll` that asserts `GET /api/admin/books/efnafraedi-2e/suggestion-view` answers `enabled: true`. Its message names the project dependency and `suggestion-view.spec.js`.

- [ ] **Step 1:** `cd server && CI=1 npm run test:e2e` on the branch as Tasks 1–6 left it. Record the failing specs by name.
- [ ] **Step 2:** Make the seed changes.
- [ ] **Step 3:** Make the config split and add the `beforeAll`.
- [ ] **Step 4:** Move the fixture-book writes and the editor logins as listed above.
- [ ] **Step 5:** Run again: all specs pass in both projects.
- [ ] **Step 6:** Any other red is read and classified as in Task 2, Step 7. Never skip a spec.
- [ ] **Step 7: Commit** `test(g113): E2E fixtures for closed books, study-book enforcement and the assign gate (spec T10)`.

---

### Task 8: The whole branch, and the pre-deploy read

- [ ] **Step 1:** From the repo root, `npm test`, `npm run lint` and `npm run format:check`; then `cd server && CI=1 npm run test:e2e`. All must pass. Then `git status --porcelain` must be clean, with no stranded mutant.
- [ ] **Step 2:** Check the spec's coverage against the branch: §6.1 → Tasks 1–2; §6.2 → Task 3; §6.3 → Task 4; §6.4 → Task 5; §6.5–§6.6 → Task 6; §6.7 → Task 2 (T9); T1–T10 each have a named test.
- [ ] **Step 3: The pre-deploy read (spec §7)**, read-only, on production, by Claude over `ssh -o BatchMode=yes`: the head editors of books other than `efnafraedi-2e`, from `user_book_access` joined to `users` (`role_for_book = 'head-editor'`, `is_active`). Report them to [USER] in the session as user ids and books. Nothing from it is committed.
- [ ] **Step 4:** Push the branch and open the PR with the deploy effects of spec §7 and the amendment's GET effect. **Merging and deploying are [USER]'s.**
