# 1A: Dead Code & Remnant Scan

**Date:** 2026-03-13
**Result:** PASS

## Findings

| # | Check | Result | Details |
|---|---|---|---|
| 1 | `edit_history` refs in active code | PASS | No matches in `server/routes/*.js`, `server/services/*.js` (excl. archived/), `server/views/*.html`, or `server/public/js/*.js`. Matches exist only in `server/migrations/` (002, 015, 016, 021) and `server/services/archived/editorHistory.js` -- both expected. |
| 2 | `pending_reviews` refs in active code | PASS | No matches in active code. Matches exist only in `server/migrations/` (002, 015, 016, 021) and `server/services/archived/editorHistory.js` -- both expected. |
| 3 | `editorHistory` service imports | PASS | No matches in `server/routes/*.js` (excl. archived/), `server/services/*.js` (excl. archived/), or `server/index.js`. Only match is `server/routes/archived/reviews.js` (expected). |
| 4 | Reviews route imports (excl. redirect) | PASS | `grep -r "require.*reviews\|from.*reviews"` returned no matches in active code. The `server/routes/archived/reviews.js` file is not imported anywhere in active code. |
| 5 | Migration 021 registered | PASS | `server/services/migrationRunner.js` line 49: `require('../migrations/021-drop-dead-tables')` is present in the migrations array, positioned after migration 020. |
| 6 | Archived files have no inbound refs | PASS | No active code in `server/routes/`, `server/services/`, `server/index.js`, or `server/views/` references the `archived/` directory. The only match for "archived" is in `server/migrations/021-drop-dead-tables.js` (a comment noting editorHistory.js was archived), which is appropriate. |
| 7 | Stale TODO/FIXME/HACK/XXX comments | PASS | Single match: `server/routes/modules.js:166` contains "mXXXXX" in a user-facing error message ("Module ID should be in format mXXXXX"). This is a false positive -- not a code comment. No actual TODO/FIXME/HACK/XXX code comments found in `server/` or `tools/`. |
| 8 | package.json script references | PASS | No reference to `scripts/update-status.js` (which is deleted). The `validate` script references `scripts/validate-status.js` which exists. The `docs:generate` script references three files that all exist. No scripts reference removed files. |

## Stale TODOs

None found. The single "XXX" match (`server/routes/modules.js:166`) is part of a format example string `"mXXXXX"`, not a code annotation.
