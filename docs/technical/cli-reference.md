# CLI Reference

Command-line tools for the Extract-Inject-Render translation pipeline.

> See [simplified-workflow.md](../workflow/simplified-workflow.md) for the full workflow context.
> See [simplified-workflow.md](../workflow/simplified-workflow.md) for the 5-step overview.

---

## Active Tools

| Tool | Purpose | Pipeline Step |
|------|---------|---------------|
| `cnxml-extract.js` | Extract segments from CNXML | Step 1a |
| `cnxml-inject.js` | Inject translations into CNXML | Step 5a |
| `cnxml-render.js` | Render CNXML to semantic HTML | Step 5b |
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
| `--source-dir <dir>` | Segments directory relative to `books/efnafraedi-2e/` (default: `02-mt-output`) |
| `--track <name>` | Publication track: mt-preview, faithful, localized (auto-detected from `--source-dir` if not specified; if given, it must match the track `--source-dir` maps to, and an unknown track is refused) |
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
03-translated/<track>/chNN/<module>.cnxml         # Translated CNXML
```

**Examples:**
```bash
# Inject from MT output (default)
node tools/cnxml-inject.js --chapter 5

# Inject one reviewed module into the faithful track (the form the server runs;
# a full-chapter faithful inject fails each unreviewed module by design)
node tools/cnxml-inject.js --chapter 5 --module m68724 --source-dir 03-faithful-translation

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
03-translated/<track>/chNN/<module>.cnxml         # Translated CNXML
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

## validate-chapter.js

Validates chapter content and structure before publication.

```bash
node tools/validate-chapter.js --chapter <num> [options]
```

---

## Status Updates

```bash
# Validate all status files
npm run validate
```

### Pipeline Stages

| Stage | Description | Step |
|-------|-------------|------|
| `extraction` | Segments + structure extracted from CNXML | 1a |
| `mtReady` | Legacy stage from the archived protect step; not a step of the current pipeline | formerly 1b |
| `mtOutput` | MT output received | 2 |
| `linguisticReview` | Faithful translation reviewed | 3 |
| `tmCreated` | TM (TMX) generated in-house by `generate-tm.js`; reported, not sequenced | 4 |
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

**`tools/archived/`** — Recently archived tools from the CNXML pipeline:

| Tool | Reason Archived |
|------|----------------|
| `protect-segments-for-mt.js` | Legacy step 1b: wrapped inline formatting in protective markers before MT. Superseded by the `[[type:content]]` bracket markers |
| `unprotect-segments.js` | Legacy step 2b: unwrapped those markers after MT. Superseded with it |
| `prepare-for-align.js` | Prepared files for Matecat Align, which is retired. The TM is generated in-house by `generate-tm.js` |
| `restore-segments-from-mt.js` | Superseded by `unprotect-segments.js` |
| `join-mt-output.js` | Joined `02-mt-output/` → `02-machine-translated/`; pipeline uses `02-mt-output` directly now |
| `init-faithful-review.js` | Bootstrapped `03-faithful-translation/`; modern workflow uses `applyApprovedEdits()` |
| `compare-markers.js` | Debugging utility for `02-machine-translated/` (unused directory) |
| `migrate-status-schema.js` | One-time migration; already run, no longer needed |

**`tools/_archived/`** — 42 deprecated tools from the old markdown pipeline (`pipeline-runner.js`, `cnxml-to-md.js`, `chapter-assembler.js`, XLIFF tools, DOCX conversion tools).

---

## See Also

- [Simplified Workflow](../workflow/simplified-workflow.md) - Complete workflow reference
- [Simplified Workflow](../workflow/simplified-workflow.md) - 5-step pipeline overview
- [Schema Reference](schemas.md) - JSON Schema field definitions
- [Architecture](architecture.md) - System architecture
