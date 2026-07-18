# View ↔ Route Contracts

**What this is:** the response fields the server views actually consume, per
endpoint — the reference to check BEFORE reading a field in a view. Batch F
(audit 2026-07-11; item 16) was twelve dashboards silently blank because view
reads drifted from route sends with no test in between. The static pins in
`server/__tests__/viewRouteContracts.test.js` enforce the reads below; if you
change a route's shape, update the consuming views, the pins, and this file
together.

**Field-name convention:** everything that flows through
`activityLog.parseRow` is camelCase (`createdAt`, `userId`) — there are NO
snake_case fields in any activity response.

## GET /api/status/:book/:chapter — routes/status.js
Consumed by: status.html (pipeline badges), books.html (chapter status).
Shape: `{ book, chapter, chapterDir, title, progress, nextStage, stages,
files, actions }`. **`stages` is a top-level ARRAY** of
`{ stage, status, symbol, complete, date, editor, notes }`; the
`stage === 'publication'` entry additionally carries `mtPreview`,
`faithful`, and `localized` objects (each `{ complete, ... }`). There is NO
`status` key.
Views convert the array to a name-keyed object locally.

## GET /api/activity — routes/activity.js (HEAD_EDITOR-gated)
Consumed by: books.html chapter activity panel (both chapter views).
Shape: `{ activities, total, limit, offset }`; rows are parseRow:
`{ id, type, userId, username, book, chapter, section, description,
metadata, createdAt }`. Filters: `book`, `type`, `user`, `chapter`. The
chapter filter compares as INTEGER with a numeric guard
(`CAST(chapter AS INTEGER) = CAST(? AS INTEGER)` + GLOB digit check) — send
the number or the string, both match, including the REAL-binding artifact
`'1.0'` rows; rows whose stored chapter is non-numeric (e.g. `''` from
legacy failed-lookup writes) never match a filtered query, only unfiltered
ones.
Note (register I16-R4): plain editors get 403 — the panel renders its
empty state for them.

## GET /api/status/activity/timeline — routes/status.js
Consumed by: status.html timeline.
Rows are parseRow **plus** `{ timeAgo, icon, color }` — `timeAgo` is a
pre-formatted Icelandic string; render it directly, do not parse dates
client-side (SQLite UTC strings parse as local time in browsers). The
envelope also carries `hasMore` (currently unused by views; status.html
derives its own "more" heuristic).

## GET /api/status/dashboard — routes/status.js
Consumed by: my-work.html admin panels.
Fields consumed: `needsAttention` `{ unassignedWork, pendingReviews,
blockedIssues (a NUMBER), overdueCount }`, `teamActivity` (timeline-shaped
rows incl. `timeAgo`/`icon`/`color` — `icon` is always truthy, `color` is a
class token `success|warning|info|default`), `readyForAssignment`.
`overdueCount` is structurally 0 today (F28 → removed in item 16 PR2).

## GET /api/my-work and /api/my-work/today — routes/my-work.js
Consumed by: my-work.html.
`/api/my-work`: `recentActivity` = parseRow rows (camelCase `createdAt`).
`/today`: `{ user, currentTask, upNext, needsAttention, quickStats
{ totalTasks, changesRequested, pendingReview, completedThisWeek,
proposedTerms }, adminStats, allTasks }`. There is NO `blockedIssues` and
NO `quickStats.overdue` (dead reads removed in item 16 PR2).

## GET {API_BASE}/terminology/lookup — routes/segment-editor.js
Consumed by: segment-editor popup autocomplete.
Query: `q` (min 2 chars), `bookSlug` (slug string — ranks the current
book's terms first). Response: `{ terms }`.
