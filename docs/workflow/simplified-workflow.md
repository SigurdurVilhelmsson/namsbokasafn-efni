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

**Goal:** Prepare web-ready content.

**Process:**
1. Apply equations from `5-1-equations.json` if needed
2. Add frontmatter
3. Copy to publication folder

```bash
# Add frontmatter to faithful translation
node tools/add-frontmatter.js \
  --input books/efnafraedi/03-faithful/ch05/5-1.is.md \
  --output books/efnafraedi/05-publication/faithful/chapters/05/5-1.md \
  --title "Grundvallaratriði orku" \
  --section "5.1" \
  --version faithful
```

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
├── 04-localized/           # ✏️ Pass 2 output (future)
└── 05-publication/         # ✏️ Web-ready content
    └── faithful/
        └── chapters/05/        # Step 5 output
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

# Step 2: Upload to malstadur.is (manual)

# Step 3: Review MT output, save to 03-faithful/ (manual)

# Step 4: Prepare for Matecat Align
node tools/prepare-for-align.js \
  --en books/efnafraedi/02-for-mt/ch05/5-1.en.md \
  --is books/efnafraedi/03-faithful/ch05/5-1.is.md \
  --output-dir books/efnafraedi/for-align/ch05
# Then upload to Matecat Align (manual)

# Step 5: Publish
node tools/add-frontmatter.js \
  --input books/efnafraedi/03-faithful/ch05/5-1.is.md \
  --output books/efnafraedi/05-publication/faithful/chapters/05/5-1.md \
  --title "Grundvallaratriði orku" --section "5.1" --version faithful
```
