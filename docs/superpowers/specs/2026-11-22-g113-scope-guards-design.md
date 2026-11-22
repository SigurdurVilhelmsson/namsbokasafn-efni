# G1.13: scope guards — closed books, chemistry always enforced, propagation, and a gated assign (DESIGN, approved 2026-11-22)

> **Approved by [USER] on 2026-11-22, as written, Claude's calls 1–12 included (§10).** Frozen from here: a change
> is a dated amendment block, never an edit. Status lives in the active register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`); this file is the design record. If the two disagree,
> the register wins.

> ✏️ **AMENDED 2026-11-22, while writing the plan** (`docs/superpowers/plans/2026-11-22-g113-scope-guards.md`). These
> change no decision and add no feature; they record what the code showed.
> 1. **T10 at route level.** Chemistry is the only writable book and the only study book, so no route-level write can
>    test the toggle-off rule on a "non-study fixture book". The toggle logic stays covered at the service level and
>    on GET routes, and route-level writes in other books now expect `BOOK_CLOSED`.
> 2. **Interfaces.** `canWriteChapter` takes `{ user, book, chapter }`, with `user` being `req.user`, because the
>    middleware decides admin and head editor from the token. `assignmentRefusal` takes `(conn, { userId, book,
>    chapter })`. The chapter carries §6.6's `chapter-not-editable`, which is checked second, after `book-closed`.
> 3. **A deploy effect §7 omits.** The reads behind the book-access check also refuse a plain editor with no chapter
>    in chemistry: `GET /api/suggestions/:sectionId`, `GET /api/suggestions/:sectionId/stats` and
>    `GET /api/books/:book/chapters/:chapter/faithful-count`. This follows from §6.2.
> 4. **The E2E fixture book `__e2e-fixture__` is closed** like every book off the allowlist. Its non-admin writes move
>    to chemistry or to an admin login, and the slug is not added to the allowlist.
> 5. **"Append-only" (§6.4) is enforced in the schema** by a `BEFORE UPDATE` trigger.

**Sources:** the Skerfur plan's G1.13 row and its 2026-11-03 dated note
(`docs/plans/2026-10-23-skerfur-development-plan.md`); rulings R6 and the consent/licence condition
(`docs/decisions/2026-11-03-research-capture-consent-and-retention-rulings.md`); the G1.1 + G1.2 design's §5.14 and
§8 (`docs/superpowers/specs/2026-11-03-served-version-and-event-log-design.md`); the licence clause
(`docs/decisions/2026-10-28-d12-and-editor-licence-answers.md`); §C190 ③ and ⑦ in the register. The current state
(§3) was read from the code on `main` at `88285194a`.

## 1. What this is for

Chemistry's editors start in the December pilot. Before the first of them saves anything, the editing tool has to
let each editor write only where they should: in chemistry, and in their own chapters. The study needs the same
thing for a second reason: **an assignment row is what lets a unit open** (G1.1's opened predicate reads
`user_chapter_assignments`), and an opening starts that unit's research record. So who holds a chapter, and when
they got it, is study data, not only access control.

G1.13 does four things:

1. closes every book but chemistry to editor writes, in code (§C190 ⑦, which until now was a rule in prose);
2. makes chemistry's chapter enforcement permanent in code, so it cannot be switched off or fail open;
3. stops propagation from writing into chapters the editor does not hold;
4. makes assigning refuse unless the editor's consent decision and signed licence clause are recorded.

The assigning itself waits: no consent decision can be recorded until [USER] approves a G1.4 consent text, which
waits on the data protection officer. The guards ship first; the assigning is a runbook step after G1.4 (§8).

## 2. What [USER] decided (2026-11-22)

- **The assign gate is in code** (option (a)): assigning refuses unless the editor's consent decision and signed
  licence clause are recorded. The alternative, a runbook checklist, was rejected because nothing would stop an early
  assign, and an early assign opens units.
- **Closing books: an allowlist of writable books**, closed by default.
- **Chemistry's enforcement: a study book is always enforced, in code**, whatever the per-book toggle says.
- **Propagation: skip the targets the editor does not hold**, and show them as skipped.
- **The licence clause: its own table, `editor_licence_clauses`**, not a column on `users`.
- **The licence records are kept permanently** (retention class `keep`), never deleted: a record proves that an
  editor's edits were released under CC BY 4.0, and that licence does not expire while the text is published. The
  alternative, deleting them on 31 December 2030 with the consent records, was rejected because it would leave
  published edits with no record of their licence.

## 3. What the code does today (read at `88285194a`)

- **The enforcement switch** is a per-book row, `book_settings.enforce_assignments` (migration 035, default 0), read
  by `isAssignmentEnforced` and set from the assignments page by `POST /api/admin/assignments/:book/enforcement`
  (admin only). The read fails open: a missing table or column reads as off. Production: off for chemistry.
- **`hasChapterAccess`** (`server/services/userService.js`) allows a write, with enforcement off, when the users
  table is not ready, when the user id is null, when the assignment table is missing, and when the editor has **no
  rows for this book** (`if (!count || count.cnt === 0) return true;`). An editor with one row is limited to their
  rows. With enforcement on it is default-deny, and a missing table raises a 503.
- **The bypass lives in the middleware**, `requireBookAccess` (`server/middleware/requireRole.js`): admins pass, and
  so does a head editor of that book. **The chapter check is skipped when the route has no chapter.**
- **Writes that never reach `requireBookAccess`:** commenting on an edit (any editor, any book); the terminology
  routes (no book at all; §4 non-goals); pipeline status lock and unlock; a reviewer's submit-review; deleting one's
  own pending edit; revoking an acceptance.
- **Editors have no book scope.** The only book gate a plain editor meets is `VALID_BOOKS` (the active registered
  books, organic among them). **Organic is partly closed**: `NOT_MINTED_BOOKS` (`server/lib/servedText.js`) refuses
  save, accept and propagate for everyone, but `/done`, the figure routes and edit comments still accept organic
  writes. **The withheld books have no closure, and efni keeps no list of them** (the list that governs the reader
  site is vefur's `PUBLISHED_BOOKS`).
- **`heldBookWrites`** holds chemistry's pipeline, publish and figure-correction routes for non-admins. It does not
  hold segment saves, so today an unassigned editor can save a chemistry segment.
- **Propagation** (`POST /propagate`) checks the URL's chapter only, then `findOccurrences` scans every chapter of the
  book (appendices and ch00 included) and `createPropagatedEdits` writes a pending edit for each target. The preview
  (`GET /propagation-preview`) shares `classifyOccurrence` and has no book check.
- **The assignment model:** `user_chapter_assignments(id, user_id, book_slug, chapter, assigned_by, assigned_at)`,
  unique per (user, book, chapter); appendices are chapter `-1`. One assignee per chapter is enforced in
  `setChapterAssignee` (a transaction), not by the schema; `assignChapter` only adds. The assign routes check only
  that the user is active and at least an editor. **Migration 012's `chapter_assignments` table is read by nothing.**
- **The assignments page** lists chapters from the disk and **drops ch00** on purpose. ch00 holds one study unit
  (`m68662`), but `validateParams` refuses any chapter below 1 on every load, save, accept, done and propagate route,
  so no one can open it. The G1.7 design (§3, call 10) already records that `m68662` "is never opened and never
  minted". Propagation's `findOccurrences` still scans ch00, so today a head editor's propagation can write pending
  edits into a chapter nobody can open or apply.
- **`scripts/backfill-appendix-sections.js`** (dry run by default, `--db` writes, `--book` scopes) adds appendix
  `book_chapters`/`book_sections` rows. It writes no assignment rows; section-keyed routes (assigning a reviewer or
  localizer to an appendix section) need it.
- **Production, read-only on 2026-11-22:** 0 assignment rows in any book, 0 module openings.

## 4. Goals, non-goals, anti-goals

**Goals**
- A non-admin can write only in a book on the allowlist, on every write route, checked by a test that enumerates the
  routes so a route added later cannot escape silently.
- In a study book, chapter enforcement is on in code, default-deny, and fails closed.
- Propagation writes only into chapters the editor may write.
- No assignment row is created for an editor without a recorded consent decision (study books) and a recorded
  licence clause, nor for anyone who needs no row.

**Non-goals**
- **The terminology routes.** They write the shared concept model, not a book's text, and take no book. G1.17 owns
  their old-model controls.
- **Section assignments** (reviewer, localizer): unchanged, apart from the backfill running before appendix sections
  are assigned.
- **Migration 012's `chapter_assignments`:** left as it is (read by nothing).
- **Making ch00 editable or assignable.** The G1.7 design (§3, call 10) settles that `m68662` is never opened; making
  front matter editable is a separate feature, and it would change the study's population. ch00 stays off the
  assignments page.
- **Removing organic from `main` or the website:** §C190's other items.

**Anti-goals** (would make G1.13 a failure even if it worked)
- **A unit opening before its editor's consent decision is recorded.** That breaks the study's consent basis.
- **A guard that reads as closed and is open:** a route the allowlist never sees, a study book whose enforcement a
  missing table or a click turns off, or chapter 0 passing a truthiness test.
- **Locking out the people who run the project:** admins keep every route; the head editor of a book keeps the
  head-editor reach they have today in that book.

## 5. Approaches considered

| Decision | Chosen | Rejected, and why |
|---|---|---|
| The assign gate | **In code**: the assign routes refuse without the two records | A runbook checklist: nothing stops an early assign, and an early assign opens units |
| Closing books | **An allowlist**, `EDITOR_WRITABLE_BOOKS = ['efnafraedi-2e']`, closed by default | Extending `heldBookWrites` with a denylist: every new book would be open until someone listed it. Switching enforcement on everywhere, no code: routes without a chapter skip the check and head editors bypass it |
| Chemistry's enforcement | **Study books always enforced in code**, failing closed | Flipping the toggle on production with a runbook step: one click from off, and it fails open |
| Propagation into unheld chapters | **Skip those targets**, shown in the preview | Refusing the whole propagation: it blocks the common case of one phrase shared across chapters |
| The licence record | **A table**, `editor_licence_clauses` | A column on `users`: a hard-deleted user would take the proof with them, the reason `research_consent` has no foreign key |

## 6. Design

### 6.1 The writable-books allowlist

- **The value:** `server/lib/editorScope.js` exports `EDITOR_WRITABLE_BOOKS` (frozen, today `['efnafraedi-2e']`) and
  `isEditorWritableBook(book)`. It is an enforceable value (CLAUDE.md § One source of truth): changed together with
  its test, and a book is added only by a code change that names why its editing may open.
- **The guard:** a middleware, `refuseClosedBookForNonAdmins(bookOf, label)`, in `heldBookWrites`' style. A non-admin
  writing to a book not on the list gets **403 `BOOK_CLOSED`**, with an Icelandic message saying the book is not open
  for editing. Admins pass. It applies to head editors too: a head editor of a closed book cannot write there.
  `bookOf(req)` reads the book from the route (params or body), or, for a route that acts on a row (an edit, an
  acceptance, a section), from that row.
- **Where it goes:** every non-GET route that writes a book's data, the routes in §3's "never reach
  `requireBookAccess`" list included, except the terminology routes (§4).
- **The census test (the guard on the guard):** a test builds the app, walks the Express router stack and lists every
  non-GET route. Each must either carry the labelled middleware or appear in `server/lib/editorScopeExempt.js` with a
  reason (the terminology routes → G1.17; auth; the public feedback form; admin-only routes, which admins alone
  reach). A route in neither list fails the test by name. A planted unguarded route is the control.
- **Organic** stays refused to everyone, admins included, for save, accept and propagate (`NOT_MINTED_BOOKS`,
  unchanged). The allowlist adds the non-admin refusal on every other route.

### 6.2 A study book is always enforced

- **`isAssignmentEnforced(book)`** returns `true` for any book in `researchScope.STUDY_BOOKS`, without reading
  `book_settings`. For other books it reads the toggle as today.
- **`hasChapterAccess` for a study book has no fail-open branch:** users table not ready, a null user id, a missing
  assignment table, or no row for that chapter all refuse (a missing table keeps today's 503,
  `ASSIGNMENT_TABLE_UNAVAILABLE`). Chapter is compared as a number: `0` and `-1` are chapters.
- **The middleware's chapter-less path:** in a study book, a route that runs `requireBookAccess` and whose chapter
  cannot be determined is refused, not waved through. The census test (§6.1) also asserts that each segment-editor
  write route carrying `requireBookAccess` with a `:chapter` parameter (today `/edit`, `/suggestions/reject`, the two
  figure routes, `/accept`, `/done`, `/propagate`) resolves a chapter. The writes outside `requireBookAccess` get the
  book check only (§6.7).
- **The toggle:** `POST /api/admin/assignments/:book/enforcement` refuses to turn a study book off (409
  `STUDY_BOOK_ALWAYS_ENFORCED`), and the assignments page shows the switch on and locked for a study book, with the
  reason.
- **G-1d** (`server/scripts/read-research-preconditions.js`) reports the effective enforcement (the study-book rule),
  not only the stored row.
- The admin and head-editor bypass in `requireBookAccess` is unchanged.

### 6.3 Propagation checks each target

- **One helper,** `canWriteChapter({ providerId, book, chapter })` in `userService` (or beside it), reproduces the
  middleware's rule for a single chapter: admin → yes; head editor of the book → yes; otherwise `hasChapterAccess` on
  the editor's `users.id`, found with `findByProviderId` as the middleware does. It never tests the chapter by
  truthiness.
- **Apply** (`POST /propagate`): between `findOccurrences` and `createPropagatedEdits`, a target the editor may not
  write is dropped, and the response lists it with a new skip reason, `not-your-chapter`.
- **Preview** (`GET /propagation-preview`): the same helper, the same reason, so preview and apply stay in parity. The
  preview also gains the book check of §6.1's allowlist (a GET, so the census does not require it; the parity does).
- **Appendix targets** (chapter -1) are ordinary chapters.
- **ch00 targets are skipped for everyone**, head editor and admin included, with the reason `chapter-not-editable`:
  every route that would load, review or apply them refuses chapter 0 (§3), so an edit written there could never be
  seen or applied. This replaces today's behaviour, in which a head editor's propagation can write such edits.

### 6.4 The licence-clause record

**`editor_licence_clauses`** (`sessions.db`, a new migration):

| Column | Declared type | Meaning |
|---|---|---|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | |
| `user_id` | `INTEGER NOT NULL` | `users.id`, **no foreign key** (the record outlives the user, as `research_consent`'s does) |
| `signed_on` | `TEXT NOT NULL` | the date on the signed agreement, `YYYY-MM-DD` |
| `recorded_by` | `TEXT NOT NULL` | the recording admin's username, the value the assign routes write into `user_chapter_assignments.assigned_by` (`req.user.username`) |
| `recorded_at_ms` | `INTEGER NOT NULL` | when it was recorded |

- **Append-only.** The current state is "at least one row for the user". A row recorded in error is removed only by an
  admin, through a route that writes an `activity_log` entry naming the row's id and why; nothing edits a row.
- **Writing it: admins only.** `POST /api/admin/users/:id/licence-clause { signedOn }` under `requireAdmin()`, like
  every other `/api/admin/users/:id/*` route, from a field on the users admin page (`/admin`, admin-only), next to the
  user's chapters. The agreement is between the editor and the project, and the record belongs to a user, not a book,
  so no book's head editor records it. `signedOn` must be a real date, not in the future.
- **Reading it:** the users admin page shows "leyfisákvæði undirritað <date>" or its absence. The assignments page,
  which the head editor can open, shows the same status read-only beside each editor, so they can see why an editor
  cannot be assigned. The assign gate reads it (§6.5).
- **Retention: `keep`, never deleted** ([USER], 2026-11-22; §2). The table names people, so
  `server/lib/editorialRetentionScope.js` must classify it, or its test fails by name. **The entry lands in the same
  commit as the migration**: the scope test also requires every classified table and column to exist in the migrated
  schema, so the entry cannot go in before the table does. The entry, exactly:

  ```js
  editor_licence_clauses: {
    action: 'keep',
    person: [integer('user_id', null), text('recorded_by', null)],
    times: [],
  },
  ```

  Both person columns match the test's person-name pattern (`user`, `_by`); each helper follows its column's declared
  type, and a kept table's `timeCol` is `null`, both as the test requires. In the same commit,
  `editorialRetentionScope.test.js` moves from 34 tables to 35 and its `keep` list from `['users']` to
  `['editor_licence_clauses', 'users']`, and the module's header comment, which today says `keep` means `users`, names
  both tables.
- **No other retention code changes.** `server/lib/editorialRetention.js` picks the 2028 strip and delete tables by
  `action`, and the 2030 step names its two tables (`research_consent`, `research_capture_losses`) directly, so a kept
  table is skipped by construction. T8 proves it rather than trusting that reading.
- **One consequence, accepted:** the `activity_log` entry for an admin's removal of a row recorded in error is in a
  `delete` table, so it goes in 2028 while the kept rows stay. A removed row was never proof of a licence.

### 6.5 The assign gate

Every path that creates a `user_chapter_assignments` row (`assignChapter`, `setChapterAssignee`, and the routes over
them: `POST /api/admin/assignments/:book/:chapter` and `POST /api/admin/users/:id/chapters`) calls one function,
`assignmentRefusal({ userId, book })`, before it writes. It returns `null` or the first reason that applies, and the
route answers **409** with that reason:

1. **`book-closed`:** the book is not on the allowlist (§6.1).
2. **`bypass-role`:** the user is an admin, or a head editor of this book. They need no row (they bypass enforcement),
   and in a study book a row would open each unit on their first look (G1.1 + G1.2 design §8: rows only for a unit's
   editors, never its reviewers).
3. **`no-consent-decision`** (study books only): no `research_consent` row for the user. **Any decision counts,
   `consented` or `declined`**: an editor who declines the research may still edit; their work is just not captured
   (§5.14). Until [USER] approves a G1.4 text, no such row can exist, so no study-book assignment can be made.
4. **`no-licence-clause`:** no `editor_licence_clauses` row for the user.
5. **`suggestion-view-off`** (study books only): the book's `suggestion-view` switch is not on now
   (`server/lib/bookSwitches.js`, `currentSwitchValue`). This is R6 in code: units opened before the view is on lose
   their suggestions for good. It holds today (on since 2026-11-12); the check keeps it holding if the switch is ever
   turned off.

- The assignments page shows the reason in Icelandic beside the chapter, and lists which editors are assignable.
- Existing rows are untouched (production holds none). Removing an assignment is not gated.
- `setChapterAssignee`'s one-assignee rule is unchanged, and stays inside the same transaction as the gate's read.

### 6.6 ch00 stays off the assignments page

Unchanged. The admin routes accept chapter 0, so the gate (§6.5) also refuses a chapter-0 assignment in a study book,
with the reason `chapter-not-editable`, so that no route can create a row for a unit that can never open.

### 6.7 Writes outside `requireBookAccess`: the book check only

These get the allowlist guard (§6.1), with the book taken from the row they act on, and **no chapter check**:

- **commenting on an edit** (`POST /edit/:editId/comment`): it changes no text, and a discussion across chapters
  within chemistry stays possible;
- **deleting one's own pending edit** and **revoking an acceptance**: already limited to the owner (or the head
  editor and admins);
- **pipeline status lock and unlock:** a status flag, not text;
- **a section's submit-review:** done by the section's assigned reviewer, who may be a plain editor and never holds a
  chapter row (G1.1 + G1.2 design §8). A chapter check here would lock every reviewer out.

## 7. Effects of the deploy

- **Plain editors can no longer save in chemistry** until they hold a chapter, and they cannot be given one until G1.4
  is approved and their two records exist. The head editor and admins are unaffected. This matches the study's order
  (nothing opens before consent) and is expected; the pilot starts in December.
- **Organic and every withheld book close to non-admins**, head editors of those books included. Before the deploy,
  read production's `user_book_access` (read-only) and name any head editor of a closed book, so [USER] knows who
  loses write access.
- Nothing changes for readers, the pipeline or the publication tree.

## 8. After the deploy (runbook, not code)

1. The A4 §3 walk (the assignment-enforcement rows of `docs/plans/2026-06-10-qa-checklist.md`), on production, by
   hand where the checklist says so.
2. `scripts/backfill-appendix-sections.js --book efnafraedi-2e` dry run, then `--db`, before any appendix section is
   assigned to a reviewer or localizer.
3. Record each editor's licence clause as their agreement is signed.
4. When [USER] has approved a G1.4 text and an editor's consent decision is recorded, assign that editor's chapters,
   one assignee per chapter. Each assignment is a study event; R6 already holds (G1.23 has been on since 2026-11-12).
5. G-1d reads the effective enforcement for chemistry.

## 9. Proofs

| # | What | How it could be wrong without it |
|---|---|---|
| T1 | The census: every non-GET route carries the allowlist guard or is listed as exempt with a reason; a planted unguarded route fails by name | A route added later writes to a closed book |
| T2 | A non-admin (editor and head editor) gets 403 `BOOK_CLOSED` on a closed book on each kind of route (param book, body book, row-derived book); an admin passes; the allowlisted book passes | A guard that reads the book from the wrong place |
| T3 | A study book is enforced with the toggle at 0 and at 1; a non-study control book follows the toggle | The rule keyed on the toggle after all |
| T4 | For a study book: users table missing, null user id, missing assignment table and no row each refuse; chapter 0 and -1 are checked, not skipped | A fail-open branch left behind, or a truthiness test |
| T5 | The toggle route refuses to turn a study book off (409) | A click turns the study's guard off |
| T6 | Propagation: an editor holding ch2 propagating a phrase also in ch3, ch0 and -1 creates edits in ch2 only; the response and the preview list ch3 and -1 as `not-your-chapter` and ch0 as `chapter-not-editable`; the head editor's propagation reaches ch2, ch3 and -1 and also skips ch0 | Preview and apply disagree, the bypass is lost, or edits land where no one can open them |
| T7 | The assign gate: each refusal (`book-closed`, `bypass-role`, `no-consent-decision`, `no-licence-clause`, `suggestion-view-off`, and `chapter-not-editable` for chapter 0), through both assign routes and `setChapterAssignee`; success with a `declined` consent row plus a licence row; no row is written on refusal | A route that skips the gate, or a declined editor wrongly refused |
| T8 | `editor_licence_clauses`: the migration, the write route's validation (bad date, future date), the logged admin removal; `editorialRetentionScope.test.js` passes with the table classified `keep` (35 tables; `keep` = `editor_licence_clauses`, `users`); **a licence row dated before both retention dates comes through the 2028 step and the 2030 step unchanged, while the 2030 run deletes a `research_consent` row planted beside it** (the control: the run did run), in `editorialRetention.test.js` beside its "a users row is never changed" | An unclassified person table, or a licence record a retention step deletes or strips |
| T9 | The writes of §6.7 refuse a closed book for a non-admin and do not check the chapter: a section's reviewer with no chapter row can still submit-review in chemistry | A reviewer locked out by a chapter check |
| T10 | Recalibration: tests that pin enforcement-off behaviour (`assignmentEnforcement.test.js`, `crossBookAuthz.test.js`) keep testing it on a **non-study** fixture book, so the toggle logic stays covered; the E2E specs that have an editor save in chemistry plant that editor's assignment row directly in their throwaway database | A test silently deleted, or E2E red for a reason no one reads |

Every new test is run against the code with the behaviour broken before it is trusted (the register's rule for
regression tests). **Run the Playwright E2E job too** (`server/`'s `test:e2e`): `npm test` does not run it, and its
specs save into chemistry as editors.

## 10. Claude's calls, for [USER] to check

1. **Head editors of a closed book are closed too** (§6.1). Only admins pass the allowlist. If a head editor of
   physics, say, should keep write access there, say so.
2. **403 `BOOK_CLOSED`**, not the 423 `heldBookWrites` uses: a closed book is a scope rule, not a temporary hold.
3. **The gate refuses rows for admins and head editors** (`bypass-role`, §6.5), because those rows would only open
   units on a first look.
4. **The writes outside `requireBookAccess` get the book check only, not the chapter check** (§6.7): comments, an
   owner's delete or revoke, pipeline status, and a reviewer's submit-review.
5. **A licence row recorded in error is removed by an admin with a logged reason**, not edited (§6.4).
6. **The consent check is "any recorded decision"**, so a declining editor can be assigned (§6.5, from §5.14).
7. **The gate checks the licence clause in every writable book, and consent only in study books.** Today the two sets
   are the same book.
8. **The preview gains the allowlist check** for parity, though the census covers only non-GET routes (§6.3).
9. **Only admins record a licence clause** (§6.4); the head editor sees its status read-only on the assignments page.
10. **R6 is in the gate too** (`suggestion-view-off`, §6.5), for the same reason the gate is in code at all.
11. **Propagation skips ch00 for everyone** (`chapter-not-editable`, §6.3), and the gate refuses a chapter-0
    assignment in a study book (§6.6). ✏️ *An earlier draft of this conversation offered "ch00 becomes assignable";
    the builder check found that ch00 cannot be opened at all and that the G1.7 design already settles it, so that
    item is dropped.*
12. **`recorded_by` holds the recording admin's username (`TEXT`)**, the value the assign routes already write into
    `assigned_by`, rather than a `users.id` (§6.4). One convention for "who did it" across the assignment records.

## 11. Open for [USER]

Nothing. The one open question, the licence records' retention class, was answered on 2026-11-22: `keep` (§2, §6.4).

## 12. Left to the builder

The exact Icelandic messages; whether `canWriteChapter` lives in `userService` or its own module; how the census test
walks the router (the `heldBookWrites` label is the model); the migration number; the page layout of the licence
field; how the E2E fixtures plant assignment rows; whether the gate's consent read uses `userService`'s connection
or `researchConsent.js`'s (the research boundary test forbids only the `research-*` scripts from naming the table);
whether `not-your-chapter` skips go into the propagation research event (the G1.2 design already says the event
carries skipped targets); splitting the build into two PRs (guards §6.1–§6.3, §6.6–§6.7; then the licence record and
the gate §6.4–§6.5) or one.
