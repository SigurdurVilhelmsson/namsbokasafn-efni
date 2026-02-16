# Design: Content Validation Gate, TM Prep Automation, Review Queue

**Created:** 2026-02-16
**Status:** Approved

Three features to complete before editorial review work begins.

---

## A. Content Validation Gate

**Goal:** Block publication when content has errors. Warn on non-critical issues.

### Current State

- `validate-chapter.js` has 21 validators (equations, cross-refs, images, placeholders, etc.)
- Supports `--json` output and `--track` filtering and `--strict` mode
- **Not integrated** into publication flow — must be run manually via CLI
- `publicationService.checkTrackReadiness()` only checks file existence

### Design

Extend the publication flow to run validation before the pipeline:

1. Add `validateBeforePublish(book, chapter, track)` to `publicationService.js`
   - Spawns `validate-chapter.js --book <book> --chapter <N> --track <track> --json`
   - Parses JSON output into `{ errors: [...], warnings: [...] }`
2. Call it from `publication.js` POST endpoint before running inject/render
3. If any ERROR-severity results → return 400 with validation report (blocks publication)
4. If only WARNINGs → include in response, allow publication to proceed
5. Publication UI displays the report (errors red, warnings yellow)

### Files to Modify

| File | Change |
|------|--------|
| `server/services/publicationService.js` | Add `validateBeforePublish()` — spawn CLI tool, parse JSON |
| `server/routes/publication.js` | Call validation before pipeline, return report on failure |

---

## B. TM Preparation Automation

**Goal:** One-click TM staging from the web UI after linguistic review is complete.

### Current State

- `prepare-for-align.js` cleans EN/IS markdown pairs for Matecat Align
- Works at section level, supports directory mode (`--en-dir`, `--is-dir`)
- Must be run manually via CLI
- `pipelineService.js` has `spawnJob()` pattern for tracked child processes

### Design

Add a new pipeline job type following the existing inject/render pattern:

1. Add `runPrepareTm({ book, chapter, userId })` to `pipelineService.js`
   - Prerequisite: verify `linguisticReview` is complete for the chapter
   - Spawns `prepare-for-align.js --en-dir 02-for-mt/chNN/ --is-dir 03-faithful-translation/chNN/ --output-dir for-align/chNN/`
   - Tracked as job type `prepare-tm`
2. Add `POST /api/pipeline/prepare-tm` endpoint to `pipeline.js`
   - Params: `{ book, chapter }`
   - Returns: `{ jobId }` for polling
   - Returns 400 if linguisticReview not complete
3. Add "Undirbua fyrir Matecat" button on chapter status page
   - Visible when `linguisticReview` is complete
   - Shows job progress via existing polling

### Files to Modify

| File | Change |
|------|--------|
| `server/services/pipelineService.js` | Add `runPrepareTm()` with prerequisite check |
| `server/routes/pipeline.js` | Add `POST /api/pipeline/prepare-tm` endpoint |
| `server/views/chapter.html` | Add conditional button |

---

## D. Review Queue

**Goal:** Cross-chapter view of all pending module reviews with quick-action links.

### Current State

- `module_reviews` table tracks review status (pending, in_review, approved, changes_requested)
- `segment_edits` table has per-edit status (pending, approved, rejected, discuss)
- `getPendingModuleReviews(book)` exists but returns flat list without edit counts
- All navigation is chapter-by-chapter in segment editor
- SLA logic exists in `reviews.js` (2d target, 3d warning, 5d critical)

### Design

New standalone page at `/review-queue`:

1. Add `getReviewQueue(book)` to `segmentEditorService.js`
   - JOINs `module_reviews` with `segment_edits` counts grouped by module
   - Returns: `{ id, book, chapter, moduleId, editor, submittedAt, counts: { pending, approved, rejected, discuss } }`
2. Add `GET /api/segment-editor/review-queue?book=efnafraedi` endpoint
3. New HTML page at `/review-queue` with:
   - Table: Chapter | Module | Editor | Submitted | Edits (pending/approved/rejected/discuss) | Action
   - Default sort: oldest first (most urgent)
   - Chapter filter dropdown
   - SLA color-coding: green < 2d, yellow < 3d, red > 5d
   - "Review" link → segment editor for that module
4. Add nav link to review queue

### Files to Modify

| File | Change |
|------|--------|
| `server/services/segmentEditorService.js` | Add `getReviewQueue()` with JOIN query + prepared statement |
| `server/routes/segment-editor.js` | Add `GET /api/segment-editor/review-queue` endpoint |
| `server/routes/views.js` | Add `GET /review-queue` route |
| `server/views/review-queue.html` | New page following existing HTML patterns |

---

## Summary

| Feature | Endpoints | Views | Service changes |
|---------|-----------|-------|-----------------|
| A. Validation Gate | 0 (extends existing) | 0 | `publicationService.js` |
| B. TM Prep | 1 POST | 0 (button on existing) | `pipelineService.js` |
| D. Review Queue | 1 GET | 1 new page | `segmentEditorService.js` |

All three features are independent and can be implemented in parallel.
