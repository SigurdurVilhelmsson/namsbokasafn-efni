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

## See Also

- [Workflow Documentation](workflow.md) - Full 8-step translation pipeline
- [Schema Reference](schema-reference.md) - JSON Schema field definitions
- [CLI Quick Reference](cli-quick-reference.md) - Command cheat sheet
