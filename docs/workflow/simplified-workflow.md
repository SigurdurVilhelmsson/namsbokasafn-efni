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
│  Tool: cnxml-to-md.js, pipeline-runner.js                   │
│  Output: 5-1.en.md (with equations, structure preserved)    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Machine Translation                                │
│  User: Upload to malstadur.is (Erlendur)                    │
│  Output: 5-1.is.md (MT output)                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 3: Linguistic Review                                  │
│  User: Edit IS markdown in any editor (VS Code, etc.)       │
│  Input: MT output, possibly with simplified formatting      │
│  Output: 5-1.is.md in 03-faithful/ (faithful translation)   │
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
│  Step 5: Publication                                        │
│  Tool: Existing publication pipeline                        │
│  Output: Web-ready markdown in 05-publication/              │
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

### Step 1: CNXML → English Markdown

**Goal:** Extract structured English content from OpenStax CNXML source.

**Process:**
```bash
# Full pipeline (fetches CNXML, converts to markdown with equations)
node tools/pipeline-runner.js <module-id> --output-dir books/efnafraedi/02-for-mt/ch05

# Or just the conversion (if CNXML already fetched)
node tools/cnxml-to-md.js <cnxml-file> --output 5-1.en.md
```

**Output:**
- `02-for-mt/ch05/5-1.en.md` - English markdown with `[[EQ:n]]` equation placeholders
- `02-for-mt/ch05/5-1-equations.json` - LaTeX equations for restoration

**For large files (>18K chars):**
```bash
node tools/split-for-erlendur.js 5-1.en.md
# Creates 5-1(a).en.md, 5-1(b).en.md, etc.
```

---

### Step 2: Machine Translation

**Goal:** Get initial Icelandic translation via malstadur.is.

**Process:**
1. Go to [malstadur.is](https://malstadur.is)
2. Upload the English markdown file(s)
3. Download the translated Icelandic output

**Save to:** `02-mt-output/ch05/5-1.is.md` (or split parts 5-1(a).is.md, etc.)

**Note:** This is raw MT output - it will be reviewed in the next step.

---

### Step 3: Linguistic Review

**Goal:** Human editor produces faithful translation.

**Process:**
1. Open the MT output in any text editor (VS Code, Typora, etc.)
2. Review and edit for:
   - Grammar and spelling
   - Natural Icelandic phrasing
   - Sentence flow and readability
   - Terminology consistency (check glossary)
   - Technical accuracy preserved

**What NOT to do:**
- NO localization (keep imperial units, American examples)
- NO adding content
- Focus only on making the translation faithful and well-written

**Save to:** `03-faithful/ch05/5-1.is.md`

**Deliverable:** Human-verified faithful translation that accurately represents the source in natural Icelandic.

---

### Step 4: TM Creation via Matecat Align

**Goal:** Create human-verified Translation Memory from reviewed content.

**Prepare files for Matecat Align:**
```bash
# From single file pair
node tools/prepare-for-align.js \
  --en books/efnafraedi/02-for-mt/ch05/5-1.en.md \
  --is books/efnafraedi/03-faithful/ch05/5-1.is.md \
  --output-dir books/efnafraedi/for-align/ch05

# From directories with split parts
node tools/prepare-for-align.js \
  --en-dir books/efnafraedi/02-for-mt/ch05/ \
  --is-dir books/efnafraedi/03-faithful/ch05/ \
  --section 5-1 \
  --output-dir books/efnafraedi/for-align/ch05
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

### Step 5: Publication

**Goal:** Prepare web-ready content with appropriate labeling.

#### 5a: Chapter Assembly (12-File Structure)

Before publishing, module files are assembled into the website's 12-file structure per chapter:

```bash
# Assemble chapter from faithful translations
node tools/chapter-assembler.js --chapter 1 --book efnafraedi --track faithful

# Or via pipeline-runner with assembly
node tools/pipeline-runner.js --chapter 1 --book efnafraedi --assemble-only --assemble-track faithful
```

**Input:** 7 module files from `03-faithful/ch01/`

**Output:** 12 publication files in `05-publication/faithful/chapters/01/`:
- 7 stripped module files (intro, 1.1-1.6) - exercises/summary/glossary removed
- `1-key-terms.is.md` - aggregated, alphabetized definitions
- `1-key-equations.is.md` - aggregated equation references
- `1-summary.is.md` - section-by-section summaries
- `1-exercises.is.md` - aggregated with running numbers and section headers

#### 5b: Publication Tracks

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
curl http://localhost:3000/api/publication/efnafraedi/5/status

# Check readiness for each track
curl http://localhost:3000/api/publication/efnafraedi/5/readiness

# Publish MT preview (requires HEAD_EDITOR auth)
curl -X POST http://localhost:3000/api/publication/efnafraedi/5/mt-preview

# Publish faithful translation (requires HEAD_EDITOR auth)
curl -X POST http://localhost:3000/api/publication/efnafraedi/5/faithful

# Publish localized content (requires HEAD_EDITOR auth)
curl -X POST http://localhost:3000/api/publication/efnafraedi/5/localized
```

#### Option C: Via CLI Tool

```bash
# Add frontmatter with MT preview label
node tools/add-frontmatter.js \
  books/efnafraedi/02-mt-output/ch05/5-1.is.md \
  --mt-preview \
  --title "Grundvallaratriði orku"

# Add frontmatter with faithful label
node tools/add-frontmatter.js \
  books/efnafraedi/03-faithful/ch05/5-1.is.md \
  --track faithful \
  --title "Grundvallaratriði orku"

# Add frontmatter with localized label
node tools/add-frontmatter.js \
  books/efnafraedi/04-localized/ch05/5-1.is.md \
  --track localized \
  --title "Grundvallaratriði orku"
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

**Published at:** [efnafraedi.app](https://efnafraedi.app)

---

## Directory Structure

```
books/efnafraedi/
├── 01-source/              # 🔒 READ ONLY - OpenStax CNXML originals
├── 02-for-mt/              # EN markdown for MT
│   └── ch05/
│       ├── 5-1.en.md           # Step 1 output
│       ├── 5-1(a).en.md        # Split for Erlendur (if needed)
│       ├── 5-1(b).en.md
│       └── 5-1-equations.json
├── 02-mt-output/           # 🔒 READ ONLY - IS markdown from MT
│   └── ch05/
│       ├── 5-1.is.md           # Step 2 output (or split parts)
│       └── ...
├── 03-faithful/            # ✏️ Reviewed IS markdown
│   └── ch05/
│       └── 5-1.is.md           # Step 3 output (faithful translation)
├── for-align/              # Staging for Matecat Align
│   └── ch05/
│       ├── 5-1.en.clean.md     # Cleaned EN for alignment
│       └── 5-1.is.clean.md     # Cleaned IS for alignment
├── tm/                     # 🔒 READ ONLY - TMX from Matecat Align
│   └── ch05/
│       └── 5-1.tmx             # Step 4 output (human-verified TM)
├── 04-localized/           # ✏️ Pass 2 output
│   └── ch05/
│       └── 5-1.is.md           # Localized translation
└── 05-publication/         # ✏️ Web-ready content
    ├── mt-preview/             # Unreviewed MT (with warning banner)
    │   └── chapters/05/
    ├── faithful/               # Human-reviewed translations
    │   └── chapters/05/
    └── localized/              # Culturally adapted content
        └── chapters/05/        # Step 5 final output
```

---

## Tools Summary

### Keep (Essential)
| Tool | Purpose | Step |
|------|---------|------|
| `pipeline-runner.js` | Full CNXML → markdown pipeline | 1 |
| `cnxml-to-md.js` | CNXML → Markdown with equations | 1 |
| `split-for-erlendur.js` | Split large files for MT | 1 |
| `prepare-for-align.js` | Clean markdown for Matecat Align | 4 |
| `chapter-assembler.js` | Assemble 7 modules → 12 publication files | 5 |
| `add-frontmatter.js` | Add metadata for publication | 5 |

### External Services
| Service | Purpose | Step |
|---------|---------|------|
| [malstadur.is](https://malstadur.is) | Icelandic MT | 2 |
| [Matecat Align](https://matecat.com/align/) | TM creation | 4 |

### Deprecated
| Tool | Why Deprecated |
|------|----------------|
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
03-faithful/ch05/5-1.is.md
        ↓
    Localization edits (SI units, Icelandic examples)
        ↓
04-localized/ch05/5-1.is.md
        ↓
05-publication/localized/chapters/05/
```

This is documented separately in [pass2-localization.md](../editorial/pass2-localization.md).

---

## Quick Reference

```bash
# Step 1: Generate EN markdown from CNXML
node tools/pipeline-runner.js m68724 --output-dir books/efnafraedi/02-for-mt/ch05

# Step 2: Upload to malstadur.is (manual), save to 02-mt-output/

# Step 2b (Optional): Publish MT preview immediately
node tools/chapter-assembler.js --chapter 5 --book efnafraedi --track mt-preview
# or via API:
curl -X POST http://localhost:3000/api/publication/efnafraedi/5/mt-preview

# Step 3: Review MT output, save to 03-faithful/ (manual)

# Step 3b: Assemble and publish faithful translation (replaces MT preview)
node tools/chapter-assembler.js --chapter 5 --book efnafraedi --track faithful
# or via API:
curl -X POST http://localhost:3000/api/publication/efnafraedi/5/faithful

# Step 4: Prepare for Matecat Align
node tools/prepare-for-align.js \
  --en books/efnafraedi/02-for-mt/ch05/5-1.en.md \
  --is books/efnafraedi/03-faithful/ch05/5-1.is.md \
  --output-dir books/efnafraedi/for-align/ch05
# Then upload to Matecat Align (manual)

# Step 5 (Optional): Localize and publish (replaces faithful)
# After Pass 2 review is complete:
node tools/chapter-assembler.js --chapter 5 --book efnafraedi --track localized
# or via API:
curl -X POST http://localhost:3000/api/publication/efnafraedi/5/localized
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/publication/:book/:chapter/status` | GET | Publication status for all tracks |
| `/api/publication/:book/:chapter/readiness` | GET | Check what's ready to publish |
| `/api/publication/:book/:chapter/mt-preview` | POST | Publish MT preview (HEAD_EDITOR) |
| `/api/publication/:book/:chapter/faithful` | POST | Publish faithful (HEAD_EDITOR) |
| `/api/publication/:book/:chapter/localized` | POST | Publish localized (HEAD_EDITOR) |
| `/api/publication/:book/overview` | GET | Overview of all chapters |
