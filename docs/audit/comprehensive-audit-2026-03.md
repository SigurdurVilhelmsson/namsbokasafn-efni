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

*(In progress)*

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
