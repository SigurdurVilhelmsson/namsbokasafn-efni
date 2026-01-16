# Scripts Guide

This guide documents the automation scripts available for managing translation workflow status.

## Available Commands

| Command | Purpose |
|---------|---------|
| `npm run update-status` | Update chapter workflow status |
| `npm run validate` | Validate all status files against schema |

---

## update-status

Updates the workflow status for a specific chapter.

### Syntax

```bash
npm run update-status <book> <chapter> <stage> <status> [options]
```

### Arguments

| Argument | Description | Examples |
|----------|-------------|----------|
| `book` | Book identifier | `efnafraedi`, `liffraedi` |
| `chapter` | Chapter number | `1`, `2`, `15` |
| `stage` | Workflow stage | See [Stages](#stages) below |
| `status` | New status value | See [Statuses](#statuses) below |

### Stages

| Stage | Description | Workflow Step |
|-------|-------------|---------------|
| `source` | Source material from OpenStax | Step 1 |
| `mtOutput` | Machine translation from malstadur.is | Step 2 |
| `matecat` | TM alignment in Matecat | Steps 3-4 |
| `editorialPass1` | Linguistic review (Pass 1) | Step 5 |
| `tmUpdated` | Translation memory updated | Step 6 |
| `editorialPass2` | Localization review (Pass 2) | Step 7 |
| `publication` | Published to web | Step 8 |

### Statuses

| Status | Meaning |
|--------|---------|
| `complete` | Stage finished (sets date automatically) |
| `in-progress` | Currently being worked on |
| `pending` | Waiting to start |
| `not-started` | Not yet begun |

### Options

| Option | Description | Applicable Stages |
|--------|-------------|-------------------|
| `--editor <name>` | Set editor name | `editorialPass1`, `editorialPass2` |
| `--version <ver>` | Set version identifier | `publication` |
| `--notes <text>` | Add notes | All stages |
| `--dry-run` | Preview changes without saving | All stages |

### Examples

**Mark Matecat alignment complete:**
```bash
npm run update-status efnafraedi 4 matecat complete
```

**Start editorial Pass 1 with editor name:**
```bash
npm run update-status efnafraedi 2 editorialPass1 in-progress --editor "Jón Jónsson"
```

**Publish a chapter with version:**
```bash
npm run update-status efnafraedi 1 publication complete --version "v1.0"
```

**Preview changes without saving:**
```bash
npm run update-status efnafraedi 1 tmUpdated complete --dry-run
```

**Add notes to a stage:**
```bash
npm run update-status efnafraedi 3 editorialPass1 pending --notes "Delivered to editor, awaiting review"
```

### Output

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

### Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "Missing required arguments" | Not enough arguments | Provide all 4 required arguments |
| "Invalid stage" | Unrecognized stage name | Use one of the valid stages |
| "Invalid status" | Unrecognized status | Use: complete, in-progress, pending, not-started |
| "Status file not found" | Chapter doesn't exist | Check book/chapter spelling |

---

## validate

Validates all chapter `status.json` files against the JSON Schema.

### Syntax

```bash
npm run validate [book]
```

### Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `book` | Validate only this book | No (validates all if omitted) |

### Examples

**Validate all books:**
```bash
npm run validate
```

**Validate only efnafræði:**
```bash
npm run validate efnafraedi
```

### Output

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

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All files valid |
| `1` | Validation errors found |

### CI/CD Integration

The validation runs automatically via GitHub Actions when status files change. See `.github/workflows/validate.yml`.

---

## Workflow Integration

### Typical Workflow Sequence

```bash
# 1. Source material downloaded
npm run update-status efnafraedi 5 source complete

# 2. Machine translation done
npm run update-status efnafraedi 5 mtOutput complete

# 3. Matecat alignment in progress
npm run update-status efnafraedi 5 matecat in-progress

# 4. Matecat complete, deliver to editor
npm run update-status efnafraedi 5 matecat complete
npm run update-status efnafraedi 5 editorialPass1 pending --notes "Delivered to editor"

# 5. Editor starts review
npm run update-status efnafraedi 5 editorialPass1 in-progress --editor "Anna Sigurðardóttir"

# 6. Pass 1 complete
npm run update-status efnafraedi 5 editorialPass1 complete

# 7. Update TM with editor corrections
npm run update-status efnafraedi 5 tmUpdated complete

# 8. Continue to Pass 2 or publish
npm run update-status efnafraedi 5 publication complete --version "v1.0"
```

### Validate Before Committing

Always validate after making manual edits to status files:

```bash
npm run validate && git add . && git commit -m "status: Update ch5 progress"
```

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

See [markdown-formatting-issues.md](markdown-formatting-issues.md) for details on the issues this tool fixes.

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

#### Sample Output

```markdown
# Math Equations from Measurement Uncertainty, Accuracy, and Precision
**Module:** m68690
**Total equations found:** 39

## Summary by Type
| Type | Count |
|------|-------|
| inline-symbol | 29 |
| calculation | 3 |
| display | 3 |

## Equations

### Equation 6 (calculation)
> ...(a)... **[EQUATION]** ...1.0023 g + 4.383 g...

**LaTeX:**
\`\`\`latex
\begin{array}{l} 1.0023 g \\ + 4.383 g \\ \hline 5.3853 g \end{array}
\`\`\`
```

#### Use Case: Replacing Image Equations

1. Run the tool to extract equations from a module
2. Use `--context` to identify which equation corresponds to which image
3. Replace image references in markdown with LaTeX: `$equation$` or `$$equation$$`
4. Test rendering in the Chemistry Reader webapp

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

Output shows images with "None" alt text, Word rId filenames, or context suggesting equations.

**Step 2: Generate** - Create a mapping template:

```bash
npm run replace-math -- --generate chapters/01/1-5.md m68690 -o mapping.json
```

This creates a JSON file with:
- All potential equation images from the markdown
- All equations extracted from the CNXML module
- Empty `equationIndex` fields for you to fill in

**Step 3: Edit Mapping** - Match images to equations:

Open `mapping.json` and for each image, set `equationIndex` to match the corresponding equation:

```json
{
  "images": [
    {
      "path": "./images/media/rId51.png",
      "context": "...**Lausn**...[IMAGE]...Svarið er 5,385 g...",
      "equationIndex": 6,      // <-- Match to equation 6
      "displayMode": true
    }
  ],
  "equations": [
    {
      "index": 6,
      "type": "calculation",
      "latex": "\\begin{array}...",
      "context": "...(a)...[EQUATION]...1.0023 g + 4.383 g..."
    }
  ]
}
```

**Step 4: Apply** - Replace images with LaTeX:

```bash
# Preview changes first
npm run replace-math -- --apply chapters/01/1-5.md mapping.json --dry-run

# Apply for real (creates .bak backup)
npm run replace-math -- --apply chapters/01/1-5.md mapping.json
```

#### Options

| Option | Description |
|--------|-------------|
| `--output, -o <file>` | Output file path for generate mode |
| `--dry-run` | Preview changes without modifying files |
| `--verbose, -v` | Show detailed progress |

#### Tips

- Images with alt text "None" are most likely equation images
- Use the `context` fields to match images to equations
- Set `displayMode: false` for inline equations (uses `$...$` instead of `$$...$$`)
- You can set `latex` directly instead of `equationIndex` for custom LaTeX
- Review changes in the Chemistry Reader webapp after applying

---

## See Also

- [Workflow Documentation](workflow.md) - Full 8-step translation pipeline
- [Schema Reference](schema-reference.md) - JSON Schema field definitions
- [CLI Quick Reference](cli-quick-reference.md) - Command cheat sheet
- [Markdown Formatting Issues](markdown-formatting-issues.md) - Known Pandoc artifacts and fixes
