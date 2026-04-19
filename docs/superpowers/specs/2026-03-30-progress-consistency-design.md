# Unified Progress Reporting — Design Spec

**Date:** 2026-03-30
**Origin:** Chrome DevTools audit revealed the same book shows different progress percentages on different pages (11% on library, 0.4% on progress page) because 4 independent tracking systems are used without coordination.

## Context

The project has 4 overlapping progress systems that evolved organically:
1. **Pipeline stages** (DB `chapter_pipeline_status` → status.json): binary stage checkboxes
2. **Segment edits** (DB `segment_edits`): individual editorial changes with approval workflow
3. **Filesystem flags** (`fs.existsSync` on 03-faithful-translation/): binary file presence
4. **Book sections** (DB `book_sections`): publication status per section

Each page used whichever was convenient, resulting in contradictory numbers. The audit found:
- Library: "11% lokið" (16/147 pipeline stages)
- Progress: "0.4%" (69 edit records / 18,884 segments)
- Progress: "69 approved" > "19 reviewed" (edit records vs distinct segments — misleading)
- Assignments: "—" (no progress data)
- Module badges vs DB (K1: 6% in DB, 0 faithful files on disk)

## Design Decision

**One user-facing metric:** Editorial completion, measured as distinct segments with at least one approved edit divided by total segments.

Pipeline stages, filesystem flags, and book sections remain as internal/developer tools. They are not surfaced to users as "progress."

## Fix 1: Centralized Progress Function

### New function in `segmentEditorService.js`

```javascript
/**
 * Get editorial progress for a book or chapter.
 * @param {string} book - Book slug
 * @param {number} [chapter] - Optional chapter number. If omitted, returns book-wide totals.
 * @returns {{ approvedSegments: number, editedSegments: number, totalSegments: number, percentComplete: number }}
 */
function getEditorialProgress(book, chapter) { ... }
```

**Approved segments query:**
```sql
SELECT COUNT(DISTINCT segment_id) as approved_segments
FROM segment_edits
WHERE book = ? AND status = 'approved'
  [AND chapter = ?]  -- optional chapter filter
```

**Edited segments query:**
```sql
SELECT COUNT(DISTINCT segment_id) as edited_segments
FROM segment_edits
WHERE book = ?
  [AND chapter = ?]
```

**Total segments:** Counted from filesystem via `segmentParser.countSegments(book, chapter)` (reads `02-for-mt/` markdown files). This already exists in the segment parser for per-module counts; needs aggregation to chapter/book level.

**percentComplete:** `(approvedSegments / totalSegments) * 100`, rounded to 1 decimal.

All pages call this one function. No per-page SQL for progress.

## Fix 2: Progress Page Stat Cards

### Current (misleading)
1. `0/169 EININGAR KLÁRAR` — modules where all segments approved
2. `69 HLUTIR SAMÞYKKTIR` — edit RECORDS with approved status (not segments)
3. `19 HLUTIR YFIRFARNIR` — distinct segments with any edit
4. `0.4% HEILDARFRAMVINDA` — edit records / total segments

### New (distinct segment counts, logical funnel)
1. **`X/169 einingar klárar`** — modules where `approvedSegments == totalSegments` (unchanged logic)
2. **`Y bútar samþykktir`** — distinct segments with at least one approved edit
3. **`Z bútar í vinnslu`** — distinct segments with any edit, excluding those already approved (the "in progress" pipeline)
4. **`X% heildarframvinda`** — `approvedSegments / totalSegments * 100` (matches bar charts)

Label change: "hlutir" (items) → "bútar" (segments) to make the unit explicit.

The funnel is now logical: `edited >= approved`, and the percentage derives from the approved count.

### Per-chapter bars
Same formula applied per chapter: `getEditorialProgress(book, chapter).percentComplete`. No change in visual behavior, just consistent data source.

### Files
- `server/services/segmentEditorService.js` — add `getEditorialProgress()`
- `server/routes/status.js` — replace inline queries with centralized function calls
- `server/views/status.html` — update stat card labels and rendering JS

## Fix 3: Library Book Card

### Current
The book card percentage uses a 3-way fallback:
1. `statusProgress.pct` (pipeline stages: 16/147 = 11%)
2. `pipelineProgress` (faithful files / modules: 0/135 = 0%)
3. `progress` (published sections / total: 0/135 = 0%)

### New
Replace the fallback chain with a single editorial progress call. The `/api/admin/books` response includes `editorialProgress: { percent, approvedSegments, totalSegments }` per registered book.

The client code (`books.html`) uses `book.editorialProgress.percent` directly — no fallback chain.

### Files
- `server/routes/admin.js` or `server/services/bookRegistration.js` — compute editorial progress per book in the book listing
- `server/views/books.html` — use `editorialProgress.percent` instead of the 3-way fallback

## Fix 4: Assignments Page Progress Column

### Current
The FRAMVINDA column shows "—" (hardcoded).

### New
The `/api/admin/assignments/:book` response is extended with per-chapter editorial progress data. The route calls `getEditorialProgress(book, chapter)` for each chapter in the book.

Response shape change:
```json
{
  "book": "efnafraedi-2e",
  "assignments": [...],
  "editors": [...],
  "chapterProgress": {
    "0": { "approvedSegments": 0, "totalSegments": 42, "percentComplete": 0 },
    "1": { "approvedSegments": 15, "totalSegments": 1150, "percentComplete": 1.3 },
    ...
  }
}
```

The client renders a small progress bar + percentage in the FRAMVINDA column, matching the progress page style.

### Files
- `server/routes/admin.js` — add `chapterProgress` to assignment response
- `server/public/js/assignments.js` — render progress bar instead of "—"

## Scope Boundaries

- **Module badges (EN/MT/Ritstýrt/Staðfært)** — unchanged. They show filesystem state (file exists?), which is factual and useful for deciding what to work on. They are NOT a progress metric.
- **Home dashboard stats** — unchanged. The "Kláruð í vikunni", "Bíður yfirferðar", "Orðatillögur" cards are workflow stats, not progress metrics. The "Þarfnast athygli" section counts assignments/reviews, not progress.
- **Pipeline stage tracking** — unchanged. `chapter_pipeline_status` and `status.json` remain as internal tools for pipeline operations (injection, rendering). They are just no longer shown to users as "progress."
- **`book_sections` table** — unchanged. Still used for section-level management. Just not surfaced as a book-level progress metric.
- **No caching layer.** The queries are lightweight (indexed on book + status). If performance becomes an issue later, add a materialized view or cache.

## Testing

- Unit test for `getEditorialProgress()`: verify counts against known segment_edits data
- Verify progress page shows consistent numbers (approved <= edited, percentage matches approved count)
- Verify library book card shows same percentage as progress page for the same book
- Verify assignments page shows per-chapter progress bars matching progress page chapter bars
