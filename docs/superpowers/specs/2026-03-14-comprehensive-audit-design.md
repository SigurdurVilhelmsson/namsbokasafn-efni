# Comprehensive Editing System Audit — Design Spec

**Date:** 2026-03-14
**Scope:** Full-scale test and review of the editing system — code integrity, UX coherence, and test coverage
**Goal:** Audit + fix everything — no deferred items unless truly out of scope

## Context

This codebase has evolved through multiple architectural shifts (file-based → database, Express 4 → 5, status.json → DB pipeline status table, markdown editor → segment editor). Four prior audit iterations (Feb–Mar 2026) addressed security, RBAC, CSP, pipeline integrity, and data safety. A manual UX walkthrough by the primary developer surfaced 14 UX concerns, most unfixed.

**Users:** Mixed technical levels — one power-user admin/head-editor (Siggi), plus a small team of non-technical translators/editors (~5 people) who need clear guidance and guardrails.

**Known open issues from prior audits:**
- M3: status.js reads status.json instead of DB (architectural seam)
- M5: Contributor edit revert bug (reported, not reproduced)
- L1: my-work.js queries non-existent terminology table
- 1B-06: 5 Pass 1 endpoints lack activity logging
- 14 UX walkthrough issues (documented in 3b-ux-walkthrough-checklist.md)
- PUBLICATION_TRACKS defined in 3 places (DRY violation)
- Duplicate migrations 010/012

## Architecture

Three sequential phases, each building on the previous:

```
Phase 1 (Code Audit)  →  Phase 2 (Live UX)  →  Phase 3 (Tests)
Fix known issues          Walk real workflows     Lock in all fixes
Sweep for new ones        Fix UX problems         Fill coverage gaps
```

---

## Phase 1 — Code Audit & Architectural Fixes

Fix known open issues + systematic sweep for new ones. Run full test suite after each fix to prevent regressions.

### 1.1 — M3: Status Dashboard DB Consistency

**Problem:** `server/routes/status.js` reads from `status.json` files on disk instead of querying the `chapter_pipeline_status` DB table. If `syncStatusJsonCache()` fails silently, the dashboard shows stale data. This is the single biggest architectural seam from the file→DB migration.

**Fix:**
- Refactor `server/routes/status.js` to call `pipelineStatusService.getChapterStage()` instead of reading status.json
- Same for `bookRegistration.js` if it reads status.json directly
- Keep status.json write-through as a backup cache, but never read from it as primary source
- Add a log warning if DB read fails and fallback is triggered

### 1.2 — L1: my-work.js Terminology Table

**Problem:** `my-work.js` queries a `terminology` table that doesn't exist (should be the actual table name from the schema). Defensive guard prevents crash but "My pending terminology proposals" always shows empty.

**Fix:** Find the correct table name, fix the query, verify it returns real data.

### 1.3 — PUBLICATION_TRACKS DRY Cleanup

**Problem:** Publication track constants defined in 3 separate places — `constants.js`, `publicationService.js`, `pipelineStatusService.js`. Values match today but could diverge.

**Fix:** Single source of truth in `constants.js`, import everywhere else.

### 1.4 — Activity Logging Gaps (1B-06)

**Problem:** 5 Pass 1 endpoints lack activity logging: review submission, edit deletion, unapprove, review completion, bulk apply. Pass 2 has a separate audit trail (`localization_edits` table) but no integration with the main `activity_log`.

**Fix:** Add `logActivity()` calls to the 5 missing endpoints. For Pass 2, add activity log entries alongside the existing localization_edits audit trail (fire-and-forget, same pattern as other endpoints).

### 1.5 — Security Spot-Check

- **L2:** Verify the 3 unescaped `err.message` in `status.html` are fixed (previous audit says "FIXED" — re-verify)
- **XSS in segment content:** Check that segment content saved via the editor is properly escaped when rendered in the editor table and in published HTML
- **SQL injection:** Verify all queries use parameterized bindings (spot-check 10 routes)
- **RBAC completeness:** Verify every write endpoint has `requireAuth` + appropriate `requireRole`
- **L1 from security audit:** `/terms` endpoint lacks `requireRole` — add it

### 1.6 — Duplicate Migration Cleanup

**Problem:** Migrations 010 and 012 both named "chapter-assignments". Harmless but confusing.

**Fix:** Document in a comment in 012 that it's the real one, or consolidate if safe.

### 1.7 — Systematic Sweep

Walk all 24 route files and 36 services looking for:
- References to old table names or dropped tables
- Hardcoded book slugs (should use params)
- Missing error handling on async operations
- `console.log` that should be `console.error` (or removed)
- Any `innerHTML` without `escapeHtml()`
- Stale references from the file→DB migration

**Order within Phase 1:** 1.1 first (deepest architectural change), then 1.2–1.4 in any order, then 1.5–1.7 last (verification passes against already-fixed code).

---

## Phase 2 — Live UX Walkthroughs

Start the server, interact via Chrome DevTools as different roles. Evaluate the system as a **translation editing tool** — not just "does it work" but "does it guide editors through a logical workflow?"

### 2.1 — Contributor Journey (Most Critical)

Contributors are the least technical users. Walk the complete flow:

1. **Land on My Work** → See what needs editing, which chapters are assigned
2. **Navigate to editor** → Pick book, chapter, module without confusion
3. **Edit segments** → Understand which column is source (EN), which is target (IS)
4. **Save and get feedback** → Know the edit was saved, see it persisted on reload
5. **Submit for review** → Clear confirmation, understand what happens next
6. **After review** → See if edits were approved/rejected, with reviewer notes

**Looking for:** Missing feedback after actions, unclear labels, dead-end states, the reported revert bug (M5), mixed EN/IS text.

### 2.2 — Head-Editor Journey

Head-editors manage the review cycle:

1. **See pending reviews** → Which modules have been submitted, by whom
2. **Review edits** → Side-by-side comparison (EN source / MT / contributor edit)
3. **Approve/reject with notes** → Clear action buttons, confirmation
4. **Complete review** → Trigger `applyApprovedEdits()`, see result
5. **Track progress** → Accurate dashboard showing where each chapter stands

**Looking for:** Review queue discoverability, progress accuracy (the "wildly inaccurate progress bars" from walkthrough), pipeline stage advancement UX.

### 2.3 — Localization Editor (Pass 2)

Editors doing Pass 2 (cultural adaptation):

1. **Find modules ready for localization** → Only modules with completed Pass 1
2. **Edit with context** → See faithful translation alongside localization target
3. **Bulk save** → Save all changes at once with audit trail
4. **View history** → See who changed what and when

**Looking for:** Whether this workflow feels distinct from Pass 1 or confusingly similar, whether the tab interface works, whether "ready for localization" is clear.

### 2.4 — Navigation & Information Architecture

| Question | How We Test |
|----------|-------------|
| Can users find their way from dashboard to editor and back? | Click through as contributor |
| Does the sidebar clearly indicate where you are? | Check active-state styling |
| Do back buttons work without infinite spinners? | Navigate editor → back |
| Is the book/chapter/module hierarchy clear? | Dropdown sequence test |
| Does the progress page tell a useful story? | Compare displayed progress to actual DB state |

### 2.5 — i18n Consistency Check

Walk every page and catalog:
- English text in UI labels, buttons, tooltips, placeholders
- English in activity feed entries, error messages, toast notifications
- Pipeline stage names in English (extraction, injection, rendering → Icelandic equivalents)
- Mixed language in status badges or dropdowns

### 2.6 — Visual & Interaction Polish

- Responsive behavior (does the sidebar collapse cleanly on narrow viewports?)
- Toast/modal z-index conflicts
- Loading states (spinners where needed, no infinite spinners)
- Empty states (what do pages show when there's no data?)
- Error states (what does the user see when an API call fails?)

### 2.7 — Progress Indicators ("Something Is Happening")

**Core problem:** Operations that take more than ~500ms give no visual feedback, causing users to re-click buttons, triggering duplicate operations and confusing error cascades. Example: book import takes 3-10s with no indication anything is happening.

**Systematic check across all async operations:**

| Operation | Location | Expected Duration |
|-----------|----------|-------------------|
| Book import (OpenStax download) | Admin panel | 3-10s |
| Pipeline stage transitions (extract/inject/render) | Chapter pipeline | 2-30s |
| Save segment edit | Segment editor | <1s |
| Bulk save-all (localization) | Localization editor | 1-5s |
| Submit for review | Segment editor | <1s |
| Apply approved edits | Review panel | 1-5s |
| Review completion | Head-editor panel | 1-3s |
| Git backup/sync | Admin panel | 5-15s |
| Terminology lookup | Editor sidebar | <1s |

**Fix pattern for each:**
1. Disable the trigger (button/link) immediately on click — prevent duplicate submissions
2. Show inline progress — spinner or "Í vinnslu..." text replacing the button label
3. Restore on completion — re-enable with success toast, or show error with retry option
4. Prevent duplicate server-side — idempotency guards where the operation isn't naturally idempotent

**Implementation:** A reusable `withProgress(button, asyncFn)` helper in `htmlUtils.js` that handles disable → spinner → re-enable consistently across all pages. One pattern, applied everywhere.

### 2.8 — Button & Action Discoverability

**Core problem:** Buttons have terse Icelandic labels but no explanation of what they actually do, what data they affect, or whether the action is reversible. Example: "Samstilla" (Sync) in admin panel — sync what? From where? Overwriting files?

**Audit checklist for every actionable button:**

| Check | Question |
|-------|----------|
| **Label clarity** | Does the label alone tell you what happens? |
| **Tooltip** | Is there a `title` attribute or custom tooltip explaining the action? |
| **Scope** | Is it clear what data is affected? (This chapter? All chapters? The whole book?) |
| **Consequences** | Is the action destructive or irreversible? Does the user know before clicking? |
| **Confirmation** | Do dangerous operations have a confirm dialog? |

**Fix pattern:**
1. Every button gets a tooltip (`title` attribute minimum) explaining: what it does, what it affects, whether it's reversible
2. Destructive/ambiguous actions get confirmation dialogs with a description of what will happen
3. Use more descriptive labels where space allows
4. Group related actions visually so context helps explain purpose

**Pages to sweep:** Admin panel, chapter pipeline, segment editor toolbar, My Work dashboard, progress page.

**Deliverable from Phase 2:** UX fixes committed, categorized during walkthrough as:
- **Blocking** — Prevents a role from completing their core workflow
- **Confusing** — Workflow works but the user won't understand it without help
- **Polish** — Works and is understandable but could be smoother

---

## Phase 3 — Test Gap Closure & Verification

Write tests to lock in all Phase 1 and Phase 2 fixes, and fill existing coverage gaps.

### 3.1 — Tests for Phase 1 Fixes

| Fix | Test Type | What We Verify |
|-----|-----------|---------------|
| M3: Status reads from DB | Integration | Status routes return DB data, not stale status.json; DB failure triggers fallback + warning log |
| L1: my-work.js table fix | Unit | "My pending terminology proposals" returns real data when proposals exist |
| Activity logging gaps | Unit | All 5 Pass 1 endpoints + Pass 2 saves produce activity_log entries |
| RBAC on /terms endpoint | E2E | Viewer gets 403, contributor gets 200 |
| innerHTML escaping | Unit | Error messages containing `<script>` render as text, not HTML |

### 3.2 — Tests for Phase 2 Fixes

| Fix | Test Type | What We Verify |
|-----|-----------|---------------|
| Progress indicators | E2E | Button disables on click, spinner appears, re-enables after response |
| Submit-for-review feedback | E2E | Toast/confirmation appears after successful submission |
| Book import idempotency | Integration | Double-click import doesn't create duplicate entries |
| i18n consistency | E2E | No English text visible on authenticated pages (scan for common EN words) |
| Tooltips on action buttons | E2E | All buttons in admin panel have non-empty `title` attributes |

### 3.3 — Existing Coverage Gaps

**High Priority:**

| Gap | Tests to Add | Why |
|-----|-------------|-----|
| Localization editor full cycle | 4-6 E2E | Currently 8 tests, many skip. Need: load → edit → save → bulk-save → history → verify audit trail |
| Contributor end-to-end workflow | 3-4 E2E | No test covers: contributor saves → submits → head-editor approves → contributor sees result |
| Error handling paths | 6-8 unit | Malformed JSON body, missing required fields, file I/O failures during apply, segment with null content |
| M5: Contributor revert bug | 1 E2E | Save as contributor → reload page → verify saved text persists (browser-level test) |

**Medium Priority:**

| Gap | Tests to Add | Why |
|-----|-------------|-----|
| Security payloads | 4-5 unit | Save segment containing `<script>`, `<img onerror>`, SQL injection strings → verify escaped |
| Multi-book switching | 2-3 E2E | Switch between efnafraedi-2e and liffraedi-2e in editor, verify data isolation |
| Empty/edge states | 3-4 unit | Empty segment content, 0-length module, chapter with no modules |
| Progress dashboard accuracy | 2-3 integration | Compare dashboard percentage to actual DB stage completion counts |

### 3.4 — Test Infrastructure

| Improvement | Why |
|-------------|-----|
| Localization editor test fixtures | Current tests skip because `03-faithful-translation/` files don't exist in test env. Create minimal fixtures. |
| Contributor + head-editor serial E2E | Need serial test using two auth contexts (contributor saves → head-editor reviews). Extend pattern from `review-cycle.spec.js`. |
| Worktree exclusion | Verify `vitest.config.js` excludes `.worktrees/` to prevent duplicate test runs. |

### 3.5 — Test Count Estimate

| Category | Current | Added | New Total |
|----------|---------|-------|-----------|
| Vitest unit | 308 | ~25-30 | ~335 |
| Playwright E2E | 51 | ~15-20 | ~70 |
| **Total** | **359** | **~40-50** | **~405** |

---

## Execution Order & Dependencies

### Phase 1 Internal Order
1. **1.1 (M3) first** — deepest architectural change, other fixes may touch same files
2. **1.2–1.4** — independent, any order
3. **1.5–1.7 last** — verification passes against already-fixed code

### Phase 2 Internal Order
1. **2.1 (contributor journey) first** — primary use case, surfaces most issues
2. **2.2–2.3** — role-specific journeys
3. **2.4–2.6** — cross-cutting concerns
4. **2.7–2.8** — systemic fixes applied across all pages (after per-role walkthroughs identify all buttons/operations)
5. **2.5 (i18n) re-sweep last** — final pass after all UI text changes

### Risk Mitigation

- **Regression risk:** Run full test suite (`npm test` + E2E) after each Phase 1 fix
- **Scope creep:** Phase 2 walkthroughs may surface issues not in this plan. Fix blocking/confusing items immediately; polish items go into a backlog appendix in the audit doc.
- **M5 revert bug:** If reproduced in Phase 2.1 live walkthrough, fix immediately. If not, the E2E test in Phase 3.3 is the safety net.

## Final Deliverable

Updated audit document at `docs/audit/comprehensive-audit-2026-03.md` summarizing:
- All findings (new + re-verified from prior audits)
- All fixes applied (with commit references)
- Test coverage before/after
- Any remaining backlog items with severity and rationale for deferral
