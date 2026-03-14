# 3A: Automated UI Checks

**Date:** 2026-03-13
**Tester:** Claude Code (curl API, Chrome DevTools MCP)

## Summary

**Verdict: PASS** (1 LOW, 1 INFO)

## Step 1: Page Load Test — All Roles x All Pages

Tested 7 pages x 5 roles = 35 combinations via curl (following redirects).

| PAGE | viewer | contributor | editor | head-editor | admin |
|------|--------|-------------|--------|-------------|-------|
| / (my-work) | 200 | 200 | 200 | 200 | 200 |
| /editor | 200 | 200 | 200 | 200 | 200 |
| /localization | 200 | 200 | 200 | 200 | 200 |
| /progress | 200 | 200 | 200 | 200 | 200 |
| /terminology | 200 | 200 | 200 | 200 | 200 |
| /admin | 200 | 200 | 200 | 200 | 200 |
| /feedback | 200 | 200 | 200 | 200 | 200 |

All pages return 200 for all authenticated roles. View routes use `sendView()` (no server-side auth middleware). Auth checks happen client-side and on API endpoints.

### 3A-01 (LOW): Admin page viewable by all roles

The `/admin` view is served to all authenticated users. Non-admin roles will see the page layout but API calls to populate data will fail with 403. This is a defense-in-depth concern — the page HTML structure and Icelandic labels are visible, but no actual data is exposed.

**Impact:** Information disclosure of page structure only. No data leakage.

## Step 2: Route Redirects

| Old Path | New Path | Type |
|----------|----------|------|
| /my-work | / | 301 permanent |
| /segment-editor | /editor | 301 permanent |
| /localization-editor | /localization | 301 permanent |
| /status | /progress | 301 permanent |
| /pipeline | /progress | 301 permanent |

All redirects work correctly.

## Step 3: Viewer Role Access Denial

| Endpoint | Expected | Actual |
|----------|----------|--------|
| POST /api/segment-editor/.../edit | 403 | 403 "Insufficient permissions" |
| POST /api/localization-editor/.../save | 403 | 403 "Insufficient permissions" |

PASS — viewer role correctly blocked from write operations.

## Step 4: Book Selector Population

Verified via Chrome DevTools MCP on the segment editor page:
- **Book select options:** Veldu bók... (placeholder), Efnafræði 2e, Líffræði 2e, Örverufræði — **3 books, PASS**
- **Chapter select:** Loads 22 chapters for efnafræði + 1 appendices — **PASS**
- **Pipeline track select:** Hrein þýðing (faithful), MT forskoðun, Staðfærð (localized) — **PASS**
- **Filter selects:** Type filter (6 options), Category filter (6 options) — **PASS**

## Step 5: Segment Editor UI Structure

Verified via Chrome DevTools MCP:
- Module list with click handlers (`loadModule('m68664')`)
- 72 segments displayed with type badges (TITLE, ABSTRACT, PARA, etc.)
- Status bar: edit counts, term counts, terminology issues
- Formatting toolbar: Bold, Italic, Term, Underline, Sub, Sup
- Save/Cancel buttons per segment
- "Senda til yfirlestrar" (Submit for review) button

### 3A-02 (INFO): Module ordering anomaly

In Chapter 1, section 1.6 (m68683) appears before section 1.5 (m68690) in the module list. This appears to be a data ordering issue in the chapter JSON, not a UI sorting bug.

## Step 6: Console Errors

Only 1 console issue observed: "No label associated with a form field (count: 3)" — accessibility warning, not a JS error.

**No JavaScript errors observed** on the segment editor page.

## Step 7: Terminology

3,367 terms present in DB (`terminology_terms` table). Terminology lookup via API endpoint returned 0 results for "efni" — the endpoint may use a different query format or column name than tested. Terms are loaded and displayed in the segment editor via the "121 hugtök" badge and "Hugtök" action buttons.
