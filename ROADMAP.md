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
│  - 21 tools (16 active, 5 deprecated)                           │
│  - Pipeline orchestration via pipeline-runner.js                │
│  - CNXML → MD, Matecat Align for TM creation                    │
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

**CLI Tools (21 total, 16 active):**
Active: `add-frontmatter`, `apply-equations`, `clean-markdown`, `cnxml-math-extract`, `cnxml-to-md`, `docx-to-md`, `export-parallel-corpus`, `fix-figure-captions`, `openstax-fetch`, `pipeline-runner`, `prepare-for-align`, `process-chapter`, `repair-directives`, `replace-math-images`, `split-for-erlendur`, `strip-docx-to-txt`, `validate-chapter`
Deprecated: `cnxml-to-xliff`, `create-bilingual-xliff`, `md-to-xliff`, `xliff-to-md`, `xliff-to-tmx`

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

### Phase 6: Publication Workflow ✅

| Component | Status | File |
|-----------|--------|------|
| Publication API | ✅ | `server/routes/publication.js` |
| 3-track system | ✅ | mt-preview, faithful, localized |
| Readiness checks | ✅ | Validates prerequisites per track |
| HEAD_EDITOR approval | ✅ | Required for all publications |

**Publication Tracks:**
- `mt-preview`: Publish MT output immediately for early access
- `faithful`: Publish after Pass 1 review complete
- `localized`: Publish after Pass 2 localization complete

---

## Active Development

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
| 2026-01 | 5-step workflow | Simplified from 8-step, Matecat Align handles segmentation |
| 2026-01 | SQLite terminology DB | Consistent with session storage, simple approval workflow |
| 2026-01 | 3-track publication | MT-preview enables early access while reviews continue |
| 2026-01 | Review before TM | TM is human-verified from the start |

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

### AD-1: End-of-Chapter Content Extraction (2026-01-19)

**Context:** OpenStax CNXML modules contain embedded tagged content that needs to be compiled into separate end-of-chapter pages for the web reader.

**Decision:** Extract and compile end-of-chapter pages in **namsbokasafn-efni** at the publication step (Step 5), NOT in namsbokasafn-vefur.

**Implementation:**
- `tools/compile-chapter.js` extracts tagged content from section files
- Creates clean section files (main content only)
- Compiles end-of-chapter pages (summary, exercises, key-terms, key-equations)

**Usage:**
```bash
# Compile for MT preview track
node tools/compile-chapter.js efnafraedi 2 --track mt-preview

# Compile for faithful track (after Pass 1 review)
node tools/compile-chapter.js efnafraedi 1 --track faithful
```

---

## Next Steps

### Immediate
1. [x] Add error recovery states to workflow sessions
2. [x] Implement terminology database
3. [x] Implement localization suggestions
4. [x] Implement publication workflow
5. [x] Implement feedback collection system
6. [x] Create teacher guide page
7. [ ] Test full workflow end-to-end with real chapter

### Short-term
1. [x] Email notification service (integrated with feedback)
2. [ ] Session cleanup job for stale workflows
3. [ ] End-to-end workflow tests
4. [ ] Usage analytics (server-side logging)

### Current Priority: Pilot at FÁ (January 2026)
1. [x] MT preview publishing for chapters 1-4
2. [ ] Publish Ch 1 as `faithful` (reviewed version)
3. [x] Feedback collection system deployed
4. [x] Teacher guide available at `/for-teachers`
5. [ ] Complete Pass 1 reviews for chapters 2-4 (post-pilot)

### Pilot Checklist
- [x] Feedback form at `/feedback`
- [x] Admin feedback dashboard at `/admin/feedback`
- [x] Teacher guide at `/for-teachers`
- [x] Email notifications for feedback
- [ ] Sync content to vefur: `npm run sync-content`
- [ ] Verify all chapter links work
- [ ] Test on mobile devices
- [ ] Deploy to Linode production
