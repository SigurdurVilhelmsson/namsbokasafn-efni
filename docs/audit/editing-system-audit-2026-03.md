# Editing System Audit Report — March 2026

**Date:** 2026-03-13
**Auditor:** Claude Code + Siggi (UX walkthrough complete)
**Scope:** Full editing system across 3 books (efnafraedi-2e, liffraedi-2e, orverufraedi)
**Spec:** docs/superpowers/specs/2026-03-13-editing-system-audit-design.md
**Plan:** docs/superpowers/plans/2026-03-13-editing-system-audit.md

## Executive Summary

The editing system is **ready for operational use** with caveats. The complete Pass 1 editorial workflow (edit → review → approve → apply → faithful file) and Pass 2 localization workflow (edit → save → localized file) both work correctly end-to-end across all three books. The pipeline continuity test confirmed that approved edits flow through inject → render → HTML without issues. Security checks are solid: role enforcement, self-approval blocking, path traversal prevention, and auth requirements all function correctly.

**Manual UX walkthrough (Siggi)** revealed significant usability concerns: unclear workflow guidance, missing feedback after submit, inaccurate progress tracking, and a reported contributor edit revert bug (not reproduced at API level). The system works technically but needs UX polish before non-technical editors can work independently. See Section 3B findings for full details.

**Fixes applied:** M1 (approve endpoint crash), M4 (localization category validation), L4 (XSS in status.html), L8 (save-all category preservation), M2 (improved error reporting with retryable flag).

## Results by Track

| Track | Section | Result | Critical | Moderate | Low | Info |
|-------|---------|--------|----------|----------|-----|------|
| 1 | 1A: Dead Code & Remnants | PASS | 0 | 0 | 0 | 0 |
| 1 | 1B: Schema & Data Flow | PASS | 0 | 3 | 3 | 0 |
| 1 | 1C: Cross-Book Isolation | PASS | 0 | 0 | 0 | 0 |
| 1 | 1D: Security Spot-Check | CONDITIONAL PASS | 0 | 0 | 2 | 1 |
| 2 | 2A: Pass 1 Full Journey | PASS | 0 | 1 | 2 | 0 |
| 2 | 2B: Pass 2 Localization | PASS | 0 | 0 | 1 | 0 |
| 2 | 2C: Pipeline Continuity | PASS | 0 | 0 | 0 | 0 |
| 2 | 2D: Error Paths | PASS | 0 | 0 | 0 | 1 |
| 3 | 3A: Automated UI Checks | PASS | 0 | 0 | 1 | 1 |
| 3 | 3B: Manual UX Walkthrough | CONCERNS | 0 | 1 | 5 | 3 |
| **Total** | | | **0** | **5** | **14** | **6** |

## Critical Issues (Must Fix)

None found.

## Moderate Issues (Should Fix)

### M1: Approve endpoint crashes without JSON body — FIXED
- **ID:** 2A-01
- **Location:** `server/routes/segment-editor.js:388`
- **Root cause:** `req.body.note` without optional chaining; `req.body` is `undefined` when no Content-Type header is sent
- **Impact:** API callers that don't send a JSON body get a 500 error. UI likely unaffected (always sends Content-Type).
- **Fix:** Changed `req.body.note` to `req.body?.note` on approve, reject, and discuss endpoints
- **Status:** Fixed

### M2: applyApprovedEdits() failure doesn't block review completion — MITIGATED
- **ID:** 1B-03
- **Location:** `server/routes/segment-editor.js:504-516`
- **Root cause:** Review is marked "approved" before `applyApprovedEdits()` runs. If apply fails, the review stays "approved" but the faithful file isn't written.
- **Impact:** Head-editor sees "review approved" but faithful file may not exist.
- **Mitigation:** Error response now includes `retryable: true` flag. Existing apply panel (`POST /:book/:chapter/:moduleId/apply`) shows unapplied edits and allows manual retry.
- **Status:** Mitigated (manual retry exists via apply panel)

### M3: status.js reads status.json as primary source
- **ID:** 1B-05
- **Location:** `server/routes/status.js`
- **Root cause:** The progress page reads `status.json` files directly instead of querying the `chapter_pipeline_status` DB table. This contradicts the documented architecture where DB is authoritative and status.json is a derived cache.
- **Impact:** Progress page may show stale data if status.json hasn't been synced after a DB update.
- **Fix:** Refactor status.js to read from DB via `pipelineStatusService.js`
- **Effort:** Medium (2-4 hours)

### M4: Localization log endpoint sends invalid category — FIXED
- **ID:** 1B-04
- **Location:** `server/routes/localization-editor.js` — `/log` endpoint
- **Root cause:** Passes `'other'` as category, which may violate the CHECK constraint on `localization_edits.category`
- **Impact:** Audit trail entries could fail silently
- **Fix:** Category now validated against allowed values; invalid categories default to `null`
- **Status:** Fixed

### M5: Contributor edit revert bug — NOT REPRODUCED
- **ID:** 3B-08
- **Location:** Segment editor, contributor role
- **Reported:** User reports that as contributor, after saving an edit and reopening the segment, the edit reverts to original. Works for admin/editor/head-editor.
- **Investigation:** Exhaustive code analysis and API-level testing confirmed the save→reload→display flow works correctly for contributor role. The edit is persisted in the DB and returned in the module reload response.
- **Possible causes:** Production server caching (nginx), different code version on production, browser-specific timing issue, or interaction with admin role preview feature.
- **Status:** Cannot reproduce. Needs browser-level debugging on the specific environment where it occurs.

## Low Issues (Can Defer)

| # | ID | Description | Location |
|---|-----|-------------|----------|
| L1 | 1B-01 | `my-work.js` queries non-existent `terminology` table | `server/routes/my-work.js:70-87` |
| L2 | 1B-02 | `submitModuleForReview()` counts all pending edits, not just submitter's | `segmentEditorService.js` |
| L3 | 1B-06 | 5 of 12 Pass 1 endpoints lack activity logging; Pass 2 has no logging | Multiple files |
| L4 | 1D-01 | ~~`err.message` in `innerHTML` without escaping (3 locations)~~ **FIXED** | `server/views/status.html` |
| L5 | 1D-02 | Terms endpoint lacks `requireRole()` | `server/routes/segment-editor.js` |
| L6 | 2A-02 | Module ordering: section 1.6 appears before 1.5 | Chapter data JSON |
| L7 | 2A-03 | Stale e2e test data in title segment | Test data hygiene |
| L8 | 2B-01 | ~~save-all endpoint drops category in audit trail~~ **FIXED** | `server/routes/localization-editor.js:303,338` |
| L9 | 3A-01 | Admin page HTML served to all authenticated roles | `server/routes/views.js:25` |

## Informational

| # | ID | Description |
|---|-----|-------------|
| I1 | 1D-03 | CSP allows `'unsafe-inline'` for scripts (acceptable trade-off for inline handlers) |
| I2 | 2D-02 | Missing segments injection falls back to EN text by design |
| I3 | 3A-02 | Module ordering anomaly (duplicate of L6) |

## Test Coverage Gaps

Based on audit findings, these areas need new automated tests:

1. **Approve endpoint without body** — E2E test should verify approve works with empty POST (no Content-Type header)
2. **applyApprovedEdits failure recovery** — Unit test for the case where file write fails after review approval
3. **Status page DB consistency** — Integration test verifying /progress data matches `chapter_pipeline_status` table
4. **Localization save-all category** — Unit test verifying categories are preserved in audit trail for bulk saves
5. **Cross-book data isolation** — E2E test verifying contributor for book A cannot see/edit book B data

## 3B: Manual UX Walkthrough Summary

Completed by Siggi on 2026-03-13. Full results in `docs/audit/findings/3b-ux-walkthrough-checklist.md`.

**Key findings:**

| Category | Issues Found |
|----------|-------------|
| A. Logical Progression | Role permissions unclear (contributor can assign?); no feedback after "Senda til yfirferðar"; /my-work doesn't surface what happens next |
| B. Icelandic UI | Mixed EN/IS in activity feed; "Undefined" in deadline display; render+inject labels in English for admin views |
| C. Navigation | Infinite spinner on "Til baka" from editor; many routes into same panels (disorienting); no clear workflow guidance |
| D. Multi-Book | Duplicate Líffræði 2e in dropdown; progress bars wildly inaccurate; no visual distinction between books |
| E. Error States | Cross-tab warning works; save error messages work; contributor edit revert bug (see M5) |

**Overall assessment:** The system works technically but lacks the UX polish needed for non-technical users to work independently. The workflow is not self-evident — users need training or better in-app guidance.

## Recommendations

### Done (this session)
1. **M1:** ~~Add optional chaining to approve endpoint~~ — FIXED (also reject + discuss)
2. **M4:** ~~Fix category validation in localization log endpoint~~ — FIXED
3. **L4:** ~~Escape `err.message` in 3 innerHTML assignments~~ — FIXED (used textContent)
4. **L8:** ~~save-all drops category in audit trail~~ — FIXED
5. **M2:** Improved error response with `retryable` flag; existing apply panel serves as retry UI

### Remaining: Architecture Alignment (2-4 hours)
6. **M3:** Refactor status.js to read from DB instead of status.json
7. **L1:** Fix terminology table name in my-work.js

### Remaining: Investigation
8. **M5:** Contributor edit revert bug — needs browser-level debugging on the environment where it occurs

### Remaining: Polish (defer)
9. **L2, L3, L5, L6, L9** — Minor consistency, logging, and data ordering issues

### New from UX Walkthrough
10. Workflow guidance and in-app instructions for non-technical editors
11. Submit feedback ("Senda til yfirferðar" shows no confirmation or next-step guidance)
12. Progress page accuracy (progress bars show incorrect percentages)
13. Book visual distinction (colors, icons) for multi-book navigation
14. Fix duplicate Líffræði 2e in book dropdown
15. Fix infinite spinner on "Til baka" from editor
16. Mixed EN/IS in activity feed and admin pipeline labels

## Appendix: Test Methodology

### Track 1: Code Integrity (automated)
- Dead code scan via grep/analysis
- Schema validation via DB introspection
- Cross-book isolation via code review
- Security audit of all route endpoints

### Track 2: Editorial Workflow E2E (API-driven)
- Full Pass 1 cycle on efnafraedi-2e ch01 m68664 (edit → review → approve/reject → apply → verify faithful file)
- Abbreviated Pass 1 on liffraedi-2e ch03 and orverufraedi ch01
- Full Pass 2 cycle (save single, save-all, verify localized file, audit trail)
- Pipeline continuity: inject → render → HTML with verified content flow
- Error paths: role enforcement, auth, path traversal, self-approval, double-approval

### Track 3: UI/UX (mixed)
- 35 page-load combinations (7 pages × 5 roles)
- Chrome DevTools MCP for interactive UI verification
- Manual UX walkthrough checklist (22 questions, pending user completion)

### Findings Files
- `docs/audit/findings/1a-dead-code.md`
- `docs/audit/findings/1b-schema-dataflow.md`
- `docs/audit/findings/1c-cross-book-isolation.md`
- `docs/audit/findings/1d-security.md`
- `docs/audit/findings/2a-pass1-journey.md`
- `docs/audit/findings/2b-pass2-journey.md`
- `docs/audit/findings/2c-pipeline-continuity.md`
- `docs/audit/findings/2d-error-paths.md`
- `docs/audit/findings/3a-automated-ui.md`
- `docs/audit/findings/3b-ux-walkthrough-checklist.md`
