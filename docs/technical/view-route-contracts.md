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
Non-numeric `chapter` params: `'appendices'` is accepted as chapter `-1`;
any other non-numeric value matches nothing (never collides with chapter 0).

## GET /api/status/activity/timeline — routes/status.js
Consumed by: status.html timeline.
Rows are parseRow **plus** `{ timeAgo, icon, color }` — `timeAgo` is a
pre-formatted Icelandic string; render it directly, do not parse dates
client-side (SQLite UTC strings parse as local time in browsers). The
envelope also carries `hasMore` (currently unused by views; status.html
derives its own "more" heuristic). Endpoints WITHOUT a server `timeAgo`
(e.g. `/api/activity`, `/api/analytics/recent`) are parsed client-side via
the guarded SQLite-UTC idiom (`replace(' ','T')+'Z'` + `isNaN` guard), now
used by both `formatTimeAgo` helpers (books.html, my-work.html) and
admin.html's analytics activity list.

## GET /api/status/dashboard — routes/status.js
Consumed by: my-work.html admin panels.
Fields consumed: `needsAttention` `{ unassignedWork, pendingReviews,
blockedIssues (a NUMBER), items }`, `teamActivity`
(timeline-shaped rows incl. `timeAgo`/`icon`/`color` — `icon` is always
truthy, `color` is a class token `success|warning|info|default`),
`readyForAssignment`, `workload`.
There is NO `overdueCount` (dead field removed in item 16 PR2, F28 — the
route never incremented it and no view ever rendered a non-zero value).
`needsAttention.items` (mixed-source, `routes/status.js` — `review` items
from `dashboardReadModel.getGlobalPendingEdits()`, `unassigned` from
`userService.getBookAssignments()`, `blocked` from
`segmentEditorService.getDiscussEdits()`): the
view renders `item.type` (icon lookup: `blocked|unassigned|review` — no
`overdue` type is ever emitted, F28), `item.message`, `item.book`,
`item.chapter` (also reads `item.assignedTo` and `item.daysOld`, which the
current route never populates — both render as their falsy-guard
fallback).
`workload` (`dashboardReadModel.getEditorWorkload`): rows carry `{ editor,
active, pending, approved, rejected, oldestPendingHours }`; the view renders
`editor`, `active`, `pending`, `oldestPendingHours` only (`approved`/
`rejected` are sent but not read).
`readyForAssignment` (`dashboardReadModel.getReadyToApply`): rows carry
`{ book, chapter, moduleId, approvedCount, pendingCount }`; the view renders
`book`, `chapter`, `moduleId`, `approvedCount` (`pendingCount` is sent but
not read).

## GET /api/my-work and /api/my-work/today — routes/my-work.js
Consumed by: my-work.html.
`/api/my-work`: `recentActivity` = parseRow rows (camelCase `createdAt`).
Also consumed: `summary { pendingSubmissionsCount, changesRequestedCount,
proposedTermsCount }` (nav badges + summary cards); `pendingSubmissions`
(`{ bookLabel, chapter, section, submittedAt, daysPending, editorUrl }`);
`recentReviews` (`{ bookLabel, chapter, section, notes, reviewedBy,
reviewedAt, editorUrl, status }` — the view filters this list client-side to
`status === 'rejected' || 'discuss'` for the "changes requested" panel);
`proposedTerms` (`{ english, icelandic, status, discussionCount }`).
`/today`: `{ user, currentTask, upNext, needsAttention, quickStats
{ totalTasks, changesRequested, pendingReview, completedThisWeek,
proposedTerms }, adminStats, allTasks }`. `allTasks` (and therefore
`currentTask`/`upNext`/`needsAttention`, all derived from it) contains
**only** `type: 'changes_requested'` items — the route never assembles an
assignment-derived task, so `quickStats.totalTasks === allTasks.length ===
quickStats.changesRequested` always (dormant assignment-task branch
deleted in item 16 PR2, F30+F25). There is NO `blockedIssues` and NO
`quickStats.overdue` (dead reads removed in item 16 PR2, F28/F29).

## GET {API_BASE}/terminology/lookup — routes/segment-editor.js
Consumed by: segment-editor popup autocomplete.
Query: `q` (min 2 chars), `bookSlug` (slug string). `bookSlug` marks the
current book's subject translations as primary (`isPrimary`); the client
renders primary translations first. It does not reorder the term list
itself. Response: `{ terms }`.
