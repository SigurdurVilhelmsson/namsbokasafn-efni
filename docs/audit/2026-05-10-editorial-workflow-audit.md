# Editorial Workflow Audit — May 2026

**Date:** 2026-05-10
**Author:** Generated with Claude Code (Opus 4.7) based on code exploration of `server/` at commit `5507b4c9`
**Scope:** End-to-end editorial UX — home dashboard, segment editor, terminology, progress, assignments, admin console; the editor → admin → applied lifecycle; vocabulary used on screen
**Out of scope:** Auth provider, DB engine, the Pass 1/Pass 2 content model, pipeline tooling under `tools/`, the `-vefur` sister repo
**Companion plan:** [`docs/plans/2026-05-10-editorial-workflow-redesign-plan.md`](../plans/2026-05-10-editorial-workflow-redesign-plan.md)

---

## 1. Executive Summary

The Námsbókasafn editorial server has accumulated five mutually inconsistent answers to the question "what is waiting?" — and the dashboard composes them in a way that contradicts itself on a single screen. An admin who has not personally edited segments sees three large headline tiles reading **0 / 0 / 0** at the same moment that a panel ten centimetres lower correctly reports eleven items pending. Neither number is wrong in isolation; the problem is that they sit at equal visual prominence with no signal that one is personal and the other is global. Two further admin panels (`Vinnuálag ritstjóra`, `Tilbúið til úthlutunar`) render permanent loading skeletons because the backend never populates the fields they read.

Beneath that surface bug lies a workflow trap: an editor's saved edits land in `segment_edits` with `status='pending'` immediately, but the dashboard's "needs attention" counter reads a *separate* `module_reviews` table that is only populated when the editor explicitly clicks "Submit module for review." Editors who save fifty edits without clicking submit hide their own work from the admin queue. There is no standalone inbox screen — the admin must remember a query-string-gated mode of the segment editor at `/editor?view=reviews`.

A second-order problem is vocabulary. The user base is five chemistry teachers, not professional translators. Words like *segment*, *translation memory*, *faithful translation*, *module review* are translator jargon that the audience does not share. Even when the data layer tells the truth, the labels do not.

The five recommended fixes, in order of cost-benefit ratio, are: (1) consolidate dashboard SQL into a single read-model service so each counter has one source; (2) fix the headline tiles to differentiate personal from global with a role switch; (3) repair or delete the two broken panels; (4) make pending segment edits visible without the `module_reviews` wrapper; (5) replace translator jargon with chemistry-teacher vocabulary in templates. The North Star: *an editor should never have to remember a workflow step, and an admin should always have one queue that contains everything.*

---

## 2. Method and Scope

**Files read** (file:line cites throughout):
- `server/routes/my-work.js` — the `/api/my-work` and `/api/my-work/today` endpoints feeding the dashboard tiles
- `server/routes/status.js` — the `/api/status/dashboard` endpoint feeding the admin-only panels
- `server/routes/segment-editor.js` — editor save / submit / approve / reject / discuss / apply lifecycle
- `server/services/segmentEditorService.js` — `saveSegmentEdit()`, `getPendingModuleReviews()`, `applyApprovedEdits()`
- `server/services/activityLog.js` — the recent-activity feed source
- `server/views/my-work.html` (1500+ lines) — the home page template
- `server/views/segment-editor.html`, `localization-editor.html`, `status.html`, `terminology.html`, `admin.html`, `assignments.html`, `books.html`
- `server/public/js/layout.js` — sidebar nav and role gates
- `server/constants.js` — role definitions
- `server/migrations/008-segment-editing.js` — `segment_edits` and `module_reviews` schemas

**Sources consulted but not cited:** the prior `comprehensive-audit-2026-03.md` (commit history `d58c8af` … `bfd865d`). Two relevant prior fixes were noted: Task 1.2 disabled the *list view* of `proposedTerms` with an "Ekki enn í boði" message but left the headline tile still binding to a hardcoded `[]`; Task 1.4 added activity-log calls to seven endpoints but the activity feed remains a separate table from the canonical edit state.

**What is *not* in scope:** the two-pass content model (Pass 1 = faithful, citable, AI-training-quality; Pass 2 = linguistic adaptation for v2.0) is treated as a fixed product requirement. The audit recommends *making the ordering visible*, never collapsing it. Likewise, Microsoft Entra ID auth, better-sqlite3, the server-rendered HTML stack, and the `03-faithful-translation/` / `04-localized-content/` / `05-publication/localized/` directory layout are all out of scope.

---

## 3. Personas and the Tuesday-Evening Test

Three personas, each grounded in a real user role from `server/constants.js:10-22`:

### 3.1 Anna — chemistry teacher, role `editor`

**Mental model:** "I open the website, click on the chapter I'm helping with, fix some sentences, and go home. The system tells me when I'm done."

**Tuesday-evening task:** review chapter 5 of Efnafræði, segments 1–30. Saves 22 edits over 45 minutes.

**Friction points:**
1. Opens `/`. The greeting says "Ekkert verkefni í dag!" because `currentTask` is `null` — Anna has no chapter assignments and no rejected/discuss edits to fix. She does not see the chapter she is *currently working on*. (`server/routes/my-work.js:272`)
2. Clicks `Ritstjóri` in the sidebar. Has to remember which book she was in.
3. Saves edit after edit. The button just says "Vista" (Save). Nothing tells her these edits are "pending" until someone approves them.
4. There is a "Submit module for review" button somewhere on the screen that she has not been told about. If she does not click it, her 22 edits exist in the database but do not appear in the admin's `getPendingModuleReviews()` count. She closes the browser. The admin has no visibility.
5. Comes back Wednesday. The `Nýleg virkni þín` panel shows her edits. The home tiles still read 0/0/0 because she has no `approved` edits this week.

**Verdict:** Anna's mental model and the system's data model diverge at step 4. The system requires a translator's "submit batch for review" gesture; Anna expects a teacher's "I saved my work" gesture.

### 3.2 Magnús — head-editor, role `head-editor`

**Mental model:** "I want to know what my team is doing and approve their work."

**Tuesday-evening task:** check whether anyone has submitted edits today.

**Friction points:**
1. Opens `/`. Sees the editor view at top (with personal stats 0/0/0 because he hasn't edited) and the admin view below.
2. `Þarfnast athygli` panel shows `0 / 0 / 11 / 1` — eleven pending reviews. ✅ This number is correct for module-level submissions but undercounts segment edits that have not been wrapped in a review.
3. `Vinnuálag ritstjóra` panel: permanent loading state. He scrolls past it.
4. `Tilbúið til úthlutunar`: also permanent loading. He scrolls past it.
5. To approve, he clicks `Ritstjóri` → manually picks book → manually picks chapter → manually picks module → one of several screens opens depending on URL parameters. The path `/editor?view=reviews` exists but is not in the sidebar.

**Verdict:** Magnús finds the right number but cannot trust the dashboard because half the panels are visibly broken. He develops a habit of ignoring the dashboard and going directly to the editor URL by memory.

### 3.3 Siggi — admin / maintainer, role `admin`

**Mental model:** "I want to know if anything is stuck or unhandled, then I want to fix the system if it is."

**Tuesday-evening task:** quick health check.

**Friction points:**
1. Opens `/`. Headline tiles say 0/0/0. Without other context this looks like "all clear."
2. Spots the activity log at the bottom showing `gudrunpalla@…` made a dozen edits this morning.
3. Realises the dashboard is lying. (This is the trigger event for this audit.)
4. Cannot tell from the home page how many of those edits are pending vs approved vs applied.
5. Investigates the code to find out why. ← This audit.

**Verdict:** the dashboard fails at its primary job — surfacing an honest summary that an admin can trust without a code dive.

---

## 4. Logical Inconsistencies (top billing)

Listed first because they are objectively wrong, not matters of taste. Each finding has *Symptom*, *Root cause*, *Affected persona*, *Severity*, *Effort*.

### F1 — Headline tiles compute personal stats but read as global  · **Critical** · **S**

- **Symptom:** Admin sees `0 / 0 / 0` at the top of `/` even when global pending count is non-zero.
- **Root cause:** `getUserPendingSubmissions(username)` and `getUserRecentReviews(username, …)` filter `segment_edits WHERE editor_username = ?`. `quickStats.pendingReview` and `quickStats.completedThisWeek` are derived from those personal queries (`server/routes/my-work.js:74-95`, `100-123`, `285-289`). The frontend at `server/views/my-work.html:1287-1291` binds them to `#stat-completed`, `#stat-pending`, `#stat-terms` without any visual indication that they are personal.
- **Affected:** Magnús (sometimes correct, sometimes 0), Siggi (always 0).
- **Why it ships:** the original target user was Anna. Personal stats are correct *for her*. The same template was reused for admin without splitting the data binding by role.

### F2 — Pending segment edits invisible until wrapped in a `module_review`  · **Critical** · **M**

- **Symptom:** Editor saves 22 edits. Admin's `Þarfnast athygli` counter shows 0 pending unless the editor also clicks "Submit module for review."
- **Root cause:** The admin counter at `server/routes/status.js:265` calls `segmentEditorService.getPendingModuleReviews()` which reads `module_reviews WHERE status IN ('pending', 'in_review')`. The actual edits live in `segment_edits` with `status='pending'`, which is *never* read by the counter.
- **Affected:** Anna (her work is hidden), Magnús (under-counts queue), Siggi (under-counts queue).
- **Why it ships:** the schema was designed for translator workflows where submitting a batch is a discrete action. For a teacher fixing one sentence at a time, the wrapper is friction.

### F3 — `workload` and `readyForAssignment` panels render permanent skeletons  · **High** · **S**

- **Symptom:** `Vinnuálag ritstjóra` and `Tilbúið til úthlutunar` show loading spinners forever.
- **Root cause:** `server/views/my-work.html:1086-1120` reads `data.workload` and `data.readyForAssignment`. The backend at `server/routes/status.js:113-128` initialises the response object without those keys; the JSDoc at `server/routes/status.js:109` promises `workload` and `overdueItems` but the response built at lines 113-128 and finalised at line 307 omits them. The fields are advertised but never produced.
- **Affected:** Magnús, Siggi.
- **Why it ships:** likely the backend was scoped down without updating the frontend, or the frontend was scaffolded ahead of the backend and the second half never landed.

### F4 — Activity feed is a separate table from canonical edit state  · **High** · **M**

- **Symptom:** A `segment_edits` row exists but does not appear in the activity feed because the corresponding `activity_log` insert silently failed (or was never written by that code path).
- **Root cause:** Recent activity reads `activity_log` (`server/services/activityLog.js:54-73`). Edits are only present if the route that mutated `segment_edits` also called `activityLog.append(...)`. The March audit (Task 1.4) added missing log calls to seven endpoints, which suggests the gap recurs whenever a new endpoint is added.
- **Affected:** Magnús, Siggi.
- **Why it ships:** event-sourcing pattern was bolted on after the fact; no foreign-key constraint or trigger ties `segment_edits` writes to `activity_log` writes.

### F5 — `proposedTerms` tile is a permanent stub  · **Medium** · **S**

- **Symptom:** Third headline tile always reads 0.
- **Root cause:** `server/routes/my-work.js:67-69` — `getUserProposedTerms()` returns `[]` unconditionally. The tile is bound at `server/views/my-work.html:1290`. The previous March audit (Task 1.2) added a "Ekki enn í boði" empty-state message to the *list view* but did not touch the *headline tile*, which still binds to `quickStats.proposedTerms` and renders `0`.
- **Affected:** all personas.
- **Why it ships:** half-built feature; the simplest fix is to delete the tile.

### F6 — `applyApprovedEdits()` has two triggers  · **Medium** · **M**

- **Symptom:** Admin approves all edits in a module. Sometimes the file in `03-faithful-translation/` updates immediately; sometimes the admin must click a separate "Apply" button.
- **Root cause:** `server/services/segmentEditorService.js:474-600+` is callable in two ways: automatically by `POST /api/segment-editor/reviews/:reviewId/complete` (when all edits are approved), and manually by `POST /api/segment-editor/:book/:chapter/:moduleId/apply`. The two triggers are visually distinguishable in the UI only by which screen the admin is on.
- **Affected:** Magnús, Siggi.
- **Why it ships:** the manual route was added before the auto-trigger; the auto-trigger was added later but the manual route was not removed.

### F7 — `Yfirferðir` nav points at a query-string-gated mode  · **Low** · **S**

- **Symptom:** Bookmarks to "the reviews screen" sometimes break. Screen readers announce it as a duplicate of the segment editor.
- **Root cause:** `server/public/js/layout.js:28-117` includes a "Yfirferðir" sidebar item pointing to `/editor?view=reviews`. The route handler at `server/routes/views.js:19` renders `segment-editor.html` regardless of the query string; the view-switching is JavaScript at runtime.
- **Affected:** Magnús, Siggi.
- **Why it ships:** evolved from a tab inside the editor, never extracted into its own route.

---

## 5. Vocabulary Audit

The single most cost-effective intervention. Two columns: word currently on screen → word a chemistry teacher would naturally use.

| Currently on screen | Replacement | Where it appears |
|---|---|---|
| Segment | Setning *or* málsgrein | segment-editor.html, my-work.html, status.html |
| Translation memory (TM) | (drop entirely; teachers don't need to know it exists) | status.html ("Þýðingaminni") |
| Faithful translation | Beinþýðing *or* Trúr texti | localization-editor.html, status.html |
| Localization / Staðfærsla | Aðlögun fyrir nemendur | layout.js nav, localization-editor.html |
| Module / Module review | Kafli *or* eining (eining for sub-section) | segment-editor.html, status.html |
| Submit for review | (delete; auto-submitted on save — see Phase 2b) | segment-editor.html |
| Pending review (status) | Bíður yfirferðar | status badges throughout |
| Discuss (status) | Til umræðu | segment-editor.html badges |
| Reviewer / Yfirferðarmaður | Ritstjóri | segment-editor.html, my-work.html |
| Workload | Verkaálag | my-work.html admin panel |
| Ready for assignment | Tilbúið til úthlutunar (already plain) | keep |
| Pipeline stage | Vinnsluskref | status.html, my-work.html stage labels |
| Injection / Inndráttur | Innsetning *or* Samhengi | status.html stage labels |
| Rendering / Myndbreyting | Birting (more familiar verb) | status.html stage labels |

This table doubles as the source of truth for the Phase 1.7 string swap. Implementation note: there is no centralised `ui-strings.js` or `i18n` module today (verified via grep). Strings are inline in HTML templates. The Phase 1.7 task is therefore a careful template-by-template find-and-replace, not a config file edit.

---

## 6. Per-Screen Rubric

Twelve templates, each scored 1–5 on four axes. Total /20. Verdict: <12 = redesign, 12–15 = tweak, 16+ = keep.

| Screen | Intuit. | Truth | Single-src | Discov. | Total | Verdict |
|---|---:|---:|---:|---:|---:|---|
| `/` Heim (`my-work.html`) | 2 | 1 | 1 | 4 | **8** | Redesign |
| `/editor` Ritstjóri (`segment-editor.html`) | 3 | 4 | 4 | 3 | **14** | Tweak |
| `/editor?view=reviews` (same template, gated) | 2 | 3 | 2 | 1 | **8** | Replace with `/yfirferd` (Phase 3) |
| `/progress` Framvinda (`status.html`) | 3 | 4 | 4 | 4 | **15** | Tweak |
| `/terminology` Orðasafn (`terminology.html`) | 3 | 5 | 5 | 4 | **17** | Keep |
| `/localization` Staðfærsla (`localization-editor.html`) | 2 | 5 | 5 | 3 | **15** | Tweak (vocab) |
| `/library` Bókasafn (`books.html`) | 4 | 5 | 5 | 4 | **18** | Keep |
| `/admin` Stjórnandi (`admin.html`, 4 tabs) | 3 | 5 | 4 | 3 | **15** | Tweak |
| `/assignments` Úthlutanir (`assignments.html`) | 4 | 5 | 5 | 4 | **18** | Keep |
| `/profile` (`profile.html`) | 5 | 5 | 5 | 5 | **20** | Keep |
| `/feedback` (`feedback.html`) | 5 | 5 | 5 | 5 | **20** | Keep |
| `/login` (`login.html`) | 5 | 5 | 5 | 5 | **20** | Keep |

**Two redesign candidates only:** the home page (full redesign of the dashboard composition) and the query-string-gated reviews mode (replace with a real `/yfirferd` route in Phase 3). The rest are healthy and need vocabulary touch-ups at most.

---

## 7. Editor-vs-Admin Walkthrough

Same scenario, narrated twice in parallel. Time `T` is when an editor saves an edit; the admin opens the dashboard at `T + 12 hours`.

| Time | What Anna (editor) does | What Siggi (admin) sees the next morning |
|---|---|---|
| T+00:00 | Opens chapter 5, segment 7. Reads MT output. Decides it's wrong. | — |
| T+00:01 | Edits the IS column. Clicks **Vista**. UI flashes a small "Vistað" toast. | — |
| T+00:01 | (DB) `segment_edits` row inserted: `status='pending'`, `editor_username='annask'`. | — |
| T+00:01 | (DB) `activity_log` row inserted *if* the route remembered to call `activityLog.append()`. | — |
| T+00:02 | Repeats 21 more times for segments 8–28. | — |
| T+00:45 | Closes the laptop. Does **not** click "Submit module for review" because she has not been told about it. | — |
| T+12:00 | — | Opens `/`. Greeting: "Gott kvöld, Sigurður Einar Vilhelmsson." Tiles: **0 / 0 / 0**. |
| T+12:01 | — | Reads "Ekkert verkefni í dag!" Concludes nothing happened. |
| T+12:02 | — | Scrolls to admin section. `Þarfnast athygli`: **0 pending reviews** (because no `module_reviews` row exists). |
| T+12:03 | — | Sees `Nýleg virkni teymis` showing `annask: segment_edit_saved` × 22. Confused. |
| T+12:04 | — | Clicks `Ritstjóri`. Manually picks Efnafræði → ch5. Sees orange "22 pending edits" badge on a module. Approves them one by one. |
| T+12:30 | — | Clicks `Apply`. File `03-faithful-translation/ch05/m12345-segments.is.md` is written. |

**The two systems' models diverge at T+00:45.** Anna's model: "I saved, I'm done." System's model: "Until you submit, your edits are private drafts." Siggi's experience at T+12:00 onward is the consequence: he has to read the activity feed to discover work that the dashboard claims doesn't exist.

---

## 8. Layout Proposals (information hierarchy, not wireframes)

ASCII wireframes for a dozen screens are unmaintainable. Instead, the proposed information hierarchy as a bullet tree.

### 8.1 Proposed `/` (Heim)

- Greeting (existing — keep)
- **Role-aware headline strip** *(replaces the three personal tiles)*
  - For role `editor`: *"Þín verk núna"* — shows count of (a) edits awaiting your fix from a reviewer (`status IN ('rejected','discuss') WHERE editor_username = me`), (b) chapters assigned to you, (c) link to the chapter you most recently edited.
  - For role `head-editor` and `admin`: *"Bíður þíns úrskurðar"* — global count of pending segment edits across all books and editors. Single big number. Click → `/yfirferd`.
- **Þarfnast athygli** *(keep, populated from same read-model)*
- **Nýleg virkni** *(keep — combined personal + team feed for admins)*
- *(deleted)* Vinnuálag ritstjóra and Tilbúið til úthlutunar — surfaced inside the new `/yfirferd` instead, where they have context

### 8.2 Proposed `/yfirferd` (Phase 3 inbox)

- Filter bar: book, chapter, editor, status (all default to "all")
- Single flat list, newest first:
  - One row per pending segment edit
  - Columns: book + chapter + module + segment ID, editor name, time waiting, edit category badge, *Approve* / *Discuss* / *Reject* inline action buttons
- Sidebar mini-panel: *Ready for apply* — modules where all edits are approved but file not yet written
- Sidebar mini-panel: *Workload* — count per editor over the last 7 days

The intent: admins never need to traverse `book → chapter → module → segment` to act. The inbox is flat; the act is one click.

---

## 9. Severity × Effort Grid

|              | Effort: S        | Effort: M           | Effort: L     |
|--------------|------------------|---------------------|---------------|
| **Critical** | F1               | F2                  | —             |
| **High**     | F3, F7           | F4, *(new inbox)*   | —             |
| **Medium**   | F5               | F6, *(vocab pass)*  | *(help/tour)* |
| **Low**      | —                | —                   | —             |

The implementation plan in `docs/plans/2026-05-10-editorial-workflow-redesign-plan.md` sequences against this grid: Phase 1–1.5 hits the top-left cells; Phase 1.7 hits the medium-M vocab cell early because it is risk-free string work; Phase 3 (inbox) is the high-M cell; Phase 4 (help/tour) is the medium-L cell, deferred.

---

## 10. What We Are Explicitly *Not* Changing

- The two-pass content model. Pass 1 (faithful translation, citable, used for AI training) precedes Pass 2 (linguistic adaptation, v2.0 release). Both passes stay; both produce distinct artefacts under `03-faithful-translation/` and `04-localized-content/` / `05-publication/localized/`. The audit makes the ordering more visible in the UI; it does not collapse it.
- Microsoft Entra ID auth.
- `better-sqlite3` and the existing migrations.
- Server-rendered HTML + vanilla JS frontend stack.
- The directory layout under `books/{book}/`.
- The 38+ existing 301 redirects in `server/routes/views.js`.
- The Vitest + Playwright test stack and the existing ~1070 + 96 test counts.
- The pipeline tools under `tools/`.

---

## 11. Open Questions

These cannot be answered by code reading alone. The implementation plan should resolve them before Phase 3 ships.

1. **Approval weighting.** Should a `head-editor` approval be equivalent to an `admin` approval? Currently both can approve; the audit assumes yes, but if an admin should override head-editor decisions, the data model needs an "override" field.
2. **Notifications.** In-app badge only, or also daily digest email via the existing `notifications.js`? If email, what address — Entra-provided or a per-user override in `users` table?
3. **Discuss-status workflow.** When an edit is marked `discuss`, who is responsible for resolving it — the original editor, the reviewer, or either? The current schema has no "assigned to" field on `segment_edits`.
4. **Pass 2 visibility for editors.** Should editors see only Pass 1 work, or also Pass 2 once Pass 1 is approved? Today Pass 2 is admin-gated; this may change as the team grows.
5. **Bulk approve.** Phase 3's inbox shows one row per edit. Should there be a "select all in this module → approve" action, or is per-edit click acceptable for the volume (~22 edits per Anna session)?
6. **Module-review wrapper.** After Phase 2b, does the `module_reviews` table still serve a purpose (e.g., tagging a coherent set of edits as a "release"), or should it be deprecated entirely?
7. **What counts as "completed this week"?** For Anna's personal tile in §8.1, is "completed" measured by `applied_at` being non-null, or by the editor's edit moving to `approved`? The two diverge if approval and apply happen on different days.
8. **Help content authorship.** Phase 4's onboarding tour needs prose. Is it written by the maintainer, or commissioned from a head-editor who can describe the workflow in chemistry-teacher terms?

---

*End of audit. The implementation plan in [`../plans/2026-05-10-editorial-workflow-redesign-plan.md`](../plans/2026-05-10-editorial-workflow-redesign-plan.md) sequences the fixes.*
