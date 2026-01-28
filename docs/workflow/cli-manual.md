# CLI Manual: Translation Pipeline

This manual provides copy-paste ready commands for processing chapters through the translation pipeline without using the server UI.

## Quick Reference Card

```bash
# Step 1: CNXML → EN Markdown (by chapter)
npm run pipeline -- --chapter 2 --book efnafraedi

# Step 2: Machine Translation → Upload to malstadur.is manually

# Step 3: Post-MT Cleanup
npm run post-mt -- --chapter efnafraedi ch02

# Step 4: Linguistic Review → Edit files manually, save to 03-faithful/

# Step 5: Prepare for Matecat Align
node tools/prepare-for-align.js \
  --en-dir books/efnafraedi/02-for-mt/ch02 \
  --is-dir books/efnafraedi/03-faithful/ch02 \
  --output-dir books/efnafraedi/for-align/ch02

# Step 6: Publication
node tools/chapter-assembler.js --chapter 2 --book efnafraedi --track mt-preview
```

---

## Step-by-Step Workflow

### Step 1: CNXML → English Markdown

Converts OpenStax CNXML source files to markdown with equation placeholders and sidecar files.

**By chapter (recommended):**
```bash
# Chapter 2
npm run pipeline -- --chapter 2 --book efnafraedi

# Chapter 3
npm run pipeline -- --chapter 3 --book efnafraedi

# Chapter 4
npm run pipeline -- --chapter 4 --book efnafraedi
```

**By module ID (advanced):**
```bash
node tools/pipeline-runner.js m68685 --output-dir books/efnafraedi/02-for-mt/ch02
```

**Output:** `books/efnafraedi/02-for-mt/ch##/`
- `{section}.en.md` - English markdown with `[[EQ:n]]` equation placeholders
- `{section}-equations.json` - LaTeX equations for restoration
- `{section}-figures.json` - Figure references
- `{section}-tables.json` - Table data
- `{section}-strings.json` - Translatable strings (titles, captions)

**Options:**
```bash
npm run pipeline -- --chapter 2 --book efnafraedi --verbose  # Detailed output
npm run pipeline -- --chapter 2 --book efnafraedi --skip-xliff  # Skip XLIFF generation
```

**Split large files (>18K characters):**
```bash
node tools/split-for-erlendur.js books/efnafraedi/02-for-mt/ch02/2-1.en.md
# Creates: 2-1(a).en.md, 2-1(b).en.md, etc.
```

---

### Step 2: Machine Translation (Manual)

1. Go to [malstadur.is](https://malstadur.is)
2. Upload the English markdown files from `02-for-mt/ch##/`
3. Download translated output
4. Save to `02-mt-output/ch##/` with `.is.md` extension

**Example file mapping:**
| Upload | Download to |
|--------|-------------|
| `02-for-mt/ch02/2-1.en.md` | `02-mt-output/ch02/2-1.is.md` |
| `02-for-mt/ch02/2-1(a).en.md` | `02-mt-output/ch02/2-1(a).is.md` |

**Important:** Preserve the file naming pattern - only change `.en.md` to `.is.md`

---

### Step 3: Post-MT Cleanup

Restores equations, figures, links, and tables from sidecar JSON files.

**By chapter (recommended):**
```bash
# Process all files in a chapter
npm run post-mt -- --chapter efnafraedi ch02
npm run post-mt -- --chapter efnafraedi ch03
npm run post-mt -- --chapter efnafraedi ch04
```

**Single file:**
```bash
npm run post-mt -- books/efnafraedi/02-mt-output/ch02/2-1.is.md
```

**Batch processing:**
```bash
npm run post-mt -- --batch books/efnafraedi/02-mt-output/ch02/
```

**Options:**
```bash
npm run post-mt -- --chapter efnafraedi ch02 --dry-run   # Preview changes
npm run post-mt -- --chapter efnafraedi ch02 --verbose   # Detailed output
npm run post-mt -- --chapter efnafraedi ch02 --skip equations  # Skip specific step
```

**Pipeline steps (in order):**
1. `images` - Restore image markdown from MT-stripped blocks
2. `figures` - Restore figure numbers and cross-references
3. `links` - Convert `[text]{url="..."}` back to standard markdown links
4. `strings` - Update sidecar with translated titles
5. `tables` - Restore tables from sidecar JSON
6. `equations` - Replace `[[EQ:n]]` with LaTeX from sidecar
7. `directives` - Add missing `:::` closing markers

---

### Step 4: Linguistic Review (Manual)

Human editor reviews and corrects the MT output.

**Process:**
1. Open files from `02-mt-output/ch##/` in your editor
2. Review for:
   - Grammar and spelling
   - Natural Icelandic phrasing
   - Terminology consistency (check glossary)
   - Technical accuracy
3. Save reviewed files to `03-faithful/ch##/`

**Example:**
```bash
# Copy structure first
mkdir -p books/efnafraedi/03-faithful/ch02

# Edit and save files
cp books/efnafraedi/02-mt-output/ch02/2-1.is.md books/efnafraedi/03-faithful/ch02/
# Then edit the file...
```

**What NOT to do:**
- No localization (keep imperial units, American examples)
- No adding content
- Focus only on making translation faithful and well-written

---

### Step 5: Prepare for Matecat Align

Creates clean markdown pairs for TM creation.

**Single file pair:**
```bash
node tools/prepare-for-align.js \
  --en books/efnafraedi/02-for-mt/ch02/2-1.en.md \
  --is books/efnafraedi/03-faithful/ch02/2-1.is.md \
  --output-dir books/efnafraedi/for-align/ch02
```

**Chapter directory (with split parts):**
```bash
# Chapter 2
node tools/prepare-for-align.js \
  --en-dir books/efnafraedi/02-for-mt/ch02 \
  --is-dir books/efnafraedi/03-faithful/ch02 \
  --output-dir books/efnafraedi/for-align/ch02

# Chapter 3
node tools/prepare-for-align.js \
  --en-dir books/efnafraedi/02-for-mt/ch03 \
  --is-dir books/efnafraedi/03-faithful/ch03 \
  --output-dir books/efnafraedi/for-align/ch03
```

**Specific section only:**
```bash
node tools/prepare-for-align.js \
  --en-dir books/efnafraedi/02-for-mt/ch02 \
  --is-dir books/efnafraedi/03-faithful/ch02 \
  --section 2-1 \
  --output-dir books/efnafraedi/for-align/ch02
```

**Output:** Clean markdown ready for alignment:
- `for-align/ch02/2-1.en.clean.md`
- `for-align/ch02/2-1.is.clean.md`

**Then upload to Matecat Align:**
1. Go to [Matecat Align](https://www.matecat.com/align/)
2. Upload the EN/IS clean markdown pair
3. Review alignment
4. Export TMX file
5. Save to `tm/ch02/2-1.tmx`

---

### Step 6: Publication

Assembles modules into web-ready publication files.

**MT Preview (unreviewed):**
```bash
# Publish MT preview for immediate access
node tools/chapter-assembler.js --chapter 2 --book efnafraedi --track mt-preview
node tools/chapter-assembler.js --chapter 3 --book efnafraedi --track mt-preview
node tools/chapter-assembler.js --chapter 4 --book efnafraedi --track mt-preview
```

**Faithful (after Pass 1 review):**
```bash
node tools/chapter-assembler.js --chapter 2 --book efnafraedi --track faithful
```

**Localized (after Pass 2):**
```bash
node tools/chapter-assembler.js --chapter 2 --book efnafraedi --track localized
```

**Options:**
```bash
node tools/chapter-assembler.js --chapter 2 --book efnafraedi --track faithful --dry-run
node tools/chapter-assembler.js --chapter 2 --book efnafraedi --track faithful --verbose
```

**Output:** `books/efnafraedi/05-publication/{track}/chapters/##/`
- 7 stripped module files (intro, 2.1-2.7)
- `2-key-terms.is.md` - Aggregated key terms
- `2-key-equations.is.md` - Aggregated equations
- `2-summary.is.md` - Section summaries
- `2-exercises.is.md` - Aggregated exercises

**Publication Tracks:**
| Track | Source | Label |
|-------|--------|-------|
| `mt-preview` | `02-mt-output/` | Vélþýðing - ekki yfirfarin |
| `faithful` | `03-faithful/` | Ritstýrð þýðing |
| `localized` | `04-localized/` | Staðfærð útgáfa |

---

## Pilot Chapters (1-4) Quick Commands

### Chapter 1
```bash
npm run pipeline -- --chapter 1 --book efnafraedi
npm run post-mt -- --chapter efnafraedi ch01
node tools/chapter-assembler.js --chapter 1 --book efnafraedi --track mt-preview
```

### Chapter 2
```bash
npm run pipeline -- --chapter 2 --book efnafraedi
npm run post-mt -- --chapter efnafraedi ch02
node tools/chapter-assembler.js --chapter 2 --book efnafraedi --track mt-preview
```

### Chapter 3
```bash
npm run pipeline -- --chapter 3 --book efnafraedi
npm run post-mt -- --chapter efnafraedi ch03
node tools/chapter-assembler.js --chapter 3 --book efnafraedi --track mt-preview
```

### Chapter 4
```bash
npm run pipeline -- --chapter 4 --book efnafraedi
npm run post-mt -- --chapter efnafraedi ch04
node tools/chapter-assembler.js --chapter 4 --book efnafraedi --track mt-preview
```

---

## Troubleshooting

### Common Errors

**"File too large for Erlendur"**
```bash
# Split files >18,000 characters
node tools/split-for-erlendur.js books/efnafraedi/02-for-mt/ch02/2-1.en.md
```

**"Missing sidecar file"**
```bash
# Re-run Step 1 to regenerate sidecars
npm run pipeline -- --chapter 2 --book efnafraedi
```

**"Equations not restored"**
```bash
# Run equation restoration manually
node tools/apply-equations.js books/efnafraedi/02-mt-output/ch02/2-1.is.md
```

**"Directives broken (missing :::)"**
```bash
# Repair directive blocks
node tools/repair-directives.js books/efnafraedi/02-mt-output/ch02/2-1.is.md
```

### Backup Before Editing

Always create backups before modifying files in `03-faithful/`, `04-localized/`, or `05-publication/`:
```bash
cp file.is.md file.is.md.$(date +%Y-%m-%d-%H%M).bak
```

### Verify File Integrity

```bash
# Check markdown for common issues
node tools/validate-chapter.js books/efnafraedi/03-faithful/ch02
```

---

## File Reference

### Directory Structure
```
books/efnafraedi/
├── 01-source/              # 🔒 READ ONLY - OpenStax CNXML
├── 02-for-mt/              # EN markdown for MT
│   └── ch##/
│       ├── {section}.en.md
│       ├── {section}-equations.json
│       ├── {section}-figures.json
│       ├── {section}-tables.json
│       └── {section}-strings.json
├── 02-mt-output/           # 🔒 READ ONLY - MT output
│   └── ch##/
│       └── {section}.is.md
├── 03-faithful/            # ✏️ Reviewed translations
│   └── ch##/
│       └── {section}.is.md
├── for-align/              # Staging for Matecat
│   └── ch##/
│       ├── {section}.en.clean.md
│       └── {section}.is.clean.md
├── tm/                     # 🔒 READ ONLY - TMX files
│   └── ch##/
│       └── {section}.tmx
├── 04-localized/           # ✏️ Pass 2 output
└── 05-publication/         # ✏️ Web-ready
    ├── mt-preview/
    ├── faithful/
    └── localized/
```

### File Naming Conventions

| Pattern | Example | Description |
|---------|---------|-------------|
| `{N}-{N}.en.md` | `2-1.en.md` | English source (chapter-section) |
| `{N}-{N}.is.md` | `2-1.is.md` | Icelandic translation |
| `{N}-{N}(a).en.md` | `2-1(a).en.md` | Split part for large files |
| `intro.en.md` | `intro.en.md` | Chapter introduction |
| `{N}-{N}-equations.json` | `2-1-equations.json` | Equation sidecar |
| `{N}-{N}-figures.json` | `2-1-figures.json` | Figure sidecar |
| `{N}-{N}-tables.json` | `2-1-tables.json` | Table sidecar |
| `{N}-{N}-strings.json` | `2-1-strings.json` | Translatable strings |

### Sidecar Files Explained

**equations.json** - Maps `[[EQ:n]]` placeholders to LaTeX:
```json
{
  "1": "E = mc^2",
  "2": "F = ma"
}
```

**figures.json** - Figure metadata and cross-references:
```json
{
  "figures": [
    {"id": "fig-2-1", "number": "2.1", "caption": "..."}
  ]
}
```

**tables.json** - Full table data for complex tables:
```json
{
  "tables": [
    {"id": "table-2-1", "rows": [...]}
  ]
}
```

**strings.json** - Translatable UI strings:
```json
{
  "title": "Early Ideas in Atomic Theory",
  "titleTranslated": null
}
```

---

## NPM Script Reference

| Script | Command | Description |
|--------|---------|-------------|
| `pipeline` | `npm run pipeline -- [args]` | CNXML → EN markdown |
| `post-mt` | `npm run post-mt -- [args]` | Post-MT cleanup |
| `apply-equations` | `npm run apply-equations -- [file]` | Restore equations |
| `cnxml-to-md` | `npm run cnxml-to-md -- [args]` | Direct CNXML conversion |
| `update-status` | `npm run update-status -- [args]` | Update chapter status |
| `validate` | `npm run validate` | Validate status files |

---

## See Also

- [Simplified Workflow](simplified-workflow.md) - Full workflow overview
- [Pass 1 Linguistic Review](../editorial/pass1-linguistic.md) - Editorial guidelines
- [Terminology Standards](../editorial/terminology.md) - Glossary usage
- [CLI Reference](../technical/cli-reference.md) - Full tool documentation
