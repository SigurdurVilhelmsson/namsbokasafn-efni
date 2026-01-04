---
name: workflow-status
description: Understand and manage translation workflow status. Triggers when discussing project progress, chapter status, workflow steps, or next actions.
---

# Workflow Status Management

## 8-Step Pipeline Summary

| Step | Stage | Output Location | Key Output |
|------|-------|-----------------|------------|
| 1 | Source | 01-source/ | Original .docx |
| 2 | MT | 02-mt-output/ | Machine translation |
| 3-4 | Matecat | tm/ | Initial TM |
| 5 | Pass 1 | 03-faithful/ | Faithful translation |
| 6 | TM Update | tm/ | Human-verified TM |
| 7 | Pass 2 | 04-localized/ | Localized version |
| 8 | Publication | 05-publication/ | Web-ready .md |

## Status Values

For `status.json` files:

| Status | Meaning |
|--------|---------|
| `complete: true` | Stage finished |
| `inProgress: true` | Currently being worked on |
| `pending: true` | Waiting to start |
| `complete: false` | Not yet done |

## CLI Commands

```bash
# Update status
npm run update-status <book> <chapter> <stage> <status> [options]

# Examples
npm run update-status efnafraedi 3 editorialPass1 complete
npm run update-status efnafraedi 3 editorialPass1 in-progress --editor "Name"
npm run update-status efnafraedi 3 publication complete --version "v1.0"

# Validate
npm run validate
npm run validate efnafraedi
```

## Status File Locations

- Chapter status: `books/{book}/chapters/ch{NN}/status.json`
- File tracking: `books/{book}/chapters/ch{NN}/files.json`
- Activity log: `logs/activity-log.md`

## Workflow Dependencies

Each stage requires previous stages to be complete:

```
source -> mtOutput -> matecat -> editorialPass1 -> tmUpdated -> editorialPass2 -> publication
```

Don't skip stages. If a stage isn't complete, earlier work may need to be done first.
