# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

## [0.5.0] - 2026-02-05

### Added

#### Phase 8: Editor Rebuild for CNXML→HTML Pipeline ✅ COMPLETE

Complete rebuild of the editor layer to work with CNXML→HTML rendering pipeline. This is the largest architectural change since project inception.

**8.1 Segment Editor** (Commit `1021662`)
- `/segment-editor` route with segment-level linguistic editing
- Database tables: `segment_edits`, `module_reviews`, `segment_discussions`
- Per-module review workflow with category tagging (grammar, terminology, style, etc.)
- Discussion threads on specific segments
- "Mark as Reviewed" approval flow for head editors
- API at `/api/segment-editor` with GET/POST/PUT endpoints

**8.2 Terminology Integration** (Commit `444cb33`)
- Inline term highlighting in segment editor
- Word-boundary matching for accurate term detection
- Consistency checking (missing terms, inconsistent translations)
- Lookup in editor with term details from terminology database
- Issue detection for terminology violations

**8.3 Pipeline API** (Commit `ec38ab0`)
- `/api/pipeline` routes for inject, render, and full pipeline operations
- Child process spawning with job tracking
- Polling-based status updates for long-running operations
- Integration with cnxml-inject.js and cnxml-render.js
- One-click "inject → render" flow for preview

**8.4 Localization Editor** (Commit `98aea7b`)
- `/localization-editor` route for Pass 2 editing
- 3-column layout: EN source | faithful IS | localized IS
- Side-by-side comparison for localization context
- API at `/api/localization-editor`
- Auto-detection of localization opportunities (units, cultural refs)

**Database Migration 008**
- Added segment editing tables
- Added review tracking tables
- Added discussion threading

**Tools Updated**
- `cnxml-inject.js` — now callable from server API
- `cnxml-render.js` — now callable from server API
- `prepare-for-align.js` — updated for segment-based workflow

**Documentation Added**
- `docs/workflow/editor-improvements-jan2026.md` — Phase 8 implementation plan
- `docs/workflow/development-plan-phases-9-13.md` — Post-Phase 8 roadmap
- `docs/pipeline/html-pipeline-issues.md` — Issue tracking for cnxml-render

**Deferred to Future Phases**
- Apply approved edits to `03-faithful-translation/` files (→ Phase 9)
- Publication migration from markdown to HTML (→ Phase 10)
- Status schema expansion to 8-stage pipeline (→ Phase 11)
- Old markdown editor retirement (→ Phase 13)

### Deprecated

**Tools Retired (Markdown Pipeline)**
- `chapter-assembler.js` — replaced by cnxml-render HTML output
- `add-frontmatter.js` — frontmatter not needed in HTML
- `compile-chapter.js` — end-of-chapter extraction now in cnxml-render
- `cnxml-to-md.js` — markdown is intermediary format only, not publication format

**Why Deprecated:** Phase 8 changes publication output from assembled markdown to semantic HTML rendered directly from CNXML. The markdown assembly workflow is no longer used.

### Added

#### Translation Pipeline Server - Phase 2.2 (Issue Classification Integration)
- **Automatic Issue Detection on Upload**
  - Runs `classifyIssues()` on every MT file upload
  - Auto-applies AUTO_FIX issues (whitespace, double spaces, line endings, typos)
  - Stores remaining issues in session for review
  - Blocks workflow advancement if BLOCKED issues exist

- **Issue Categories**
  - AUTO_FIX: Whitespace, typos, line endings (applied automatically)
  - EDITOR_CONFIRM: Terminology, Icelandic quotes, formatting (needs review)
  - BOARD_REVIEW: Unit conversions (F→C, lbs→kg), US references (needs discussion)
  - BLOCKED: Unclosed brackets, missing content (prevents progress)

- **Issues API Enhancement**
  - `GET /api/issues/session/:sessionId` - Get issues for specific session
  - `POST /api/issues/session/:sessionId/:issueId/resolve` - Resolve session issue
  - `GET /api/issues/stats` - Dashboard statistics with pendingByCategory
  - Session-based issue storage integrated with workflow

- **Issues Dashboard** (`/issues`)
  - Stats overview: total, pending, auto-fixed, requires review
  - Filter by book and category
  - Shows issue context and suggestions
  - Category-specific action buttons (accept/reject/resolve)
  - Safe DOM manipulation (XSS-resistant)

- **Workflow UI Issue Summary**
  - Shows auto-fixed count, needs review count, blocked count after uploads
  - Links to issues page for full review
  - Disables "proceed" button when blocked issues exist

#### Translation Pipeline Server - Phase 2.1 (Workflow Enhancements)
- **Erlendur MT File Splitting**
  - Automatic splitting of files >18,000 characters at paragraph boundaries
  - Split files named with part indicators: `2-6(a).en.md`, `2-6(b).en.md`
  - Erlendur-style headers with `hluti: „a"` for part tracking
  - Automatic recombination of translated parts after upload

- **Workflow Session Management**
  - SQLite persistence for sessions (survives server restarts)
  - Workflow uniqueness constraint: one active workflow per book/chapter
  - Content-based file identification (parses metadata from uploaded files)
  - Section-based file naming (`2-1.en.md`) instead of module IDs
  - Upload progress tracking with matched/unmatched file detection

- **UI Improvements**
  - File checklist shows friendly names (`2.6: Ionic and Molecular Compounds`)
  - Download/upload filename hints for each expected file
  - Warning banner when files have been split
  - Existing workflow dialog when attempting duplicate workflows

### Fixed
- Chapter 2 module mappings in `cnxml-to-md.js` and `pipeline-runner.js`
  - Corrected m68684-m68698 section assignments to match OpenStax collection
- YAML frontmatter handling in split files (was creating duplicate headers)
- Upload tracking now only counts files that match expected sections

#### Translation Pipeline Server - Phase 2
- **Web Interface** (Icelandic UI)
  - `/workflow` - Multi-step workflow wizard
  - `/issues` - Issue review dashboard
  - `/images` - Image translation tracker
  - `/status` - Pipeline status overview
  - `/login` - GitHub authentication page

- **Authentication & Authorization**
  - `server/services/auth.js` - GitHub OAuth + JWT session management
  - `server/middleware/requireAuth.js` - JWT validation middleware
  - `server/middleware/requireRole.js` - Role-based access control
  - Role mapping: Admin, Head Editor, Editor, Contributor, Viewer

- **Workflow Management**
  - `server/services/session.js` - Workflow session persistence (4-hour expiry)
  - `server/routes/workflow.js` - 6-step guided workflow API
  - Steps: Source → MT Upload → Matecat Create → Matecat Review → Issue Review → Finalize

- **Issue Classification**
  - `server/services/issueClassifier.js` - Automatic issue categorization
  - Categories: AUTO_FIX, EDITOR_CONFIRM, BOARD_REVIEW, BLOCKED
  - Pattern detection for whitespace, terminology, units, cultural references
  - `server/routes/issues.js` - Issue management API

- **Content Sync**
  - `server/services/github.js` - GitHub API client for PR creation
  - `server/routes/sync.js` - PR-based content sync to repository

- **Image Tracking**
  - `server/services/imageTracker.js` - Track image translation status
  - `server/routes/images.js` - Image management API
  - OneDrive/SharePoint source linking support

- **Documentation**
  - `server/README.md` - Comprehensive server documentation
  - `server/.env.example` - Configuration template

#### Other Additions
- **`tools/clean-markdown.js`** - Post-processing script to fix Pandoc artifacts
  - Replaces `\mspace{Xmu}` with KaTeX equivalents
  - Removes orphan `:::` directive markers
  - Fixes escaped tildes for subscript syntax
  - Cleans table border artifacts
- **`docs/markdown-formatting-issues.md`** - Documentation of known rendering issues and fixes

### Fixed
- 27 `\mspace` commands in mt-preview markdown files
- 442 orphan `:::` directive markers across chapters 1-4
- 16 escaped tildes that should be subscript markers

### Changed
- Updated `docs/scripts-guide.md` with Pipeline Tools section

## [0.4.0] - 2025-12-27

### Added
- **Status automation tooling**
  - `scripts/update-status.js` - CLI tool for updating chapter status
  - `scripts/validate-status.js` - JSON Schema validation for status files
  - `schemas/chapter-status.schema.json` - JSON Schema for status.json files
- **GitHub Actions CI/CD**
  - `.github/workflows/validate.yml` - Automated validation on push/PR
- **Documentation**
  - `docs/scripts-guide.md` - Detailed CLI tool usage guide
  - `docs/schema-reference.md` - JSON Schema field definitions
  - `docs/cli-quick-reference.md` - Command cheat sheet
  - `books/liffraedi/STATUS.md` - Biology book status page
- **Content**
  - Icelandic section titles for chapters 2, 3, and 4
- Progress tracking system with status files at multiple levels
  - `CLAUDE.md` - Instructions for Claude Code when working in this repo
  - `STATUS.md` - Overall project status dashboard
  - `books/efnafraedi/STATUS.md` - Detailed Chemistry book tracking
  - `books/efnafraedi/chapters/ch01-21/status.json` - Per-chapter JSON status

### Changed
- `templates/chapter-status.json` - Simplified to match actual usage pattern
- `package.json` - Reorganized scripts (working vs planned)
- `README.md` - Added documentation links table (bilingual)
- `.gitignore` - Added `.claude/` directory
- Refactored `update-status.js` with declarative status transitions
- Refactored `validate-status.js` with extracted validator functions

### Fixed
- Stale dates in STATUS.md files (2024 → 2025)
- Empty table rows in STATUS.md files
- Broken link to líffræði STATUS.md

## [0.3.0] - 2025-12-17

### Added
- Two-pass editorial workflow producing multiple valuable assets
- New directory structure:
  - `03-faithful-translation/` - Human-verified faithful translation
  - `04-localized-content/` - Localized version with SI units and Icelandic context
  - `glossary/` - Terminology files (CSV format)
  - `tm/exports/` - Translation memory exports
- Chapter subdirectories (ch01, ch02) in source/faithful/localized folders
- Complete README.md with Icelandic and English sections
- New documentation:
  - 8-step workflow with ASCII diagrams
  - Editorial guide for two-pass review process
  - Assets documentation describing valuable outputs
  - Expanded terminology standards with chemistry terms
- New templates:
  - `localization-log.md` for documenting Pass 2 changes
  - `editorial-checklist.md` for editor workflow
  - Updated `chapter-status.json` with full workflow stages
- New tool placeholders:
  - `export-parallel-corpus.js`
  - `validate-chapter.js`
- Terminology glossary (`terminology-en-is.csv`)

### Changed
- Renamed `02-machine-translation/` → `02-mt-output/`
- Renamed `06-publication/` → `05-publication/`
- Updated metadata.json for both books
- Updated package.json with new scripts and metadata

### Removed
- `03-tm-translated/` (merged into new workflow)
- `04-editor-review/` (replaced by two-pass system)
- `05-final-docx/` (replaced by 03-faithful-translation/)

## [0.2.0] - 2025-12-16

### Added
- Complete directory structure for translation management
- Chemistry book (efnafræði) setup with 21 chapters
- Biology book (líffræði) placeholder with 47 chapters
- Numbered folders (01-06) tracking translation pipeline stages:
  - `01-source/` - Original OpenStax files
  - `02-machine-translation/` - MT output
  - `03-tm-translated/` - TM-assisted translation
  - `04-editor-review/` - Editorial review
  - `05-final-docx/` - Final documents
  - `06-publication/` - Web-ready markdown
- Documentation in `docs/`:
  - Workflow guide
  - Terminology standards
  - Contributing guide
- Templates in `templates/`:
  - Frontmatter template
  - Chapter status template
- Tool placeholders in `tools/`
- Book metadata files:
  - `metadata.json` - Book information
  - `toc.json` - Table of contents
  - `glossary.json` - Terminology
- Translation memory folders for Matecat exports

## [0.1.0] - 2025-05-18

### Added
- Initial commit
- Repository created for Icelandic OpenStax translations
- LICENSE file (CC BY 4.0)
- Basic README.md
- .gitignore configuration
