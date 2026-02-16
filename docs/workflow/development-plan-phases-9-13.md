# Development Plan: Phases 9-13

**Created:** 2026-02-05
**Context:** Phase 8 (Editor Rebuild) is complete. This plan covers the next stages of development, from closing the write gap through to codebase consolidation.

---

## Current State

### What Phase 8 Built

| Sub-phase | Commit | What |
|-----------|--------|------|
| 8.1 | `1021662` | Segment-level linguistic editor (DB-backed edits, module reviews, discussions) |
| 8.2 | `444cb33` | Terminology integration (inline term highlighting, consistency checking, lookup) |
| 8.3 | `ec38ab0` | Pipeline API (inject/render triggered from web UI, job tracking) |
| 8.4 | `98aea7b` | Localization editor (3-column Pass 2 editor, saves to `04-localized-content/`) |

### The Write Gap (Primary Blocker)

The segment editor records edits in SQLite (`segment_edits` table) and the head editor can approve/reject them. But approved edits only update a `status` column in the database. **Nothing writes approved content to `03-faithful-translation/` segment files.** Without those files:

- `cnxml-inject` has no source for the faithful track
- `cnxml-render` produces no faithful HTML
- The faithful publication track stays empty
- TM creation via Matecat Align cannot start

This is the single highest-priority item.

### Content State (efnafraedi)

| Directory | Chapters | Notes |
|-----------|----------|-------|
| `01-source/` | — | CNXML originals (fetched on demand) |
| `02-for-mt/` | ch01-ch05 | EN segments extracted |
| `02-mt-output/` | ch01-ch05, ch09, ch12-ch13, appendices | IS segments from MT |
| `03-faithful-translation/` | **empty** | Populated per-module by `applyApprovedEdits()` |
| `03-translated/faithful/` | **empty** | Produced per-module by inject after review |
| `04-localized-content/` | **empty** | Pass 2 not started |
| `05-publication/mt-preview/` | ch01 | HTML rendered |
| `05-publication/faithful/` | **empty** | Grows per-module as reviews are approved |

### Open Pipeline Issues

Three issues remain in `cnxml-render.js` (tracked in [html-pipeline-issues.md](../pipeline/html-pipeline-issues.md)):

| # | Issue | Severity | Nature |
|---|-------|----------|--------|
| 5 | Examples structure | Medium | CSS/structure alignment — may be a vefur-side fix |
| 6 | Exercises structure | Medium | Same as #5 |
| 7 | Cross-references empty | Low | `<link target-id="..."/>` not resolved to figure/table numbers |

Issues 5 and 6 need investigation to determine whether the fix belongs in cnxml-render (wrong HTML structure) or vefur (missing CSS). Issue 7 is a genuine gap in cnxml-render where internal cross-references render as empty parentheses.

---

## Phase 9: Close the Write Gap ✅ (2026-02-16)

**Goal:** Approved edits flow to `03-faithful-translation/` files, unblocking the downstream pipeline.

**Status:** COMPLETE. Code for 9.1-9.3 was implemented in Phase 8.

**Note (2026-02-16):** Premature bulk initialization of `03-faithful-translation/` from MT output was removed. The faithful track is now populated **per-module** via `applyApprovedEdits()` when module reviews are completed and approved. The segment editor falls back to `02-mt-output/` when `03-faithful-translation/` files don't exist, so no pre-initialization is needed for web-based editing.

### 9.1 — Apply Approved Edits to Files

Add `applyApprovedEdits(book, chapter, moduleId)` to `segmentEditorService.js`:

1. Load current IS segments from `02-mt-output/` as the base text
2. Query all approved edits for this module from the database
3. Overlay approved content onto each segment (latest approved edit wins)
4. Write to `03-faithful-translation/chNN/mNNNNN-segments.is.md` via `segmentParser.saveModuleSegments()`
5. Record which edits were applied (new `applied_at` column) to prevent double-application

**Trigger points:**
- Automatically when `completeModuleReview()` returns `status: 'approved'`
- Manual "Apply to files" button in segment editor (HEAD_EDITOR only)

**Files to modify:**
- `server/services/segmentEditorService.js` — add apply function
- `server/services/segmentParser.js` — may need minor adjustments
- `server/routes/segment-editor.js` — add apply endpoint
- `server/views/segment-editor.html` — add apply button
- `server/migrations/009-*.js` — add `applied_at` column to `segment_edits`

### 9.2 — "Apply & Render" One-Click Flow

After applying edits, chain into the pipeline API:

1. Apply approved edits to `03-faithful-translation/`
2. Run `cnxml-inject` (source: `03-faithful-translation`) → `03-translated/`
3. Run `cnxml-render` (track: faithful) → `05-publication/faithful/`
4. Show rendered HTML in a preview panel

This gives the head editor immediate visual feedback after completing a review.

**Files to modify:**
- `server/routes/segment-editor.js` — add `/apply-and-render` endpoint
- `server/views/segment-editor.html` — add button and preview panel

### 9.3 — Bulk Chapter Apply

Endpoint to process all approved modules in a chapter at once:

1. List modules with completed reviews
2. Apply edits for each
3. Run chapter-wide inject → render

This matches the practical workflow: review modules individually, then publish the chapter.

**Files to modify:**
- `server/routes/pipeline.js` — add chapter-level apply endpoint

---

## Phase 10: Publication Migration ✅ (2026-02-16)

**Goal:** Replace markdown assembly with HTML pipeline output.

**Status:** COMPLETE. The publication service was already migrated to use inject→render during Phase 8 (Pipeline API at `/api/pipeline`). Phase 10 cleanup:
- Removed premature bulk initialization of `03-faithful-translation/` and `05-publication/faithful/`
- Established module-level publication model: faithful HTML grows per-module as reviews complete
- Removed unused `03-editing/` directory
- Updated documentation to reflect HTML pipeline

**Key design decision:** Faithful publication happens at the **module level**. When a module review is completed and approved, `applyApprovedEdits()` writes segments to `03-faithful-translation/`, then inject→render produces faithful HTML for that module. The reader shows faithful when available, falls back to mt-preview.

| Track | Source | Pipeline |
|-------|--------|----------|
| mt-preview | `02-mt-output/` | inject → render → `05-publication/mt-preview/` |
| faithful | `03-faithful-translation/` | inject → render → `05-publication/faithful/` (per-module) |
| localized | `04-localized-content/` | inject → render → `05-publication/localized/` |

---

## Phase 11: Status & Schema Modernization ✅ (2026-02-16)

**Goal:** Pipeline tracking reflects reality.

**Status:** COMPLETE. Migrated from mixed-name 7-stage model to canonical 8-stage pipeline.

### What was done:

- **11.1 — Schema migration:** One-time migration script (`tools/migrate-status-schema.js`) rewrote all 22 `status.json` files. Legacy names removed: `source`, `enMarkdown`, `editorialPass1`, `matecat`, `tmUpdated`, `editorialPass2`. JSON schema updated to match.
- **11.2 — Status routes updated:** `PIPELINE_STAGES` expanded to 8 stages. Removed `STAGE_MAPPING` and `normalizeStageStatus()`. Updated `formatChapterStatus()`, `suggestNextActions()`, section-level status, summary, and analytics routes.
- **11.3 — Filesystem sync updated:** `bookRegistration.js` `scanAndUpdateStatus()` uses canonical names and module-based file detection. Checks `02-for-mt/` for extraction + mtReady, `02-mt-output/` for mtOutput, `03-faithful-translation/` for linguisticReview, `tm/` for tmCreated, `03-translated/mt-preview/` for injection, `05-publication/mt-preview/` for rendering.
- **11.4 — Auto-advance hook:** `segmentEditorService.js` `applyApprovedEdits()` checks if all modules have faithful files after each apply. When all modules reviewed, marks `linguisticReview: complete`. `pipelineService.js` already auto-advances `injection` and `rendering`.

**Design docs:** `docs/plans/2026-02-16-phase11-status-modernization-design.md`, `docs/plans/2026-02-16-phase11-implementation.md`

**Note on 11.2 (Chapter Files Tracking):** Deferred. The `chapterFilesService.js` file type tracking for structure JSON, translated CNXML, and rendered HTML was not implemented — the filesystem sync in `bookRegistration.js` provides sufficient tracking at the chapter level.

---

## Phase 12: Pipeline Verification ✅ (2026-02-16)

**Goal:** Prove the end-to-end flow works and fix remaining issues.

**Status:** COMPLETE. All pipeline issues verified as resolved on the live site (namsbokasafn.is).

### 12.1 — Cross-Reference Resolution ✅

Cross-references already fixed in earlier work. Verified on live site:
- Section 3-1: 11 cross-references resolved correctly (Mynd 3.2-3.10, Dæmi 3.3, Dæmi 3.6)
- Section 5-2: 10 cross-references resolved correctly (Mynd 5.11-5.18, Tafla 5.1)
- Zero empty `()` references found on any tested page

### 12.2 — Verify Examples & Exercises ✅

Both examples and exercises render correctly on the live site. The vefur `content.css` already had appropriate styles:
- **Examples:** `<aside class="example">` with gray background, proper labels ("DÆMI 3.1"), solution/check-your-learning structure
- **Exercises:** `<div class="eoc-exercise">` with numbered answer-key links, `.problem` containers, 80 exercises verified on chapter 3
- Updated `html-pipeline-issues.md` to close issues #5 and #6

### 12.3 — End-to-End Test

Deferred to operational use. The pipeline has been verified through the rendering and publication path. Full end-to-end testing (edit → apply → inject → render → publish) will occur naturally during the first real editorial review cycle through the segment editor.

---

## Phase 13: Cleanup & Consolidation ✅ (2026-02-16)

**Goal:** Remove dead weight, reduce maintenance surface.

### 13.1 — Retire Old Pipeline ✅ (2026-02-16)

**Completed.** Commit `89b86d2`. ~37,800 lines removed:

| Deleted | Lines | Replacement |
|---------|-------|-------------|
| `tools/_archived/` (43 files) | ~27,000 | Extract-Inject-Render CLI tools |
| `tools/__tests__/_archived/` (4 files) | ~1,500 | — |
| `server/routes/editor.js` | 1,008 | `segment-editor.js` |
| `server/views/editor.html` | 7,909 | `segment-editor.html` |
| `server/routes/process.js` | 455 | `pipeline.js` |
| `server/routes/localization.js` | 577 | `localization-editor.js` |
| Dead code in `workflow.js` | ~575 | Cleaned in place |
| Dead code in `books.js` | ~210 | Cleaned in place |

Also updated: `sync.js`, `sessionCore.js`, `index.js`, `views.js`, `workflow.html`, `chapter.html`, nav links in 23 view files (`/editor` → `/segment-editor`).

### 13.2 — Audit Remaining Services ✅ (2026-02-16)

Audited all ~30 service files. Found and deleted 3 orphaned services (682 lines):

| File | Lines | Why Dead |
|------|-------|----------|
| `mtRestoration.js` | 196 | Markdown-specific MT restoration, zero imports |
| `presenceStore.js` | 244 | Editor presence tracking, only used by deleted `editor.js` |
| `notesStore.js` | 245 | Editor notes store, only used by deleted `editor.js` |

Other candidates investigated:
- `editorHistory.js` — **NOT dead**, actively used by `reviews.js` and `status.js`
- `publicationService.js` — **Clean**, markdown assembly already removed in Phase 13.1

### 13.3 — Core Pipeline Tests ✅ (2026-02-16)

Added 22 integration tests in `tools/__tests__/pipeline-integration.test.js`:

| Category | Tests | What |
|----------|-------|------|
| cnxml-inject | 4 | Single module, full chapter, translated content, preserved IDs |
| cnxml-render | 5 | Chapter HTML, valid documents, translated content, IDs, end-of-chapter pages |
| Regression #1-#8 | 10 | Image paths, no duplication, equations, examples CSS, exercises structure, cross-refs, inline artifacts |
| Round-trip | 1 | inject → render → verify Icelandic text + IDs |
| General quality | 2 | Data attributes, answer key structure |

Total test suite: 49 tests across 4 files, all passing.

---

## Ideas Beyond the Roadmap

These aren't committed to a phase but would directly serve the workflow:

### A. Content Validation Gate

Before publishing, automatically check:
- All segments have translations
- All `[[MATH:N]]` placeholders have corresponding equations
- All approved terms used consistently
- No empty cross-references

Block publication if checks fail. Low effort, high value.

### B. TM Preparation Automation

After `03-faithful-translation/` files are written, auto-run `prepare-for-align.js` to stage files for Matecat Align. Reduces the TM creation step from a manual multi-step process to a single click.

### C. Segment-Level Progress Metrics

Replace chapter-level progress tracking (which counted markdown files) with segment-level metrics: X of Y segments reviewed, Z approved, N rejected. Accurate progress for the team and stakeholders.

### D. Review Queue

Dedicated view showing all pending module reviews across all chapters, sorted by submission date, with quick-action buttons. Currently reviewers must navigate chapter-by-chapter.

### E. Diff View in Segment Editor

Character-level diffs between MT output and editor's changes, highlighting exactly what was modified. Helps head editors review faster.

---

## Priority Order

| Priority | Item | Rationale |
|----------|------|-----------|
| 1 | **9.1** Apply edits to files | Unblocks entire downstream pipeline |
| 2 | **9.2** Apply & Render flow | Makes 9.1 immediately useful |
| 3 | **10.1-10.2** Publication migration | Enables publishing HTML |
| 4 | **11.1** Status stages | Accurate tracking |
| 5 | **12.1** Cross-references | Quality of rendered output |
| 6 | **9.3 + B** Bulk apply + TM prep | Operational efficiency |
| 7 | **A** Validation gate | Quality assurance |
| 8 | **13.1-13.3** Cleanup + tests | Maintainability |
| 9 | **C, D, E** Metrics, queue, diffs | Team productivity |

---

## Related Documents

- [ROADMAP.md](../../ROADMAP.md) — Project-level roadmap
- [Editor Rebuild Plan](editor-improvements-jan2026.md) — Phase 8 plan (completed)
- [Simplified Workflow](simplified-workflow.md) — 5-step pipeline reference
- [HTML Pipeline Issues](../pipeline/html-pipeline-issues.md) — cnxml-render bug tracking
- [Master Pipeline](master-pipeline.md) — Complete pipeline reference
