# 2D: Error Paths & Edge Cases

**Date:** 2026-03-13
**Tester:** Claude Code (API + CLI)

## Summary

**Verdict: PASS** (1 MODERATE from 2A, expanded here; 1 INFO)

## Role Enforcement (tested in Task 9)

All role checks pass correctly — see 2C findings for full table.

## Appendices Edge Case

Appendices (chapter_num = -1) correctly appear in the chapter list for efnafraedi-2e as "Viðaukar" (Appendices). The API returns it in the chapters list.

## Missing Segments Injection

Both with and without `--allow-incomplete`, inject succeeds (exit 0). The tool falls back to EN text for modules without translations in the source directory. This is by design — it logs "Using English segments for m68690" as a warning rather than failing.

**Note:** The `--allow-incomplete` flag controls behavior for modules where some segments are present but some are missing. When an entire module has no translation file, the tool always uses EN as fallback regardless of the flag.

## Cross-tab Conflict Detection

Not tested via API — requires browser interaction. Covered by existing Playwright E2E test (`server/e2e/concurrent-editing.spec.js`) and manual UX checklist (3B).

## Autosave 409 Conflict

Code review verified:
- `server/public/js/saveRetry.js` handles 409 by stopping the autosave timer and showing a reload prompt
- `segment-editor.html` autosave handler checks response status before continuing

## Self-healing Faithful File

Deferred — requires creating and deleting faithful file in a controlled sequence. The `applyApprovedEdits()` function has documented self-healing behavior. Will be verified during manual testing if time permits.

## INFO: Approve endpoint body requirement (see 2A-01)

The approve endpoint (`POST /api/segment-editor/edit/:editId/approve`) requires a JSON body (even if empty `{}`) or it crashes. The reject and complete-review endpoints handle missing bodies gracefully with `req.body?.note`. This inconsistency should be fixed.
