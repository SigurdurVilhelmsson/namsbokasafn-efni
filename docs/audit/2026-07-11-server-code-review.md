# Editorial-Server Code Review — Consolidated Findings

**Date:** 2026-07-11
**Scope:** `server/` in full — routes, services, middleware, lib, migrations, `public/js` (browser-side editor code), and views (server-rendered HTML pages).
**Method:** a 6-lens Fable-5 fan-out (find → dedup → 3-skeptic refute-by-default → synth), followed by an independent second-pass verification that re-read every surviving finding against the current source and defaulted to refuting it unless the evidence still held up on direct inspection.

The six lenses were:

1. **authz** — cross-book and role-based access control (can a user act outside what they're supposed to be allowed to touch?)
2. **integrity** — data and transaction correctness (can a write leave the database or the files it manages in a contradictory state?)
3. **state** — concurrency and shared mutable state (can two requests, or a reload, interact badly?)
4. **failloud** — silent failure versus logged/surfaced failure (does an error get hidden from the person who needs to know?)
5. **contract** — agreement between client and server, or between a view and the route that feeds it (does the data the server sends match what the page or script expects?)
6. **deadcode** — unused, undeclared, or stale code and configuration

**Coverage statement:** every server-side layer was in scope — `routes/`, `services/`, `middleware/`, `lib/`, `migrations/`, `public/js/`, and `views/`. Findings that survived triage landed in `routes/`, `services/`, `public/js/`, and `views/`; `middleware/` and `lib/` were reviewed throughout as the mechanisms several findings depend on (the role/book-scoping middleware in `requireRole.js`, the shared pino logger in `lib/logger.js`), and `migrations/` were reviewed as the schema several findings reference (migration 034's `localization_pending_edits`, migration 012's `chapter_assignments`) — but no defect in a `middleware/`, `lib/`, or `migrations/` file itself survived triage as a standalone finding.

**Model-mix note:** the fan-out (workflow `wf_e36b62fa-875`) ran 145 agents; one agent tripped Fable-5's built-in safety classifier on biology-adjacent content and silently fell back to Opus 4.8 (billed as a cache read), so this was effectively a pure-Fable run. The second-pass verification (workflow `wf_4dfc7ccf-791`) ran 42 agents with zero fallbacks. Both runs were read-only code review — neither left any uncommitted changes in the repository.

Before the 41 findings below were assembled, the fan-out's own 3-skeptic adversarial process had already discarded 3 candidate findings outright (a claim about a missing lock acquisition in `localizationReviewService`, a claim about a silently-swallowed config refresh, and a claim about a dead-code spawn failure — each refuted 2–3 times independently) and folded 2 more into other rows (one two-site appendix-labeling issue merged into a single finding; one cross-book import-authz issue recognized as a duplicate of an already-tracked audit item and moved straight to the cross-referenced list). Those are not re-litigated here; they are noted for completeness.

---

## Headline verdict

Two findings are genuinely high-severity and should ship first: **any head-editor can currently mutate or publish another book's content** through the pipeline routes and the section-approval routes, because those two route files never adopted the book-scoping guard the rest of the codebase already uses. A third route with the same missing guard (file uploads) is medium-severity for the same underlying reason. These three, plus one already-tracked sibling, form a single natural batch — see "Batch A" below.

Everything else in this report is either a narrower concurrency/integrity edge case reachable only under specific timing, or a client-server contract mismatch that breaks a dashboard widget, badge, or status field without touching content correctness. None of the remaining 34 findings involve a security boundary.

---

## Verified-findings summary

The fan-out produced 41 ranked findings. Second-pass verification re-examined each one independently against current source:

- **KEEP** (rating unchanged): 31
- **DOWNGRADE** (severity and/or confidence reduced, and in several cases an overstated claim removed from the finding itself): 6
- **DROP** (the finding's core claim did not hold up — refuted, not a defect): 4

31 + 6 = **37 findings reported below**; the 4 dropped findings are listed with their refutations in "Refuted on second-pass verification."

**By adjusted severity (37 reported):**

| Severity | Count | Confidence breakdown |
|---|---|---|
| High | 2 | 2 CONFIRMED |
| Medium | 12 | 12 CONFIRMED |
| Low | 23 | 22 CONFIRMED, 1 PLAUSIBLE |

**By lens (37 reported, against the lens's original total before drops):**

| Lens | Reported | What changed |
|---|---|---|
| authz | 3 of 3 | all kept as originally rated |
| integrity | 6 of 7 | 1 finding dropped; 1 downgraded high→medium, 2 downgraded medium→low |
| state | 5 of 5 | all kept as originally rated |
| failloud | 3 of 6 | 3 findings dropped, 1 downgraded medium→low/PLAUSIBLE — this lens shrank the most under verification |
| contract | 15 of 15 | all kept at their original severity; 2 had an overstated detail trimmed |
| deadcode | 5 of 5 | all kept as originally rated |

The **failloud** lens (silent-failure claims) fared worst under adversarial re-verification: half of its six original findings turned out to already log the failure via the project's pino logger, which the verification rubric treats as disqualifying for a "silent swallow" claim. This is a reassuring result, not a troubling one — it means the project's fail-loud discipline is more consistently applied than the raw fan-out initially credited it for.

---

## Ranked findings

Re-ranked after applying the second-pass verdicts: High → Medium → Low, and within a severity tier, CONFIRMED before PLAUSIBLE. "Orig #" is the finding's rank in the original 41-item fan-out output, kept for traceability back to the raw findings log.

| # | Orig # | File:line | Severity | Confidence | Lens | Summary |
|---|---|---|---|---|---|---|
| 1 | 1 | `server/routes/pipeline.js:29` | High | CONFIRMED | authz | Pipeline inject/render/run endpoints are gated only by a global head-editor role check; any head-editor can mutate or publish any book's content |
| 2 | 2 | `server/routes/sections.js:627` | High | CONFIRMED | authz | Section approve-review/assign/request-changes/status actions use a global role check with no book ownership check — cross-book head-editor actions succeed |
| 3 | 3 | `server/services/localizationReviewService.js:212` | Medium (↓ was High) | CONFIRMED | integrity | Localization approve-and-apply records "approved" before writing the file; a write failure strands that edit in an unrecoverable status |
| 4 | 4 | `server/routes/sections.js:156` | Medium | CONFIRMED | authz | Section file-upload requires only the base editor role, no book scope — any editor can write into any book's human-verified directories |
| 5 | 5 | `server/services/pipelineService.js:439` | Medium | CONFIRMED | state | Pipeline job-tracking never records which book a job belongs to; two books sharing a chapter number falsely block each other |
| 6 | 6 | `server/routes/segment-editor.js:1111` | Medium | CONFIRMED | state | "Vista + Birta" applies edits before checking whether a render is already running; a conflict leaves edits applied but unrendered with no clean retry |
| 7 | 7 | `server/services/localizationReviewService.js:92` | Medium | CONFIRMED | state | A second editor's localization submission silently overwrites a first editor's still-pending submission for the same segment, no conflict warning |
| 8 | 8 | `server/public/js/saveRetry.js:178` | Medium | CONFIRMED | state | A successful save never cancels an earlier failed save's retry queue entry; the stale version can replay over the newer one |
| 9 | 14 | `server/services/terminologyService.js:1438` | Medium | CONFIRMED | deadcode | The terminology import feature depends on the `glob` package, which is not a declared dependency anywhere — it only resolves by accident today |
| 10 | 15 | `server/public/js/localization-editor.js:1622` | Medium | CONFIRMED | contract | The localization review tab calls an API endpoint that does not exist; its section picker can never populate |
| 11 | 16 | `server/views/status.html:643` | Medium | CONFIRMED | contract | The pipeline progress page reads stage-completion data in a shape the API doesn't send; every stage badge shows "incomplete" permanently |
| 12 | 17 | `server/views/books.html:2092` | Medium | CONFIRMED | contract | The chapter activity panel reads field names that don't match what the activity API actually returns; every row shows blank/generic placeholders |
| 13 | 18 | `server/routes/segment-editor.js:99` | Medium | CONFIRMED | contract | Term-lookup autocomplete reads the wrong query parameter name for the current book, so book-specific term ranking silently never activates |
| 14 | 19 | `server/routes/pipeline.js:83` | Medium | CONFIRMED | contract | The pipeline's "are you sure?" confirmation step has no corresponding button or handler in the browser — the user just sees a bare error |
| 15 | 9 | `server/services/segmentEditorService.js:697` | Low (↓ was Medium) | CONFIRMED | integrity | "Latest approved edit wins" logic can pick either of two same-second approvals unpredictably, permanently discarding the one not picked |
| 16 | 10 | `server/services/contentVersionService.js:223` | Low (↓ was Medium) | CONFIRMED | integrity | Restoring an earlier version writes the correct file but never refreshes the search/reuse indexes built from it, which briefly serve stale text |
| 17 | 21 | `server/services/segmentParser.js:500` + `server/services/concordanceService.js:155` | Low | CONFIRMED | integrity | Appendix chapters are addressed by two incompatible labels internally; appendix modules are undercounted and excluded from search indexing |
| 18 | 22 | `server/services/segmentEditorService.js:1090` | Low | CONFIRMED | integrity | A progress-counting formula double-counts already-applied segments, so half-reviewed modules can report as fully reviewed |
| 19 | 23 | `server/services/contentVersionService.js:68` | Low | CONFIRMED | integrity | Version snapshots silently skip empty segments, breaking the "restore is fully reversible" guarantee for untranslated content |
| 20 | 24 | `server/services/feedbackService.js:127` | Low | CONFIRMED | state | This service opens the production database the moment it's loaded rather than on first real use — a test-isolation hazard |
| 21 | 25 | `server/routes/segment-editor.js:431` | Low | CONFIRMED | failloud | Several audit-log writes (approve/reject/unapprove) fail silently with no logging, unlike the identical pattern done correctly nearby |
| 22 | 26 | `server/routes/admin.js:397` | Low | CONFIRMED | failloud | The admin book list hides real progress-calculation failures behind fabricated zero values, indistinguishable from a genuinely unstarted book |
| 23 | 28 | `server/routes/pipeline.js:43` | Low | CONFIRMED | contract | The pipeline panel rejects the appendices "chapter" that the segment editor itself offers as a valid option |
| 24 | 29 | `server/public/js/saveRetry.js:209` | Low | CONFIRMED | contract | An edit-conflict error message drops the human-readable Icelandic explanation, showing the raw word "conflict" instead |
| 25 | 30 | `server/routes/my-work.js:260` | Low | CONFIRMED | contract | Overdue-task data is sent in a shape the personal dashboard can't read, so overdue styling and the overdue alert can never appear |
| 26 | 31 | `server/views/my-work.html:1655` | Low | CONFIRMED | contract | Personal activity timestamps read the wrong field name and always render blank |
| 27 | 32 | `server/views/status.html:702` | Low | CONFIRMED | contract | The chapter timeline reads a field name the API doesn't send; every timeline row shows "Invalid Date" |
| 28 | 33 | `server/routes/status.js:120` | Low | CONFIRMED | contract | The dashboard's "overdue" statistic is declared but never actually calculated — permanently shows zero |
| 29 | 34 | `server/views/my-work.html:1254` | Low | CONFIRMED | contract | A "blocked issues" banner reads data the API never sends and links to a retired page — fully dead UI |
| 30 | 35 | `server/views/my-work.html:1435` | Low | CONFIRMED | contract | A missing label field would render the literal word "undefined" as a badge — currently dormant because nothing writes to the underlying table |
| 31 | 36 | `server/views/my-work.html:1896` | Low | CONFIRMED | contract | An icon-display condition is backwards, so the activity icon the server sends is never actually shown |
| 32 | 37 | `server/public/js/segment-editor.js:1879` | Low | CONFIRMED | contract | Several editor-facing Icelandic messages bypass the shared strings file that exists specifically to prevent this |
| 33 | 38 | `server/services/notifications.js:373` | Low | CONFIRMED | deadcode | Four assignment-notification functions have had zero callers since the related feature was removed months ago |
| 34 | 39 | `server/services/analyticsService.js:290` | Low | CONFIRMED | deadcode | A server-side page-view tracking middleware is fully built but never turned on |
| 35 | 40 | `server/.env.example:29` | Low | CONFIRMED | deadcode | Four environment variables are documented as live configuration but have no code reading them anywhere |
| 36 | 41 | `server/data/decisions.json:1` | Low | CONFIRMED | deadcode | Two stale placeholder files are still committed and read (and discarded) at every server boot |
| 37 | 12 | `server/routes/status.js:75` | Low (↓ was Medium) | PLAUSIBLE (↓ was CONFIRMED) | failloud | A status-lookup failure falls back to a cached file with no log line — a minor observability gap, not the "invisible stale data" defect first claimed |

---

## Finding details

Ordered most-severe first, matching the table above. Each entry gives the exact code, the concrete way it breaks in practice, the fix, and — where the second pass changed anything — what specifically was confirmed or walked back.

### 1. `server/routes/pipeline.js:29` — Any head-editor can mutate or publish another book's content

**Severity/confidence:** High, CONFIRMED · **Lens:** authz

```js
router.use(requireAuth, requireRole(ROLES.HEAD_EDITOR));   // role level only, never checks req.user.books
```

The book name comes from the request body a few lines later and is checked only against the global list of valid book slugs — never against which books the logged-in head-editor is actually assigned to.

**Failure scenario:** A head-editor who is only assigned to `efnafraedi-2e` (chemistry) can send a request to `/api/pipeline/render` naming `liffraedi-2e` (biology) as the book, and the server will regenerate biology's published HTML — content that then syncs out to readers. Even the built-in "are you sure?" confirmation step can be skipped by sending `confirmed: true` up front. Nothing downstream in `pipelineService` checks book ownership either, so there is no second line of defense.

**Fix:** Remove the blanket role-only gate and replace it with the book-scoped guard the codebase already has for exactly this situation (`requireHeadEditorFor`, which checks the request's book against the user's assigned books) — either by validating the body's book field first, or by moving the book into the URL itself as a route parameter.

**Second-pass verification:** Confirmed by reading the routing chain directly. `requireRole` genuinely has no concept of per-book assignment; the book-scoped alternative (`requireHeadEditor` / `requireHeadEditorFor`) lives in the same middleware file and is already used by the publication and segment-editor routes, so this is a known, working pattern that `pipeline.js` simply never adopted — not a gap that needs new code invented to close it. Rating unchanged.

---

### 2. `server/routes/sections.js:627` — Cross-book section actions allowed for any head-editor

**Severity/confidence:** High, CONFIRMED · **Lens:** authz

```js
router.post('/:sectionId/approve-review', requireAuth, requireRole(ROLES.HEAD_EDITOR), loadSection, ...)
// the same pattern repeats at assign-reviewer (:296), assign-localizer (:378), and request-changes (:698);
// the status route's elevated branch (:506-514) is a bare role check too
```

**Failure scenario:** A head-editor for one book can approve a review, assign a reviewer or localizer, or request changes on a section that belongs to a completely different book, simply by knowing (or guessing) its numeric section ID. The route does load the section first, and that lookup does carry the section's owning book — but nothing ever compares that book against the acting head-editor's own assignments.

**Fix:** Replace the plain role check on these routes with the same book-scoped guard used elsewhere, resolving the book from the loaded section rather than from a URL parameter (since the URL only carries a section ID here); extend the same ownership check to the status route's elevated branch.

**Second-pass verification:** Confirmed directly — the book-scoped guard functions are never imported into this file at all (a repository-wide search turns up zero references), and no existing test exercises book-scoping on any of these four routes. Rating unchanged.

---

### 3. `server/services/localizationReviewService.js:212` — Localization approval commits before the file write succeeds

**Severity/confidence:** Medium (downgraded from High), CONFIRMED · **Lens:** integrity

```js
// step 1 (commits immediately): UPDATE localization_pending_edits SET status = 'approved' ...   (:212-219)
// step 2: segmentParser.loadModuleForLocalization(...)  ← throws if the faithful file is missing (:222)
// applied_at is only set at :240-242, after the save succeeds
```

**Failure scenario:** This function is not wrapped in a database transaction, so its two steps aren't atomic. It first marks the pending edit as `approved`, and only afterward tries to build and write the actual localized file. If that second step throws — realistically, because the underlying faithful-translation file it needs is missing, the same class of problem that has happened for real on module m68700 — the edit is left in a state that says "approved" but was never actually written anywhere. Because both the approve and the reject functions only operate on edits still marked "pending," this specific stranded edit can't be approved again or rejected through the ordinary review screens.

**Fix:** Reorder the two steps so the file is written first and the status is only marked "approved" (in the same transaction) once the write succeeds; or roll the status back to "pending" in a catch block if the write fails; or make the approve action retryable for edits already marked "approved" but not yet applied.

**Second-pass verification:** Downgraded from High to Medium. The original write-up said the edit was stranded with "no recovery path," which overstates it on two counts confirmed by direct inspection: first, the failure is not silent — the head-editor sees an explicit error response immediately, not a false success; second, the actual translated *content* is not lost, because a fresh submission for the same segment creates a new pending edit (the submit function only checks for existing "pending" rows, so it doesn't notice the stuck "approved" one), and approving that fresh submission applies cleanly. What remains true, and is the real defect here, is narrower: the original stranded database row itself stays permanently un-actionable through the API until someone edits the database directly. That's a genuine integrity bug, just a smaller one than first described.

---

### 4. `server/routes/sections.js:156` — Unscoped file upload into human-verified content directories

**Severity/confidence:** Medium, CONFIRMED · **Lens:** authz

```js
router.post('/:sectionId/upload/:uploadType', requireAuth, requireRole(ROLES.EDITOR), loadSection, ..., upload.single('file'))
// the upload destination is derived from the section's book and chapter, with no ownership or assignment check
```

**Failure scenario:** An editor whose assignment is limited to chemistry could send a file upload targeting a biology section, and the server will write it straight into that book's `03-faithful-translation/` or `04-localized-content/` directories — the human-verified content this project treats as its most protected asset — and change that section's workflow status, all without the per-book assignment check that the segment editor's own save paths enforce. On the narrower side, the server names the uploaded file in a way that can't collide with the pipeline's own per-module files, so this can't silently overwrite existing translated segments; the realistic damage is a cross-book overwrite of the section's own tracked upload, a stray write into a directory that should never receive uploads at all (including the read-only machine-translation output directory), and an unscoped status change. This route also looks like it may be a leftover from an earlier manual-upload workflow with no current button in the editor pointing at it.

**Fix:** Add a book-ownership check right after the section is loaded — admin, head-editor of that specific book, or an editor formally assigned to that chapter — or confirm the route is legacy and retire it outright.

**Second-pass verification:** Confirmed — none of the book-scoping helper functions are imported into this file, and the multer upload destination is built entirely from the loaded section's book with no comparison to the acting user's assignments anywhere in the chain. Rating unchanged.

---

### 5. `server/services/pipelineService.js:439` — Pipeline job tracking doesn't know which book a job belongs to

**Severity/confidence:** Medium, CONFIRMED · **Lens:** state

```js
// job objects carry { id, type, chapter, moduleId, track, userId } — no book field anywhere
if (job.chapter === chapter && job.type === type && job.status === 'running')   // the entire "is a job running" check
```

**Failure scenario:** Because a running job is identified purely by chapter number and job type, a pipeline running for chemistry chapter 3 will make a request for biology chapter 3 come back with a false "already running" response — carrying chemistry's job ID, not an error about biology at all. Downstream, this also makes the publish function throw incorrectly across books, makes the publication-status display show the wrong book's job, and makes an unrelated admin listing serialize source-file fetches globally instead of per book. Today this is invisible because only one book (chemistry) has active pipeline jobs; it becomes a real, frequent problem the moment biology chapters start running through the same pipeline machinery alongside chemistry's.

**Fix:** Add a `book` field to the job object, extend the "is a job running" check to take the book into account, and update the half-dozen call sites that currently only pass chapter and type.

**Second-pass verification:** Confirmed directly — every call site checked passes only chapter and type even in places where the book is already known and validated two lines earlier. The job registry itself is a single shared in-memory list with no per-book separation. Rating unchanged.

---

### 6. `server/routes/segment-editor.js:1111` — "Vista + Birta" applies edits before checking whether a render is already in progress

**Severity/confidence:** Medium, CONFIRMED · **Lens:** state

```js
const applyResult = segmentEditor.applyApprovedEdits(...);          // :1111 — files are written, applied_at is set
const existing = pipelineService.hasRunningJob(req.chapterNum, 'pipeline');
if (existing) return res.status(409).json({ error: 'Pipeline already running…', applied: applyResult });  // :1118-1125
```

**Failure scenario:** If a head-editor clicks "Vista + Birta" (Save + Publish) while any pipeline job for that chapter number is already running — including, per finding 5 above, a job belonging to a *different* book that happens to share the chapter number — the approved edits get written to the faithful-translation file successfully, but no render is launched to actually publish them. The browser only sees the 409 "already running" response and reports total failure, discarding the fact that the edits actually did save. A retry then fails a second, different way: because there's nothing left to apply, the server responds with "all approved edits have already been applied." The published HTML silently falls behind the approved translation until someone notices and manually triggers a render. Elsewhere in the same codebase (the publish route), the check-then-write order is done correctly, so this isn't a universal pattern — just a spot where it was missed.

**Fix:** Check for a running job *before* applying the edits, not after; or, if a job is already running, still return success with a flag indicating the edits were saved but a render was skipped, so the interface can tell the user the truth.

**Second-pass verification:** Confirmed — this exact scenario is realistic for a small team of concurrent editors (roughly five editors, with render jobs that can run close to a minute), and no existing test covers the apply-then-render sequence. Worth noting for anyone cross-checking against the project's list of already-known issues: this file and line also come up in a separate, already-tracked note about a deferred dashboard-redesign feature — that earlier note explicitly says it should *not* be used to wave off apply-path correctness bugs like this one, so this is confirmed as a genuinely new, separate finding rather than a duplicate. Rating unchanged.

---

### 7. `server/services/localizationReviewService.js:92` — A second editor's submission silently destroys the first editor's pending work

**Severity/confidence:** Medium, CONFIRMED · **Lens:** state

```sql
SELECT id FROM localization_pending_edits WHERE book=? AND module_id=? AND segment_id=? AND status='pending'  -- no editor_id check
UPDATE ... SET edited_content=?, category=?, original_content=?, editor_id=?, editor_username=?, created_at=CURRENT_TIMESTAMP WHERE id=?
```

**Failure scenario:** When a book has the localization review tier switched on, and two different editors both work on the same segment before either submission is approved, the second editor's save overwrites the first editor's pending edit in place — replacing its content, its author, and its timestamp, with no warning and no record kept of what was lost. The usual conflict check that would normally catch this (comparing file modification times) can't help here, because review-tier submissions only ever touch the database, not the file itself — so there is no file-timestamp change for the check to notice. The equivalent Pass-1 (linguistic review) workflow already protects against exactly this by scoping pending edits per editor and returning a conflict error; this review tier has no equivalent.

**Fix:** Scope the "is there already a pending edit" lookup by the submitting editor's ID (matching how Pass 1 already does it), or return a conflict response when the existing pending edit belongs to someone else; at minimum, log the overwritten content before it's replaced.

**Second-pass verification:** Confirmed — the existing automated test for this function only covers the same editor resubmitting their own edit, and no database constraint prevents the cross-editor overwrite. Rating unchanged.

---

### 8. `server/public/js/saveRetry.js:178` — A successful save doesn't cancel an earlier failed save still queued for retry

**Severity/confidence:** Medium, CONFIRMED · **Lens:** state

```js
if (response.ok) { return response.json(); }   // no removeFromQueue(key) call, no timer cancellation
```

**Failure scenario:** When a save fails transiently (for example, a brief server error), the editor's browser queues it in local storage and schedules a retry. If the editor then makes a newer edit and it saves successfully right away, that success path never removes the earlier failed save from the queue or cancels its pending retry timer. Later — sometimes because the old retry timer simply fires anyway, sometimes because the page reloads and the queue is replayed automatically, which can happen up to an hour after the original failure — the *older*, already-superseded content gets sent to the server and silently overwrites the newer save. The server-side conflict check that would normally catch a competing write doesn't apply here, because both saves came from the same editor.

**Fix:** When a save succeeds, remove any queued retry entry for that same segment and cancel its timer; consider stamping queue entries with a sequence number so an old one is discarded automatically if a newer save for the same segment has already succeeded.

**Second-pass verification:** Confirmed by tracing every call site of the queue-removal function — it's only ever invoked from the retry-handling code path, never from the plain success path. Rating unchanged.

---

### 9. `server/services/terminologyService.js:1438` — Terminology import depends on an undeclared package

**Severity/confidence:** Medium, CONFIRMED · **Lens:** deadcode (label is slightly misleading — see note below)

```js
const glob = require('glob');   // :1438 — not listed in server/package.json or its lockfile at all
```

**Failure scenario:** This line only works today because another, unrelated dependency happens to pull in the `glob` package as one of its own indirect dependencies, and because a locally-installed copy in `server/node_modules` happens to still be present. Neither of those is a promise — if the unrelated dependency ever stops needing `glob`, or if `server/node_modules` is rebuilt from a clean install (which is exactly what happens in testing, linting, and deployment), this line will fail outright. When it does, any head-editor using the "import from key terms" feature with a chapter number specified gets a server error.

**Fix:** Either declare `glob` as a proper dependency in `server/package.json`, or — more simply — replace this call with the equivalent file-scanning helper the codebase already has and uses for a very similar case elsewhere in the same file.

**Second-pass verification:** Confirmed, with one correction to the finding's own label: it's filed under "deadcode," but the function that uses this line is not dead at all — it's reachable from a live, working API route. If anything that makes this more urgent than a typical dead-code finding, since it's a live feature resting on an accidental dependency rather than an unused code path that can simply be deleted. Rating unchanged.

---

### 10. `server/public/js/localization-editor.js:1622` — The review tab calls an API endpoint that doesn't exist

**Severity/confidence:** Medium, CONFIRMED · **Lens:** contract

```js
fetchJson('/api/sections/' + bookSlug + '/' + chapterNum)   // the sections API only ever defines GET /:sectionId
```

**Failure scenario:** The URL this code builds has book and chapter in it, but the server-side sections routes only recognize a single numeric section ID at that position — there's no route that matches a book-and-chapter shape at all. Every request here returns a "not found" response, and the client's error handling quietly replaces the section dropdown with a single "Error" placeholder. This breaks the entire picker-driven review flow: loading a section, seeing suggestions, viewing the sync log — none of it can be reached this way. The only way into this screen at all is a direct link that already specifies a section ID and skips the picker entirely.

**Fix:** Either add a server route that looks up a section by book and chapter (the data needed for this already exists in the section-registration table), or change the client to call an endpoint that already exists and returns the right data.

**Second-pass verification:** Confirmed end to end — the two-part URL genuinely matches nothing in the router, and no test in the project's suite exercises this call shape. Rating unchanged.

---

### 11. `server/views/status.html:643` — Pipeline stage badges read the wrong data shape and never show "done"

**Severity/confidence:** Medium, CONFIRMED · **Lens:** contract

```js
var stages = (data.status && data.status.stages) || data.status || {};   // the API response has no top-level "status" key at all
```

**Failure scenario:** The actual API response puts the list of pipeline stages directly at the top level, as an array — not nested under a `status` key, and not as an object keyed by stage name the way this code expects. Because of how the fallback chain is written, this collapses to an empty object every time, so every stage badge (extraction, translation, review, and so on) and both publication badges show as incomplete no matter what has actually happened in the pipeline. Tellingly, a different page in the same codebase (`books.html`) already handles this exact same API response correctly, with a comment noting that the API returns an array — this fix was simply never carried over to this page.

**Fix:** Read the array directly from its actual top-level field, and look up each stage by name the same way the other page already does.

**Second-pass verification:** Confirmed by reading the route handler's actual response shape directly. Rating unchanged; this is cosmetic (no data is at risk) but the entire feature is currently non-functional.

---

### 12. `server/views/books.html:2092` — The chapter activity panel reads field names the API doesn't send

**Severity/confidence:** Medium, CONFIRMED · **Lens:** contract

```js
getActivityIcon(a.action) … escapeHtml(a.userName || 'Kerfi') … escapeHtml(a.details) … formatTimeAgo(a.timestamp)
// the API actually sends: type / username / description / createdAt — and the "chapter" filter is never applied server-side
```

**Failure scenario:** Every one of the four fields this panel reads has the wrong name, so instead of showing what actually happened, every row falls back to a generic icon, the placeholder name "Kerfi" (System), blank description text, and a blank time — all because the code has defensive null-checks that prevent a crash but don't fix the underlying mismatch. Separately, even though the panel is meant to show activity for one specific chapter, the chapter filter it sends is never actually applied on the server side, so — once the field names are fixed — it would still show activity for the whole book rather than just the chapter in view. The identical bug is duplicated word-for-word in a second place in the same file.

**Fix:** Correct the field names read on the client side (both places this pattern appears), and either wire up server-side chapter filtering (the underlying lookup function that supports it already exists) or remove the chapter parameter if it's not meant to do anything.

**Second-pass verification:** Confirmed directly by comparing the client's field reads against the server's actual response shape. This panel is reachable by head-editors and admins; plain editors don't have access to the activity feature at all, so they never see the broken rendering. Rating unchanged.

---

### 13. `server/routes/segment-editor.js:99` — Term-lookup autocomplete never applies book-specific ranking

**Severity/confidence:** Medium, CONFIRMED · **Lens:** contract

```js
const { q, bookId } = req.query;                       // the client actually sends "bookSlug" — bookId is always undefined
terminology.lookupTerm(q, bookId ? parseInt(bookId, 10) : null);  // and the underlying function expects a book SLUG (text), not a number
```

**Failure scenario:** The editor's autocomplete sends the current book as `bookSlug`, but the server reads a field called `bookId` that the client never actually sends — so it's always empty, and the book parameter passed onward is always nothing at all. Even if the client did send `bookId`, it would get converted into a number where the underlying lookup expects a text slug, so it still wouldn't work. The practical effect is that the ranking logic which is supposed to prioritize terms belonging to the book someone is actually working in never runs — editors on a biology book get suggestions with no biology-specific priority, silently, with no error anywhere. A sibling endpoint elsewhere in the codebase gets this right, proving the correct approach already exists; the editor's own autocomplete client just doesn't use it.

**Fix:** Read the field the client is actually sending (`bookSlug`) and pass it straight through unchanged.

**Second-pass verification:** Confirmed by tracing the client call, the route handler, and the underlying lookup function together — all three layers checked directly. Rating unchanged.

---

### 14. `server/routes/pipeline.js:83` — The pipeline's confirmation step has no corresponding UI

**Severity/confidence:** Medium, CONFIRMED · **Lens:** contract

```js
return res.status(409).json({ requiresConfirmation: true, warning: '…' });  // no "error" or "message" field at all
// the client's generic error handler falls back to: data.error || data.message || 'Villa: HTTP 409' — both are absent here
```

**Failure scenario:** When a head-editor tries to inject, render, or run a chapter before it's actually reached the required prior stage, the server is designed to ask for confirmation — sending back a flag and a warning message meant to be shown to the user, with an expectation that the client will re-send the same request with an explicit "yes, I confirmed" flag. But the client never implements that half of the handshake: nothing in the browser code checks for the confirmation flag or knows how to resend with it. Because the 409 response doesn't include the generic error-message fields the client's fallback logic looks for, the user just sees the bare, unhelpful text "Villa: HTTP 409" — the actual warning message is thrown away, and there's no way to proceed. A different part of the admin interface implements this same pattern correctly, showing it was built once as a feature, just never connected to this particular button.

**Fix:** Add the missing confirm-and-retry logic to the pipeline panel's button handler — show the warning text in a confirmation dialog and resend with the confirmation flag if the user agrees; or, at minimum, add the generic error fields to the response so the warning text at least reaches the screen.

**Second-pass verification:** Confirmed end to end, including a repository-wide search confirming there is no confirmation-handling code anywhere in the client for this specific flow. Rating unchanged.

---

### 15. `server/services/segmentEditorService.js:697` — Same-second approvals can unpredictably discard the newer edit

**Severity/confidence:** Low (downgraded from Medium), CONFIRMED · **Lens:** integrity

```sql
ORDER BY reviewed_at DESC   -- no tie-break by ID; reviewed_at only has one-second precision
```

**Failure scenario:** When an already-approved edit for a segment gets revised again ("edit again"), it's possible for both the original approved edit and the new revision to be sitting in the database as approved-but-not-yet-applied at the same time. If a head-editor approves both within the same one-second window, the database has no defined order between them — whichever one the "latest wins" logic happens to pick first gets applied, and the other is permanently marked as superseded, with no way to bring it back once that has happened. Notably, the separate preview feature that shows editors what content currently looks like already breaks these ties consistently by edit ID, so it's possible for the live preview and what actually gets published to disagree about which version "won."

**Fix:** Add a secondary sort by edit ID to both of the places this ordering query appears, so ties resolve consistently and predictably instead of arbitrarily.

**Second-pass verification:** Downgraded from Medium to Low. This is real and was confirmed by tracing the approval and apply logic directly, but the trigger is narrower than "any two approvals" — it specifically requires two *different* editors' approved-and-unapplied edits for the *same segment*, approved within the same one-second window (a same-editor re-edit is already filtered out separately). And the actual harm is nondeterminism about *which* legitimate, reviewer-approved edit wins — not silent loss of unreviewed content. Both edits are real approved work either way; the bug is just that the outcome isn't reproducible.

---

### 16. `server/services/contentVersionService.js:223` — Restoring an old version doesn't refresh the search/reuse caches built from the text it replaces

**Severity/confidence:** Low (downgraded from Medium), CONFIRMED · **Lens:** integrity

```js
const savedPath = segmentParser.saveModuleSegments(book, chapter, moduleId, restoredSegments);  // :223 — followed only by an activity-log entry
```

**Failure scenario:** When a head-editor rolls a module back to an earlier saved version — for example, because a later version's translations turned out to be wrong — the file on disk is correctly rewritten to the older content. But the concordance search index and the translation-memory export, both of which are supposed to be rebuilt from that file every time it changes, are only ever refreshed by the normal *apply* path, not by *restore*. So immediately after a restore, searching for repeated text or reusing prior translations can still surface the newer, just-discarded text, until something else happens to trigger a reindex of that module.

**Fix:** Have the restore function call the same reindexing steps the normal apply path already calls, right after it writes the file.

**Second-pass verification:** Downgraded from Medium to Low. The original write-up implied the withdrawn translation would keep "serving" indefinitely through search and the translation-memory export; on closer inspection, what actually goes stale is strictly the *derived* search and reuse caches — the faithful-translation file itself, which is both the citable asset and the real source of truth, is written correctly by the restore. Only translation-memory *suggestions* can briefly reference withdrawn text, not published content, and the staleness typically clears itself the next time anyone applies any edit to that same module, since that re-triggers the same reindexing restore currently skips.

---

### 17. `server/services/segmentParser.js:500` + `server/services/concordanceService.js:155` — Appendix chapters are addressed by two incompatible internal labels

**Severity/confidence:** Low, CONFIRMED · **Lens:** integrity *(merged finding — one root cause, two call sites)*

```js
// segmentParser.js: the internal chapter-to-directory helper maps only the NUMBER -1 to the appendices folder
// the segment-count function is called with the TEXT "appendices" instead, which the helper doesn't recognize,
// producing a nonexistent folder path and a count of zero
// concordanceService.js's search-index backfill has the identical mismatch
```

**Failure scenario:** There are two different ways this codebase refers to "the appendices" internally — sometimes the number `-1`, sometimes the text `"appendices"` — and the low-level function that turns a chapter reference into an actual folder path only understands the number. Two real callers pass the text version instead, with two separate consequences. First, every dashboard and progress display that counts segments in the appendices reports zero, permanently, for every appendix module — since both callers require a positive count before they'll mark anything "complete," appendix chapters can never show as reviewed no matter how much work is actually done on them. Second, the search-index backfill hits the identical dead-end path, so no appendix content has ever been added to the concordance search index or translation memory, even though the backfill process itself reports success. On top of that, the normal per-edit indexing path stores the chapter label one way while the backfill stores it the other way, so even a partial fix wouldn't fully reconcile the two.

**Fix:** Teach both the segment-counting function and the concordance backfill to recognize the text label the same way the low-level folder-path helper already recognizes the number; and standardize on one label internally so future code doesn't reintroduce the same split.

**Second-pass verification:** Confirmed — this was checked directly against real appendix files on disk for the chemistry book, where the miscount is live and observable today. The concordance-indexing half is currently dormant only because no book has appendix translations checked in yet; it will become live the moment the first one is.

---

### 18. `server/services/segmentEditorService.js:1090` — A progress formula double-counts already-applied work

**Severity/confidence:** Low, CONFIRMED · **Lens:** integrity

```js
const approvedRecords = (modEdits.approved || 0) + (modEdits.applied || 0);
// but "applied" edits are, by definition, a SUBSET of "approved" edits — applying a segment doesn't change its status,
// it only stamps a separate "applied at" timestamp on an edit that is still counted as "approved"
```

**Failure scenario:** Because "applied" segments are already included inside the "approved" count, adding the two together counts every applied segment twice. A module with ten segments, where five have been approved and applied and the other five are still awaiting review, computes five plus five — ten — which meets or exceeds the total segment count and reports the module as fully reviewed, when only half of it actually has been looked at. The identical formula appears in a second place that drives a similarly visible "complete" indicator. A separate, correctly-written version of this same calculation exists elsewhere in the codebase, confirming the intended logic was always meant to avoid double-counting.

**Fix:** Use the approved count on its own (it already includes applied edits) rather than adding the two together; fix the second location with the same bug.

**Second-pass verification:** Confirmed by reading the underlying SQL definitions of both counts directly — "applied" is unambiguously a strict subset of "approved." Rating unchanged; this affects only reported completion percentages, not actual content.

---

### 19. `server/services/contentVersionService.js:68` — Version snapshots silently skip empty (untranslated) segments

**Severity/confidence:** Low, CONFIRMED · **Lens:** integrity

```js
if (seg.content) { insert.run(...) }   // an empty string is "falsy" in JavaScript, so empty segments are never snapshotted at all
```

**Failure scenario:** An untranslated segment routinely has empty content, which is entirely normal. But the safety-snapshot function that runs automatically before a restore skips any segment with empty content, on the theory that there's nothing to record. If a head-editor restores a module to an older version where a now-empty segment used to have real text, the "current state" snapshot taken just before that restore has no record of that segment at all — so if the editor later tries to undo the restore, the undo logic finds nothing to restore that segment *to*, and it simply keeps whatever the restore just wrote instead of returning it to empty. This quietly breaks the promise that a restore can always be undone. A related edge case: a module where every segment happens to be empty can produce a version record with no rows in it at all, which later throws a confusing "version not found" error if anyone tries to use it.

**Fix:** Record empty segments in the snapshot as explicit empty entries rather than skipping them, or keep a separate manifest per version that distinguishes "this segment was empty" from "this segment wasn't recorded."

**Second-pass verification:** Confirmed — empty-content edits are deliberately allowed and common elsewhere in the same service, so this is a routine, reachable situation rather than a hypothetical one. Rating unchanged.

---

### 20. `server/services/feedbackService.js:127` — This service opens the production database at load time, not on first use

**Severity/confidence:** Low, CONFIRMED · **Lens:** state

```js
let db = initDb();                        // runs the moment this file is loaded — opens/creates the real database file immediately
let statements = initStatements(db);
```

**Failure scenario:** Most services in this codebase open their database connection lazily, only when first actually needed, specifically so that tests can redirect them to a throwaway test database beforehand. This service instead opens (and, if necessary, creates tables in) the real production database the instant it's loaded into memory — before any test-setup code gets a chance to redirect it. The service's own test suite runs into exactly this problem today. Because the database file location is captured once at load time, setting the environment variable that's supposed to control it afterward has no effect. This is the same category of bug that a past incident (documented elsewhere in the project) already caused and had to be fixed once, in a different file.

**Fix:** Convert this service to the same "open the database only when first needed" pattern already used by the other services in this codebase, keeping the existing test-database override hook.

**Second-pass verification:** Confirmed directly. This is a genuinely new instance of the pattern, distinct from an already-known example of the same bug class in a different service (`analyticsService`, tracked separately) — this file was not previously flagged. Rating unchanged.

---

### 21. `server/routes/segment-editor.js:431` — Several audit-log writes fail completely silently

**Severity/confidence:** Low, CONFIRMED · **Lens:** failloud

```js
} catch { /* fire-and-forget */ }   // repeats at several more call sites in this file and in localization-editor's route file
// a sibling block in the SAME file does it correctly:
// catch (logErr) { log.error({err: logErr}, 'Activity log failed'); }
```

**Failure scenario:** Writing an audit-trail entry — the record of who approved, rejected, or reversed a piece of work — can fail (a full disk, a database hiccup), just like any other database write. At several places in this code, including the approve, reject, and unapprove actions specifically, that failure is caught and thrown away with no log message at all. The action itself still succeeds and returns success to the browser; only the audit trail entry silently never gets written. Since the project relies on this audit trail for its "four eyes" accountability model, gaps like this are invisible until someone specifically goes looking for a record that should exist and doesn't. The same two files already contain the correct version of this exact pattern a few lines away, which is strong evidence this is an oversight rather than an intentional choice.

**Fix:** Replace each of these silent catch blocks with the logging version already used correctly nearby in the same files.

**Second-pass verification:** Confirmed, with a minor count correction: of the roughly eleven similar-looking catch blocks originally cited, six are genuinely silent; the other five turned out to be nested inside an outer error handler that does log the failure. The corrected count is smaller but the core defect — real silent catches exist on real audit-sensitive actions — stands.

---

### 22. `server/routes/admin.js:397` — The admin book list hides real failures behind fabricated zeros

**Severity/confidence:** Low, CONFIRMED · **Lens:** failloud

```js
catch { book.editorialProgress = { percent: 0, approvedSegments: 0, totalSegments: 0 }; }   // no log line at all
```

**Failure scenario:** The function that computes a book's editorial progress already has a legitimate, non-error way of reporting "nothing started yet" — an empty book with no folders simply returns zero without throwing anything. So this catch block only ever fires on a genuine problem: a database error, or a filesystem permissions issue. And when it does, the output it produces is byte-for-byte identical to the legitimate "nothing started" case, with nothing logged anywhere to distinguish the two. An administrator scanning the book list has no way to tell "this book's pipeline is broken" apart from "nobody has touched this book yet." A different catch block just a few lines away in the same route does log its errors correctly, confirming this omission is a gap rather than a deliberate choice.

**Fix:** Log the actual error, and represent the value as explicitly unavailable rather than as a fabricated zero, so a broken pipeline is visually distinguishable from an untouched book.

**Second-pass verification:** Confirmed directly by reading the surrounding code and the sibling catch block that does this correctly. Rating unchanged.

---

### 23. `server/routes/pipeline.js:43` — The pipeline panel rejects the appendices "chapter" that the editor itself offers

**Severity/confidence:** Low, CONFIRMED · **Lens:** contract

```js
if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > MAX_CHAPTERS)   // rejects -1, the internal code for "appendices"
```

**Failure scenario:** The segment editor treats "Viðaukar" (Appendices) as a legitimate selectable chapter, internally numbered -1, and the shared validation logic used almost everywhere else in the server correctly special-cases that value. But the pipeline route has its own separate, inline validation that was never given the same exception — so a head-editor who selects the appendices and clicks Inject, Render, or Run gets a flat "invalid chapter number" error, even though the equivalent apply-and-render action elsewhere in the same editor screen accepts the appendices without complaint. There's a second, deeper issue lurking underneath: even where -1 is accepted elsewhere, it gets passed to the underlying command-line tool as the literal text "-1", and that tool's own formatting logic only recognizes the *word* "appendices" — so fixing just the validation here wouldn't be the whole fix.

**Fix:** Add the same appendices exception to this route's own validation that the shared validation logic already has; while doing so, verify the appendices chapter is formatted the same way everywhere downstream (this shares its root cause with finding 17 above).

**Second-pass verification:** Confirmed by tracing both code paths (the accepting one and the rejecting one) side by side. Rating unchanged.

---

### 24. `server/public/js/saveRetry.js:209` — A conflict error drops its own explanation text

**Severity/confidence:** Low, CONFIRMED · **Lens:** contract

```js
new Error(data.error || 'Villa ' + response.status)   // the 409 response is actually {error: 'conflict', message: <Icelandic explanation>}
```

**Failure scenario:** When two editors' saves genuinely conflict, the server sends back both a short machine-readable code (`"conflict"`) and a full, human-readable Icelandic explanation. This code only reads the short code, so the resulting error object's message ends up being the bare word `"conflict"` — and because that's a non-empty string, the editor's own hardcoded Icelandic fallback message never gets a chance to display either, since the code checks "do we have a message" before falling back to it. The end result is that the user sees the literal English word "conflict" with no context. A different, correctly-written utility elsewhere in the same codebase checks both fields in the right order.

**Fix:** Check the explanation field first, falling back to the short code only if the explanation is missing.

**Second-pass verification:** Confirmed end to end, from the server's response shape through to what the user actually sees on screen. Rating unchanged.

---

### 25. `server/routes/my-work.js:260` — Overdue-task data can never actually trigger the overdue UI

**Severity/confidence:** Low, CONFIRMED · **Lens:** contract

**Failure scenario:** The personal dashboard's page code expects due-date information as a small structured object (with a status, a day count, and a formatted string) and expects a specific "how many things are overdue" count in the quick-stats section. The server instead sends the due date as a plain text string, and never includes the overdue count field at all. As a result, the visual styling meant to highlight overdue tasks, and the "X tasks are overdue" alert banner, can never appear — even though the server already does the date comparison needed to sort overdue tasks to the top of the list, so the underlying data exists, it's just not shaped the way the page expects.

**Fix:** Send the due-date information as the structured object the page already expects, and add the missing overdue count, reusing the comparison the server already performs for sorting.

**Second-pass verification:** Confirmed directly against both the server response and the page's rendering code. Rating unchanged.

---

### 26. `server/views/my-work.html:1655` — Personal activity timestamps always render blank

**Severity/confidence:** Low, CONFIRMED · **Lens:** contract

**Failure scenario:** The personal activity feed's timestamp field on the page reads a snake_case field name, but the activity data the server actually sends uses the camelCase version of that same field — there is no snake_case field in the response at all. Because the time-formatting function's own safety check treats a missing value as "just show nothing," every entry in this list shows a blank timestamp instead of erroring.

**Fix:** Read the field name the server actually sends.

**Second-pass verification:** Downgraded (severity stays Low, but the finding's scope shrank). The original write-up also claimed the activity icons next to each entry render incorrectly for the same reason; that additional claim was checked directly and found to be false — the icon-related field name does match between server and page, so icons display correctly. That claim has been removed from this report rather than carried forward with a footnote; only the confirmed timestamp defect remains.

---

### 27. `server/views/status.html:702` — Every timeline entry shows "Invalid Date"

**Severity/confidence:** Low, CONFIRMED · **Lens:** contract

**Failure scenario:** The chapter timeline reads a date from one of two possible field names, neither of which the server's response actually contains (the server only sends the camelCase version of the field, under neither of the names the page checks). Attempting to parse a date from nothing produces the literal text "Invalid Date," which is exactly what renders as the timestamp prefix on every single row of the timeline. The server actually does send a pre-formatted, ready-to-display "time ago" string alongside the raw data — the page just never uses it.

**Fix:** Read the field name the server actually sends, or simply use the pre-formatted display string the server already provides instead of trying to parse a date on the client at all.

**Second-pass verification:** Confirmed directly against the server's response shape. This is purely cosmetic — the description text on each row still renders correctly, only the timestamp is affected.

---

### 28. `server/routes/status.js:120` — The "overdue" dashboard statistic is declared but never calculated

**Severity/confidence:** Low, CONFIRMED · **Lens:** contract

**Failure scenario:** The dashboard's data-building code sets an "overdue count" value to zero as a starting point, and then never updates it anywhere else in the same function — nor does it ever produce the accompanying list of overdue items the display is built to show. The live personal-dashboard page reads this value directly for its "Tímafrestur" (deadline) statistic, which as a result permanently displays zero regardless of how many assignments actually have passed their due date. This is a recurrence of a pattern from an earlier audit finding, whose fix wired up two sibling statistics on the same dashboard but left this one half-finished.

**Fix:** Actually compute the overdue count from the assignment data the function already has loaded, comparing due dates against the current time; or, if the feature isn't worth finishing, remove the stat from the page so it stops silently showing a number that's always wrong.

**Second-pass verification:** Confirmed by reading the full dashboard-building function and finding no code path that ever increments this value. Rating unchanged.

---

### 29. `server/views/my-work.html:1254` — A "blocked issues" banner is fully dead code

**Severity/confidence:** Low, CONFIRMED · **Lens:** contract

**Failure scenario:** This banner is designed to display when there are flagged issues needing attention, reading a field from the personal-dashboard API that the API never actually sends (a similarly-named but differently-shaped field exists on an entirely different endpoint, for a different purpose). Because the field it reads is always empty, the banner can never appear — even in situations where it genuinely should. Its link, if it ever did appear, would point to a page that has since been retired and now just redirects back to the home page.

**Fix:** Either remove this banner and its supporting code entirely, or connect it to the data source that actually has the relevant information, with a working link.

**Second-pass verification:** Confirmed by checking both halves directly — the field really is never sent, and the link target really is retired. Rating unchanged; low severity because the failure mode is "a helpful banner never shows up," not an incorrect result.

---

### 30. `server/views/my-work.html:1435` — A missing label would render as the literal word "undefined" — currently dormant

**Severity/confidence:** Low, CONFIRMED · **Lens:** contract

**Failure scenario:** For an assignment-type task with no due date, this code builds a badge using a label field the server never actually sends (it sends a different, related field instead) — so if this code path ran, the badge would display the literal text "undefined." The page even has a lookup table defined nearby that would supply the correct label, but this particular spot never uses it.

**Fix:** Use the existing label lookup table here (or have the server send the label directly); alternatively, this entire branch could be removed along with the rest of the dead assignment-task feature it belongs to.

**Second-pass verification:** Downgraded with a reachability caveat added (severity stays Low). The database table this specific task type reads from currently has no code anywhere that writes to it — the live "assign a chapter" feature writes to a different, unrelated table. So today, this code path cannot actually be triggered by anything the system produces; only a leftover or manually-inserted database row could reach it. This is reported as a confirmed-but-currently-dormant bug: real, and worth fixing while touching this code, but not something happening in production right now. It would immediately become live again if the underlying assignment-task feature is ever revived.

---

### 31. `server/views/my-work.html:1896` — An icon-display condition is backwards

**Severity/confidence:** Low, CONFIRMED · **Lens:** contract

```js
(activity.icon ? '' : '●')   // shows NOTHING when the server sent a real icon, and the bullet only when it didn't — which never happens
```

**Failure scenario:** The server's icon-lookup function always returns *something* — it has a fallback emoji for any activity type it doesn't specifically recognize — so `activity.icon` is always a real value by the time this code runs. But the condition here is written backwards: it shows the icon only when there *isn't* one, and shows nothing at all when there is one. In practice this means the icon column in the admin activity feed is always blank. The line directly above this one has a related, smaller issue — it puts a CSS class name where the code expects an actual color value.

**Fix:** Swap the two branches of the condition; fix the color-value issue on the adjacent line at the same time.

**Second-pass verification:** Confirmed by reading the icon-generation function on the server and the display condition on the page together. Purely cosmetic.

---

### 32. `server/public/js/segment-editor.js:1879` — Several editor messages bypass the shared Icelandic-text file

**Severity/confidence:** Low, CONFIRMED · **Lens:** contract

**Failure scenario:** This codebase keeps a single shared file specifically so that all the Icelandic text shown to editors lives in one place and can be updated consistently. Several messages in the main editor script don't follow that rule: the "file is missing, can be rebuilt" status message (sitting right between two other branches that do it correctly), the preview-loading and preview-ready badges (written in a way that a simple text search for the Icelandic wording would miss), the conflict-error fallback text, and the entire version-history dialog's wording are all hardcoded directly in the script instead. Because the project's existing test for the shared text file only checks that keys it *does* reference actually exist — not that all displayed text comes from the file — a future wording update could easily update the shared file while missing these spots, and nothing would catch the inconsistency.

**Fix:** Move each of these hardcoded strings into the shared text file, in the appropriate section.

**Second-pass verification:** Confirmed — all four categories were checked directly in the live script. No functional impact; this is a maintainability and consistency issue, and it's representative of a broader pattern of similar hardcoded strings elsewhere in the same file rather than an exhaustive list.

---

### 33. `server/services/notifications.js:373` — Four notification functions have had no callers for months

**Severity/confidence:** Low, CONFIRMED · **Lens:** deadcode

**Failure scenario:** Four functions that build assignment-handoff and chapter-kickoff notifications, along with three associated type constants, have had zero callers anywhere in the codebase since the assignment-workflow feature they supported was removed in an earlier cleanup. They remain exported, which makes it look — to anyone reading this file — like a working handoff-notification feature exists, when it doesn't. This amounts to roughly 150 lines describing functionality that's fully disconnected from the rest of the system.

**Fix:** Remove the four functions, their exports, and the associated constants — unless old notification records in the database still need one of those type values to display correctly, in which case keep just the constants.

**Second-pass verification:** Confirmed by a repository-wide search for every function name, turning up no callers outside this file itself. Minor correction: there are actually four orphaned type constants, not three as originally counted — this makes the finding slightly larger, not smaller.

---

### 34. `server/services/analyticsService.js:290` — A page-view tracking feature is fully built but never turned on

**Severity/confidence:** Low, CONFIRMED · **Lens:** deadcode

**Failure scenario:** This service exports a piece of middleware, plus several logging helper functions it alone calls, that are meant to record server-side page views and events. None of it is ever actually wired into the server — it's exported but never activated anywhere. The only thing that actually writes analytics data today is a completely separate path: the reader-facing site making its own direct API call. Anyone reading this file's own description of itself, or interpreting the admin statistics dashboard's numbers, could reasonably but incorrectly assume server-side page views are being tracked, when they aren't.

**Fix:** Either activate the middleware if server-side tracking is actually wanted, or remove it along with its now-unreachable helper functions, keeping the parts that are genuinely used.

**Second-pass verification:** Confirmed by a repository-wide search — the middleware is never activated anywhere, and the helper functions it alone calls have no other callers either. This is a distinct issue from an already-known, separately-tracked problem in this same file (that file also opens its database connection too eagerly, a different bug in the same service) — not a duplicate of that other note.

---

### 35. `server/.env.example:29` — Four documented environment variables are entirely unused

**Severity/confidence:** Low, CONFIRMED · **Lens:** deadcode

**Failure scenario:** The example environment file lists several variables as if they're live configuration — three related to a GitHub pull-request sync feature that was removed in an earlier cleanup, and two related to a translation-memory tool that has since been replaced by an in-house alternative. None of the five has a single line of code anywhere in the project actually reading it. Because the standard setup instructions tell a new developer to copy this file directly to create their own configuration, every fresh setup gets seeded with configuration that looks meaningful but does nothing — a plausible source of wasted troubleshooting time down the line. One nearby variable looks similar but is genuinely still read by a real script and must be kept.

**Fix:** Remove the genuinely dead variables from the example file; keep and fix the misleading comment on the one that's still live; consider documenting a handful of variables that actually are read today but currently aren't listed at all.

**Second-pass verification:** Confirmed by searching the entire codebase for any code reading each of these variable names — none were found for the four flagged as dead. Rating unchanged.

---

### 36. `server/data/decisions.json:1` — Two stale placeholder files are still committed and processed at every boot

**Severity/confidence:** Low, CONFIRMED · **Lens:** deadcode

**Failure scenario:** A small file containing nothing but an empty list is still checked into the repository, and the server's own data-loading code reads and parses it every time the server starts (and, less obviously, on some routine requests too) — only to immediately discard it, because it doesn't have the field the loader is looking for. The project's own consistency-checking script has to explicitly skip this specific filename by name, which is itself a sign that it's known clutter rather than something with a purpose. A second stale file — an empty, zero-byte database placeholder with a name similar to the real database file — sits nearby and could plausibly confuse someone into thinking it's the actual database, a specific kind of confusion this project has already had to clean up once before in a different context.

**Fix:** Remove both files (after confirming the production server doesn't depend on either one being present), remove the now-unnecessary special-case exclusions in the consistency-checking script, and correct a stale reference to the placeholder database file still present in the architecture documentation.

**Second-pass verification:** Confirmed by reading both the data-loading code and the consistency-checking script's exclusion list directly. Rating unchanged.

---

### 37. `server/routes/status.js:75` — A status-lookup failure falls back to a cached file with no log line

**Severity/confidence:** Low (downgraded from Medium), PLAUSIBLE (downgraded from CONFIRMED) · **Lens:** failloud

```js
} catch {  // falls back to reading status.json directly from disk — nothing is logged in this specific catch block
  return JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
```

**Failure scenario:** If the function that looks up a chapter's pipeline status from the database ever throws — which it currently has no internal handling for — this code silently falls back to a cached copy on disk instead of surfacing the error. Six different places in the server rely on this function, so a persistent underlying problem would make all of them quietly serve the cached copy indefinitely, with no log entry marking that anything went wrong.

**Fix:** Add a single log line inside this catch block noting the database read failed and that a cached fallback is being used — both to close the observability gap and to match the logging style already used by the related "write" path in the same service.

**Second-pass verification:** Downgraded from Medium/CONFIRMED to Low/PLAUSIBLE, and the framing substantially softened. The original claim was that a persistent fault would "serve stale status indefinitely, invisibly" — direct inspection shows neither half of that holds up well. First, the cached file is not neglected legacy data: a separate part of the same service actively rewrites it from the database every time a pipeline stage changes, so the fallback is serving a recently-synced, correct value, not something stale. Second, a genuinely persistent database problem does not stay invisible at the system level even though this one catch block doesn't log it — it would surface loudly through the server's health-check endpoint, through a nearby dashboard route in the same file that does log its own errors, and through every write operation elsewhere in the server, which would start failing outright. What remains is real but modest: this one specific read-only endpoint degrades quietly instead of logging when it does, which is worth the one-line fix but is a minor observability gap rather than the more serious "silently serving indefinitely stale data" defect originally described.

---

## Suggested remediation batches

Grouping the 37 survivors by what a single focused pull request could plausibly fix together.

### Batch A — Book-scoped authorization sweep (ship first, ship alone)

**Findings 1, 2, 4** — `server/routes/pipeline.js:29`, `server/routes/sections.js:627`, `server/routes/sections.js:156`.

This is the headline of the whole report. The project already built and tested the right tool for this exact problem — the `requireHeadEditor` / `requireHeadEditorFor` middleware, confirmed working and covered by tests as part of an earlier hardening effort (the project's own QA checklist lists book-scoped 403 enforcement as a verified-present protection). What these three route files have in common is simply that they were never updated to use it: `pipeline.js` gates its entire router on a global role check, and `sections.js` does the same on its four most consequential mutating routes and its upload route. This is not a design gap that needs new machinery invented — it's an adoption gap in three specific files, which makes it both high-impact and cheap to fix correctly.

A fourth, already-known instance of the identical pattern belongs in this same batch: chapter markdown-import (`server/routes/books.js:509`) requires only the base editor role with no book scope, letting any editor write into any book's machine-translation-input directory. This one isn't part of the 37 findings above because it was already caught and documented in a prior security audit (tracked there as **SA-11**) — it's listed here only as a rider so the same middleware pass picks it up in the same PR, and it should **not** be re-reported as new.

**Recommendation:** one pull request, one shared regression-test suite covering "head-editor/editor of book A cannot act on book B" across all four route files (three findings plus the SA-11 rider). Highest blast radius of anything in this report — ship it before anything else.

### Batch B — Apply and version-history integrity

**Findings 3, 15, 16, 19** — `localizationReviewService.js:212`, `segmentEditorService.js:697`, `contentVersionService.js:223`, `contentVersionService.js:68`.

All four sit on the write-order and snapshot logic around approving, applying, and restoring content. Two related findings that were part of this batch in the original fan-out (a claimed transaction-ordering bug in the main apply path, and a claimed silent-snapshot-failure bug) were refuted on second-pass verification and dropped — see below — which meaningfully shrinks this batch's scope and confirms the core apply path is more solid than first suspected. What's left is real but narrower: reorder localization's approve-then-apply sequence (finding 3), add an ID tie-break to same-second approval ordering (finding 15), have restore trigger the same reindexing apply already does (finding 16), and stop skipping empty segments in version snapshots (finding 19). One design pass — guard-then-write ordering, deterministic tie-breaks, snapshot-then-reindex consistently — covers all four.

### Batch C — Pipeline job model and confirmation-handshake parity

**Findings 5, 6, 14** — `pipelineService.js:439`, `segment-editor.js:1111`, `pipeline.js:83`.

One data-model change — giving a pipeline job a `book` field — directly fixes finding 5 and removes the cross-book false-positive that makes finding 6 worse than it would otherwise be (though finding 6's apply-before-guard ordering is a separate defect that needs its own fix regardless). Finding 14's missing confirmation-dialog handler rides the same route file and the same test harness, so it's efficient to land in the same pass even though it's a distinct client-side gap.

### Batch D — Editor save-path concurrency ("second writer wins silently")

**Findings 7, 8, 24** — `localizationReviewService.js:92`, `saveRetry.js:178`, `saveRetry.js:209`.

Three different symptoms of the same underlying story: a second write can silently clobber a first one (the localization pending-edit overwrite), a stale write can silently replay over a fresher one (the save-retry queue), and even when a genuine conflict *is* caught correctly, the person hitting it doesn't get told why (the dropped conflict message). Worth treating as one "lost update" campaign with one shared test approach across both the server and the client.

### Batch E — Fail-loud sweep (smaller than it first appeared)

**Findings 20, 21, 22, 37** — `feedbackService.js:127`, `segment-editor.js:431`, `admin.js:397`, `status.js:75`.

This batch shrank considerably under second-pass verification: two of its original six candidate findings (the publication-status fallback and the chapter-import response) turned out to already log their failures correctly via the project's standard logger and were dropped entirely, and the highest-remaining item (the status-lookup fallback) was downgraded to a low-severity, unconfirmed-impact observability nit. What's left is a legitimate but modest batch: swap several bare `catch {}` blocks for the logging version already used correctly nearby in the same files, and stop fabricating zero values on real failures in the admin book list. Mechanical, low-risk, one grep-driven checklist.

### Batch F — Dashboard and view contract repair

**Findings 10, 11, 12, 13, 18, 25, 26, 27, 28, 29, 30, 31** — the largest batch, spanning `localization-editor.js`, `status.html` (twice), `books.html`, `segment-editor.js`, `segmentEditorService.js`, `my-work.js`, and `my-work.html` (five separate spots).

All twelve are field-name or data-shape mismatches between what a route sends and what a page or script reads — plus the progress double-counting bug (finding 18) that feeds directly into some of the same displays. None of these touch translated content or security; they're dashboard widgets, badges, and status indicators quietly showing wrong or blank information. Best fixed together against a short written "this is what each endpoint actually returns" reference, specifically so the same kind of drift doesn't recur — and worth a single pass clicking through the progress page, the book list, and the personal dashboard afterward to confirm each fix visually.

### Batch G — Appendices chapter handling

**Findings 17, 23** — `segmentParser.js:500` / `concordanceService.js:155`, `pipeline.js:43`.

One root cause (the codebase's two incompatible internal labels for "the appendices") surfaces in three places: segment counting, search indexing, and pipeline-action validation. Worth normalizing to a single label once, now, while the appendix content corpus is still small — this only gets more annoying to unwind later.

### Batch H — Dependency and dead-code hygiene

**Findings 9, 32, 33, 34, 35, 36** — `terminologyService.js:1438`, `segment-editor.js:1879`, `notifications.js:373`, `analyticsService.js:290`, `.env.example:29`, `decisions.json:1`.

Finding 9 (the undeclared `glob` dependency) is the one item here with real breakage risk — it belongs first, on its own if needed, since it can fail a clean install at any time. The rest is pure deletion-and-documentation cleanup with no behavior change: dead notification functions, an unactivated tracking middleware, dead environment variables, stale placeholder files, and a batch of hardcoded strings that belong in the shared text file. Cheap to land as one PR, meaningful readability payoff for future maintenance.

---

## Refuted on second-pass verification

These four findings were part of the original 41 but did not survive independent re-verification against the current source. They are recorded here, with their original rating and the specific reason each one was refuted, so the "silent failure" pattern the project is otherwise right to watch for isn't over-applied to code that already handles it correctly.

### `server/services/publicationService.js:247` — originally rated Medium, CONFIRMED (failloud)

**Original claim:** that a refused pipeline-stage transition gets mistaken for a "database unavailable" condition, and the fallback then writes `complete: true` into the on-disk status file — turning a legitimate refusal into a recorded false success.

**Why it doesn't hold up:** the catch block in question is not silent — it logs the failure at error level through the project's standard logger before doing anything else, complete with the underlying error and which publication stage was affected. More importantly, the fallback that writes `complete: true` only ever runs when the actual render job has already finished successfully on disk — so the "false success" the finding worried about is, in the cases that can actually reach this code, a real success being correctly recorded through a secondary path, not a masked refusal. At most this leaves a minor, already-logged inconsistency between the database and the status file, not the silent-failure defect originally claimed.

### `server/routes/books.js:590` — originally rated Medium, CONFIRMED (failloud)

**Original claim:** that a chapter import can report success even when registering the imported files in the database fails, leaving files that exist on disk invisible to every database-backed listing.

**Why it doesn't hold up:** this catch block also logs the failure at error level with the full error object — not silent. The impact claim was also overstated: the imported files are already safely on disk by this point, and most of the places that would show them to a user read directly from disk rather than from the database, so only two specific database-backed helper functions are actually affected. Reporting success reflects that the part of the operation that matters most — getting the files safely onto disk — genuinely did succeed, and the database registration step is safely retryable.

### `server/services/segmentEditorService.js:755` — originally rated Medium, PLAUSIBLE (integrity)

**Original claim:** that the faithful-translation file gets overwritten inside a database transaction, and that a failure partway through could leave the database rolled back while bad or corrupted content stays on disk.

**Why it doesn't hold up:** the actual file-write function this concern is about never writes partial or corrupt content — it always keeps a timestamped backup of the previous content and writes the new content atomically (to a temporary file, then renamed into place), so there's no window where a half-written file can exist. The only failures that can happen after a successful write are verification checks that specifically fire when the write already failed (empty or missing output) — and because those failures also roll back a marker that gets checked again the next time anything tries to apply edits to that module, the affected edits simply get retried automatically rather than lost. The one theoretical failure that could follow a fully successful write is extremely difficult to trigger in practice, and even then would leave the database in a consistent state with the prior content still safely recoverable from the backup file.

### `server/services/segmentEditorService.js:750` — originally rated Low, CONFIRMED (failloud)

**Original claim:** that a failure while taking a pre-apply safety snapshot gets swallowed silently, with the success response giving the user no indication that the usual rollback safety net wasn't actually created for that particular save.

**Why it doesn't hold up:** the failure is logged at error level, with the full underlying error, through the project's standard logger — not silent. The only part of the original claim that's technically accurate is that the HTTP response itself doesn't carry an explicit flag warning the user their safety snapshot was skipped — but that's a deliberate, code-commented design choice (the comment in the source literally says "non-fatal, continuing apply"): the save itself fully succeeds, and the snapshot is an intentionally best-effort safety net whose failure is meant to be visible in server logs to an operator, not surfaced as a user-facing warning.

---

## Cross-referenced (already tracked)

Two categories: one specific rider called out above, and the broader set of issues the fan-out correctly recognized as already documented elsewhere and did not re-report as new. None of the items below are part of the 37 findings in this report.

**The Batch A rider:** `server/routes/books.js:509` — chapter markdown-import requires only the base editor role with no book scope, letting any editor write import files into any book's directory. This is the same defect shape as findings 1, 2, and 4 above, but it was already caught and documented in a prior security audit (tracked there as **SA-11**, rated Low). It rides Batch A rather than being re-ranked here.

**The broader exclusion list** (18 rows, compiled from the project's audit history, its architecture register, its editorial-throughput roadmap, its QA checklist, and its project memory) covers issues a fan-out reviewing this codebase could plausibly rediscover. The fan-out checked every one of its 41 candidate findings against this list before finalizing; none of the 37 reported above duplicate a row on it. Condensed:

| Issue | Tracked as |
|---|---|
| Live in-browser preview renders every book with chemistry-specific settings (untranslated structural headings, chemistry-hardcoded image paths, silently-dropped exercise types) because book-specific configuration never reaches the in-process preview call the way the command-line renderer receives it | Register FR2-1 / RUN5-Rank6 ("module-globals" workstream) |
| The glossary/index-page generator hardcodes chemistry's data file for every book, producing a dead index page for every other book | RUN5-Rank2 / RUN6-Rank4 / register RV-5 |
| Unmapped note types in biology render with English headers (now loudly, with a warning logged) pending translated label text from the translation vendor | RUN5-Rank3 / register RV-1 |
| Chapter-assignment admin endpoints cap the chapter number at 30, making biology's chapters 31–47 unassignable through the head-editor UI | RUN5-Rank5 |
| Appendix table numbers differ between the live preview and the actually-published version | Register P0-8 Minor M1 |
| Two book-lookup functions both use a database join that hides a registered book with no catalogue entry (a third, similar function deliberately avoids the same join) | CLAUDE.md 2026-06-10 follow-up |
| `analyticsService.js` opens its database connection eagerly at load time rather than lazily — **note:** this is a different bug in the same file from finding 34 above (which covers that file's unactivated tracking middleware); finding 20 above (the same eager-open pattern in `feedbackService.js`) is also a distinct, newly-identified sibling, not a duplicate of this row | Project memory / test-isolation notes |
| The segment editor's save path has no live untranslated-text warning — the detector exists and gates the command-line injection step, but was deliberately scoped out of the editor's save path pending its own follow-up | Register A2-c |
| The in-editor spell-check button and route are fully built, but the external spell-check service they depend on has never been deployed — an infrastructure decision, not a code defect | Backlog infra-2 |
| Localized (Pass 2) content has no version-history/restore feature — only raw filesystem backups; the existing restore feature (relevant to findings 3, 15, 16, and 19 above) covers faithful-translation content only | Backlog rem-2.2 |
| A duplicated segment ID can resolve to different text depending which tool reads it, because the policy for handling duplicates differs by call site | Register #14 / Backlog #15 |
| A terminology-consistency checker exists but is never automatically invoked when an editor saves a segment | CLAUDE.md roadmap / throughput roadmap Unit 3 |
| Terminology data export to git may or may not still be stale, depending on which of two documents describing it is current — included for completeness even though it's ambiguous which state is accurate | CLAUDE.md / throughput roadmap 6.1 |
| A planned "inbox" review dashboard and related consolidation of the multiple places that trigger an apply were deliberately deferred as out of scope for a team this size — **note:** this deferral does not cover apply-path correctness bugs at those same call sites; finding 6 above (apply-before-guard ordering) was confirmed to be a legitimate, separate finding this row does not suppress | Redesign plan Phases 2b–6 / Backlog rem-minor |
| A handful of smaller throughput-roadmap UI enhancements remain deferred (repetition-detection refinements, a term-category-to-glossary link, glossary-export freshness, feedback-to-module routing) | Backlog `throughput` row |
| A set of protections a fan-out might otherwise flag as "missing" are already verified present and tested: book-scoped 403 enforcement, output escaping, render-failure rollback, version-restore reversibility, localization self-approval-by-design, assignment-enforcement fail-closed behavior, optimistic-concurrency conflict guards, and unauthenticated-page redirects | QA checklist §0–§5 (all auto-verified, cited test files per item) |
| Two QA-checklist items are test-coverage gaps, not code defects: the preview path-traversal guard and the broken-legacy-migration handling both exist and are unit-tested, just not yet walked manually on a live server | QA checklist §0.1b/§0.1c/§5c |
| A specific rendering defect (depth-unaware handling of elements nested inside list items or exercises, which can misplace or duplicate content) is still live and reachable through the same in-process preview path the server uses, though two of its symptoms have already been patched | Register P0-1 |

A further set of items the fan-out considered and explicitly excluded — because the underlying bug has already been fixed in code shipped since, or because the issue lives entirely outside `server/` with no reachable path through it — is recorded in the campaign's working notes rather than repeated here in full; none of it bears on any finding in this report.
