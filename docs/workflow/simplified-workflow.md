# Simplified Translation Workflow (5 Steps)

This document describes the streamlined 5-step translation workflow that replaced the older 8-step process.

## Why Simplified?

The previous workflow had 12+ steps with multiple format conversions (DOCX → plain text → MT → XLIFF → Matecat → track changes → etc.). This was fragile, time-consuming, and error-prone.

**Key insight:** Matecat Align works well with markdown pairs, eliminating the need for XLIFF generation.

**Key change:** Linguistic review happens BEFORE TM creation, so the TM is human-verified quality from the start.

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: CNXML → EN Markdown                                │
│  Tool: cnxml-extract.js                                     │
│  Output: m68724-segments.en.md (with [[MATH:N]] placeholders│
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Machine Translation                                │
│  Tool: api-translate.js (automated via Málstaður API)       │
│  Sends whole files directly — all markers preserved intact  │
│  Includes 617 approved glossary terms per request           │
│  Output: m68724-segments.is.md in 02-mt-output/             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 3: Linguistic Review                                  │
│  User: Edit IS markdown in any editor (VS Code, etc.)       │
│  Input: MT output, possibly with simplified formatting      │
│  Output: 5-1.is.md in 03-faithful-translation/ (faithful translation)   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 4: TM Creation via Matecat Align                      │
│  Tool: prepare-for-align.js (prep), then Matecat Align      │
│  User: Upload reviewed EN + IS markdown to Matecat Align    │
│  Output: TMX file ← HUMAN-VERIFIED TM                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 5a: Inject translations into CNXML                    │
│  Tool: cnxml-inject.js                                      │
│  Output: Translated CNXML in 03-translated/                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 5b: Render to HTML                                    │
│  Tool: cnxml-render.js                                      │
│  Output: Semantic HTML in 05-publication/                   │
└─────────────────────────────────────────────────────────────┘
```

## Why This Order?

- TM created from human-verified translation, not MT
- No need to update TM after review
- One Matecat Align upload instead of two
- Editor reviews markdown (simpler than Matecat UI)

## What This Eliminates

| Eliminated | Why |
|------------|-----|
| XLIFF generation | Matecat Align handles segmentation |
| DOCX conversions | Work directly in markdown |
| Segmentation mismatch | We don't segment - Matecat does |
| Track Changes workflow | Review directly in markdown |
| Multiple Matecat uploads | One upload to Align tool |

---

## Step-by-Step Instructions

### Step 1a: CNXML → English Markdown

**Goal:** Extract structured English content from OpenStax CNXML source.

**Process:**
```bash
# Extract all modules in a chapter
node tools/cnxml-extract.js --chapter 5

# Or a single module
node tools/cnxml-extract.js --input books/efnafraedi-2e/01-source/ch05/m68724.cnxml
```

**Output:**
- `02-for-mt/ch05/m68724-segments.en.md` - English segments with `<!-- SEG:... -->` markers and `[[MATH:N]]` placeholders
- `02-structure/ch05/m68724-structure.json` - Document structure for reconstruction
- `02-structure/ch05/m68724-equations.json` - MathML equations keyed by placeholder ID

### Step 2: Machine Translation

**Goal:** Get initial Icelandic translation via the Málstaður API.

#### Method A: Automated via API (Recommended)

```bash
# Translate all modules in a chapter
node tools/api-translate.js --book efnafraedi-2e --chapter 5

# Preview what will be translated and estimated cost
node tools/api-translate.js --book efnafraedi-2e --chapter 5 --dry-run

# Translate a single module
node tools/api-translate.js --book efnafraedi-2e --chapter 5 --module m68724

# Translate an entire book
node tools/api-translate.js --book efnafraedi-2e
```

**Requirements:** `MALSTADUR_API_KEY` set in `.env` or environment.

**Features:**
- Sends whole `.en.md` files directly (no protection/splitting needed — API preserves all markers)
- Sends approved glossary terms with each request for terminology enforcement
- Skips modules that already have output (resumable — use `--force` to re-translate)
- Reports character count and cost estimate
- Normalizes Unicode subscripts/superscripts in API output

**Output:** `02-mt-output/ch05/m68724-segments.is.md` — ready for injection directly.

#### Method B: Manual via malstadur.is Web UI (Legacy)

For situations where the API is unavailable, the web UI method still works but requires additional protect/unprotect steps. See the [Legacy MT Workflow](#legacy-mt-workflow-web-ui) section at the end of this document.

---

### Step 3: Linguistic Review

**Goal:** Human editor produces faithful translation.

There are two paths for linguistic review:

#### Option A: Web-based Segment Editor (Recommended)

Use the segment editor at `/segment-editor` for module-by-module review:

1. Open the segment editor, select book/chapter/module
2. The editor loads segments from `03-faithful-translation/` if available, falling back to `02-mt-output/`
3. Edit segments for grammar, spelling, natural Icelandic phrasing, terminology
4. Submit for head editor review
5. When approved, `applyApprovedEdits()` writes reviewed segments to `03-faithful-translation/`
6. Inject + render produces faithful HTML for that module

**No initialization needed** — the segment editor falls back to `02-mt-output/` automatically.

**Module-level publication:** Each module is published as faithful individually when its review is approved. Other modules in the same chapter remain as mt-preview until reviewed.

#### Option B: Manual Offline Editing

For editing in VS Code or another text editor, first initialize the files:

```bash
# Initialize chapter for review (copies MT output to 03-faithful-translation)
node tools/init-faithful-review.js --chapter 5 --verbose

# Force overwrite if needed
node tools/init-faithful-review.js --chapter 5 --force
```

Then edit the segment files directly:
1. Open `03-faithful-translation/ch05/m68724-segments.is.md` in your editor
2. Review and edit for grammar, spelling, natural Icelandic phrasing, terminology
3. Run inject + render when ready:
   ```bash
   node tools/cnxml-inject.js --chapter 5
   node tools/cnxml-render.js --chapter 5 --track faithful
   ```

**Note:** `init-faithful-review.js` copies complete MT output so there are no missing segments during injection.

#### Review Guidelines (Both Options)

**What NOT to do:**
- NO localization (keep imperial units, American examples)
- NO adding content
- Focus only on making the translation faithful and well-written

**Deliverable:** Human-verified faithful translation that accurately represents the source in natural Icelandic.

---

### Step 4: TM Creation via Matecat Align

**Goal:** Create human-verified Translation Memory from reviewed content.

**Prepare files for Matecat Align:**
```bash
# From single file pair
node tools/prepare-for-align.js \
  --en books/efnafraedi-2e/02-for-mt/ch05/5-1.en.md \
  --is books/efnafraedi-2e/03-faithful-translation/ch05/5-1.is.md \
  --output-dir books/efnafraedi-2e/for-align/ch05

# From directories with split parts
node tools/prepare-for-align.js \
  --en-dir books/efnafraedi-2e/02-for-mt/ch05/ \
  --is-dir books/efnafraedi-2e/03-faithful-translation/ch05/ \
  --section 5-1 \
  --output-dir books/efnafraedi-2e/for-align/ch05
```

**Output:** Clean markdown files ready for Matecat Align:
- `for-align/ch05/5-1.en.clean.md`
- `for-align/ch05/5-1.is.clean.md`

**Matecat Align process:**
1. Go to [Matecat Align](https://www.matecat.com/align/)
2. Upload the EN and IS clean markdown files as a pair
3. Review alignment (Matecat handles segmentation)
4. Export TMX file

**Save to:** `tm/ch05/5-1.tmx` (human-verified TM)

---

### Step 5: Publication (Inject + Render)

**Goal:** Produce web-ready HTML from reviewed translations.

#### 5a: Inject translations into CNXML

After linguistic review, inject the reviewed segments back into the CNXML structure:

```bash
# Inject all modules in a chapter
node tools/cnxml-inject.js --chapter 1

# Or a single module
node tools/cnxml-inject.js --chapter 1 --module m68663
```

**Input:**
- Reviewed segments from `03-faithful-translation/ch01/` (or `02-mt-output/` for mt-preview)
- Structure JSON from `02-structure/ch01/`
- Equations JSON from `02-structure/ch01/`
- Original CNXML from `01-source/ch01/`

**Output:** Translated CNXML in `03-translated/ch01/m68663.cnxml` (one file per module)

#### 5b: Render CNXML to HTML

Render the translated CNXML to semantic HTML for web publication:

```bash
# Render all modules in a chapter
node tools/cnxml-render.js --chapter 1 --track faithful

# Or a single module
node tools/cnxml-render.js --chapter 1 --module m68663 --track faithful
```

**Input:** Translated CNXML from `03-translated/ch01/`

**Output:** Semantic HTML files in `05-publication/faithful/chapters/01/`:
- One HTML file per module with all IDs preserved
- Pre-rendered KaTeX equations (display and inline)
- Embedded page data JSON
- Absolute image paths for web serving

#### 5c: Publication Tracks

The publication system has **three tracks** that replace each other as the translation matures:

| Track | When | Label | Purpose |
|-------|------|-------|---------|
| `mt-preview` | After MT upload | Vélþýðing - ekki yfirfarin | Let readers access content immediately |
| `faithful` | After Pass 1 approved | Ritstýrð þýðing | Human-verified faithful translation |
| `localized` | After Pass 2 approved | Staðfærð útgáfa | Culturally adapted for Iceland |

**Important:** All publications require **HEAD_EDITOR** approval.

#### Option A: Via Web UI (Recommended)

1. Go to the workflow UI at `http://localhost:3000/workflow`
2. Select the book and chapter
3. Review publication readiness
4. Click "Publish MT Preview" / "Publish Faithful" / "Publish Localized"

#### Option B: Via API

```bash
# Check publication status
curl http://localhost:3000/api/publication/efnafraedi-2e/5/status

# Check readiness for each track
curl http://localhost:3000/api/publication/efnafraedi-2e/5/readiness

# Publish MT preview (requires HEAD_EDITOR auth)
curl -X POST http://localhost:3000/api/publication/efnafraedi-2e/5/mt-preview

# Publish faithful translation (requires HEAD_EDITOR auth)
curl -X POST http://localhost:3000/api/publication/efnafraedi-2e/5/faithful

# Publish localized content (requires HEAD_EDITOR auth)
curl -X POST http://localhost:3000/api/publication/efnafraedi-2e/5/localized
```

#### Option C: Via CLI Tools

```bash
# Inject + render for faithful track
node tools/cnxml-inject.js --chapter 5
node tools/cnxml-render.js --chapter 5 --track faithful

# Inject + render for MT preview track (uses MT output segments)
node tools/cnxml-inject.js --chapter 5 --lang is
node tools/cnxml-render.js --chapter 5 --track mt-preview
```

#### MT Preview Warning Banner

When MT preview is published, the content automatically includes a warning banner:

```markdown
:::warning{title="Vélþýðing"}
Þessi texti er vélþýddur og hefur ekki verið yfirfarinn af ritstjóra.
Villur kunna að vera til staðar. Ritstýrð útgáfa er í vinnslu.
:::
```

This banner is removed when faithful translation is published.

**Published at:** [namsbokasafn.is](https://namsbokasafn.is)

---

## Directory Structure

```
books/efnafraedi-2e/
├── 01-source/              # 🔒 READ ONLY - OpenStax CNXML originals
│   └── ch05/
│       └── m68724.cnxml
├── 02-for-mt/              # EN segments for MT (Step 1a output)
│   └── ch05/
│       └── m68724-segments.en.md    # With <!-- SEG:... --> and [[MATH:N]]
├── 02-structure/           # Document structure (Step 1a output)
│   └── ch05/
│       ├── m68724-structure.json    # Document skeleton
│       └── m68724-equations.json    # MathML equations
├── 02-mt-output/           # 🔒 READ ONLY - IS segments from MT
│   └── ch05/
│       └── m68724-segments.is.md    # Step 2 output
├── 03-faithful-translation/            # ✏️ Reviewed IS segments
│   └── ch05/
│       └── m68724-segments.is.md    # Step 3 output (faithful)
├── 03-translated/          # Translated CNXML (Step 5a output)
│   └── ch05/
│       └── m68724.cnxml             # Reconstructed translated CNXML
├── for-align/              # Staging for Matecat Align
│   └── ch05/
│       ├── 5-1.en.clean.md
│       └── 5-1.is.clean.md
├── tm/                     # 🔒 READ ONLY - TMX from Matecat Align
│   └── ch05/
│       └── 5-1.tmx                  # Step 4 output (human-verified TM)
├── 04-localized-content/           # ✏️ Pass 2 output
│   └── ch05/
│       └── m68724-segments.is.md    # Localized translation
└── 05-publication/         # ✏️ Web-ready HTML (Step 5b output)
    ├── mt-preview/             # Unreviewed MT (with warning banner)
    │   └── chapters/05/
    ├── faithful/               # Human-reviewed translations
    │   └── chapters/05/
    └── localized/              # Culturally adapted content
        └── chapters/05/
```

---

## Tools Summary

### Active
| Tool | Purpose | Step |
|------|---------|------|
| `cnxml-extract.js` | CNXML → segmented EN markdown + structure JSON | 1 |
| `api-translate.js` | Automated MT via Málstaður API (with glossary) | 2 |
| `prepare-for-align.js` | Clean markdown for Matecat Align | 4 |
| `cnxml-inject.js` | Inject translations back into CNXML structure | 5a |
| `cnxml-render.js` | Render translated CNXML to semantic HTML | 5b |

### Legacy (Web UI only)
| Tool | Purpose | When needed |
|------|---------|-------------|
| `protect-segments-for-mt.js` | Protect tags & links, split for web UI upload | Only when using malstadur.is web UI |
| `unprotect-segments.js` | Restore tags & links in web UI MT output | Only when using malstadur.is web UI |

### External Services
| Service | Purpose | Step |
|---------|---------|------|
| [Málstaður API](https://api.malstadur.is) | Icelandic MT (via `api-translate.js`) | 2 |
| [Matecat Align](https://matecat.com/align/) | TM creation | 4 |

### Deprecated
| Tool | Why Deprecated |
|------|----------------|
| `chapter-assembler.js` | Replaced by `cnxml-render.js` for HTML output |
| `add-frontmatter.js` | Metadata embedded in HTML by `cnxml-render.js` |
| `compile-chapter.js` | End-of-chapter extraction handled by `cnxml-render.js` |
| `pipeline-runner.js` | Replaced by `cnxml-extract.js` for extraction |
| `cnxml-to-md.js` | Replaced by `cnxml-extract.js` |
| `split-for-erlendur.js` | Replaced by `protect-segments-for-mt.js` (splits + protects) |
| `create-bilingual-xliff.js` | Matecat Align handles segmentation |
| `md-to-xliff.js` | No longer generating XLIFF |
| `xliff-to-md.js` | No longer processing XLIFF |
| `cnxml-to-xliff.js` | No longer generating XLIFF |
| `xliff-to-tmx.js` | Matecat exports TMX directly |

---

## Quality Checkpoints

### After Step 3 (Faithful Translation)
- [ ] All sections translated
- [ ] Grammar and spelling correct
- [ ] Terminology consistent with glossary
- [ ] Technical accuracy preserved
- [ ] Natural Icelandic phrasing
- [ ] No localization changes (faithful to source)

### After Step 4 (TM Creation)
- [ ] TMX file exported from Matecat Align
- [ ] Spot-check segment alignment
- [ ] TMX saved to `tm/` folder

### After Step 5 (Publication)
- [ ] Markdown renders correctly
- [ ] Frontmatter complete
- [ ] Equations render properly
- [ ] Images display correctly
- [ ] Deployed to web

---

## Localization (Pass 2 - Future)

After Step 3 (faithful translation complete):

```
03-faithful-translation/ch05/5-1.is.md
        ↓
    Localization edits (SI units, Icelandic examples)
        ↓
04-localized-content/ch05/5-1.is.md
        ↓
05-publication/localized/chapters/05/
```

This is documented separately in [pass2-localization.md](../editorial/pass2-localization.md).

---

## Quick Reference

```bash
# Step 1: Extract EN segments from CNXML
node tools/cnxml-extract.js --chapter 5

# Step 2: Machine translate via API (automated)
node tools/api-translate.js --book efnafraedi-2e --chapter 5
# Or dry-run first to see cost estimate:
node tools/api-translate.js --book efnafraedi-2e --chapter 5 --dry-run

# Step 3 Option A: Review via segment editor at /segment-editor (recommended)
# Step 3 Option B: Manual editing — first initialize, then edit files
# node tools/init-faithful-review.js --chapter 5 --verbose

# Step 4: Prepare for Matecat Align
node tools/prepare-for-align.js \
  --en books/efnafraedi-2e/02-for-mt/ch05/5-1.en.md \
  --is books/efnafraedi-2e/03-faithful-translation/ch05/5-1.is.md \
  --output-dir books/efnafraedi-2e/for-align/ch05
# Then upload to Matecat Align (manual)

# Step 5a: Inject translations into CNXML
node tools/cnxml-inject.js --chapter 5

# Step 5b: Render to HTML and publish
node tools/cnxml-render.js --chapter 5 --track faithful
# or via API:
curl -X POST http://localhost:3000/api/publication/efnafraedi-2e/5/faithful

# MT preview (uses MT output directly, before review):
node tools/cnxml-inject.js --chapter 5
node tools/cnxml-render.js --chapter 5 --track mt-preview
# or via API:
curl -X POST http://localhost:3000/api/publication/efnafraedi-2e/5/mt-preview
```

## Legacy MT Workflow (Web UI)

> These steps are only needed when using the malstadur.is **web UI** instead of `api-translate.js`. The API method (Step 2 above) does not require protection or unprotection.

### Step 1b (Legacy): Protect & Split for Web UI

**Goal:** Make segment files safe for the malstadur.is web UI, which strips HTML comments and markdown link URLs.

```bash
node tools/protect-segments-for-mt.js --batch books/efnafraedi-2e/02-for-mt/ch05/
```

**What it does:**
1. Converts `<!-- SEG:... -->` → `{{SEG:...}}` (web UI strips HTML comments)
2. Protects links: `[text](url)` → `{{LINK:N}}text{{/LINK}}` (web UI strips URLs)
3. Splits at paragraph boundaries if visible character count exceeds 12K
4. Writes `-links.json` sidecar with protected URLs

### Step 2 (Legacy): Upload to malstadur.is

1. In the pipeline UI, click **"↓ Sækja EN"** to download protected files
2. Upload to [malstadur.is](https://malstadur.is)
3. Download translated `.is.md` files
4. In the pipeline UI, click **"↑ Hlaða upp IS"** to upload and auto-unprotect

### Step 2b (Legacy): Unprotect & Merge

```bash
node tools/unprotect-segments.js --chapter 5 --verbose
```

**What it does:** Merges split files, converts `{{SEG:...}}` → `<!-- SEG:... -->`, restores links from `-links.json`.

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/publication/:book/:chapter/status` | GET | Publication status for all tracks |
| `/api/publication/:book/:chapter/readiness` | GET | Check what's ready to publish |
| `/api/publication/:book/:chapter/mt-preview` | POST | Publish MT preview (HEAD_EDITOR) |
| `/api/publication/:book/:chapter/faithful` | POST | Publish faithful (HEAD_EDITOR) |
| `/api/publication/:book/:chapter/localized` | POST | Publish localized (HEAD_EDITOR) |
| `/api/publication/:book/overview` | GET | Overview of all chapters |
