# 1C: Cross-Book Data Isolation

**Date:** 2026-03-13
**Result:** PASS (with notes)

## Summary

All database queries that return or modify per-book data are properly scoped with `WHERE book = ?` or `WHERE book_slug = ?`. Two functions (`getGlobalEditStats`, `getDiscussEdits`) intentionally operate cross-book for the admin dashboard. Three functions (`getEditById`, `deleteSegmentEdit`, review action functions) look up records by primary key only, but this is safe because they operate on already-created records whose book column was set at insertion time. No hardcoded book slugs were found in active service or route code (only in JSDoc examples and a legacy redirect map).

---

## Step 1: segmentEditorService.js — DB Query Scoping

| Function | Accepts `book`? | Query scoped by book? | Verdict |
|---|---|---|---|
| `saveSegmentEdit()` | Yes (in params) | Yes — SELECT uses `WHERE book = ? AND module_id = ? AND segment_id = ? AND editor_id = ?`; INSERT includes `book` column | PASS |
| `getModuleEdits()` | Yes (arg 1) | Yes — `WHERE book = ? AND module_id = ?` | PASS |
| `getSegmentEdits()` | Yes (arg 1) | Yes — `WHERE book = ? AND module_id = ? AND segment_id = ?` | PASS |
| `getEditById()` | No | No — `WHERE id = ?` (primary key lookup) | OK (see note 1) |
| `deleteSegmentEdit()` | No (uses editId) | No — `WHERE id = ?` (primary key lookup) | OK (see note 1) |
| `approveEdit()` | No (uses editId) | No — `WHERE id = ?` (primary key lookup) | OK (see note 1) |
| `rejectEdit()` | No (uses editId) | No — `WHERE id = ?` (primary key lookup) | OK (see note 1) |
| `markForDiscussion()` | No (uses editId) | No — `WHERE id = ?` (primary key lookup) | OK (see note 1) |
| `unapproveEdit()` | No (uses editId) | No — `WHERE id = ?` (primary key lookup) | OK (see note 1) |
| `submitModuleForReview()` | Yes (in params) | Yes — existing-check uses `WHERE book = ? AND module_id = ?`; edit count uses `WHERE book = ? AND module_id = ?`; INSERT includes `book` | PASS |
| `getPendingModuleReviews()` | Yes (optional) | Conditionally — adds `AND book = ?` when `book` arg is truthy; returns cross-book when called without arg | PASS (see note 2) |
| `getModuleReviewWithEdits()` | No (uses reviewId) | Indirectly — retrieves review by PK, then uses `review.book` and `review.module_id` to fetch edits with `WHERE book = ? AND module_id = ?` | PASS |
| `completeModuleReview()` | No (uses reviewId) | Indirectly — retrieves review by PK, then counts edits with `WHERE book = ? AND module_id = ? AND created_at >= ?` | PASS |
| `applyApprovedEdits()` | Yes (arg 1) | Yes — all queries use `WHERE book = ? AND module_id = ?`; file paths use `book` param | PASS |
| `getApplyStatus()` | Yes (arg 1) | Yes — `WHERE book = ? AND module_id = ?` | PASS |
| `getModuleStats()` | Yes (arg 1) | Yes — `WHERE book = ? AND module_id = ?` | PASS |
| `getReviewQueue()` | Yes (optional) | Conditionally — adds `AND mr.book = ?` when `book` arg is truthy; cross-book when called without arg | PASS (see note 2) |
| `getGlobalEditStats()` | No | No — intentionally cross-book aggregate | PASS (intentional, see note 3) |
| `getDiscussEdits()` | No | No — intentionally cross-book | PASS (intentional, see note 3) |
| `addDiscussionComment()` | No (uses segmentEditId) | No — `WHERE id = ?` on `segment_edits` PK, then inserts into `segment_discussions` | OK (see note 1) |
| `getDiscussion()` | No (uses segmentEditId) | No — `WHERE segment_edit_id = ?` (FK lookup) | OK (see note 1) |

**Note 1 — Primary-key lookups:** Functions like `getEditById`, `deleteSegmentEdit`, `approveEdit`, `rejectEdit`, `markForDiscussion`, `unapproveEdit`, `addDiscussionComment`, and `getDiscussion` look up records by auto-increment integer ID. These cannot accidentally return data from another book because:
- The `id` is opaque to the user (derived from URL params like `:editId`)
- The record's `book` column was set at creation time and is never used to filter here
- An attacker who guesses an edit ID from another book could technically approve/reject it, but this is an authorization concern (covered in the 1D security audit), not a data isolation issue

**Note 2 — Optional book filter:** `getPendingModuleReviews(book)` and `getReviewQueue(book)` accept an optional `book` parameter. When called without it, they return cross-book results. This is intentional: the review queue and admin dashboard need to show all pending reviews across books. The route handlers pass `req.params.book` when available.

**Note 3 — Intentional cross-book queries:** `getGlobalEditStats()` and `getDiscussEdits()` are designed for the admin dashboard and intentionally aggregate across all books. Both include `book` in their SELECT columns (for `getDiscussEdits`) so the caller can distinguish results by book.

---

## Step 2: localizationEditService.js — DB Query Scoping

| Function | Accepts `book`? | Query scoped by book? | Verdict |
|---|---|---|---|
| `logLocalizationEdit()` | Yes (in params) | Yes — INSERT includes `book` column | PASS |
| `logLocalizationEdits()` | Yes (per-row) | Yes — INSERT includes `book` column per row | PASS |
| `getSegmentHistory()` | Yes (arg 1) | Yes — `WHERE book = ? AND module_id = ? AND segment_id = ?` | PASS |
| `getModuleHistory()` | Yes (arg 1) | Yes — `WHERE book = ? AND module_id = ?` | PASS |

All localizationEditService functions are properly book-scoped. No cross-book queries exist, which is correct since this service has no admin dashboard features.

---

## Step 3: pipelineStatusService.js — DB Query Scoping

| Function | Accepts `bookSlug`? | Query scoped by book? | Verdict |
|---|---|---|---|
| `getChapterStage()` | Yes (arg 1) | Yes — `WHERE book_slug = ? AND chapter_num = ?` | PASS |
| `transitionStage()` | Yes (arg 1) | Yes — all queries use `WHERE book_slug = ? AND chapter_num = ?`; INSERT includes `book_slug` | PASS |
| `revertStage()` | Yes (arg 1) | Yes — `WHERE book_slug = ? AND chapter_num = ?` | PASS |
| `getStageHistory()` | Yes (arg 1) | Yes — both `chapter_pipeline_status` and `chapter_generation_log` queries use `WHERE book_slug = ? AND chapter_num = ?` | PASS |
| `syncStatusJsonCache()` | Yes (arg 1) | Yes — delegates to `getChapterStage(bookSlug, chapterNum)` which is scoped; file path uses `bookSlug` | PASS |

All pipelineStatusService functions are properly book-scoped. Note: `getBookProgress()` (mentioned in the audit plan) does not exist in the codebase. Pipeline progress is derived at the route level by iterating `getChapterStage()` per chapter.

---

## Step 4: Hardcoded Book Slugs

**Search scope:** `server/services/*.js` and `server/routes/*.js`, excluding `archived/`, `node_modules/`, and test files.

**Findings:**

| File | Line | Context | Verdict |
|---|---|---|---|
| `server/services/bookRegistration.js:466` | JSDoc `@param` example | `@param {string} bookSlug - e.g., 'efnafraedi-2e'` | OK — documentation only |
| `server/services/bookRegistration.js:515` | JSDoc `@param` example | `@param {string} bookSlug - Icelandic slug (e.g., 'efnafraedi-2e')` | OK — documentation only |
| `server/services/bookDataLoader.js:29` | JSDoc `@param` example | `@param {string} slug - e.g. 'efnafraedi-2e'` | OK — documentation only |
| `server/routes/views.js:46` | Legacy redirect map | `const SLUG_REDIRECTS = { efnafraedi: 'efnafraedi-2e' };` | OK — intentional redirect for old URLs |

**Verdict:** No hardcoded book slugs in service or route logic. All instances are either JSDoc examples or a legitimate redirect map. No book slug is used where a parameter should be.

---

## Step 5: Review Queue Scoping

### `getPendingModuleReviews(book)`

- **Accepts book:** Yes (optional parameter)
- **When `book` is provided:** Query adds `AND book = ?` — properly scoped
- **When `book` is omitted:** Returns all pending/in-review module reviews across all books
- **Assessment:** Intentional design. The admin/head-editor review dashboard needs to show pending reviews for all books they have access to. The route handler is responsible for passing the book filter when appropriate.

### `getReviewQueue(book)`

- **Accepts book:** Yes (optional parameter)
- **When `book` is provided:** Query adds `AND mr.book = ?` — properly scoped
- **When `book` is omitted:** Returns cross-book review queue with JOIN to segment_edits (also scoped via `mr.book = se.book`)
- **Assessment:** Same intentional design as above. The JOIN condition `mr.book = se.book AND mr.module_id = se.module_id` ensures edit counts are not mixed across books even in cross-book queries.

---

## Issues Found

None. All data-returning queries are either:
1. Properly scoped by `book`/`book_slug` parameter, or
2. Intentionally cross-book for admin dashboard use (documented), or
3. Using primary-key lookups where book scoping is implicit in the record

## Recommendations

None required. The cross-book isolation is well-implemented. The optional `book` parameter pattern used by `getPendingModuleReviews()` and `getReviewQueue()` is a clean design that serves both per-book filtering and admin-level cross-book views.
