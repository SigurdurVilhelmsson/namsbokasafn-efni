# Translation Pipeline Roadmap

## Overview

Automated web interface for the OpenStax translation pipeline, from single-file processing to full book management with guided workflows.

## Key Constraints

- **Deployment:** Local first, designed for eventual server deployment
- **Erlendur MT:** Manual only (API costs ISK 100k/month - prohibitive)
- **Matecat:** Free REST API available, can self-host
- **Server Access:** Read-only to content repo; all writes via PRs
- **Scale Target:** 4-5 books in 2 years, designed for eventual 10+ books

---

## Architecture: Three-Tier Progressive Enhancement

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 3: Full Dashboard (Phase 3)                               │
│  - React dashboard with real-time status                        │
│  - OpenStax book browser (fetch from GitHub)                    │
│  - Job queue for background processing                          │
│  - Claude agent integration                                     │
├─────────────────────────────────────────────────────────────────┤
│  TIER 2: Guided Workflow (Phase 2)                              │
│  - Session-based multi-step wizard                              │
│  - File upload/download handling                                │
│  - Status tracking integration                                  │
│  - Simple HTML UI                                               │
├─────────────────────────────────────────────────────────────────┤
│  TIER 1: Simple Automation (Phase 1)                            │
│  - pipeline-runner.js orchestrator                              │
│  - REST API for single-file processing                          │
│  - Module fetching from OpenStax GitHub                         │
├─────────────────────────────────────────────────────────────────┤
│  FOUNDATION (Exists)                                            │
│  - 17 CLI tools (cnxml-to-md, md-to-xliff, xliff-to-tmx, etc.) │
│  - Status tracking (status.json + schema validation)            │
│  - process-chapter.js orchestration pattern                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation Enhancement - COMPLETE

**Goal:** Chain existing tools into a single orchestrator + minimal API

### Deliverables

| Component | Status | File |
|-----------|--------|------|
| Pipeline orchestrator | ✅ | `tools/pipeline-runner.js` |
| OpenStax module fetcher | ✅ | `tools/openstax-fetch.js` |
| Express server | ✅ | `server/index.js` |
| Processing API | ✅ | `server/routes/process.js` |
| Matecat integration | ✅ | `server/services/matecat.js` |

### API Endpoints

```
POST /api/process/cnxml     Process CNXML file
POST /api/process/module/:id Process by module ID
GET  /api/status/:book      Get pipeline status
GET  /api/modules           List known modules
```

---

## Phase 2: Guided Workflow + Session Management - IN PROGRESS

**Goal:** Step-by-step web wizard with session persistence and file tracking

### Component Status

| Component | Status | Notes |
|-----------|--------|-------|
| **2A: GitHub OAuth + JWT** | ✅ | `server/services/auth.js`, `server/middleware/requireAuth.js` |
| **2B: Workflow routes + sessions** | ✅ | SQLite persistence, uniqueness constraint |
| **2C: Issue classification** | ⏳ | `server/services/issueClassifier.js` - pending |
| **2D: GitHub PR sync** | ⏳ | `server/services/github.js` - pending |
| **2E: Image tracking** | ⏳ | `server/services/imageTracker.js` - pending |
| **2F: HTML wizard UI** | ✅ | `server/views/workflow.html` |

### Phase 2.1 Features (Complete)

- **Erlendur MT File Splitting**
  - Automatic splitting of files >18,000 characters at paragraph boundaries
  - Split files named with part indicators: `2-6(a).en.md`, `2-6(b).en.md`
  - Erlendur-style headers with `hluti: „a"` for part tracking
  - Automatic recombination after upload

- **Workflow Session Management**
  - SQLite persistence (survives server restarts)
  - Workflow uniqueness constraint: one active workflow per book/chapter
  - Content-based file identification (parses metadata from uploaded files)
  - Section-based file naming (`2-1.en.md`) instead of module IDs
  - Upload progress tracking with matched/unmatched file detection

- **UI Improvements**
  - File checklist shows friendly names (`2.6: Ionic and Molecular Compounds`)
  - Download/upload filename hints for each expected file
  - Warning banner when files have been split
  - Existing workflow dialog when attempting duplicate workflows

### Workflow API

```
POST /api/workflow/start              Start new workflow session
GET  /api/workflow/sessions           List active sessions
GET  /api/workflow/:sessionId         Get session details
POST /api/workflow/:sessionId/upload  Upload translated files
POST /api/workflow/:sessionId/advance Move to next step
GET  /api/workflow/:sessionId/download-all Download all files as ZIP
```

### Issue Classification (Pending)

```javascript
// services/issueClassifier.js
const ISSUE_CATEGORIES = {
  AUTO_FIX: {
    patterns: ['whitespace', 'trailing-space', 'line-ending', 'known-typo'],
    action: 'apply',
    approver: null
  },
  EDITOR_CONFIRM: {
    patterns: ['terminology-suggestion', 'minor-edit', 'formatting-choice'],
    action: 'queue',
    approver: 'head-editor'
  },
  BOARD_REVIEW: {
    patterns: ['new-terminology', 'localization-policy', 'cultural-adaptation'],
    action: 'escalate',
    approver: 'editorial-board'
  },
  BLOCKED: {
    patterns: ['copyright', 'major-error', 'unclear-source'],
    action: 'halt',
    approver: 'manual'
  }
};
```

### User Flow

1. User selects book and chapter
2. System generates MD files for Erlendur (splits large files automatically)
3. User downloads, translates via Erlendur MT, uploads results
4. System recombines split files, generates XLIFF for Matecat
5. User downloads XLIFF, reviews in Matecat, uploads reviewed XLIFF
6. System classifies issues, applies auto-fixes
7. User reviews flagged issues
8. System generates final outputs (TMX, faithful MD)
9. User initiates sync → Creates PR to repository

---

## Phase 3: Full Dashboard + Multi-Book Management - FUTURE

**Goal:** Complete project management interface with role-based access

### Planned Components

```
dashboard/                    # React frontend
├── src/
│   ├── components/
│   │   ├── StatusTable.jsx   # Chapter progress grid
│   │   ├── ActionQueue.jsx   # Pending actions list
│   │   ├── BookBrowser.jsx   # OpenStax book selector
│   │   ├── IssueQueue.jsx    # Issue review interface
│   │   └── SyncStatus.jsx    # PR and sync status
│   └── hooks/
│       ├── useStatus.js
│       └── useWebSocket.js
```

### Features

- **Book Browser:** Fetch collection.xml from OpenStax, list all modules
- **Status Grid:** Visual chapter progress per book
- **Action Queue:** Pending tasks with download/upload buttons
- **Issue Queue:** Categorized issues awaiting review
- **Real-time Updates:** WebSocket for live progress
- **Job Queue:** Background processing for large operations
- **Editor Panel:** Approve/reject, assign reviewers

### Role-Based Access

| Role | Permissions |
|------|-------------|
| **Viewer** | Read status, download published content |
| **Contributor** | Upload translations, report issues |
| **Editor** | Approve content, resolve issues, create PRs |
| **Head Editor** | Manage book, assign editors, approve PRs |
| **Admin** | Manage all books, system configuration |

---

## Content Sync Architecture

### Sync Model: Read-Only Server + PR-Based Writes

```
┌─────────────────────────────────────────────────────────────────┐
│  Pipeline Server                                                │
│  - Processes CNXML → MD → XLIFF                                 │
│  - READ-ONLY access to namsbokasafn-efni                        │
│  - Outputs to local pipeline-output/ directory                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (PR-based write)
┌─────────────────────────────────────────────────────────────────┐
│  namsbokasafn-efni (Source of Truth)                            │
│  - Branch protection on main                                    │
│  - CODEOWNERS per book directory                                │
│  - Required reviews before merge                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (sync after merge)
┌─────────────────────────────────────────────────────────────────┐
│  namsbokasafn-vefur (Website)                                   │
│  - Pulls from 05-publication/ only                              │
│  - Only syncs files with approved: true                         │
└─────────────────────────────────────────────────────────────────┘
```

### Per-Book Access Control

```
# .github/CODEOWNERS
/books/efnafraedi/    @chemistry-head-editor
/books/liffraedi/     @biology-head-editor
/books/edlisfraedi/   @physics-head-editor
/tools/               @pipeline-maintainer
/server/              @pipeline-maintainer
```

---

## Image Pipeline (Future)

### Storage Architecture

```
Menntaský OneDrive:
/Námsbókasafn/
├── efnafraedi/images-editable/
│   └── ch01/
│       ├── fig-1.1.pdf    (Acrobat editable)
│       └── fig-1.2.eps    (Inkscape editable)

GitHub (web-ready only):
books/efnafraedi/05-publication/images/
└── ch01/
    ├── fig-1.1.png    (<500KB, translated)
    └── fig-1.2.png
```

### Workflow

1. Pipeline extracts image references from CNXML
2. Dashboard shows: "Chapter 1: 12 images, 8 done, 4 pending"
3. Editor clicks pending → Links to OneDrive editable source
4. Editor edits in Acrobat/Inkscape
5. Editor exports PNG, uploads via dashboard
6. Head editor approves PR
7. Website pulls updated images

---

## Directory Structure

```
namsbokasafn-efni/
├── tools/                    # CLI tools
│   ├── pipeline-runner.js    # Orchestrator
│   ├── cnxml-to-md.js        # CNXML → Markdown
│   ├── md-to-xliff.js        # Markdown → XLIFF
│   └── ...
├── server/                   # Web server
│   ├── index.js
│   ├── routes/
│   ├── services/
│   └── views/
├── dashboard/                # React frontend (Phase 3)
├── scripts/                  # Status management scripts
└── books/                    # Content and status files
```

---

## Next Steps

### Immediate (Phase 2 completion)

1. Implement issue classification service
2. Add GitHub PR creation for sync
3. Add image tracking routes
4. Complete Matecat upload step in workflow

### Near-term (Phase 3 start)

1. React dashboard skeleton
2. WebSocket for real-time updates
3. Multi-book status view
