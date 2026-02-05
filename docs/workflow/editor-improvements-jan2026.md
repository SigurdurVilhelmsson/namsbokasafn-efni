# Editor Rebuild Plan: CNXML→HTML Pipeline Integration

## Overview

This document replaces the previous Phase 2 editor improvements plan. That plan described 10 UX features built for a markdown-only editor. While many of those features (dark mode, presence, notes, keyboard shortcuts) carry forward, the underlying content model must be rebuilt to support the new Extract-Inject-Render pipeline.

**Decision:** The CNXML→HTML pipeline (with markdown as an intermediary for machine translation) is the way forward. The old markdown-assembly publication path (`chapter-assembler.js` + `add-frontmatter.js` → `05-publication/*.md`) will be retired before final deployment.

**Status:** NOT STARTED

---

## Architecture: Old vs New

### Old Pipeline (Being Retired)

```
CNXML → cnxml-to-md → EN markdown → MT → IS markdown
                                          ↓
                                    EasyMDE editor
                                          ↓
                                    03-faithful/*.md
                                          ↓
                              chapter-assembler + add-frontmatter
                                          ↓
                                05-publication/*.md (markdown)
                                          ↓
                              vefur renders markdown → HTML
```

### New Pipeline (Target)

```
CNXML → cnxml-extract → EN segments + structure.json + equations.json
                              ↓
                    protect-segments-for-mt
                              ↓
                        malstadur.is (MT)
                              ↓
                    restore-segments-from-mt
                              ↓
                    Editor (segment review)          ← REBUILD FOCUS
                              ↓
                        03-faithful/ (IS segments)
                              ↓
                    cnxml-inject → 03-translated/*.cnxml
                              ↓
                    cnxml-render → 05-publication/*.html
                              ↓
                    vefur serves pre-rendered HTML
```

**Key difference:** Publication output is semantic HTML from `cnxml-render.js`, not assembled markdown. The web reader (vefur) serves pre-rendered HTML rather than rendering markdown at request time.

---

## What Carries Forward

These features from the previous Phase 1 and Phase 2 plans are pipeline-independent and carry forward unchanged:

### Dashboard & Workflow (Phase 1)
- [x] Unified admin dashboard (`status.html`)
- [x] Assignment workflow (`assignments.html`, `my-work.html`)
- [x] Simplified navigation (5-item nav)
- [x] Issue resolution (`issues.html`)
- [x] Decision log (`decisions.html`)
- [x] Progress metrics (analytics in `status.html`)

### Editor UX (Phase 2)
- [x] Spell check (browser-native Icelandic)
- [x] Presence indicators
- [x] Personal notes per section
- [x] Keyboard shortcuts
- [x] Dark mode
- [x] Bulk actions for admin
- [x] Notification preferences
- [x] Consistency checker (terminology)

### Pilot Support (Phase 7)
- [x] Feedback system
- [x] Teacher guide

---

## What Needs Rebuilding

### 1. Editor Content Model

**Current state:** The editor (`server/views/editor.html`) uses EasyMDE to edit full markdown files from `02-mt-output/` and `03-faithful/`. It treats each section (e.g., `5-1.is.md`) as a single markdown document.

**Required change:** The editor must work with **segment files** from the extract-inject pipeline. These are markdown files with `<!-- SEG:... -->` markers and `[[MATH:N]]` placeholders. The editor still edits markdown (so EasyMDE can stay), but it must:

- Load segment files from `02-mt-output/` or `03-faithful/`
- Preserve `<!-- SEG:... -->` markers (or `{{SEG:...}}` from protected files)
- Preserve `[[MATH:N]]` placeholders (equations live in separate JSON)
- Show the corresponding English segment alongside each Icelandic segment
- Load equation JSON for preview (display rendered math alongside placeholders)

**Files to modify:**
- `server/routes/editor.js` — update content loading to work with segment files
- `server/services/editorHistory.js` — update file paths and version tracking
- `server/views/editor.html` — update EasyMDE configuration and preview

### 2. Pipeline API Endpoints

**Current state:** `server/routes/process.js` exposes endpoints for `cnxml-extract` (via `pipeline-runner.js`) but not for `cnxml-inject` or `cnxml-render`. There is no way to trigger the inject/render cycle from the web UI.

**Required:** Add API endpoints for the full pipeline:

| Endpoint | Method | Tool | Purpose |
|----------|--------|------|---------|
| `/api/process/extract/:book/:chapter` | POST | `cnxml-extract.js` | Extract segments from CNXML |
| `/api/process/protect/:book/:chapter` | POST | `protect-segments-for-mt.js` | Protect segments for MT |
| `/api/process/restore/:book/:chapter` | POST | `restore-segments-from-mt.js` | Restore segments after MT |
| `/api/process/inject/:book/:chapter` | POST | `cnxml-inject.js` | Inject translations into CNXML |
| `/api/process/render/:book/:chapter` | POST | `cnxml-render.js` | Render CNXML to HTML |

**Files to modify:**
- `server/routes/process.js` — add inject and render endpoints

### 3. Publication Pipeline

**Current state:** Publication uses `chapter-assembler.js` to assemble 7 module markdown files into 12 publication markdown files, then `add-frontmatter.js` adds YAML metadata. Output is `05-publication/{track}/chapters/{NN}/*.is.md`.

**Required:** Replace with `cnxml-inject` → `cnxml-render` pipeline:

1. After review, run `cnxml-inject` to produce translated CNXML in `03-translated/`
2. Run `cnxml-render` to produce semantic HTML in `05-publication/{track}/chapters/{NN}/`
3. Output format: `.html` files with embedded page data JSON, pre-rendered KaTeX, and absolute image paths

**Files to modify:**
- `server/routes/publication.js` — update publish endpoints to use inject+render
- `server/services/publicationService.js` — replace markdown assembly with HTML rendering

**Tools to retire:**
- `tools/chapter-assembler.js` — replaced by `cnxml-render.js`
- `tools/add-frontmatter.js` — metadata embedded in HTML by `cnxml-render.js`
- `tools/compile-chapter.js` — end-of-chapter extraction handled by render

### 4. Database Schema Updates

**Current state:** `server/services/chapterFilesService.js` tracks file types: `en-md`, `equations`, `figures`, `protected`, `strings`. No tracking for structure JSON, translated CNXML, or rendered HTML.

**Required:** Add tracking for new pipeline outputs:

| File Type | Directory | Description |
|-----------|-----------|-------------|
| `structure` | `02-structure/` | Structure JSON from extract |
| `equations` | `02-structure/` | Equations JSON from extract |
| `translated-cnxml` | `03-translated/` | CNXML from inject |
| `rendered-html` | `05-publication/` | HTML from render |

**Files to modify:**
- `server/services/chapterFilesService.js` — add new file types
- `server/migrations/` — add migration for new tracking columns

### 5. Status Schema Updates

**Current state:** 5 stages: `enMarkdown` → `mtOutput` → `linguisticReview` → `tmCreated` → `publication`.

**Required:** Expand to include inject and render steps:

| Stage | Step | Description |
|-------|------|-------------|
| `extraction` | 1 | CNXML → segments + structure (cnxml-extract) |
| `mtReady` | 1b | Segments protected and split (protect-segments-for-mt) |
| `mtOutput` | 2 | MT output received |
| `linguisticReview` | 3 | Faithful translation reviewed |
| `tmCreated` | 4 | TM created via Matecat Align |
| `injection` | 5a | Translated CNXML produced (cnxml-inject) |
| `rendering` | 5b | HTML produced (cnxml-render) |
| `publication` | 5c | Published to web |

**Files to modify:**
- `schemas/chapter-status.schema.json`
- `server/routes/status.js` — update `PIPELINE_STAGES`

### 6. Editor HTML Preview

**Current state:** The editor only shows markdown (EasyMDE) and optionally the English source alongside.

**Required:** Add a rendered HTML preview panel so editors can see how their translations will look after inject+render:

- "Preview" button triggers `cnxml-inject` + `cnxml-render` for the current module
- Preview panel shows the rendered HTML alongside the segment editor
- This replaces the current markdown preview (which shows approximate rendering)

**Files to modify:**
- `server/views/editor.html` — add preview panel
- `server/routes/editor.js` — add preview endpoint

### 7. Export Updates

**Current state:** Export to PDF/Word from markdown via EasyMDE print view.

**Required:** Export from rendered HTML:
- PDF: print the rendered HTML (better fidelity, correct equations)
- Word: convert rendered HTML to .docx

**Files to modify:**
- `server/views/editor.html` — update export functions

---

## Directory Structure Updates

The content repository needs two new directories tracked in documentation:

```
books/{book}/
├── 01-source/              # 🔒 READ ONLY - OpenStax CNXML originals
├── 02-for-mt/              # EN segments for machine translation
│   └── ch{NN}/
│       └── m{NNNNN}-segments.en.md
├── 02-structure/           # ← NEW: Document structure from extract
│   └── ch{NN}/
│       ├── m{NNNNN}-structure.json
│       └── m{NNNNN}-equations.json
├── 02-mt-output/           # 🔒 READ ONLY - IS segments from MT
├── 03-faithful/            # ✏️ Reviewed IS segments
├── 03-translated/          # ← NEW: Translated CNXML from inject
│   └── ch{NN}/
│       └── m{NNNNN}.cnxml
├── 04-localized/           # ✏️ Pass 2 output
├── 05-publication/         # ✏️ Web-ready HTML (was markdown)
│   ├── mt-preview/
│   ├── faithful/
│   └── localized/
├── for-align/              # Staging for Matecat Align
├── tm/                     # 🔒 READ ONLY - TMX from Matecat Align
├── glossary/               # Terminology files
└── chapters/ch{NN}/        # Status tracking
```

---

## Implementation Order

### Phase A: Pipeline API (Foundation)

1. Add `/api/process/inject` endpoint calling `cnxml-inject.js`
2. Add `/api/process/render` endpoint calling `cnxml-render.js`
3. Update `chapterFilesService.js` to track structure, translated CNXML, and rendered HTML
4. Add database migration for new file types

### Phase B: Publication Migration

5. Update `publication.js` routes to use inject+render instead of chapter-assembler
6. Update publication tracks (mt-preview, faithful, localized) to produce HTML
7. Test end-to-end: review → inject → render → publish for one chapter

### Phase C: Editor Updates

8. Update editor content loading for segment files
9. Add HTML preview panel (inject+render preview)
10. Update export to use rendered HTML
11. Update status schema with new stages

### Phase D: Cleanup

12. Retire `chapter-assembler.js`, `add-frontmatter.js`, `compile-chapter.js`
13. Remove old markdown publication paths from `publication.js`
14. Update all documentation (ROADMAP, architecture, CLI reference)
15. Update vefur sync to handle HTML content instead of markdown

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Keep EasyMDE for segment editing | Markdown segments are still the editing format; only publication output changes |
| HTML publication output | cnxml-render produces higher-fidelity output than markdown assembly |
| Pre-render KaTeX server-side | Already implemented in cnxml-render.js; faster page loads |
| Retire chapter-assembler path | Two publication paths creates maintenance burden and confusion |
| Keep 3-track publication | mt-preview/faithful/localized tracks still make sense for HTML output |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Vefur must be updated to serve HTML instead of rendering markdown | Plan vefur changes in parallel; HTML is simpler to serve |
| Existing published markdown content becomes orphaned | Re-render all published chapters through new pipeline before retirement |
| Editor segment markers confuse translators | Add clear UI indication that markers are system-managed |
| cnxml-render open issues (examples, exercises, cross-refs) | Fix these in cnxml-render.js before editor integration; tracked in html-pipeline-issues.md |

---

## Related Documents

- [UI Improvements Phase 1](./ui-improvements-plan.md) — Dashboard features (carry forward)
- [Simplified Workflow](./simplified-workflow.md) — Updated 5-step process
- [HTML Pipeline Issues](../pipeline/html-pipeline-issues.md) — Bugs in cnxml-render
- [Architecture](../technical/architecture.md) — System architecture
