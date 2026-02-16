# Translation Pipeline Roadmap

## Overview

Automated web interface for OpenStax translation pipeline (English → Icelandic).

| Aspect | Value |
|--------|-------|
| **Scale** | 4-5 books in 2 years, designed for 10+ |
| **Team** | Small editorial team + occasional contributors |
| **Deployment** | Local-first, server for shared access |
| **Current Phase** | Phases 9-13 complete; operational use |
| **Latest Milestone** | Phase 13 complete (2026-02-16), all pipeline issues resolved, 49 tests passing |

**Phase progression:** 1 → 2 → 2.5 → 5 → 6 → 7 → 8 ✅ → 9 ✅ → 10 ✅ → 11 ✅ → 12 ✅ → 13 ✅
**Note:** Phase 3 (Enhanced Dashboard) and Phase 4 (not defined) are deferred. Built features as needed, not by strict sequence.

---

## Architecture

### Current State

```
┌─────────────────────────────────────────────────────────────────┐
│  Web Interface (server/)                                        │
│  - Express server with SQLite session management                │
│  - Workflow wizard with step-by-step guidance                   │
│  - Issue dashboard with auto-fix + classification               │
│  - Image tracking with OneDrive integration                     │
│  - GitHub OAuth authentication                                  │
│  - Segment editor + localization editor (Phase 8, complete)      │
├─────────────────────────────────────────────────────────────────┤
│  CLI Tools (tools/)                                             │
│  - Extract-Inject-Render pipeline (cnxml-extract/inject/render) │
│  - Segment protection for MT (protect/unprotect-segments)       │
│  - TM creation (prepare-for-align.js)                           │
├─────────────────────────────────────────────────────────────────┤
│  Data Layer                                                     │
│  - SQLite for workflow sessions (server/services/session.js)    │
│  - JSON status files per chapter (books/*/chapters/ch##/)       │
│  - File-based content in books/                                 │
│  - Structure JSON + equations JSON (02-structure/)              │
│  - Translated CNXML (03-translated/)                            │
└─────────────────────────────────────────────────────────────────┘
```

### Key Constraints

| Constraint | Implication |
|------------|-------------|
| Erlendur MT is manual | Files split at 12k visible chars, download/upload cycle |
| Matecat has free API | Can automate XLIFF operations |
| Content repo is read-only | All writes via GitHub PRs |
| Small team | Simple over complex |

---

## Completed Work

### Phase 1: Foundation ✅

| Component | File | Status |
|-----------|------|--------|
| Extract-Inject-Render pipeline | `tools/cnxml-extract.js`, `cnxml-inject.js`, `cnxml-render.js` | ✅ |
| Segment protection for MT | `tools/protect-segments-for-mt.js`, `unprotect-segments.js` | ✅ |
| OpenStax fetcher | `tools/openstax-fetch.js` | ✅ |
| TM preparation | `tools/prepare-for-align.js` | ✅ |
| Express server | `server/index.js` | ✅ |
| Pipeline API | `server/routes/pipeline.js` | ✅ |
| Matecat integration | `server/services/matecat.js` | ✅ |

**Active CLI Tools:**
`cnxml-extract`, `cnxml-inject`, `cnxml-render`, `protect-segments-for-mt`, `unprotect-segments`, `openstax-fetch`, `prepare-for-align`, `validate-chapter`

**Old markdown pipeline (deleted 2026-02-16):**
43 tools in `tools/_archived/` removed. All code preserved in git history. Key deleted tools: `pipeline-runner`, `cnxml-to-md`, `chapter-assembler`, `add-frontmatter`, `compile-chapter`, `split-for-erlendur`, `apply-equations`, `clean-markdown`, `docx-to-md`, `cnxml-to-xliff`, `create-bilingual-xliff`, `md-to-xliff`, `xliff-to-md`, `xliff-to-tmx`.

### Phase 2: Guided Workflow ✅

| Component | Status | File | Lines |
|-----------|--------|------|-------|
| GitHub OAuth + JWT | ✅ | `server/services/auth.js` | 362 |
| Workflow routes + sessions | ✅ | `server/services/session.js` | 1077 |
| Issue classification | ✅ | `server/services/issueClassifier.js` | 424 |
| GitHub PR sync | ✅ | `server/services/github.js` | 371 |
| Image tracking | ✅ | `server/services/imageTracker.js` | 319 |
| HTML wizard UI | ✅ | `server/views/workflow.html` | ✅ |

**Server Routes (20 total):**
`activity`, `admin`, `auth`, `books`, `images`, `issues`, `localization-editor`, `matecat`, `modules`, `notifications`, `pipeline`, `publication`, `reviews`, `sections`, `segment-editor`, `status`, `suggestions`, `sync`, `terminology`, `views`, `workflow`

> **Note:** `editor`, `process`, and `localization` routes were removed in the 2026-02-16 pipeline retirement. Replaced by `segment-editor`, `pipeline`, and `localization-editor`.

**Phase 2.1 Features:**
- Erlendur MT file splitting (>18k chars at paragraph boundaries)
- SQLite session persistence
- Workflow uniqueness constraint (one per book/chapter)
- Content-based file identification
- Upload progress tracking

**Phase 2.2 Features:**
- Issue detection on MT upload
- Auto-fix for whitespace, typos, line endings
- Issue categories: AUTO_FIX, EDITOR_CONFIRM, BOARD_REVIEW, BLOCKED
- Issues dashboard with filtering
- Workflow blocking on BLOCKED issues

---

## Completed Phases

### Phase 2.5: Operational Improvements ✅

#### Error Recovery ✅
- [x] Workflow rollback capability
- [x] Session recovery after failures
- [x] Clear error states (FAILED, ROLLBACK_PENDING)

#### Notifications ✅
- [x] In-app notification system
- [x] Activity timeline tracking

#### Testing & Validation (Partial)
- [ ] End-to-end workflow tests
- [ ] Service integration tests
- [x] CI validation of status files

### Phase 5: Terminology & Suggestions ✅

| Component | Status | File |
|-----------|--------|------|
| Terminology database | ✅ | `server/routes/terminology.js` |
| Terminology UI | ✅ | `server/views/terminology.html` |
| Localization suggestions | ✅ | `server/routes/suggestions.js` |
| Pattern detection | ✅ | `server/services/suggestionPatterns.js` |
| Localization review UI | ✅ | `server/views/localization-review.html` |

**Features:**
- SQLite-backed terminology database with approval workflow
- Auto-detection of localization opportunities (units, cultural refs)
- Split-panel review interface for Pass 2
- Bulk suggestion accept/reject

### Phase 6: Publication Workflow ✅ (API Layer — Internals Being Migrated)

| Component | Status | File | Note |
|-----------|--------|------|------|
| Publication API | ✅ | `server/routes/publication.js` | API shape stable; internals migrated to HTML pipeline |
| 3-track system | ✅ | mt-preview, faithful, localized | Tracks carry forward |
| Readiness checks | ✅ | Validates prerequisites per track | Stage checks to be updated in Phase 11 |
| HEAD_EDITOR approval | ✅ | Required for all publications | Carries forward |

**Publication Tracks (carry forward to HTML pipeline):**
- `mt-preview`: Publish MT output immediately for early access
- `faithful`: Publish after Pass 1 review complete
- `localized`: Publish after Pass 2 localization complete

> **Note:** The old markdown assembly tools (`chapter-assembler.js`, `add-frontmatter.js`) were deleted in the 2026-02-16 pipeline retirement. Publication now uses `cnxml-inject` → `cnxml-render` → HTML output (migrated in Phase 8, finalized in Phase 10).

---

## Completed: Phase 8 — Editor Rebuild for CNXML→HTML Pipeline ✅

**Status:** COMPLETE (2026-02-05)

Rebuilt the editor layer to work with the CNXML→HTML pipeline. Replaced the old markdown editor model with segment-level editing.

See [docs/workflow/editor-improvements-jan2026.md](docs/workflow/editor-improvements-jan2026.md) for the original plan.

| Sub-phase | Commit | What |
|-----------|--------|------|
| 8.1 Segment Editor | `1021662` | DB-backed segment edits, module reviews, discussions, category tagging |
| 8.2 Terminology | `444cb33` | Inline term highlighting, consistency checking, lookup in editor |
| 8.3 Pipeline API | `ec38ab0` | Inject/render from web UI, job tracking with polling |
| 8.4 Localization Editor | `98aea7b` | 3-column Pass 2 editor (EN \| faithful IS \| localized IS) |

**What was delivered:**
- Segment-level linguistic editor at `/segment-editor` with API at `/api/segment-editor`
- Terminology integration with word-boundary matching, issue detection (missing/inconsistent terms)
- Pipeline API at `/api/pipeline` — inject, render, or full pipeline via child process spawning
- Localization editor at `/localization-editor` with API at `/api/localization-editor`
- Database migration 008 for `segment_edits`, `module_reviews`, `segment_discussions` tables

**What was deferred to later phases:**
- Apply approved edits to `03-faithful-translation/` files (→ Phase 9)
- Publication migration from markdown to HTML (→ Phase 10)
- Status schema expansion (→ Phase 11)
- Old editor retirement (→ Phase 13)

---

## Active Development

### Phase 9: Close the Write Gap ✅ (2026-02-16)

**Status:** COMPLETE

Code for 9.1-9.3 was implemented during Phase 8. Faithful track initialized from MT output (8 chapters + appendices) and rendered to HTML on 2026-02-16.

**Work:**
- [x] 9.1 — `applyApprovedEdits()`: overlay approved DB edits onto MT output, write to `03-faithful-translation/`
- [x] 9.2 — "Apply & Render" flow: apply → inject → render → preview in one click
- [x] 9.3 — Bulk chapter apply: process all approved modules in a chapter at once
- [x] Initialize faithful track from MT output for ch01-05, ch09, ch12-13, appendices
- [x] Render faithful HTML for all initialized chapters

### Phase 10: Publication Migration ✅ (2026-02-16)

**Status:** COMPLETE

Publication service was already migrated to HTML pipeline during Phase 8. Phase 10 cleanup: removed premature bulk faithful content, established module-level publication model (faithful HTML grows per-module as reviews complete), removed unused `03-editing/` directory, updated documentation.

- [x] 10.1 — Publication service uses inject→render (done in Phase 8)
- [x] 10.2 — Publication routes use Pipeline API (done in Phase 8)
- [x] 10.3 — Directory cleanup + module-level publication model

### Phase 11: Status & Schema Modernization ✅ (2026-02-16)

**Status:** COMPLETE

Migrated chapter status tracking from mixed-name 7-stage model to canonical 8-stage pipeline. One-time migration script rewrote all 22 status.json files. Schema, routes, filesystem sync, and auto-advance hooks all updated.

- [x] 11.1 — Schema migration: 8 canonical stages (extraction, mtReady, mtOutput, linguisticReview, tmCreated, injection, rendering, publication)
- [x] 11.2 — Status routes updated: PIPELINE_STAGES, removed legacy STAGE_MAPPING
- [x] 11.3 — Filesystem sync: module-based detection with canonical names
- [x] 11.4 — Auto-advance: linguisticReview marked complete when all modules have faithful files

### Phase 12: Pipeline Verification ✅ (2026-02-16)

**Status:** COMPLETE

All pipeline issues verified as resolved on the live site. Cross-references working (0 empty refs across tested chapters). Examples and exercises properly styled (vefur CSS already targets the HTML classes). Issues #5, #6, #7 closed in html-pipeline-issues.md. End-to-end test deferred to first real editorial review cycle.

### Phase 13: Cleanup & Consolidation ✅ (2026-02-16)

**Status:** COMPLETE

- [x] 13.1 — Retire old pipeline (~37,800 lines removed, commit `89b86d2`)
- [x] 13.2 — Audit services: deleted 3 orphaned files (682 lines: mtRestoration, presenceStore, notesStore)
- [x] 13.3 — Pipeline integration tests: 22 tests covering inject, render, all 8 regression issues, round-trip

See [docs/workflow/development-plan-phases-9-13.md](docs/workflow/development-plan-phases-9-13.md) for the full plan.

### Phase 3: Enhanced Dashboard (If Needed)

**Build Phase 3 only when:**
- Team grows beyond 3-4 active editors
- Managing 5+ concurrent books
- Current HTML interface becomes limiting

### Explicitly NOT Needed
- Real-time WebSocket updates (polling is fine)
- Job queue (processes run in seconds)
- Complex role hierarchy (use GitHub CODEOWNERS)
- React dashboard (HTML + htmx sufficient)

---

## Content Sync Architecture

```
Pipeline Server (processes locally)
        │
        ▼ (creates PR via server/services/github.js)
namsbokasafn-efni (source of truth)
        │
        ▼ (sync on merge)
namsbokasafn-vefur (website)
```

### Access Control via CODEOWNERS

```
# .github/CODEOWNERS
/books/efnafraedi/    @chemistry-editor
/books/liffraedi/     @biology-editor
/tools/               @pipeline-maintainer
/server/              @pipeline-maintainer
```

---

## Image Pipeline

### Storage Model

| Location | Content | Format |
|----------|---------|--------|
| OneDrive | Editable sources | PDF, EPS, AI |
| GitHub | Web-ready images | PNG (<500KB) |

### Image Tracking (Implemented)

The `server/services/imageTracker.js` provides:
- Extract image refs from CNXML
- Track status: pending → in-progress → translated → approved
- Generate OneDrive links for editable sources
- Chapter and book-level statistics

### Routes (`server/routes/images.js`)

```
GET  /api/images/:book              Book image overview
GET  /api/images/:book/:chapter     Chapter image details
POST /api/images/:book/:chapter/:id/status   Update status
POST /api/images/:book/:chapter/:id/upload   Upload translated
POST /api/images/:book/:chapter/init         Initialize from CNXML
```

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-10 | Manual Erlendur over API | API costs ISK 100k/month |
| 2025-10 | SQLite over Postgres | Single-server sufficient |
| 2026-01 | HTML wizard over React SPA | Simpler, sufficient for team size |
| 2026-01 | PR-based writes | Audit trail, review gates |
| 2026-01 | File splitting at 12k visible chars | Erlendur character limit; protect-segments-for-mt handles splitting |
| 2026-01 | 5-step workflow | Simplified from 8-step, Matecat Align handles segmentation |
| 2026-01 | SQLite terminology DB | Consistent with session storage, simple approval workflow |
| 2026-01 | 3-track publication | MT-preview enables early access while reviews continue |
| 2026-01 | Review before TM | TM is human-verified from the start |
| 2026-01 | OpenStax Option B | Keep custom pipeline + add POET; our MT workflow is novel and working |
| 2026-02 | CNXML→HTML pipeline replaces markdown assembly | Higher structure fidelity, preserved IDs, pre-rendered KaTeX, single source of truth |
| 2026-02 | Keep EasyMDE for segment editing | Markdown segments are still the editing format; only publication output changes to HTML |
| 2026-02 | Retire chapter-assembler + add-frontmatter | Two publication paths (markdown + HTML) creates maintenance burden |
| 2026-02 | Delete old pipeline code entirely | 43 archived tools + 4 server routes already broken (lazy imports to moved files). ~37,800 lines removed. Git history preserves everything. |
| 2026-02 | MathJax 3→4 upgrade | MathJax 3 TeX fonts had only 1/20 Icelandic characters; v4 New Computer Modern has full native support |
| 2026-02 | Module-level faithful publication | Faithful HTML grows per-module as reviews complete; no bulk initialization needed; reader falls back to mt-preview |
| 2026-02 | 8-stage pipeline model | extraction → mtReady → mtOutput → linguisticReview → tmCreated → injection → rendering → publication; binary complete/not-started; auto-advance on pipeline actions |

---

### Phase 7: FÁ Pilot Support ✅

| Component | Status | File |
|-----------|--------|------|
| Feedback form | ✅ | `server/views/feedback.html` |
| Feedback API | ✅ | `server/routes/feedback.js` |
| Feedback service | ✅ | `server/services/feedbackService.js` |
| Admin dashboard | ✅ | `server/views/feedback-admin.html` |
| Email notifications | ✅ | `server/services/notifications.js` |
| Teacher guide | ✅ | `server/views/teacher-guide.html` |
| Chapter compiler | ✅ | `tools/compile-chapter.js` |

**Features:**
- Public feedback form at `/feedback` (no auth required)
- Admin dashboard at `/admin/feedback` (HEAD_EDITOR role)
- SQLite-backed feedback storage with status tracking
- Email notifications to ADMIN_EMAIL on new feedback
- Teacher onboarding guide at `/for-teachers`
- Chapter compilation tool for publication workflow

**Feedback Types:**
- `translation_error`: Villa í þýðingu (auto high priority)
- `technical_issue`: Tæknilegt vandamál
- `improvement`: Tillaga að bætingu
- `other`: Annað

---

## Architectural Decisions

### AD-1: End-of-Chapter Content Extraction (2026-01-19, updated 2026-02)

**Context:** OpenStax CNXML modules contain embedded tagged content that needs to be compiled into separate end-of-chapter pages for the web reader.

**Original decision:** Extract using `compile-chapter.js` at the publication step.

**Updated decision:** End-of-chapter content extraction is now handled by `cnxml-render.js` as part of the HTML rendering pipeline. The `compile-chapter.js` tool is deprecated.

**Usage:**
```bash
# Render chapter (includes end-of-chapter extraction)
node tools/cnxml-render.js --chapter 2 --track faithful
```

### AD-2: CNXML→HTML Pipeline (2026-02)

**Context:** The original pipeline converted CNXML → markdown → assembled markdown for publication. The web reader (vefur) then rendered markdown to HTML at request time. This involved multiple lossy transformations and lost structural information (IDs, semantic markup, note types).

**Decision:** Replace the markdown assembly publication path with a CNXML→HTML rendering pipeline. Markdown remains as an intermediary format for machine translation only.

**Pipeline:**
```
CNXML → cnxml-extract → EN segments (markdown) → MT → IS segments → review
     → cnxml-inject → translated CNXML → cnxml-render → semantic HTML
```

**Rationale:**
- Full preservation of CNXML IDs for cross-referencing
- Higher-fidelity structure (notes, examples, exercises retain semantic markup)
- Pre-rendered KaTeX equations (faster page loads)
- Single source of truth (CNXML) through the entire pipeline
- Vefur serves pre-rendered HTML instead of processing markdown

**Tools retired:** `chapter-assembler.js`, `add-frontmatter.js`, `compile-chapter.js`, `pipeline-runner.js`, `cnxml-to-md.js` (plus 38 others — all deleted from `tools/_archived/` on 2026-02-16)

---

## Next Steps

### Current Priority: Operational Use

Phases 9-13 are complete. The pipeline is fully verified with 49 automated tests. Next priorities are editorial workflow items from the "Ideas Beyond the Roadmap" section in [docs/workflow/development-plan-phases-9-13.md](docs/workflow/development-plan-phases-9-13.md).

### Ongoing
1. [ ] Complete Pass 1 reviews for chapters 1-4 (using segment editor)
2. [ ] Publish Ch 1 as `faithful` (faithful HTML now available)
3. [ ] End-to-end workflow tests
4. [ ] Session cleanup job for stale workflows

### Post-Stabilization: OpenStax Integration Evaluation

See [docs/technical/openstax-tools-analysis.md](docs/technical/openstax-tools-analysis.md) for full analysis.

**Recommended: Option B (Incremental Adoption)**
- [ ] Install POET VSCode extension for CNXML validation
- [ ] Study osbooks-fizyka-bundle structure for best practices

**Future evaluation:**
- [ ] Test Enki locally for PDF generation
- [ ] Consider creating osbooks-efnafraedi-bundle for long-term compatibility
