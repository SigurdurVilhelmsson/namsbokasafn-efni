# Fail-Loud Sweep — Design (Campaign Batch 4)

**Date:** 2026-07-12 · **Status:** approved by lead (Approach A, "root-cause sweep") · **Branch:** `fix/fail-loud-sweep`, one PR off `main`
**Campaign item:** `docs/plans/2026-07-11-pre-semester-coding-campaign.md` Phase 1 item 3 (folds in register items B1-F8 and the B1-F1 follow-up "dbUser-null enforcement fall-through")
**Sources:** audit findings 20/21/22/37 + Batch E in `docs/audit/2026-07-11-server-code-review.md`; editorial rec #5 in `docs/audit/2026-07-11-editorial-workflow-review.md`; recon fan-out 2026-07-12 (7 read-only agents against `main` @ `b758dff6`) — all file:line references below verified current at that commit.

## 1. Problem

Failure handling in `server/` swings between silent and raw instead of failing loud with a clean message:

1. **Audit-trail writes are each caller's problem.** `activityLog.log()` throws on any failure (`services/activityLog.js:144-165` — no internal catch; the insert has four NOT NULL columns and `JSON.stringify(metadata)` can also throw). 52 call sites each hand-roll a guard — with three different outcomes today:
   - **12 genuinely silent** `} catch { /* fire-and-forget */ }` sites (audit said 6; the census grew — including `return-to-pending`, added by batch 2 last week, which copied the silent pattern): `routes/segment-editor.js` 422 (delete), 550 (approve), 587 (reject), 624 (discuss), 657 (unapprove), 687 (return-to-pending), 786 (comment); `routes/localization-editor.js` 112 (review toggle), 159 (loc approve), 196 (loc reject), 385 (loc submit), 577 (loc submit bulk). A four-eyes accountability record can vanish with zero trace.
   - **29 nested-logged** sites (suggestions 7, admin 3, sections 6, terminology 13) with no dedicated guard: the write sits in the route's outer try *before* `res.json`, so a failing audit write flips an already-committed mutation into a 4xx/5xx — the exact failure mode B1-F1's shape bug produced in this codebase.
   - **11 correct** hand-rolled `catch (logErr) { log.error({ err: logErr }, 'Activity log failed'); }` wrappers.
2. **Five services open the production DB at module load** (audit said two): `activityLog.js:88`, `notifications.js:127`, `localizationLog.js:38`, `feedbackService.js:127`, `analyticsService.js:69`. Tests can't redirect them (`feedbackService.test.js` opens the real `pipeline-output/sessions.db` at import before `_setTestDb` runs; `analyticsService` has no seam at all and zero tests). Worse: **no migration owns `activity_log`, `notifications`, or `notification_preferences`** — the import-time side effect is the only creator of those tables anywhere.
3. **Fabricated zeros:** `routes/admin.js:402-404` renders a real progress-calculation failure identically to an untouched book (`{ percent: 0, approvedSegments: 0, totalSegments: 0 }`, no log). Sibling at `admin.js:1000-1002` (assignments dashboard `chapterProgress = {}`); three more unlogged swallows in the same file (`:236` refreshValidBooks, `:1297` getStageData→null, `:1219` migrate loop).
4. **Unlogged degradation:** `routes/status.js:75` falls back from the DB to cached `status.json` with no log line; the fallback read itself (`:79`) can throw a second error that masks the original DB error.
5. **B1-F8 asymmetry in `services/userService.js`:** writes fail loud (`assignChapter:637`, `removeChapterAssignment:657` throw), but four sibling reads swallow any "no such table" to `[]` (`getChapterAssignments:683`, `getAllChapterAssignments:703`, `getBookAssignments:729`, `getEditorsForBook:769`). Consequences: `DELETE /api/admin/assignments/:book/:chapter` (admin.js:1087-1118) fake-succeeds on a corrupted DB; review digests (`teamDigestService.js:33`) and reader-feedback routing (`routes/feedback.js:117-141`) silently reach nobody. Post-#212 the server refuses to boot on migration errors, so reaching these catches with `users` present means a corrupted DB, not bootstrap.
6. **dbUser-null enforcement fall-through:** `middleware/requireRole.js:272` (`if (dbUser)`) skips the entire chapter-assignment check — including enforcement-ON default-deny and the 503 fail-closed branch — for any JWT holder with no `users` row. Only realistic production case: a hard-deleted user's still-valid JWT (≤24h) — precisely who enforcement should deny. Rider found in scope: `routes/books.js:471` mounts `requireBookAccess` on a route whose param is `:bookId`, so the middleware reads `req.params.book === undefined` and enforcement can never bite there.

## 2. Decisions (locked)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **`activityLog.log()` becomes never-throw by design** (internal try/catch → `log.error({ err, type, book, userId }, 'Activity log write failed')` → return `null`; success returns the insert result as today). All 23 hand-rolled wrappers deleted; 29 nested sites fixed with zero code change. | Lead-approved Approach A. One real code path instead of 52 copies (`feedback-robustness-over-expedience`). The newest route copied the silent variant — per-site fixes leave the copy-source in place. |
| D2 | **Trade-off accepted:** a future payload-shape bug (B1-F1 class) no longer 500s a route; it surfaces only in pino error logs. | The mutation should never fail over its audit record (existing codebase stance, `contentVersionService.js:234`). Compensation: static tripwire + behavioral test that a malformed payload produces a `log.error`. |
| D3 | **Migration 040 takes ownership of `activity_log`, `notifications`, `notification_preferences`** (DDL copied verbatim from the services, `CREATE TABLE IF NOT EXISTS` — idempotent on prod DBs that already have them). Service-side DDL deleted. | Migrations run at `index.js:34` before any route require and fail loud (#212); import-time DDL is the wrong owner. `feedback`/`analytics_events`/`localization_logs` already owned by migrations 005/005/003 — no 040 work needed for them. |
| D4 | **All five eager services convert to the lazy `getDb()` pattern** (`terminologyService.js:64-75`: `_testDb` checked first, mkdir+open+WAL on first call), prepared statements become inline `conn.prepare(...)` per call (codebase precedent — no lazy service keeps a statements cache). `_setTestDb` added where missing; `feedbackService._setTestDb(null)` restore no-op (`if (testDb)` guard at :219) fixed. | Test isolation (the audit's finding 20 scenario is live today in `feedbackService.test.js`); `analyticsService` becomes testable for the first time. |
| D5 | **Test schema comes from real migration files** applied to `:memory:`/temp DBs (`localizationReviewService.test.js` precedent), never hand-rolled DDL. `feedbackService.test.js` switches from `_setTestDb`'s table creation (which becomes a pure setter) to applying migration 005. | Batch-2 fixture-drift lesson: 8 hand-rolled fixtures made a 2,100-test suite structurally blind to a whole defect class. |
| D6 | **B1-F8:** delete the four read-side catch-swallows (S3/S4/S5/S6); keep the `isUserTableReady()` bootstrap head-guards (`return []`); keep `isAssignmentEnforced`→false-on-missing-table (S1, deliberate toggle bootstrap) and `hasChapterAccess`'s enforce-aware branches (S2, Unit-3 model). Rider: chapter-centric DELETE responds `{ success: true, removed: !!current }`. | Restores write/read symmetry. With `users` present, a missing assignments table is a corrupted DB → 500 loudly. `removed` flag makes no-op unassigns distinguishable without breaking the client toast (client doesn't read it). |
| D7 | **dbUser-null:** decision moves into the enforcement-aware layer. `requireBookAccess` always calls `hasChapterAccess(dbUser ? dbUser.id : null, book, chapter)` (guard at requireRole.js:272 removed); `hasChapterAccess` gains an explicit early branch — placed *after* the `isUserTableReady()` guard — `userId == null` → `enforce ? (log.warn + false) : true`. | Enforcement-ON denies row-less callers with the standard 403 "not assigned" path; enforcement-OFF preserves the test-pinned fail-open (`crossBookAuthz.test.js:605`) explicitly, so the legacy "book has assignments" count check can't accidentally deny. Missing-table-under-enforcement 503 unchanged. `isAssignmentEnforced` stays unexported. |
| D8 | **Status fallback logs at `warn`,** not error: `log.warn({ err, bookSlug, chapterNum }, 'Pipeline status DB read failed; serving cached status.json')`, placed at the **top** of the catch (before the fallback read, so the true DB error is recorded even when the fallback itself throws ENOENT/SyntaxError). | The request still succeeds via a recently-synced cache; real DB outages already surface via `/api/health` and every write path. Log shape matches `pipelineStatusService.js:197/273/430`. |
| D9 | **Admin book list:** on failure, `editorialProgress = null` + sibling `editorialProgressUnavailable: true` + `log.error({ err, book: book.slug }, ...)`. `views/books.html:1648` (sole consumer) renders "Framvinda ótiltæk" instead of "0% lokið" when the flag is set. | Marker-object shapes without numeric `percent` render "undefined% lokið" in the current client; `null` + flag degrades safely on stale clients (0%, no JS error) while new client shows the honest state. `approvedSegments`/`totalSegments` have no consumer — dropped with the fabrication. |
| D10 | **Rider:** `routes/books.js:471` route param `:bookId` → `:book` (handler refs updated) so `requireBookAccess` receives the book. | One-line authz repair discovered in scope; without it D7 is dead code on that route. |

## 3. Design by component

### 3.1 `services/activityLog.js` — never-throw + lazy + migration-owned

- Lazy `getDb()` (D4) with `_setTestDb` seam; `initDb()`'s DDL (lines 55-86: `activity_log` + 4 indexes) moves verbatim into migration 040; module-level `statements` object dissolves into inline prepares.
- `log(options)` keeps its current signature and validation, wraps everything (including `JSON.stringify(metadata)`) in try/catch. Failure path: `log.error({ err, type: options.type, book: options.book, userId: options.userId }, 'Activity log write failed')`, return `null`. The file gains `const log = require('../lib/logger')` (it has no logger today).
- Read functions (`search`, `getRecent`, …) unchanged in behavior (they throw; their route callers already log + 500 — that is correct fail-loud for reads).

### 3.2 Call-site sweep (routes + contentVersionService)

- **Delete the 23 dedicated wrappers** (12 silent + 11 logging) so call sites read `activityLog.log({...})` bare: segment-editor.js 351/422/465/550/587/624/657/687/744/786/1102/1167; localization-editor.js 112/159/196/385/440/577/623; publication.js 145/203/263; contentVersionService.js 236. **Wrinkle:** the comment-route wrapper (segment-editor.js:785-797) also guards `segmentEditor.getEditById()` — hoist the lookup above the (removed) guard so a lookup throw still reaches the route's error path.
- **Nested-logged sites (29): no code change** — with D1 they can no longer throw.
- **Not touched:** the two `localizationEditService` audit-trail guards (localization-editor.js:417-430, 609-612) — different service, different table; their hand-rolled logging guards stay.

### 3.3 Migration 040 + the other four lazy conversions

- `040-service-table-ownership.js`: `activity_log` (+4 indexes) from activityLog.js, `notifications` + `notification_preferences` (+indexes) from notifications.js:88-125, all `IF NOT EXISTS`. Index names copied verbatim so the migration is a no-op on existing prod DBs. Generic migration-idempotency coverage (`migrationIdempotency.test.js`) picks it up automatically — verify it enumerates migrations dynamically.
- `notifications.js`, `localizationLog.js`, `feedbackService.js`, `analyticsService.js`: same conversion as 3.1 (lazy getDb, `_testDb` first, inline prepares, DDL deleted where migration-owned). `localizationLog.js`'s stale "matches sessionCore.js pattern" comment goes; `localizationSuggestions.js:705`'s deferred-require band-aid can stay as-is (harmless once import is side-effect-free).
- `feedbackService._setTestDb` becomes a pure setter (tables come from migration 005 in tests, D5); note migration 005 also owns the `update_feedback_timestamp` trigger the service DDL never created — deleting service DDL removes that drift.

### 3.4 Admin honesty (`routes/admin.js` + `views/books.html`)

- `:402` per D9. `:1000` gains `log.error` (fallback `{}` stays — progress is genuinely optional on that dashboard). `:236` gains `log.warn` (failed VALID_BOOKS refresh means new book 400s until restart — must be visible). `:1297` gains a log line in `getStageData`'s catch. `:1219` migrate-loop catch gains `log.error({ err, migration: name }, ...)` (response payload already surfaces the error; pino never sees it today).
- `views/books.html:1648`: `var ep = book.editorialProgress; var pct = ep && typeof ep.percent === 'number' ? ep.percent : 0;` + render the unavailable label when `book.editorialProgressUnavailable`.

### 3.5 `routes/status.js:75` — one log line per D8. Nothing else in the file changes (its other bare catches are deliberate per-chapter skips; two adjacent findings go to the register, §5).

### 3.6 `services/userService.js` + `routes/admin.js` (B1-F8, D6)

- Delete the `catch (err) { if (err.message.includes('no such table')) return []; throw err; }` blocks at :683-684, :703-704, :729-730, :769-770 (keep the try only if other error mapping remains — otherwise unwrap).
- Verify each caller's error path logs before 500ing: admin routes do (`log.error` + 500 pattern throughout); `routes/status.js:156-165` has its own catch (dashboard renders unassigned — acceptable, it logs? — plan task verifies and adds a log line if bare); `teamDigestService.js:33` and `routes/feedback.js:117-141` — plan task confirms their outer catches log loud.
- DELETE `/api/admin/assignments/:book/:chapter`: add `removed: !!current` to the success payload.

### 3.7 `middleware/requireRole.js` + `services/userService.js` (dbUser-null, D7) + `routes/books.js` rider (D10)

- requireRole.js:269-295: keep the `if (chapter)` gate; replace `if (dbUser) { ... }` by always calling `hasChapterAccess(dbUser ? dbUser.id : null, book, chapter)`; existing `ASSIGNMENT_TABLE_UNAVAILABLE`→503 and `!allowed`→403 branches unchanged. No logger needed in the middleware (the service logs the deny).
- userService.hasChapterAccess: after the `isUserTableReady()` guard, insert the explicit null-user branch per D7.
- books.js:471-474: `:bookId` → `:book` in the route path and handler references.

## 4. Test strategy

Baseline: 2201 tests green (`npx vitest list`), `npm test` from repo root is the gate.

1. **Log-assertion spike (first task):** verify `vi.spyOn(require('../lib/logger'), 'error')` intercepts calls from other CJS modules (single shared pino instance — plausible, unprecedented in this repo). Fallback if pino instance methods resist spying: DI options argument, `migrationFailLoud.test.js` precedent.
2. **activityLog behavioral:** with `_setTestDb` + migration-040 schema: happy-path insert returns row info; dropped `activity_log` table → `log()` returns `null`, `logger.error` called, no throw; malformed payload (missing `type`) → same (pins D2's compensation).
3. **Static tripwire** (`source-write-guard` precedent): assert the literal `/* fire-and-forget */` pattern is gone from `server/`, and no `try {` block whose body begins with `activityLog.log(` exists in routes/services (wrappers deleted; new ones unnecessary — if one reappears, a human classifies it). Reword any code comments that would false-positive rather than weakening the guard (B1-F1 lesson).
4. **Eager-open regression:** subprocess test (`spawnSync node -e "require('<service>')"` with `SESSIONS_DB_PATH` pointing into a temp dir) asserting the DB file does **not** exist after import, for each of the five services; one positive control (call a function → file appears).
5. **Admin honesty:** `crossBookAuthz`-style listen+fetch harness already mounts `routes/admin`; its minimal schema makes `getEditorialProgress` throw naturally → pins `GET /api/admin/books` → 200 with `editorialProgress: null` + `editorialProgressUnavailable: true` (and, pre-fix, would have shown the fabricated zeros — the behavioral delta is real, not a static pin).
6. **B1-F8:** userService unit tests — `users` present + `user_chapter_assignments` dropped → all four reads throw; no `users` table → `[]` (bootstrap unchanged); DELETE route via harness → 500 on corrupted DB (was fake 200), `removed: false` on no-op unassign.
7. **dbUser-null:** new row-less EDITOR persona in `crossBookAuthz.test.js` vs an enforcement-ON section → 403 (today 200 — the deny direction is currently unpinned); existing `:605` fail-open pin stays green; service-level `hasChapterAccess(null, …)` enforce ON/OFF cases.
8. **feedbackService.test.js** migrates to D5 (real migration 005 on `:memory:`); **first analyticsService test** (greenfield smoke: insert + count via `_setTestDb`).

## 5. Out of scope → register (campaign doc, batch-4 entry)

- `services/bookRegistration.js:620-622` bare catch (chapterNums fall-through) — same endpoint's data path, different file.
- `routes/status.js:1230` converts a DB outage into a client-visible 404 "Status not found"; `:645`/`:842`/`:1182` silently skew analytics/agenda/summary counts on per-chapter failures.
- `userService.findByProviderId` ignores `is_active` — a deactivated (not deleted) user's still-valid JWT passes the editor path; adjacent authz-semantics decision for the lead, not a fail-loud item.
- Apply's content-version snapshot lacks `applied_by` attribution (editorial rec #5's second half) — batch 5 (apply/version integrity) territory.
- B1-F7/B1-F9 notification/activity vocabulary alignment — unchanged, stays its own batch.

## 6. Risks

| Risk | Mitigation |
|------|------------|
| D2: shape bugs invisible at HTTP layer | Tripwire + behavioral malformed-payload test + pino error is production-visible (`LOG_LEVEL` info default) |
| Migration 040 collides with prod tables created by service DDL | `IF NOT EXISTS` + verbatim index names + generic idempotency test |
| B1-F8 rethrow surfaces in digest/feedback paths as crashes | Plan task verifies each caller's catch logs; adds log lines where bare |
| hasChapterAccess null-branch placement changes 503 semantics | Branch sits after the `isUserTableReady()` guard; enforcement-ON + missing-table stays 503 (pinned by `assignmentEnforcement.test.js:119`) |
| Wrapper removal churns files batch 2 just touched | Mechanical deletions; `npm test` gate + final whole-branch review |
