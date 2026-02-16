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
| `03-faithful-translation/` | ch01-ch05, ch09, ch12-ch13, appendices | Initialized from MT output (2026-02-16) |
| `03-translated/faithful/` | ch01-ch05, ch09, ch12-ch13, appendices | Translated CNXML from injection |
| `04-localized-content/` | **empty** | Pass 2 not started |
| `05-publication/mt-preview/` | ch01 | HTML rendered |
| `05-publication/faithful/` | ch01-ch05, ch09, ch12-ch13, appendices | Faithful HTML rendered (2026-02-16) |

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

**Status:** COMPLETE. Code for 9.1-9.3 was implemented in Phase 8. Faithful track initialized from MT output and rendered to HTML for 8 chapters + appendices on 2026-02-16.

**Initialization (2026-02-16):**
- Initialized `03-faithful-translation/` from `02-mt-output/` for ch01-ch05, ch09, ch12-ch13, appendices (50 segment files, 9,854 segments)
- Injected faithful track → `03-translated/faithful/` (50 CNXML files)
- Rendered faithful HTML → `05-publication/faithful/` (101 HTML files across 9 directories including appendices)
- The faithful track is now populated with MT baseline content. As editors review and approve segments via the segment editor, `applyApprovedEdits()` overwrites these files with human-reviewed content.

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

## Phase 10: Publication Migration

**Goal:** Replace markdown assembly with HTML pipeline output.

### 10.1 — Rewrite Publication Service

The current `publicationService.js` (1,104 lines) still has markdown assembly code, but the tools it depended on (`chapter-assembler.js`, `add-frontmatter.js`) were deleted in the Phase 13.1 cleanup. Replace the core publication logic:

| Track | Source | Pipeline |
|-------|--------|----------|
| mt-preview | `02-mt-output/` | inject → render → `05-publication/mt-preview/` |
| faithful | `03-faithful-translation/` | inject → render → `05-publication/faithful/` |
| localized | `04-localized-content/` | inject → render → `05-publication/localized/` |

Existing features that carry forward unchanged:
- Readiness checks (validation before publish)
- HEAD_EDITOR approval gates
- Three-track system
- Activity logging

### 10.2 — Update Publication Routes

`publication.js` keeps its API shape. The "publish" action becomes:
validate readiness → inject → render → write to publication dir → update status → log activity.

### 10.3 — Re-render Existing Content

Re-render Chapter 1 MT-preview and generate faithful HTML once Phase 9 provides the files.

**Files to modify:**
- `server/services/publicationService.js` — rewrite core
- `server/routes/publication.js` — update to call new service

---

## Phase 11: Status & Schema Modernization

**Goal:** Pipeline tracking reflects reality.

### 11.1 — Expand Pipeline Stages

Current 5-stage model is outdated. Update to 8 stages:

| Stage | Step | Description |
|-------|------|-------------|
| `extraction` | 1 | CNXML → segments + structure |
| `mtReady` | 1b | Segments protected for MT |
| `mtOutput` | 2 | MT output received |
| `linguisticReview` | 3 | Pass 1 review complete |
| `tmCreated` | 4 | TM created via Matecat Align |
| `injection` | 5a | Translated CNXML produced |
| `rendering` | 5b | HTML produced |
| `publication` | 5c | Published to web |

**Files to modify:**
- `schemas/chapter-status.schema.json`
- `server/routes/status.js` — update `PIPELINE_STAGES` and mapper

### 11.2 — Chapter Files Tracking

Add tracking for new file types in `chapterFilesService.js`:

| File Type | Directory |
|-----------|-----------|
| `structure` | `02-structure/` |
| `equations` | `02-structure/` |
| `translated-cnxml` | `03-translated/` |
| `rendered-html` | `05-publication/` |

### 11.3 — Auto-Advance Status

When pipeline actions complete, automatically update chapter status:
- Edits applied → `linguisticReview: complete`
- Inject succeeds → `injection: complete`
- Render succeeds → `rendering: complete`
- Published → `publication: complete`

**Files to modify:**
- `server/services/chapterFilesService.js`
- `server/services/pipelineService.js` — add status updates on completion
- `server/migrations/009-*.js` or `010-*.js`

---

## Phase 12: Pipeline Verification

**Goal:** Prove the end-to-end flow works and fix remaining issues.

### 12.1 — Cross-Reference Resolution

Fix `<link target-id="..."/>` in `cnxml-render.js`:
- Build a chapter-wide ID→label registry (cnxml-render already tracks figure/table numbering)
- Resolve `target-id` attributes to their numbered labels
- Render as linked text: "Figure 5.3" instead of "()"

### 12.2 — Verify Examples & Exercises

Investigate issues #5 and #6 to determine whether:
- cnxml-render outputs wrong HTML structure (fix in render), or
- vefur CSS doesn't target the existing structure (fix in vefur), or
- both

This requires rendering a chapter with examples/exercises and inspecting the output against vefur expectations.

### 12.3 — End-to-End Test

Process one chapter completely through the web UI:
1. Open segment editor → review module → approve edits
2. Apply edits (Phase 9) → faithful files written
3. Inject + render → HTML produced
4. Publish → verify in vefur
5. Document any issues found

---

## Phase 13: Cleanup & Consolidation

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

### 13.2 — Audit Remaining Services

The server now has ~20 route files and ~30 service files. Remaining candidates for cleanup:
- `editorHistory.js` — tracked old editor versions, likely dead
- `mtRestoration.js` — markdown-specific restoration, not imported anywhere
- `presenceStore.js`, `notesStore.js` — only used by deleted `editor.js`, now orphaned
- Parts of `publicationService.js` — markdown assembly (to be replaced in Phase 10)

### 13.3 — Core Pipeline Tests

Add tests for `cnxml-inject.js` and `cnxml-render.js`:
- Round-trip tests: inject known segments, verify output CNXML contains them
- Render tests: render known CNXML, verify HTML structure
- Regression tests for the 5 fixed pipeline issues

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
