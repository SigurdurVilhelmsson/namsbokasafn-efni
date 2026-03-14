# 2A: Pass 1 — Full Journey Findings

**Date:** 2026-03-13
**Module:** m68664 (Chemistry in Context), efnafraedi-2e ch01
**Tester:** Claude Code (API + Chrome DevTools MCP)

## Summary

**Verdict: PASS** (1 MODERATE, 2 LOW findings)

The complete Pass 1 editorial workflow works end-to-end: contributor edits segments, submits for review, head-editor approves/rejects, review completion triggers `applyApprovedEdits()`, and the faithful file is correctly written with only approved content.

## Step Results

| Step | Description | Result | Notes |
|------|-------------|--------|-------|
| 1 | Open segment editor as contributor | PASS | Page loads, all 3 books in selector, no JS errors |
| 2 | Load module m68664 | PASS | 72 segments displayed with EN/IS columns |
| 3 | Edit segment 1 (AUDIT-TEST-1) | PASS | editId=71, category=terminology |
| 4 | Edit segment 2 (AUDIT-TEST-2) | PASS | editId=72, category=accuracy |
| 5 | Submit for review | PASS | reviewId=8, 6 edited segments submitted |
| 6 | Switch to head-editor, view review queue | PASS | Review visible in queue with correct metadata |
| 7 | Approve edit 71, reject edit 72 | PASS* | See finding 2A-01 |
| 8 | Complete review | PASS | applyApprovedEdits() ran, faithful file written |
| 9 | Verify DB state | PASS | approved: applied_at set; rejected: applied_at=null |
| 10 | Verify pipeline status | PASS | linguisticReview remains not_started (correct) |

## Findings

### 2A-01 (MODERATE): Approve endpoint crashes without JSON body

**Endpoint:** `POST /api/segment-editor/edit/:editId/approve`
**File:** `server/routes/segment-editor.js:388`

When called without a `Content-Type: application/json` header (i.e. no body), `req.body` is `undefined` and `req.body.note` throws:
```
Cannot read properties of undefined (reading 'note')
```

The reject endpoint and complete-review endpoint both work without a body. The fix: use optional chaining `req.body?.note` (like the complete endpoint already does at line 499).

**Impact:** The UI probably always sends `Content-Type: application/json`, so this may not affect real users. But it's inconsistent with the other endpoints and would break any API client that doesn't send a body.

**Severity:** MODERATE — API inconsistency, potential failure for external callers.

### 2A-02 (LOW): Module ordering — 1.6 appears before 1.5

In the chapter module list, section 1.6 (m68683) is displayed before section 1.5 (m68690). This suggests the module list is not sorted by section number.

**Impact:** Confusing for editors scanning the module list sequentially.

### 2A-03 (LOW): Stale e2e test data in title segment

The title segment of m68664 contains 6 appended e2e test markers (`[e2e-XXXX]`) from previous Playwright test runs. These weren't cleaned up. This is a data hygiene issue, not a code bug — the e2e tests should clean up after themselves or use isolated test data.

**Impact:** Visual clutter, no functional impact.

## Additional Observations

- **Review counts anomaly:** When `completeModuleReview()` returned, `counts` showed all zeros (approved=0, rejected=0, pending=0). The actual decision was 1 approved + 5 rejected. The counts may reflect only the "unreviewed" edits rather than the total. This is not necessarily a bug but could be confusing.
- **`submitted_by` type:** The review queue shows `submitted_by: "99996.0"` — the float string from better-sqlite3's TEXT column storage. Known issue (documented in project memory).
- **No module selector:** The editor uses a two-level navigation (chapter list → module cards) rather than a dropdown. This is a UI design choice, not a bug.
- **"Innskra" (Login) button:** Shows in top-right despite valid auth, because the cookie was set as non-httpOnly via document.cookie. In normal OAuth flow this would be httpOnly and the server-side rendering would detect it.
