# CLI Reference

This document covers all command-line tools for managing the translation workflow.

---

## Quick Reference

### Status Updates

```bash
# Basic syntax
npm run update-status <book> <chapter> <stage> <status>

# Stages: source, mtOutput, matecat, editorialPass1, tmUpdated, editorialPass2, publication
# Statuses: complete, in-progress, pending, not-started
```

### Common Operations

```bash
# Mark source complete
npm run update-status efnafraedi 5 source complete

# Start Matecat work
npm run update-status efnafraedi 5 matecat in-progress

# Complete Matecat
npm run update-status efnafraedi 5 matecat complete

# Assign to editor
npm run update-status efnafraedi 5 editorialPass1 in-progress --editor "Name"

# Complete Pass 1
npm run update-status efnafraedi 5 editorialPass1 complete

# Publish with version
npm run update-status efnafraedi 5 publication complete --version "v1.0"

# Add notes
npm run update-status efnafraedi 5 matecat pending --notes "Waiting for source files"

# Preview changes (dry run)
npm run update-status efnafraedi 5 tmUpdated complete --dry-run
```

### Validation

```bash
# Validate all books
npm run validate

# Validate single book
npm run validate efnafraedi
```

### Workflow Cheat Sheet

| Step | Stage | Command |
|------|-------|---------|
| 1 | Source ready | `npm run update-status efnafraedi X source complete` |
| 2 | MT done | `npm run update-status efnafraedi X mtOutput complete` |
| 3-4 | Matecat | `npm run update-status efnafraedi X matecat complete` |
| 5 | Pass 1 | `npm run update-status efnafraedi X editorialPass1 complete` |
| 6 | TM update | `npm run update-status efnafraedi X tmUpdated complete` |
| 7 | Pass 2 | `npm run update-status efnafraedi X editorialPass2 complete` |
| 8 | Publish | `npm run update-status efnafraedi X publication complete --version "v1.0"` |

### Books

| ID | Name |
|----|------|
| `efnafraedi` | Efnafræði (Chemistry) |
| `liffraedi` | Líffræði (Biology) |

### Options

| Option | Usage | Example |
|--------|-------|---------|
| `--editor` | Set editor name | `--editor "Jón Jónsson"` |
| `--version` | Set version | `--version "ai-preview"` |
| `--notes` | Add notes | `--notes "Waiting for review"` |
| `--dry-run` | Preview only | `--dry-run` |

### Git Workflow

```bash
# Update status and commit
npm run update-status efnafraedi 3 editorialPass1 complete
npm run validate
git add books/efnafraedi/chapters/ch03/status.json
git commit -m "status: Complete ch3 Pass 1"
git push
```

---

## Detailed Command Reference

### update-status

Updates the workflow status for a specific chapter.

#### Syntax

```bash
npm run update-status <book> <chapter> <stage> <status> [options]
```

#### Arguments

| Argument | Description | Examples |
|----------|-------------|----------|
| `book` | Book identifier | `efnafraedi`, `liffraedi` |
| `chapter` | Chapter number | `1`, `2`, `15` |
| `stage` | Workflow stage | See [Stages](#stages) below |
| `status` | New status value | See [Statuses](#statuses) below |

#### Stages

| Stage | Description | Workflow Step |
|-------|-------------|---------------|
| `source` | Source material from OpenStax | Step 1 |
| `mtOutput` | Machine translation from malstadur.is | Step 2 |
| `matecat` | TM alignment in Matecat | Steps 3-4 |
| `editorialPass1` | Linguistic review (Pass 1) | Step 5 |
| `tmUpdated` | Translation memory updated | Step 6 |
| `editorialPass2` | Localization review (Pass 2) | Step 7 |
| `publication` | Published to web | Step 8 |

#### Statuses

| Status | Meaning |
|--------|---------|
| `complete` | Stage finished (sets date automatically) |
| `in-progress` | Currently being worked on |
| `pending` | Waiting to start |
| `not-started` | Not yet begun |

#### Options

| Option | Description | Applicable Stages |
|--------|-------------|-------------------|
| `--editor <name>` | Set editor name | `editorialPass1`, `editorialPass2` |
| `--version <ver>` | Set version identifier | `publication` |
| `--notes <text>` | Add notes | All stages |
| `--dry-run` | Preview changes without saving | All stages |

#### Output

The script shows before/after comparison:

```
efnafraedi chapter 1 - tmUpdated
────────────────────────────────────────
Before: {
  "complete": false
}
After:  {
  "complete": true,
  "date": "2025-12-27",
  "inProgress": false,
  "pending": false
}

✓ Updated books/efnafraedi/chapters/ch01/status.json
```

#### Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "Missing required arguments" | Not enough arguments | Provide all 4 required arguments |
| "Invalid stage" | Unrecognized stage name | Use one of the valid stages |
| "Invalid status" | Unrecognized status | Use: complete, in-progress, pending, not-started |
| "Status file not found" | Chapter doesn't exist | Check book/chapter spelling |

---

### validate

Validates all chapter `status.json` files against the JSON Schema.

#### Syntax

```bash
npm run validate [book]
```

#### Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `book` | Validate only this book | No (validates all if omitted) |

#### Output

**Success:**
```
Validating chapter status files...

  ✓ efnafraedi/ch01/status.json
  ✓ efnafraedi/ch02/status.json
  ...

──────────────────────────────────────────────────

Results: 21/21 files valid

All files valid!
```

**With errors:**
```
Validating chapter status files...

  ✗ efnafraedi/ch05/status.json (2 errors)

──────────────────────────────────────────────────

Results: 20/21 files valid

Errors:

  efnafraedi/ch05/status.json:
    - .titleIs: expected string or null, got undefined
    - .status.source: missing required property "complete"
```

#### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All files valid |
| `1` | Validation errors found |

#### CI/CD Integration

The validation runs automatically via GitHub Actions when status files change. See `.github/workflows/validate.yml`.

---

## Pipeline Tools

The `tools/` directory contains scripts for processing content through the publication pipeline.

### clean-markdown.js

Cleans Pandoc artifacts from markdown files to ensure compatibility with the Chemistry Reader webapp.

#### Syntax

```bash
node tools/clean-markdown.js <file.md>
node tools/clean-markdown.js --batch <directory>
node tools/clean-markdown.js --all
```

#### Options

| Option | Description |
|--------|-------------|
| `--batch <dir>` | Process all .md files in directory recursively |
| `--all` | Process all files in `books/*/05-publication/mt-preview/` |
| `--dry-run` | Preview changes without writing files |
| `--verbose`, `-v` | Show detailed processing information |

#### Fixes Applied

| Issue | Solution |
|-------|----------|
| `\mspace{Xmu}` | Replace with KaTeX equivalents (`\,` `\:` `\;` `\quad`) |
| Orphan `:::` markers | Remove directive markers on their own line |
| Escaped tildes `\~` | Fix for subscript syntax |
| Table border artifacts | Remove decorative Pandoc borders |

#### Examples

```bash
# Preview changes without writing
node tools/clean-markdown.js --all --dry-run --verbose

# Process all mt-preview files
node tools/clean-markdown.js --all

# Process a single file
node tools/clean-markdown.js books/efnafraedi/05-publication/mt-preview/chapters/02/2-3.md

# Process a directory
node tools/clean-markdown.js --batch books/efnafraedi/05-publication/mt-preview/chapters/03/
```

See [markdown-fixes.md](markdown-fixes.md) for details on the issues this tool fixes.

---

### docx-to-md.js

Converts .docx files to Markdown format for the publication system.

#### Syntax

```bash
node tools/docx-to-md.js <input.docx> [output.md]
node tools/docx-to-md.js --batch <directory>
```

#### Options

| Option | Description |
|--------|-------------|
| `--batch <dir>` | Process all .docx files in directory |
| `--images-dir <dir>` | Directory to extract images to |
| `--verbose` | Show detailed progress |
| `--dry-run` | Show what would be done without writing |

#### Features

- Preserves heading hierarchy, bold, italic, lists, tables
- Extracts images to separate folder with updated paths
- Marks equations as `[EQUATION]` placeholders for manual tagging
- Auto-detects output paths based on project structure

---

### add-frontmatter.js

Adds YAML frontmatter to markdown files for the Chemistry Reader.

#### Syntax

```bash
node tools/add-frontmatter.js <file.md>
```

See the script for available frontmatter fields and options.

---

### process-chapter.js

Full chapter processing pipeline combining multiple conversion steps.

```bash
node tools/process-chapter.js <chapter-directory>
```

---

### cnxml-math-extract.js

Extracts MathML equations from OpenStax CNXML source files and converts them to LaTeX. Use this when DOCX files contain equations as images but you need editable math.

#### Background

OpenStax provides textbook content in multiple formats:
- **DOCX files**: Often contain equations as embedded images (not editable)
- **CNXML source**: Contains equations in MathML format (editable/convertible)

This tool fetches CNXML from the [openstax/osbooks-chemistry-bundle](https://github.com/openstax/osbooks-chemistry-bundle) repository and extracts the MathML equations, converting them to LaTeX.

#### Syntax

```bash
npm run extract-math <module-id>              # Fetch from GitHub
npm run extract-math <path/to/file.cnxml>     # Read local file
npm run extract-math -- --list-modules        # List known modules
```

#### Arguments

| Argument | Description | Examples |
|----------|-------------|----------|
| `module-id` | OpenStax module ID | `m68690` (section 1.5) |
| `file.cnxml` | Path to local CNXML file | `./m68690.cnxml` |

#### Options

| Option | Description |
|--------|-------------|
| `--output <file>` | Write output to file (default: stdout) |
| `--format <fmt>` | Output format: `markdown`, `json`, `latex` |
| `--context` | Include surrounding text to help identify equations |
| `--verbose` | Show detailed progress |
| `--list-modules` | List known Chemistry 2e module IDs |

#### Module IDs for Chemistry 2e Chapter 1

| Module | Section | Title |
|--------|---------|-------|
| m68662 | intro | Introduction |
| m68663 | 1.1 | Chemistry in Context |
| m68664 | 1.2 | Phases and Classification of Matter |
| m68667 | 1.3 | Physical and Chemical Properties |
| m68674 | 1.4 | Measurements |
| m68690 | 1.5 | Measurement Uncertainty, Accuracy, and Precision |
| m68683 | 1.6 | Mathematical Treatment of Measurement Results |

To find other module IDs, browse the [modules directory on GitHub](https://github.com/openstax/osbooks-chemistry-bundle/tree/main/modules) and cross-reference with the [collection file](https://github.com/openstax/osbooks-chemistry-bundle/blob/main/collections/chemistry-2e.collection.xml).

#### Examples

```bash
# Extract equations from section 1.5 (Measurement Uncertainty)
npm run extract-math m68690

# Save as JSON for programmatic processing
npm run extract-math m68690 -- --format json --output math-1.5.json

# Include context to help match equations to images
npm run extract-math m68690 -- --context

# Get just the LaTeX equations
npm run extract-math m68690 -- --format latex
```

---

### replace-math-images.js

Automates replacing equation images in markdown files with LaTeX. Works together with `cnxml-math-extract.js`.

#### Syntax

```bash
npm run replace-math -- --scan <file.md>                    # Find equation images
npm run replace-math -- --generate <file.md> <module-id>    # Generate mapping file
npm run replace-math -- --apply <file.md> <mapping.json>    # Apply replacements
```

#### Workflow

**Step 1: Scan** - Identify which images are likely equations:

```bash
npm run replace-math -- --scan chapters/01/1-5.md
```

**Step 2: Generate** - Create a mapping template:

```bash
npm run replace-math -- --generate chapters/01/1-5.md m68690 -o mapping.json
```

**Step 3: Edit Mapping** - Match images to equations in `mapping.json`

**Step 4: Apply** - Replace images with LaTeX:

```bash
npm run replace-math -- --apply chapters/01/1-5.md mapping.json
```

#### Options

| Option | Description |
|--------|-------------|
| `--output, -o <file>` | Output file path for generate mode |
| `--dry-run` | Preview changes without modifying files |
| `--verbose, -v` | Show detailed progress |

---

## See Also

- [Workflow Overview](../workflow/overview.md) - Full 8-step translation pipeline
- [Schema Reference](schemas.md) - JSON Schema field definitions
- [Markdown Fixes](markdown-fixes.md) - Known Pandoc artifacts and fixes
