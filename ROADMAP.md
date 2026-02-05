# Translation Pipeline Roadmap

## Overview

Automated web interface for OpenStax translation pipeline (English → Icelandic).

| Aspect | Value |
|--------|-------|
| **Scale** | 4-5 books in 2 years, designed for 10+ |
| **Team** | Small editorial team + occasional contributors |
| **Deployment** | Local-first, server for shared access |

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
│  ⚠ Editor needs rebuild for new pipeline (see Phase 8)          │
├─────────────────────────────────────────────────────────────────┤
│  CLI Tools (tools/)                                             │
│  - Extract-Inject-Render pipeline (cnxml-extract/inject/render) │
│  - Segment protection for MT (protect/restore-segments)         │
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
| Erlendur MT is manual | Files split at 18k chars, download/upload cycle |
| Matecat has free API | Can automate XLIFF operations |
| Content repo is read-only | All writes via GitHub PRs |
| Small team | Simple over complex |

---

## Completed Work

### Phase 1: Foundation ✅

| Component | File | Status |
|-----------|------|--------|
| Extract-Inject-Render pipeline | `tools/cnxml-extract.js`, `cnxml-inject.js`, `cnxml-render.js` | ✅ |
| Segment protection for MT | `tools/protect-segments-for-mt.js`, `restore-segments-from-mt.js` | ✅ |
| OpenStax fetcher | `tools/openstax-fetch.js` | ✅ |
| TM preparation | `tools/prepare-for-align.js` | ✅ |
| Express server | `server/index.js` | ✅ |
| Processing API | `server/routes/process.js` | ✅ |
| Matecat integration | `server/services/matecat.js` | ✅ |

**Active CLI Tools:**
`cnxml-extract`, `cnxml-inject`, `cnxml-render`, `protect-segments-for-mt`, `restore-segments-from-mt`, `openstax-fetch`, `prepare-for-align`, `validate-chapter`

**Deprecated (old markdown pipeline):**
`pipeline-runner`, `cnxml-to-md`, `chapter-assembler`, `add-frontmatter`, `compile-chapter`, `split-for-erlendur`, `apply-equations`, `clean-markdown`, `docx-to-md`, `cnxml-to-xliff`, `create-bilingual-xliff`, `md-to-xliff`, `xliff-to-md`, `xliff-to-tmx`

### Phase 2: Guided Workflow ✅

| Component | Status | File | Lines |
|-----------|--------|------|-------|
| GitHub OAuth + JWT | ✅ | `server/services/auth.js` | 362 |
| Workflow routes + sessions | ✅ | `server/services/session.js` | 1077 |
| Issue classification | ✅ | `server/services/issueClassifier.js` | 424 |
| GitHub PR sync | ✅ | `server/services/github.js` | 371 |
| Image tracking | ✅ | `server/services/imageTracker.js` | 319 |
| HTML wizard UI | ✅ | `server/views/workflow.html` | ✅ |

**Server Routes (21 total):**
`activity`, `admin`, `auth`, `books`, `editor`, `images`, `issues`, `localization`, `matecat`, `modules`, `notifications`, `process`, `publication`, `reviews`, `sections`, `status`, `suggestions`, `sync`, `terminology`, `views`, `workflow`

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

### Phase 6: Publication Workflow ✅ (Markdown — Being Retired)

| Component | Status | File | Note |
|-----------|--------|------|------|
| Publication API | ✅ | `server/routes/publication.js` | Needs rebuild for HTML output |
| 3-track system | ✅ | mt-preview, faithful, localized | Tracks carry forward |
| Readiness checks | ✅ | Validates prerequisites per track | Needs updated stage checks |
| HEAD_EDITOR approval | ✅ | Required for all publications | Carries forward |

**Publication Tracks (carry forward to HTML pipeline):**
- `mt-preview`: Publish MT output immediately for early access
- `faithful`: Publish after Pass 1 review complete
- `localized`: Publish after Pass 2 localization complete

> **Note:** The markdown publication path (`chapter-assembler.js` + `add-frontmatter.js`) will be replaced by `cnxml-inject` → `cnxml-render` → HTML output. See Phase 8.

---

## Active Development

### Phase 8: Editor Rebuild for CNXML→HTML Pipeline

**Status:** NOT STARTED

The CNXML→HTML pipeline (with markdown as an intermediary for MT) is the way forward. The old markdown-assembly publication path will be retired. This requires rebuilding the editor's integration with the pipeline.

See [docs/workflow/editor-improvements-jan2026.md](docs/workflow/editor-improvements-jan2026.md) for the full plan.

**Summary of work:**
- Add API endpoints for `cnxml-inject` and `cnxml-render`
- Update publication routes to produce HTML instead of assembled markdown
- Update editor to work with segment files (preserve markers and placeholders)
- Add HTML preview panel to editor
- Update database schema for new file types (structure, translated CNXML, rendered HTML)
- Update status schema with inject/render stages
- Retire `chapter-assembler.js`, `add-frontmatter.js`, `compile-chapter.js`
- Update vefur to serve pre-rendered HTML instead of rendering markdown

### Phase 3: Enhanced Dashboard (If Needed)

**Build Phase 3 only when:**
- Team grows beyond 3-4 active editors
- Managing 5+ concurrent books
- Current HTML interface becomes limiting

### Possible Features
- Multi-book status overview
- Role-based access (if team grows)
- Batch operations

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
| 2026-01 | File splitting at 14k visible chars | Erlendur character limit; protect-segments-for-mt handles splitting |
| 2026-01 | 5-step workflow | Simplified from 8-step, Matecat Align handles segmentation |
| 2026-01 | SQLite terminology DB | Consistent with session storage, simple approval workflow |
| 2026-01 | 3-track publication | MT-preview enables early access while reviews continue |
| 2026-01 | Review before TM | TM is human-verified from the start |
| 2026-01 | OpenStax Option B | Keep custom pipeline + add POET; our MT workflow is novel and working |
| 2026-02 | CNXML→HTML pipeline replaces markdown assembly | Higher structure fidelity, preserved IDs, pre-rendered KaTeX, single source of truth |
| 2026-02 | Keep EasyMDE for segment editing | Markdown segments are still the editing format; only publication output changes to HTML |
| 2026-02 | Retire chapter-assembler + add-frontmatter | Two publication paths (markdown + HTML) creates maintenance burden |

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

**Tools retired:** `chapter-assembler.js`, `add-frontmatter.js`, `compile-chapter.js`, `pipeline-runner.js`, `cnxml-to-md.js`

---

## Next Steps

### Current Priority: Editor Rebuild (Phase 8)

See [docs/workflow/editor-improvements-jan2026.md](docs/workflow/editor-improvements-jan2026.md) for the full plan.

1. [ ] Add `/api/process/inject` and `/api/process/render` endpoints
2. [ ] Update publication routes to use inject+render → HTML
3. [ ] Update editor content loading for segment files
4. [ ] Add HTML preview panel to editor
5. [ ] Update database schema and status stages
6. [ ] Retire old markdown publication tools
7. [ ] Update vefur to serve pre-rendered HTML

### Pipeline Stabilization
1. [ ] Fix open cnxml-render issues (examples, exercises, cross-refs) — see [html-pipeline-issues.md](docs/pipeline/html-pipeline-issues.md)
2. [ ] End-to-end test: extract → MT → review → inject → render → publish for one chapter
3. [ ] Re-render chapters 1-4 through new pipeline

### Ongoing
1. [ ] Complete Pass 1 reviews for chapters 2-4
2. [ ] Publish Ch 1 as `faithful` (reviewed, HTML version)
3. [ ] Session cleanup job for stale workflows
4. [ ] End-to-end workflow tests

### Post-Stabilization: OpenStax Integration Evaluation

See [docs/technical/openstax-tools-analysis.md](docs/technical/openstax-tools-analysis.md) for full analysis.

**Recommended: Option B (Incremental Adoption)**
- [ ] Install POET VSCode extension for CNXML validation
- [ ] Study osbooks-fizyka-bundle structure for best practices

**Future evaluation:**
- [ ] Test Enki locally for PDF generation
- [ ] Consider creating osbooks-efnafraedi-bundle for long-term compatibility
