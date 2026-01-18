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
├─────────────────────────────────────────────────────────────────┤
│  CLI Tools (tools/)                                             │
│  - 19 tools, all verified working                               │
│  - Pipeline orchestration via pipeline-runner.js                │
│  - CNXML/DOCX → MD → XLIFF → TMX conversions                    │
├─────────────────────────────────────────────────────────────────┤
│  Data Layer                                                     │
│  - SQLite for workflow sessions (server/services/session.js)    │
│  - JSON status files per chapter (books/*/chapters/ch##/)       │
│  - File-based content in books/                                 │
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

| Component | File | Lines |
|-----------|------|-------|
| Pipeline orchestrator | `tools/pipeline-runner.js` | ✅ |
| OpenStax fetcher | `tools/openstax-fetch.js` | ✅ |
| 17 additional CLI tools | `tools/*.js` | ✅ |
| Express server | `server/index.js` | ✅ |
| Processing API | `server/routes/process.js` | ✅ |
| Matecat integration | `server/services/matecat.js` | 537 |

**CLI Tools (19 total):**
`add-frontmatter`, `apply-equations`, `clean-markdown`, `cnxml-math-extract`, `cnxml-to-md`, `cnxml-to-xliff`, `docx-to-md`, `export-parallel-corpus`, `fix-figure-captions`, `md-to-xliff`, `openstax-fetch`, `pipeline-runner`, `process-chapter`, `repair-directives`, `replace-math-images`, `strip-docx-to-txt`, `validate-chapter`, `xliff-to-md`, `xliff-to-tmx`

### Phase 2: Guided Workflow ✅

| Component | Status | File | Lines |
|-----------|--------|------|-------|
| GitHub OAuth + JWT | ✅ | `server/services/auth.js` | 362 |
| Workflow routes + sessions | ✅ | `server/services/session.js` | 1077 |
| Issue classification | ✅ | `server/services/issueClassifier.js` | 424 |
| GitHub PR sync | ✅ | `server/services/github.js` | 371 |
| Image tracking | ✅ | `server/services/imageTracker.js` | 319 |
| HTML wizard UI | ✅ | `server/views/workflow.html` | ✅ |

**Server Routes (11 total):**
`auth`, `books`, `images`, `issues`, `matecat`, `modules`, `process`, `status`, `sync`, `views`, `workflow`

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

## Active Development

### Phase 2.5: Operational Improvements

Before considering Phase 3, add operational necessities:

#### Error Recovery (Priority: High)
- [ ] Workflow rollback capability
- [ ] Session recovery after failures
- [ ] Clear error states (FAILED, ROLLBACK_PENDING)
- **Why:** Data loss erodes trust

#### Notifications (Priority: Medium)
- [ ] Email editors when action needed
- [ ] Simple webhook for integrations
- **Why:** Editors need to know when work awaits

#### Testing & Validation (Priority: Medium)
- [ ] End-to-end workflow tests
- [ ] Service integration tests
- [ ] CI validation of status files

---

## Phase 3: Enhanced Dashboard (If Needed)

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
| 2026-01 | File splitting at 18k | Erlendur character limit |

---

## Next Steps

### Immediate
1. [ ] Add error recovery states to workflow sessions
2. [ ] Test full workflow end-to-end with real chapter
3. [ ] Document server setup for production deployment

### Short-term
1. [ ] Add email notification service
2. [ ] Create image manifest from existing CNXML
3. [ ] Session cleanup job for stale workflows

### Before Phase 3 Consideration
1. [ ] Run pilot with FÁ teachers (Jan 2026)
2. [ ] Gather feedback on current HTML interface
3. [ ] Evaluate if team growth warrants dashboard
