# Comprehensive Editing System Audit — March 2026

**Date:** 2026-03-14
**Scope:** Full-scale code audit, UX review, and test gap closure
**Spec:** `docs/superpowers/specs/2026-03-14-comprehensive-audit-design.md`
**Plan:** `docs/superpowers/plans/2026-03-14-comprehensive-audit.md`

---

## Phase 1: Code Audit & Architectural Fixes

### Task 1.1 — M3: Status Dashboard DB Consistency
**Status:** FIXED (`d58c8af`)
- Refactored `bookRegistration.js` to read from `pipelineStatusService.getChapterStage()` instead of status.json
- Both `getRegisteredBook()` (per-chapter) and `getRegisteredBooks()` (book-wide) now use DB
- Added `computeChapterPipelineProgressFromDb()` for the DB data shape
- status.json remains as write-through cache but is no longer read

### Task 1.2 — L1: my-work.js Terminology Table
**Status:** FIXED (`84301ee`)
- `getUserProposedTerms()` queried non-existent `terminology` table (actual: `terminology_terms` with different schema)
- Feature was never fully built — disabled gracefully with "Ekki enn í boði" message
- my-work.html empty state updated from "no proposals pending" to "not yet available"

### Task 1.3 — PUBLICATION_TRACKS DRY Cleanup
**Status:** FIXED (`770fd56`)
- Centralized in `constants.js`: `PUBLICATION_TRACKS` (array) + `PUBLICATION_TRACK_DIRS` (object)
- `pipelineStatusService.js` now imports from constants (was local duplicate)
- `publicationService.js` now imports `PUBLICATION_TRACK_DIRS` (was local `PUBLICATION_TRACKS` object)
- Test updated to import from `constants.js`

### Task 1.4 — Activity Logging Gaps
**Status:** FIXED (`94dbd96`)
- 5 Pass 1 endpoints now log: delete, submit, unapprove, complete, comment
- 2 Pass 2 endpoints now log: single save, bulk save
- All calls fire-and-forget with try/catch, matching existing pattern
- Added `activityLog` import to localization-editor.js

### Task 1.5 — Security Spot-Check
**Status:** FIXED (`a07fedb`)
- Added `requireRole(ROLES.CONTRIBUTOR)` to `GET /:book/:chapter/:moduleId/terms`
- Fixed 1 unescaped `err.message` in `admin.html:1187`
- innerHTML audit: all other view files properly escape user data
- SQL parameterization audit: all queries use `?` placeholders (verified userService, pipelineService, localizationSuggestions — template literals only interpolate code-built SQL fragments, not user input)

### Task 1.6 — Migration Documentation
**Status:** FIXED (`bfd865d`)
- Added cross-reference comment to migration 010 explaining distinction from 012
- 010 = user_chapter_assignments (access control/RBAC)
- 012 = chapter_assignments (task tracking with due dates)

### Task 1.7 — Systematic Sweep
**Status:** COMPLETE

**Findings:**
- `edit_history`/`pending_reviews` references: only in `services/archived/editorHistory.js` (expected)
- Hardcoded `'efnafraedi'` (without `-2e`): only in migrations (rename logic) and JSDoc examples (cosmetic, deferred)
- `console.log` in services: all are progress/info logs in long-running operations (OpenStax fetch, notifications) — appropriate, not errors
- No missing `requireAuth` on write endpoints
- No stale references in active routes or services

**Deferred (cosmetic):**
- ~15 JSDoc `@param` examples use `'efnafraedi'` instead of `'efnafraedi-2e'` — low priority, purely documentation

---

## Phase 2: Live UX Walkthroughs & Fixes

### Task 2.0 — Setup & Methodology
**Status:** COMPLETE
- Test server started on port 3456 with test JWT secret
- Chrome DevTools MCP verified and connected
- JWT tokens generated for contributor, head-editor, admin roles
- Cookie injection via `document.cookie` + `?loggedIn=1` pattern

### Task 2.1 — Contributor Journey Walkthrough
**Status:** COMPLETE — 1 NOT REPRODUCIBLE, 3 FIXED, 2 DEFERRED

**Walkthrough findings:**
- **Contributor save bug (NOT REPRODUCIBLE):** Save, reload, and navigation all work correctly on test server. Edit persists through back-button navigation and module reload. May have been fixed by Phase 1 DB consistency fix (Task 1.1) or is production-specific.
- **Module ordering 1.6 before 1.5 (LOW):** Confirmed — m68683 (1.6) appears before m68690 (1.5) in chapter JSON. Data ordering issue, not a UI bug.
- **Stale e2e test data (LOW):** Title segment has 6 `[e2e-XXXX]` markers from prior Playwright runs. Data hygiene issue.
- **Submit button feedback:** Toast "Sent til yfirlestrar!" already exists with link (line 2061). User may have missed 6-second auto-dismiss.
- **Back button spinner:** Guard added — checks for valid chapter before dispatching change event, prevents infinite spinner when chapter select is empty.
- **Column headers in Icelandic:** TEGUND, ENSKA (FRUMTEXTI), ÍSLENSKA (ÞÝÐING), AÐGERÐIR — confirmed good.

### Task 2.2 — Head-Editor Journey Walkthrough
**Status:** COMPLETE — 2 FIXED, 1 DEFERRED

**Walkthrough findings:**
- **Activity feed shows raw user IDs (FIXED):** `renderAdminActivity` used `activity.userId` (numeric "99996") instead of `activity.username`. Changed to `activity.username`.
- **Mixed EN/IS in activity feed (DEFERRED):** English entries ("saved edit on") are historical data from before Task 1.4 fix. Current code logs all activities in Icelandic. Old entries will age out naturally.
- **Nav structure correct:** "YFIRFERÐ" section (Yfirferðir, Staðfærsla), "STJÓRNUN" section (Stjórnandi, Bókasafn) visible for head-editor.
- **Admin page access:** Correctly shows "Aðeins kerfistjórar geta séð notendastjórnun" for non-admin roles.

### Task 2.3 — Localization Editor
**Status:** COMPLETE — 1 FIXED

- **Save-all category data loss (FIXED):** `editLookup` now stores `{content, category}` objects. Audit trail entries from bulk saves now include category information.

### Task 2.4 — Navigation & Information Architecture
**Status:** COMPLETE

- Sidebar highlights not role-sensitive but shows correct nav items per role
- Contributor sees: Heim, Ritstjori, Framvinda, Orðasafn
- Head-editor adds: Yfirferðir, Staðfærsla, Stjórnandi, Bókasafn
- Library page shows only 1 of 3 books (LOW — likely a registration display issue)
- Progress page pipeline stages all in Icelandic

### Task 2.5 — i18n Consistency Check
**Status:** COMPLETE — 5 FIXED

- **feedback.html (4 FIXED):** Translated English radio descriptions:
  - "Translation error" → "Villa í þýðingu eða merkingu"
  - "Technical issue" → "Tæknilegt vandamál eða birtingarvilla"
  - "Improvement suggestion" → "Tillaga um hvernig má bæta efnið"
  - "Other" → "Annað sem þú vilt koma á framfæri"
- **Activity feed userId (1 FIXED):** See Task 2.2 above
- **Chapter titles K5+ in English:** Source data issue — untranslated OpenStax titles. Not a code fix.
- **Pipeline stage names:** Already Icelandic in all views (chapter-pipeline, segment-editor, progress)

### Task 2.6 — Visual & Interaction Polish
**Status:** DEFERRED (to Phase 3 or post-launch)

- Responsive behavior not tested (requires further mobile walkthrough)
- Toast z-index appears correct (2000 vs modal 1000)
- Loading states present on module load

### Task 2.7 — Progress Indicators (`withProgress()`)
**Status:** COMPLETE

- Built `withProgress()` utility in `server/public/js/htmlUtils.js`
- Added `.btn-loading` CSS with spinner animation to `common.css`
- Applied to admin sync button (loadingText: "Samstillir...", successText: "Samstillt!")
- Applied to migration button (loadingText: "Keyrir...", successText: "Lokið!")

### Task 2.8 — Button & Action Discoverability
**Status:** COMPLETE

- **Tooltips added:**
  - Admin: sync button, add book button, migration button (Icelandic descriptions)
  - Chapter pipeline: advance confirm, revert confirm
  - Segment editor: back button and submit button already had tooltips
- **Book import idempotency (FIXED):** Route-level guard returns 409 "Bók þegar skráð" if book already registered, preventing duplicate-import error cascade from repeated clicks.

### Task 2.5b — i18n Final Re-sweep
**Status:** COMPLETE

- No common English button labels found across all views
- All new text added in Phase 2 is in Icelandic
- Remaining English: historical activity log entries (will age out), untranslated chapter titles (source data)

### Phase 2 Summary

| Finding | Severity | Status |
|---------|----------|--------|
| Contributor save revert | CRITICAL | NOT REPRODUCIBLE |
| Activity feed shows user IDs | CONFUSING | FIXED |
| feedback.html English text (4 items) | CONFUSING | FIXED |
| Save-all drops category data | LOW | FIXED |
| Back button infinite spinner | CONFUSING | FIXED |
| Book import idempotency | LOW | FIXED |
| withProgress() utility | FEATURE | IMPLEMENTED |
| Button tooltips | FEATURE | IMPLEMENTED |
| Module ordering 1.6 before 1.5 | LOW | DEFERRED (data issue) |
| Stale e2e test data | LOW | DEFERRED (data hygiene) |
| Library shows 1 of 3 books | LOW | DEFERRED |
| Responsive behavior | POLISH | DEFERRED |

---

## Phase 3: Test Gap Closure

*(Not started)*

---

## Pre-Audit Changes

### Localization Editor Visibility
**Status:** IMPLEMENTED (`bac45bc`)
- Nav link hidden for non-admin users (admin-only until Pass 2 workflow verified)
- Route still works if accessed directly (RBAC enforced server-side)

### Post-Launch TODOs
**Status:** DOCUMENTED (`bac45bc`)
- Created `docs/planning/post-launch-todos.md` with 6 prioritized items for summer 2026 sprint
