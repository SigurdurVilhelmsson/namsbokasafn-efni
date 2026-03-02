# Master Pipeline: CNXML → Markdown → HTML

This is the authoritative reference for the namsbokasafn translation pipeline. All other workflow documentation should be consistent with this document.

## Design Principles

1. **CNXML is the structural source of truth.** It carries IDs, semantic markup, equations, cross-references, and document hierarchy. It is never modified.
2. **Markdown is the persistent working format.** Every stage of human and machine work operates on markdown segment files. All versions are preserved.
3. **HTML is the publication output.** Produced by injecting markdown translations back into CNXML structure, then rendering to semantic HTML.
4. **The pipeline branches, not loops.** Content flows forward through three publication tracks (mt-preview → faithful → localized), each replacing the previous on the web.
5. **Segment-level tracking.** Editorial review, approval, and terminology checking operate at the individual segment level, not the file level.

---

## Pipeline Overview

```
 CNXML (OpenStax)
      │
      ▼
 ┌─ EXTRACTION ──────────────────────────────────────────────────────┐
 │  cnxml-extract     → EN segments (.en.md) + structure + equations │
 │  protect-for-mt    → MT-ready segments (escaped, split if >20KB) │
 └───────────────────────────────────────────────────────────────────┘
      │
      ▼  manual upload to malstadur.is
 ┌─ MACHINE TRANSLATION ────────────────────────────────────────────┐
 │  Erlendur MT       → IS segments (.is.md) in 02-mt-output/      │
 │  restore-from-mt   → join splits, restore links/equations/markers│
 └───────────────────────────────────────────────────────────────────┘
      │
      ├──────────────────────────────────────────────────────┐
      ▼                                                      │
 ┌─ MT-PREVIEW PUBLICATION ────────────────┐                 │
 │  cnxml-inject  (source: 02-mt-output/)  │                 │
 │  cnxml-render  (track: mt-preview)      │                 │
 │  → 05-publication/mt-preview/           │                 │
 │  → sync to vefur                        │                 │
 └─────────────────────────────────────────┘                 │
                                                             │
      ┌──────────────────────────────────────────────────────┘
      ▼
 ┌─ LINGUISTIC REVIEW (Pass 1) ─────────────────────────────────────┐
 │  Editor: side-by-side EN/IS segment view in server/              │
 │  Editor suggests changes, tagged by category:                    │
 │    terminology · accuracy · readability · style · omission       │
 │  Head editor: approve / reject / discuss per segment             │
 │  Output: 03-faithful-translation/ (linguistically edited IS segments)        │
 └───────────────────────────────────────────────────────────────────┘
      │
      ├──────────────────────────────────────────────────────┐
      ▼                                                      │
 ┌─ FAITHFUL PUBLICATION ──────────────────┐                 │
 │  cnxml-inject  (source: 03-faithful-translation/)   │                 │
 │  cnxml-render  (track: faithful)        │                 │
 │  → 05-publication/faithful/             │                 │
 │  → sync to vefur (replaces mt-preview)  │                 │
 └─────────────────────────────────────────┘                 │
      │                                                      │
      ▼                                                      │
 ┌─ TM CREATION ────────────────────────────────────────────┐│
 │  prepare-for-align  → clean EN/IS pairs                  ││
 │  Matecat Align      → human-verified TMX                 ││
 │  Output: tm/ (translation memory)                        ││
 └──────────────────────────────────────────────────────────┘│
                                                             │
      ┌──────────────────────────────────────────────────────┘
      ▼
 ┌─ LOCALIZATION (Pass 2) ──────────────────────────────────────────┐
 │  AI drafts suggestions:                                          │
 │    Imperial → SI units, US → Icelandic examples,                 │
 │    cultural references, geographic examples                      │
 │  Human editor reviews, edits, accepts or rejects                 │
 │  Output: 04-localized-content/ (localized IS segments)                   │
 └───────────────────────────────────────────────────────────────────┘
      │
      ▼
 ┌─ LOCALIZED PUBLICATION ─────────────────┐
 │  cnxml-inject  (source: 04-localized-content/)  │
 │  cnxml-render  (track: localized)       │
 │  → 05-publication/localized/            │
 │  → sync to vefur (replaces faithful)    │
 └─────────────────────────────────────────┘
```

---

## Stage-by-Stage Detail

### Stage 1: Extraction

**Goal:** Convert CNXML source into translatable markdown segments while preserving document structure for later reconstruction.

**Tool:** `cnxml-extract.js`

```bash
node tools/cnxml-extract.js --chapter 5
```

**Input:** `01-source/ch05/m68724.cnxml`

**Output (3 files per module):**

| File | Directory | Contents |
|------|-----------|----------|
| `m68724-segments.en.md` | `02-for-mt/ch05/` | English segments with `<!-- SEG:id -->` markers and `[[MATH:N]]` placeholders |
| `m68724-structure.json` | `02-structure/ch05/` | Document skeleton (sections, figures, tables, notes, exercises) |
| `m68724-equations.json` | `02-structure/ch05/` | MathML equations keyed by placeholder ID |

**Segment ID format:** `{moduleId}:{type}:{elementId}` — e.g., `m68724:para:CNX_Chem_05_01_Para01`

**Inline markup conversion:**
| CNXML | Markdown |
|-------|----------|
| `<emphasis effect="bold">` | `**text**` |
| `<emphasis effect="italics">` | `*text*` |
| `<term>` | `__text__` |
| `<link url="...">` | `[text](url)` |
| `<link target-id="id">` | `[#id]` |
| MathML blocks | `[[MATH:N]]` |

### Stage 2: Protect and Split for MT

**Goal:** Make segment files safe for Erlendur MT, which strips HTML comments and markdown link URLs, and has a ~20KB file size limit.

**Tool:** `protect-segments-for-mt.js`

```bash
node tools/protect-segments-for-mt.js --batch books/efnafraedi-2e/02-for-mt/ch05/
```

**Input:** `02-for-mt/ch05/m68724-segments.en.md`

**Transformations:**

| From | To | Why |
|------|----|-----|
| `<!-- SEG:xxx -->` | `{{SEG:xxx}}` | Erlendur strips HTML comments |
| `[text](url)` | `{{LINK:N}}text{{/LINK}}` | Erlendur strips URLs from links |
| `[#ref-id]` | `{{XREF:N}}` | Erlendur mangles square brackets |

**Splitting:** If visible character count exceeds 14,000 (hard limit 20,000), splits at paragraph boundaries. Visible chars exclude all `{{...}}` and `[[...]]` markers.

**Output:**
- `m68724-segments.en.md` — first (or only) part
- `m68724-segments(b).en.md` — second part, if split
- `m68724-segments(c).en.md` — third part, etc.
- `m68724-segments-links.json` — protected link URLs

### Stage 3: Machine Translation

**Service:** [malstadur.is](https://malstadur.is) (Erlendur)

**Process (manual):**
1. Upload protected `.en.md` files to malstadur.is
2. Download translated output
3. Rename to `{moduleId}-segments.is.md` (matching the English filename pattern)
4. Save to `02-mt-output/ch05/`
5. If the file was split, save each part separately: `m68724-segments.is.md`, `m68724-segments(b).is.md`, etc.

**Erlendur behavior:**
- Escapes brackets: `{{SEG:...}}` becomes `\{\{SEG:...\}\}`
- Escapes square brackets: `[[MATH:1]]` becomes `\[\[MATH:1\]\]`
- Preserves protected markers (they survive as escaped text)

### Stage 4: Restore Segments from MT

**Goal:** Undo Erlendur's escaping, restore links and cross-refs, and optionally merge split files.

**Tool:** `restore-segments-from-mt.js`

```bash
node tools/restore-segments-from-mt.js --batch books/efnafraedi-2e/02-mt-output/ch05/ --merge
```

**Input:**
- `02-mt-output/ch05/m68724-segments.is.md` (and split parts)
- `02-for-mt/ch05/m68724-segments-links.json` (link URL sidecar from protect step)

**Transformations:**

| From | To |
|------|----|
| `\{\{SEG:xxx\}\}` | `<!-- SEG:xxx -->` |
| `\[\[MATH:N\]\]` | `[[MATH:N]]` |
| `{{LINK:N}}text{{/LINK}}` | `[text](url)` (from links.json) |
| `{{XREF:N}}` | `[#ref-id]` (from links.json) |

**Merge:** With `--merge`, combines split parts (a, b, c...) into a single file.

**Output:** Clean `m68724-segments.is.md` in `02-mt-output/ch05/` — restored, merged, ready for use.

### Stage 5: MT-Preview Publication

**Goal:** Publish unreviewed MT output immediately so readers can access content while review is ongoing.

**Tools:** `cnxml-inject.js` + `cnxml-render.js`

```bash
node tools/cnxml-inject.js --chapter 5 --source-dir 02-mt-output
node tools/cnxml-render.js --chapter 5 --track mt-preview
```

**cnxml-inject reads:**
- Translated segments from `02-mt-output/ch05/m68724-segments.is.md`
- Structure from `02-structure/ch05/m68724-structure.json`
- Equations from `02-structure/ch05/m68724-equations.json`
- Original CNXML from `01-source/ch05/m68724.cnxml`

**cnxml-inject produces:** `03-translated/ch05/m68724.cnxml` — full translated CNXML with markdown reversed back to CNXML markup and equations restored from MathML.

**cnxml-render reads:** `03-translated/ch05/m68724.cnxml`

**cnxml-render produces:** `05-publication/mt-preview/chapters/05/5-1-energy-basics.html` — semantic HTML with pre-rendered KaTeX, embedded page metadata JSON, Icelandic note-type labels, and all IDs preserved.

**Output filename convention:** `{chapter}-{section}-{slug}.html` (section notation, not module ID).

**MT preview includes a warning banner** indicating unreviewed machine translation.

**Sync:** Copy `05-publication/mt-preview/` to namsbokasafn-vefur for deployment.

### Stage 6: Linguistic Review (Pass 1)

**Goal:** Human editors produce a faithful, natural Icelandic translation.

**Environment:** Server editor (`server/views/editor.html`) — side-by-side EN/IS view at segment level.

**Process:**
1. Editor opens a module in the server editor
2. Each `<!-- SEG:id -->` block is displayed as an editable segment alongside the corresponding English source
3. Editor reviews and edits each segment, tagging changes by category:
   - **terminology** — wrong or inconsistent term
   - **accuracy** — meaning changed or lost in MT
   - **readability** — awkward but technically correct
   - **style** — register, voice, formality
   - **omission** — MT dropped content
4. Editor submits reviewed segments for head-editor approval
5. Head editor reviews changes per segment: **approve**, **reject**, or **discuss**
6. Approved segments are written to `03-faithful-translation/ch05/m68724-segments.is.md`

**What editors must NOT change:**
- `<!-- SEG:... -->` markers (system-managed)
- `[[MATH:N]]` placeholders (equations live in separate JSON)
- Segment boundaries

**What editors focus on:**
- Grammar and spelling
- Natural Icelandic phrasing
- Terminology consistency (with glossary lookup in editor)
- Technical accuracy preserved
- NO localization (keep imperial units, American examples — that's Pass 2)

**Terminology integration:** The editor provides inline term lookup against the approved glossary. Editors can propose new terms directly from the editor, which enter the terminology approval workflow.

### Stage 7: Faithful Publication

**Goal:** Publish human-reviewed translation, replacing the mt-preview.

```bash
node tools/cnxml-inject.js --chapter 5 --source-dir 03-faithful
node tools/cnxml-render.js --chapter 5 --track faithful
```

Same inject-render process as mt-preview, but reads from `03-faithful-translation/` and writes to `05-publication/faithful/`.

**Sync:** Copy to vefur. Faithful replaces mt-preview on the website.

### Stage 8: TM Creation

**Goal:** Create human-verified Translation Memory from the faithful translation.

**Tool:** `prepare-for-align.js`

```bash
node tools/prepare-for-align.js \
  --en books/efnafraedi-2e/02-for-mt/ch05/m68724-segments.en.md \
  --is books/efnafraedi-2e/03-faithful-translation/ch05/m68724-segments.is.md \
  --output-dir books/efnafraedi-2e/for-align/ch05
```

**Produces:** Clean markdown pairs in `for-align/` — stripped of frontmatter, normalized whitespace.

**Process (manual):**
1. Upload EN + IS clean files to [Matecat Align](https://matecat.com/align/)
2. Review alignment
3. Export TMX
4. Save to `tm/ch05/`

**Why after faithful:** The TM is built from human-verified translation, not raw MT.

### Stage 9: Localization (Pass 2)

**Goal:** Adapt the faithful translation for Icelandic students.

**Environment:** Server localization review interface.

**Process:**
1. AI analyzes faithful segments and drafts localization suggestions:
   - **Unit conversions:** Imperial → SI (e.g., Fahrenheit → Celsius, pounds → kilograms)
   - **Cultural references:** Replace US-specific examples with Icelandic equivalents
   - **Geographic examples:** US landmarks/phenomena → Icelandic (e.g., geothermal, volcanic)
   - **Institutional references:** US institutions → Icelandic equivalents where appropriate
2. Human editor reviews each suggestion: accept, edit, or reject
3. Head editor approves finalized localized segments
4. Output written to `04-localized-content/ch05/m68724-segments.is.md`

### Stage 10: Localized Publication

**Goal:** Publish the fully localized version, replacing faithful on the website.

```bash
node tools/cnxml-inject.js --chapter 5 --source-dir 04-localized
node tools/cnxml-render.js --chapter 5 --track localized
```

Same inject-render process. Reads from `04-localized-content/`, writes to `05-publication/localized/`.

**Sync:** Copy to vefur. Localized replaces faithful on the website.

---

## Directory Structure

```
books/efnafraedi-2e/
├── 01-source/               # 🔒 READ ONLY — OpenStax CNXML originals
│   └── ch{NN}/
│       └── m{NNNNN}.cnxml
│
├── 02-for-mt/               # GENERATED — EN segments for machine translation
│   └── ch{NN}/
│       ├── m{NNNNN}-segments.en.md        # English segments
│       ├── m{NNNNN}-segments(b).en.md     # Split part (if needed)
│       └── m{NNNNN}-segments-links.json   # Protected link URLs
│
├── 02-structure/            # GENERATED — Document structure from extraction
│   └── ch{NN}/
│       ├── m{NNNNN}-structure.json        # Document skeleton
│       └── m{NNNNN}-equations.json        # MathML equations
│
├── 02-mt-output/            # MT output — restored IS segments
│   └── ch{NN}/
│       └── m{NNNNN}-segments.is.md        # Restored MT segments
│
├── 03-faithful-translation/             # ✏️ EDITORIAL — Linguistically reviewed IS segments
│   └── ch{NN}/
│       └── m{NNNNN}-segments.is.md        # Pass 1 output
│
├── 03-translated/           # GENERATED — Translated CNXML from injection
│   └── ch{NN}/
│       └── m{NNNNN}.cnxml                 # Used by cnxml-render
│
├── 04-localized-content/            # ✏️ EDITORIAL — Localized IS segments
│   └── ch{NN}/
│       └── m{NNNNN}-segments.is.md        # Pass 2 output
│
├── 05-publication/          # GENERATED — Web-ready HTML
│   ├── mt-preview/chapters/{NN}/          # Unreviewed MT
│   ├── faithful/chapters/{NN}/            # Reviewed translation
│   └── localized/chapters/{NN}/           # Adapted for Iceland
│       └── {ch}-{sec}-{slug}.html
│
├── for-align/               # STAGING — Clean pairs for Matecat Align
│   └── ch{NN}/
│       ├── m{NNNNN}.en.clean.md
│       └── m{NNNNN}.is.clean.md
│
├── tm/                      # 🔒 READ ONLY — Human-verified TMX
│   └── ch{NN}/
│       └── m{NNNNN}.tmx
│
├── glossary/                # Terminology files
│   └── terms.json
│
└── chapters/ch{NN}/         # Status tracking
    └── status.json
```

**All markdown versions are preserved** — EN source, MT output, faithful edit, localized edit — for reference, TM creation, AI training, and future work.

---

## File Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Extraction, MT, editorial | Module ID | `m68724-segments.en.md` |
| Split parts | Module ID + suffix | `m68724-segments(b).en.md` |
| Structure/equations | Module ID | `m68724-structure.json` |
| Translated CNXML | Module ID | `m68724.cnxml` |
| Publication HTML | Section notation | `5-1-energy-basics.html` |
| Matecat Align | Module ID | `m68724.en.clean.md` |
| Translation Memory | Module ID | `m68724.tmx` |

---

## Tools Summary

### Active Pipeline Tools

| Tool | Stage | Input | Output |
|------|-------|-------|--------|
| `cnxml-extract.js` | 1 | CNXML | segments.en.md + structure.json + equations.json |
| `protect-segments-for-mt.js` | 2 | segments.en.md | protected/split .en.md + links.json |
| `restore-segments-from-mt.js` | 4 | segments.is.md (escaped) | segments.is.md (clean, merged) |
| `cnxml-inject.js` | 5, 7, 10 | segments.is.md + structure + equations + CNXML | translated .cnxml |
| `cnxml-render.js` | 5, 7, 10 | translated .cnxml | publication .html |
| `prepare-for-align.js` | 8 | EN + IS segments | clean pairs for Matecat |
| `openstax-fetch.cjs` | 0 | module/collection ID | CNXML files |
| `validate-chapter.js` | any | chapter files | validation report |

### External Services

| Service | Stage | Purpose |
|---------|-------|---------|
| malstadur.is | 3 | Icelandic machine translation |
| Matecat Align | 8 | Translation memory creation |

### Required Tool Changes

| Tool | Change | Why |
|------|--------|-----|
| `cnxml-inject.js` | Add `--source-dir` flag | Currently hardcodes `02-for-mt/`; needs to read from `02-mt-output/`, `03-faithful-translation/`, or `04-localized-content/` depending on track |
| `cnxml-extract.js` | Extract `getChapterModules` to `tools/lib/` | Currently imports from deprecated `pipeline-runner.js` |

---

## Terminology System

The glossary system builds on the official Icelandic Chemistry Society glossary and provides an approval workflow for new terms.

### Term Lifecycle

```
proposed → approved     (head editor approves)
proposed → disputed     (contributor disputes, discussion thread opens)
disputed → approved     (head editor resolves)
disputed → needs_review (escalated)
```

### Term Structure

| Field | Description |
|-------|-------------|
| english | English term (unique per book) |
| icelandic | Approved Icelandic translation |
| alternatives | JSON array of alternative translations |
| category | fundamental, bonding, reactions, solutions, acids-bases, periodic-table, structure, states, properties, changes, measurements, concepts, constants, units, other |
| source | idordabankinn, chemistry-association, chapter-glossary, manual, imported-csv, imported-excel |
| status | proposed, approved, disputed, needs_review |
| notes | Usage notes, context |

### Editor Integration

- Inline term lookup from the editor (Ctrl+T)
- Consistency checker validates translated text against approved terms
- Editors can propose new terms directly while editing; proposals enter the approval workflow

### Import Sources

- **Chemistry Society glossary** — bulk import from CSV/Excel
- **Chapter key-terms** — extracted from `:::definition{}` blocks in content
- **Manual entry** — individual term proposals

---

## Editorial Workflow Detail

### Segment-Level Review

Each `<!-- SEG:id -->` block in a module's segment file is a reviewable unit. The editorial system tracks:

| Field | Description |
|-------|-------------|
| Segment ID | From `<!-- SEG:m68724:para:CNX_Chem_05_01_Para01 -->` |
| Original (EN) | English source segment |
| MT output (IS) | Machine translation |
| Editor suggestion | Proposed edit with change category |
| Category | terminology, accuracy, readability, style, omission |
| Status | pending, approved, rejected, discuss |
| Reviewer | Head editor who reviewed |
| Notes | Discussion thread if status is "discuss" |

### Change Categories

| Category | When to use | Example |
|----------|-------------|---------|
| **terminology** | Wrong or inconsistent term | "efni" should be "efnasamband" for "compound" |
| **accuracy** | Meaning changed or lost | MT reversed the meaning of a comparison |
| **readability** | Correct but unnatural | Restructure sentence for natural Icelandic |
| **style** | Voice, register, formality | Passive → active, academic register |
| **omission** | Content missing | MT dropped a clause or qualifier |

### Head Editor Actions

| Action | Effect |
|--------|--------|
| **approve** | Suggestion accepted; segment updated in 03-faithful-translation/ |
| **reject** | Suggestion discarded; MT version kept (or previous approved version) |
| **discuss** | Opens discussion thread; segment stays pending until resolved |

### Defer to Localization

If a segment is technically faithful but will change in Pass 2 (e.g., Fahrenheit values that will become Celsius), the editor should tag it with a note for the localization pass rather than changing it in Pass 1.

---

## Status Tracking

```json
{
  "extraction": "complete",
  "mtReady": "complete",
  "mtOutput": "complete",
  "mtPreviewPublished": "complete",
  "linguisticReview": "in-progress",
  "faithfulPublished": "not-started",
  "tmCreated": "not-started",
  "localization": "not-started",
  "localizedPublished": "not-started"
}
```

---

## Server Integration

The server (`server/`) should progressively automate the full pipeline. Priority order:

### Priority 1: Linguistic Editor (Immediate Need)

The side-by-side segment editor for Pass 1 review. Editors see EN source and IS MT output, suggest changes with categories, head editor approves/rejects. This is the core workflow that enables the editorial team to work.

**Existing infrastructure that carries forward:**
- EasyMDE editor with EN/IS split view
- Version history with content deduplication
- Review workflow with SLA tracking
- Terminology lookup and consistency checking
- Presence indicators, personal notes, keyboard shortcuts
- Git integration for approved reviews

**Gaps to fill:**
- Editor loads from old directory/naming conventions → update for module-based segment files
- Review workflow is section-level → make segment-level
- No visual diff in review UI → add segment diff viewer
- cnxml-inject/render not callable from server → add API endpoints

### Priority 2: Terminology Management

Build on the existing terminology system (already has CRUD, approval workflow, import, search, discussion threads) to support the Chemistry Society glossary as the foundation.

**Existing:** Full terminology CRUD with approval workflow, bulk import, discussion threads, consistency checker.

**Gaps:** No term version history, no export of approved terms, dispute doesn't prevent term use during review.

### Priority 3: Localization Editor

AI-assisted localization suggestions with human review. Can reuse the linguistic editor infrastructure with different suggestion sources.

### Priority 4: Pipeline Automation

Automated extract, protect, restore, inject, render triggered from the server UI. Chapter prep and publication orchestration.

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [Editor Rebuild Plan](./editor-improvements-jan2026.md) | Server rebuild detail for Phase 8 |
| [Pass 1 Guidelines](../editorial/pass1-linguistic.md) | Linguistic review instructions |
| [Pass 2 Guidelines](../editorial/pass2-localization.md) | Localization instructions |
| [Terminology Standards](../editorial/terminology.md) | Term conventions |
| [HTML Pipeline Issues](../pipeline/html-pipeline-issues.md) | cnxml-render bug tracking |
| [Architecture](../technical/architecture.md) | System architecture |
| [ROADMAP](../../ROADMAP.md) | Development status |
