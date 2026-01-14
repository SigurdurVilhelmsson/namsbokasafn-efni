# CLI Quick Reference

Quick reference for all command-line operations.

---

## Status Updates

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

---

## Validation

```bash
# Validate all books
npm run validate

# Validate single book
npm run validate efnafraedi
```

---

## Workflow Cheat Sheet

| Step | Stage | Command |
|------|-------|---------|
| 1 | Source ready | `npm run update-status efnafraedi X source complete` |
| 2 | MT done | `npm run update-status efnafraedi X mtOutput complete` |
| 3-4 | Matecat | `npm run update-status efnafraedi X matecat complete` |
| 5 | Pass 1 | `npm run update-status efnafraedi X editorialPass1 complete` |
| 6 | TM update | `npm run update-status efnafraedi X tmUpdated complete` |
| 7 | Pass 2 | `npm run update-status efnafraedi X editorialPass2 complete` |
| 8 | Publish | `npm run update-status efnafraedi X publication complete --version "v1.0"` |

---

## Books

| ID | Name |
|----|------|
| `efnafraedi` | Efnafræði (Chemistry) |
| `liffraedi` | Líffræði (Biology) |

---

## Options

| Option | Usage | Example |
|--------|-------|---------|
| `--editor` | Set editor name | `--editor "Jón Jónsson"` |
| `--version` | Set version | `--version "ai-preview"` |
| `--notes` | Add notes | `--notes "Waiting for review"` |
| `--dry-run` | Preview only | `--dry-run` |

---

## Git Workflow

```bash
# Update status and commit
npm run update-status efnafraedi 3 editorialPass1 complete
npm run validate
git add books/efnafraedi/chapters/ch03/status.json
git commit -m "status: Complete ch3 Pass 1"
git push
```

---

## Pipeline Tools

```bash
# Clean Pandoc artifacts from markdown
node tools/clean-markdown.js --all                    # All mt-preview files
node tools/clean-markdown.js --batch <directory>     # Directory
node tools/clean-markdown.js <file.md>               # Single file
node tools/clean-markdown.js --all --dry-run         # Preview only

# Convert DOCX to Markdown
node tools/docx-to-md.js <input.docx>
node tools/docx-to-md.js --batch <directory>

# Add frontmatter to markdown
node tools/add-frontmatter.js <file.md>
```

---

## See Also

- [Scripts Guide](scripts-guide.md) - Detailed script documentation
- [Schema Reference](schema-reference.md) - JSON field definitions
- [Workflow](workflow.md) - Full 8-step pipeline
