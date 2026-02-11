# CLI Reference

Command-line tools for the Extract-Inject-Render translation pipeline.

> See [master-pipeline.md](../workflow/master-pipeline.md) for the full workflow context.
> See [simplified-workflow.md](../workflow/simplified-workflow.md) for the 5-step overview.

---

## Active Tools

| Tool | Purpose | Pipeline Step |
|------|---------|---------------|
| `cnxml-extract.js` | Extract segments from CNXML | Step 1a |
| `protect-segments-for-mt.js` | Protect markers, split for MT | Step 1b |
| `restore-segments-from-mt.js` | Restore markers in MT output | Post-MT |
| `cnxml-inject.js` | Inject translations into CNXML | Step 5a |
| `cnxml-render.js` | Render CNXML to semantic HTML | Step 5b |
| `prepare-for-align.js` | Prepare files for Matecat Align | Step 4 |
| `validate-chapter.js` | Validate chapter content | Validation |

---

## cnxml-extract.js

Extracts translatable segments from CNXML while preserving document structure. Produces three outputs: segments markdown, structure JSON, and equations JSON.

```bash
node tools/cnxml-extract.js --chapter <num> [--module <id>] [options]
node tools/cnxml-extract.js --input <cnxml-file> [options]
```

| Option | Description |
|--------|-------------|
| `--chapter <num>` | Process all modules in a chapter |
| `--module <id>` | Specific module ID (e.g., m68724) |
| `--input <file>` | Input CNXML file path |
| `--output-dir <dir>` | Output directory (default: auto-determined) |
| `--verbose` | Show detailed progress |

**Output:**
```
02-for-mt/ch05/m68724-segments.en.md     # EN text segments with <!-- SEG:id --> markers
02-structure/ch05/m68724-structure.json   # Document skeleton with segment references
02-structure/ch05/m68724-equations.json   # MathML equations preserved separately
```

**Examples:**
```bash
# Extract all modules in chapter 5
node tools/cnxml-extract.js --chapter 5

# Extract specific module
node tools/cnxml-extract.js --chapter 5 --module m68724 --verbose
```

---

## protect-segments-for-mt.js

Protects segment markers and links for safe passage through machine translation. Splits files exceeding 14K visible characters (Erlendur 20KB file limit).

```bash
node tools/protect-segments-for-mt.js --chapter <num> [options]
```

| Option | Description |
|--------|-------------|
| `--chapter <num>` | Chapter number |
| `--verbose` | Show detailed progress |

**What it does:**
- Converts `<!-- SEG:xxx -->` markers to `{{SEG:xxx}}`
- Protects markdown links from MT corruption
- Splits large files into parts (a, b, c...) at paragraph boundaries
- Stores link mapping in sidecar JSON

---

## restore-segments-from-mt.js

Restores protected markers and links in MT output. Joins split files back together.

```bash
node tools/restore-segments-from-mt.js --chapter <num> [options]
```

| Option | Description |
|--------|-------------|
| `--chapter <num>` | Chapter number |
| `--verbose` | Show detailed progress |

**What it does:**
- Restores `{{SEG:xxx}}` back to `<!-- SEG:xxx -->`
- Restores links from sidecar JSON
- Joins split files (a, b, c) into single segment file
- Injects equations and other placeholders

---

## cnxml-inject.js

Injects translated segments back into the CNXML document structure, producing complete translated CNXML files.

```bash
node tools/cnxml-inject.js --chapter <num> [--module <id>] [options]
```

| Option | Description |
|--------|-------------|
| `--chapter <num>` | Chapter number |
| `--module <id>` | Specific module ID (default: all in chapter) |
| `--lang <code>` | Language code (default: `is`) |
| `--source-dir <dir>` | Segments directory relative to `books/efnafraedi/` (default: `02-for-mt`) |
| `--output-dir <dir>` | Output directory (default: `03-translated/chNN/`) |
| `--verbose` | Show detailed progress |

**Input Files:**
```
<source-dir>/chNN/<module>-segments.<lang>.md   # Translated segments
02-structure/chNN/<module>-structure.json        # Document structure
02-structure/chNN/<module>-equations.json         # MathML equations
01-source/chNN/<module>.cnxml                     # Original CNXML (reference)
```

**Output:**
```
03-translated/chNN/<module>.cnxml                 # Translated CNXML
```

**Examples:**
```bash
# Inject from MT output (default)
node tools/cnxml-inject.js --chapter 5

# Inject from reviewed faithful translations
node tools/cnxml-inject.js --chapter 5 --source-dir 03-faithful-translation

# Inject from localized translations
node tools/cnxml-inject.js --chapter 5 --source-dir 04-localized-content

# Specific module with verbose output
node tools/cnxml-inject.js --chapter 5 --module m68724 --verbose
```

---

## cnxml-render.js

Renders translated CNXML to semantic HTML with pre-rendered KaTeX equations and absolute image paths.

```bash
node tools/cnxml-render.js --chapter <num> [--module <id>] [options]
```

| Option | Description |
|--------|-------------|
| `--chapter <num>` | Chapter number |
| `--module <id>` | Specific module ID (default: all in chapter) |
| `--track <track>` | Publication track: `mt-preview`, `faithful` |
| `--lang <code>` | Language code (default: `is`) |
| `--verbose` | Show detailed progress |

**Input:**
```
03-translated/chNN/<module>.cnxml                 # Translated CNXML
```

**Output:**
```
05-publication/<track>/chapters/NN/<ch>-<sec>-<slug>.html
```

**Examples:**
```bash
# Render chapter 5 as faithful publication
node tools/cnxml-render.js --chapter 5 --track faithful

# Render MT preview
node tools/cnxml-render.js --chapter 5 --track mt-preview --verbose
```

---

## prepare-for-align.js

Prepares markdown files for Matecat Align by cleaning and normalizing content for TM creation.

```bash
node tools/prepare-for-align.js --en <file> --is <file> --output-dir <dir>
node tools/prepare-for-align.js --en-dir <dir> --is-dir <dir> --section <num> --output-dir <dir>
```

| Option | Description |
|--------|-------------|
| `--en <file>` | English markdown file |
| `--is <file>` | Icelandic markdown file |
| `--en-dir <dir>` | Directory with English files (for split files) |
| `--is-dir <dir>` | Directory with Icelandic files (for split files) |
| `--section <num>` | Section number (e.g., "5-1") |
| `--output-dir <dir>` | Output directory for cleaned files |

**Output:**
```
for-align/ch05/5-1.en.clean.md
for-align/ch05/5-1.is.clean.md
```

---

## validate-chapter.js

Validates chapter content and structure before publication.

```bash
node tools/validate-chapter.js --chapter <num> [options]
```

---

## Status Updates

```bash
# Update workflow status
npm run update-status <book> <chapter> <stage> <status>

# Validate all status files
npm run validate
```

### Pipeline Stages

| Stage | Description | Step |
|-------|-------------|------|
| `extraction` | Segments + structure extracted from CNXML | 1a |
| `mtReady` | Segments protected and split for MT | 1b |
| `mtOutput` | MT output received | 2 |
| `linguisticReview` | Faithful translation reviewed | 3 |
| `tmCreated` | TM created via Matecat Align | 4 |
| `injection` | Translated CNXML produced | 5a |
| `rendering` | HTML produced | 5b |
| `publication` | Published to web | 5c |

### Statuses

| Status | Meaning |
|--------|---------|
| `complete` | Stage finished (sets date automatically) |
| `in-progress` | Currently being worked on |
| `pending` | Waiting to start |
| `not-started` | Not yet begun |

---

## Shared Libraries (`tools/lib/`)

| Module | Purpose |
|--------|---------|
| `cnxml-parser.js` | CNXML document parsing |
| `cnxml-elements.js` | HTML rendering for CNXML elements |
| `mathml-to-latex.js` | MathML → LaTeX conversion |
| `mathjax-render.js` | MathJax SVG rendering |
| `module-sections.js` | Module section building |
| `chapter-modules.js` | Chemistry 2e module ID mappings |

---

## Archived Tools

42 deprecated tools from the old markdown pipeline are in `tools/_archived/`. These include the old `pipeline-runner.js`, `cnxml-to-md.js`, `chapter-assembler.js`, XLIFF tools, and DOCX conversion tools.

---

## See Also

- [Master Pipeline](../workflow/master-pipeline.md) - Complete workflow reference
- [Simplified Workflow](../workflow/simplified-workflow.md) - 5-step pipeline overview
- [Schema Reference](schemas.md) - JSON Schema field definitions
- [Architecture](architecture.md) - System architecture
