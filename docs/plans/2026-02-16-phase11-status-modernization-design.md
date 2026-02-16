# Phase 11: Status & Schema Modernization — Design

**Date:** 2026-02-16
**Approach:** Schema-First (define canonical schema, migrate files, update code, add auto-advance)

## Decisions

- **Storage:** JSON files (`chapters/ch*/status.json`) remain source of truth
- **Migration:** Clean break — migrate files to new names, remove legacy names entirely
- **Auto-advance:** Status-only by default. "Apply & Render" button (Phase 9.2) handles full chain when user wants it
- **Completion semantics:** `linguisticReview` = complete when ALL modules in chapter have applied edits

## 8-Stage Pipeline Model

| # | Stage | Trigger | Auto-advance from |
|---|-------|---------|-------------------|
| 1 | `extraction` | `cnxml-extract.js` completes | Filesystem sync |
| 2 | `mtReady` | `protect-segments-for-mt.js` completes | Filesystem sync |
| 3 | `mtOutput` | Files appear in `02-mt-output/` | Filesystem sync |
| 4 | `linguisticReview` | `applyApprovedEdits()` writes all module files | segmentEditorService |
| 5 | `tmCreated` | TMX files appear in `tm/` | Filesystem sync |
| 6 | `injection` | `cnxml-inject.js` completes | pipelineService |
| 7 | `rendering` | `cnxml-render.js` completes | pipelineService |
| 8 | `publication` | Published via publication API | publicationService |

### Stage Status Shape

Every stage uses a uniform shape:

```json
{
  "complete": false,
  "date": null,
  "notes": ""
}
```

`publication` keeps sub-tracks:

```json
{
  "publication": {
    "mtPreview": { "complete": true, "date": "2026-01-13" },
    "faithful": { "complete": false },
    "localized": { "complete": false }
  }
}
```

### Legacy Name Migration

| Old Name | New Name |
|----------|----------|
| `source` | `extraction` |
| `enMarkdown` | `extraction` |
| `editorialPass1` | `linguisticReview` |
| `matecat` | `tmCreated` |
| `tmUpdated` | `tmCreated` |
| `editorialPass2` | removed |

New stages added with `{ "complete": false }`: `mtReady`, `injection`, `rendering`.

## Auto-Advance Hooks

### A. pipelineService.js (existing, align names)

- After inject → `injection: { complete: true, date: today }`
- After render → `rendering: { complete: true, date: today }`

### B. segmentEditorService.js (new)

- After `applyApprovedEdits()` → check if all modules in chapter have applied edits
- If yes → `linguisticReview: { complete: true, date: today }`

### C. Filesystem sync (update existing)

Update `scanAndUpdateStatus()`:
- Use new stage names
- Check `.html` files in publication (not `.md`)
- Add `mtReady` check: presence of `-links.json` sidecars in `02-for-mt/`
- Add `injection` check: `.cnxml` files in `03-translated/`
- Add `rendering` check: `.html` files in `05-publication/`

## Files to Modify

| File | Change |
|------|--------|
| `schemas/chapter-status.schema.json` | Rewrite with 8 canonical stages |
| `server/routes/status.js` | Update `PIPELINE_STAGES`, remove `STAGE_MAPPING`, update sync paths |
| `server/services/pipelineService.js` | Align stage names in `advanceChapterStatus()` |
| `server/services/segmentEditorService.js` | Add status update after `applyApprovedEdits()` |
| `books/efnafraedi/chapters/ch*/status.json` | Migrate via script (~15 files) |
| New: `tools/migrate-status-schema.js` | One-time migration script |

**Not changed:** publication routes, segment editor UI, CLI tools.
