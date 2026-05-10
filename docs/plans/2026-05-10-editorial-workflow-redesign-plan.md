# Editorial Workflow Redesign — Implementation Plan

**Date:** 2026-05-10
**Companion audit:** [`docs/audit/2026-05-10-editorial-workflow-audit.md`](../audit/2026-05-10-editorial-workflow-audit.md)
**Audience:** Future Claude session executing `/executing-plans`, or human maintainer

---

## Context

The audit identified seven findings (F1–F7) and a workflow trap (editors must remember a discrete "Submit module" click or their work is invisible). This plan sequences fixes in dependency order, behind feature flags where behaviour changes, with a rollback path per phase.

**Guiding principles:**
- *Truth before beauty:* fix what the dashboard says before redesigning what it looks like.
- *One source of truth:* every counter derives from a single read-model service.
- *Risk-free wins first:* vocabulary swap (Phase 1.7) ships before the inbox rewrite because it costs nothing and helps every subsequent phase's user testing.
- *Behaviour changes are flag-gated:* Phase 2b and Phase 5 ship dark and enable per-environment.

---

## Phase 0 — Audit document  ✅ DONE

**Goal:** establish shared analytical baseline.
**Output:** `docs/audit/2026-05-10-editorial-workflow-audit.md`
**Acceptance:** every finding F1–F7 cites a `file:line`. Markdown renders cleanly in GitHub preview.
**Effort:** M (½ day)

---

## Phase 1 — `dashboardReadModel.js` service (no UI change)

**Goal:** introduce one service that every dashboard panel reads from. No callers wired yet.

**Files touched:**
- `server/services/dashboardReadModel.js` (new)
- `test/services/dashboardReadModel.test.js` (new — Vitest)

**API surface (proposed):**
```js
module.exports = {
  // What's globally pending across all editors. Source: segment_edits.status='pending'.
  getGlobalQueue({ book, chapter, editor } = {}) { /* returns array of edit summaries */ },

  // What this user personally has on their plate (rejected/discuss + assignments).
  getUserQueue(username) { /* returns { rejectedDiscuss, assignments } */ },

  // Per-editor counts over the last 7 days. Source: segment_edits aggregations.
  getEditorWorkload({ days = 7 } = {}) { /* returns array of { editor, active, overdue, load } */ },

  // Modules where all edits are approved but applied_at IS NULL on at least one.
  getReadyForAssignment() { /* returns array of { book, chapter, moduleId, approvedCount } */ },

  // Single-source-of-truth aggregate for the home page admin tile.
  getAdminHeadlineCount() { /* returns integer — global pending count */ },
};
```

**Data migration:** none. Read-only.

**Acceptance test:** `npm test -- dashboardReadModel` passes. Tests must include:
- `getGlobalQueue()` returns 1 row when one `pending` `segment_edit` exists, *without* requiring a `module_review` parent
- `getUserQueue(username)` returns only that user's rejected/discuss edits
- `getEditorWorkload()` aggregates correctly across multiple editors
- `getReadyForAssignment()` excludes modules with any `applied_at IS NOT NULL` edits

**Rollback:** delete the file. No callers exist yet.

**Effort:** M (½–1 day)

---

## Phase 1.5 — Wire tiles to read-model; fix or remove broken panels

**Goal:** every visible counter on `/` is provably correct. The two skeleton panels either show data or are removed.

**Files touched:**
- `server/routes/my-work.js` (lines 67-69, 74-95, 211-316, 318-345) — replace personal-only queries with role-aware delegation to `dashboardReadModel`
- `server/routes/status.js` (lines 109-128, 263-307) — populate `workload` and `readyForAssignment` from `dashboardReadModel`
- `server/views/my-work.html` (lines 1287-1291) — render different tiles per role (use the `userLoaded` event already in place at line 1190)
- `server/views/my-work.html` (lines 1086-1120) — keep the panels (now populated) **OR** delete them in favour of surfacing in `/yfirferd` (Phase 3)
- `test/playwright/dashboard-truth.spec.js` (new)

**Decision required before merging:** keep `Vinnuálag ritstjóra` + `Tilbúið til úthlutunar` on the home page, or move them to `/yfirferd`? Recommend keep-and-populate for Phase 1.5 (smallest diff), then move during Phase 3.

**Data migration:** none.

**Acceptance test:**
- Curl `GET /api/my-work/today` as an admin who has never edited; assert `quickStats.adminPending` (new field) > 0 when DB has `pending` `segment_edits`.
- Curl `GET /api/status/dashboard`; assert response includes non-empty `workload` array and `readyForAssignment` array (or that the keys are absent because the panels were deleted).
- Playwright: load `/` as admin via role-preview dropdown; assert headline tile shows the global pending count, not 0.
- Playwright: load `/` as editor; assert tiles show personal stats.

**Rollback:** `git revert <sha>`. No data written.

**Effort:** S (≤2h once Phase 1 is in place)

---

## Phase 1.7 — Vocabulary swap

**Goal:** every screen uses chemistry-teacher words instead of translator jargon. No data-layer changes.

**Files touched:** all of `server/views/*.html` (verified: no centralised `ui-strings.js` exists). Apply the table in §5 of the audit doc.

**Data migration:** none.

**Acceptance test:**
- `grep -rn "Translation memory\|TM\|Faithful translation\|Module review" server/views/` returns zero matches outside `<!-- comment -->` blocks.
- Playwright: load each role view; manual screenshot review confirms readability.
- User-testing checkpoint: 30-min walkthrough with one editor + the head-editor before merging the next phase.

**Rollback:** `git revert <sha>`. Pure string changes, fully reversible.

**Effort:** S (≤2h plus user-testing slot)

---

## Phase 2a — Counter reads pending `segment_edits` directly

**Goal:** close the "editor hides own work" trap on the *read* side. The admin counter no longer requires a `module_review` parent.

**Files touched:**
- `server/services/dashboardReadModel.js` — `getAdminHeadlineCount()` reads `segment_edits.status='pending'` only
- `server/routes/status.js:265` — replace `getPendingModuleReviews()` call with `dashboardReadModel.getAdminHeadlineCount()`
- `server/routes/my-work.js` — same in the admin tile path
- `test/services/dashboardReadModel.test.js` — add test asserting orphan pending edits count

**Data migration:** none. The `module_reviews` table stays untouched and still works for any UI that reads it.

**Acceptance test:**
- Vitest: insert `pending` `segment_edit` directly; `getAdminHeadlineCount()` returns 1.
- Playwright: as admin, observe headline counter increment in real time after an editor saves an edit *without* clicking submit.

**Rollback:** `git revert <sha>`. The old `getPendingModuleReviews()` function is unchanged and ready to be re-wired.

**Effort:** M (½ day)

---

## Phase 2b — Hide "Submit for review" button (flag-gated)

**Goal:** behaviour change. Editors no longer need to remember a discrete submit step.

**Files touched:**
- `server/views/segment-editor.html` — wrap "Submit module for review" button in `{{#if !flags.directQueue}}` (or equivalent server-rendered conditional via existing config)
- `server/routes/segment-editor.js` — `/submit` route returns `410 Gone` when `ENABLE_DIRECT_QUEUE=1`
- `server/config.js` — read `ENABLE_DIRECT_QUEUE` env var
- `test/playwright/editor-save-without-submit.spec.js` (new)

**Data migration:** for any `segment_edits` rows that *would have* been wrapped in a `module_review` but weren't (because the editor never clicked submit), the new dashboard already surfaces them via Phase 2a — no migration needed. If the team later decides to deprecate `module_reviews` entirely (open question 6 in the audit), that's a Phase 6+ decision.

**Acceptance test:**
- With `ENABLE_DIRECT_QUEUE=1`: as editor, save an edit; assert no "Submit" button visible; assert `POST /api/segment-editor/.../submit` returns 410.
- Without the flag: behaviour is unchanged.
- Playwright role-preview screenshot diff between flag on/off.

**Rollback:** unset the env var. The button reappears immediately. No data has been altered.

**Pre-merge checklist:** ship Phase 2a first; let it run for at least one full work week with the new counter visible to admins; only then enable Phase 2b. This soak time is to catch any case where `segment_edits` and `module_reviews` had subtly drifted, before removing the visible reminder.

**Effort:** M (½ day + 1-week soak)

---

## Phase 3 — `/yfirferd` inbox screen

**Goal:** one role-filtered queue containing everything waiting for the current user.

**Files touched:**
- `server/views/yfirferd.html` (new)
- `server/public/js/yfirferd.js` (new)
- `server/routes/views.js` — register `/yfirferd` route
- `server/public/js/layout.js:28-117` — add nav entry "Yfirferð" (singular, replacing "Yfirferðir") in the Review section, pointing at `/yfirferd`
- `server/routes/views.js` — keep `/editor?view=reviews` working for one release; add a 301 to `/yfirferd` in Phase 4
- `test/playwright/inbox-nav.spec.js` (new)

**Layout (per audit §8.2):**
- Filter bar: book, chapter, editor, status (defaults: all)
- Flat list, newest first, one row per pending segment edit
- Inline action buttons: Approve / Discuss / Reject
- Sidebar mini-panels: *Ready for apply*, *Workload* (now contextual)

**Data source:** `dashboardReadModel.getGlobalQueue()` for admins/head-editors; `dashboardReadModel.getUserQueue(username)` for editors (showing rejected/discuss items they need to address).

**Data migration:** none.

**Acceptance test:**
- Playwright: `/yfirferd` reachable from sidebar
- Loads pending items
- Role-filtered: editor sees their own rejected/discuss; head-editor and admin see global pending
- Approve button updates `segment_edits.status` and removes the row from the list without page reload

**Rollback:** `git revert <sha>`. The legacy `/editor?view=reviews` mode still works (Phase 4 hasn't redirected it yet).

**Pre-merge user testing:** 30-min walkthrough with head-editor.

**Effort:** L (1–2 days)

---

## Phase 3.5 — Notification badge + optional digest email

**Goal:** the inbox model only works if it pulls users back. Add a count badge on the `/yfirferd` nav link, plus an optional daily digest email.

**Files touched:**
- `server/public/js/layout.js` — render badge on the Yfirferð link, polling `GET /api/my-work/summary` every 60s
- `server/routes/my-work.js` — `/summary` endpoint returns role-aware `total` from `dashboardReadModel`
- `server/services/notifications.js` (existing) — add `sendDigest(user)` function; reuse existing mailer
- `server/jobs/dailyDigest.js` (new) — scheduled via existing job runner if one exists, else cron-via-systemd documented in `docs/operations/`

**Open question to resolve before this phase:** in-app only, or also email? (Audit open question 2.) Recommendation: badge in Phase 3.5; email in a follow-up if the team asks for it.

**Data migration:** add `users.digest_opt_in BOOLEAN DEFAULT 0` column via new migration if email is included.

**Acceptance test:**
- Vitest: `/api/my-work/summary` returns `total` matching `getAdminHeadlineCount()` for admin, `getUserQueue().length` for editor.
- Playwright: badge appears on Yfirferð link when count > 0; disappears when 0.
- (Email path) Vitest: `sendDigest(mockUser)` produces an HTML email with current pending list.

**Rollback:** remove badge JS; revert migration if email shipped.

**Effort:** S (≤2h for badge; +M if email)

---

## Phase 4 — Inline help, tooltips, onboarding tour

**Goal:** new editors complete their first review without asking for help.

**Files touched:**
- `server/views/yfirferd.html`, `segment-editor.html`, `localization-editor.html` — `?` info icons next to non-obvious labels (Pass 1 vs Pass 2, edit categories, status meanings)
- `server/views/_help-modal.html` (new partial) — first-login tour
- `server/migrations/0XX-help-tour-seen.js` — adds `users.help_tour_seen_at DATETIME` so tour shows once
- `server/routes/views.js` — add 301: `/editor?view=reviews` → `/yfirferd`
- `server/views/_help-content.md` — writable by maintainer or head-editor (decided per audit open question 8)

**Data migration:** add nullable `users.help_tour_seen_at`. Backfill: leave `NULL` so all existing users see the tour once.

**Acceptance test:**
- Playwright: log in as a user with `help_tour_seen_at IS NULL`; assert tour modal opens; dismiss; assert column updates; reload; assert no modal.
- Pass 1 vs Pass 2 tooltip content reviewed by a head-editor.

**Rollback:** revert the migration; remove tour partial.

**Effort:** M (½–1 day)

---

## Phase 5 — Resolve dual auto-apply / manual-apply ambiguity

**Goal:** there is exactly one trigger for `applyApprovedEdits()`. Admins can predict when files in `03-faithful-translation/` will update.

**Files touched:**
- `server/services/segmentEditorService.js:474-600+` — single internal function; the auto-trigger (after review-complete with all approved) becomes the only caller in production, gated by `ENABLE_AUTO_APPLY_ONLY=1`
- `server/routes/segment-editor.js` — `/apply` route returns 410 when flag is on (or remains as an admin-override path for stuck reviews — decide in PR)
- `test/services/applyTrigger.test.js` (new) — assert only one trigger fires per review-complete event

**Recommendation:** keep the manual `/apply` route as an **admin-only override** for the case where a review is partially approved and the admin wants to ship the approved subset early. UI label: "Apply approved subset now." This is the only case where the auto-trigger doesn't fire.

**Data migration:** none.

**Acceptance test:**
- Vitest: complete a review where all edits are approved; assert exactly one file write.
- Vitest: complete a review where only some edits are approved; assert no auto file write; assert manual `/apply` still works.
- Playwright: as admin, observe a "Manual apply" button on partially-approved modules only.

**Rollback:** unset the flag.

**Effort:** M (½–1 day)

---

## Phase 6 — CI invariant tests

**Goal:** the F2-class regression cannot reach prod again.

**Files touched:**
- `test/services/dashboardInvariants.test.js` (new)

**Tests:**
- *Counter parity:* `getAdminHeadlineCount()` equals raw `SELECT COUNT(*) FROM segment_edits WHERE status='pending'`.
- *No orphan-pending:* (after Phase 2b) for every `pending` `segment_edit`, either there is *no* `module_reviews` row OR there is exactly one with consistent state.
- *No ghost edits:* every `segment_edit` mutation in the last 24h has a corresponding `activity_log` row. (Optional; depends on whether F4 is fully addressed by then.)
- *Apply trigger uniqueness:* (after Phase 5) for any review-complete event, `applyApprovedEdits` is called exactly once.

**Acceptance test:** the test suite passes; deliberately seed an orphan-pending fixture and confirm the test fails.

**Rollback:** `git revert <sha>`. Tests-only.

**Effort:** S (≤2h)

---

## Cross-cutting concerns

### Backwards compatibility

- All existing 301 redirects in `server/routes/views.js` stay.
- `/editor?view=reviews` keeps working through Phase 3; Phase 4 redirects it to `/yfirferd`.
- The `module_reviews` table is **not** dropped; it is bypassed for the dashboard counter but remains queryable. Open question 6 in the audit decides its long-term fate.

### Feature flags

| Flag | Default | Phases | Purpose |
|---|---|---|---|
| `ENABLE_DIRECT_QUEUE` | off | 2b | Hide Submit-for-review button; `/submit` returns 410 |
| `ENABLE_AUTO_APPLY_ONLY` | off | 5 | Manual `/apply` returns 410 except for partial-approve override |

Flags are read at request time, matching the existing pattern in `server/config.js` and the env-var reads in routes.

### Test strategy

- **Vitest** under `test/services/` for `dashboardReadModel`, `applyTrigger`, and `dashboardInvariants`.
- **Playwright** under `test/playwright/` for `dashboard-truth.spec.js`, `inbox-nav.spec.js`, `editor-save-without-submit.spec.js`, role-preview screenshot diffs.
- Each phase adds at least one Playwright spec or Vitest file.
- The existing role-preview dropdown (`server/public/js/layout.js:96-103`) is the manual QA harness — every phase's acceptance criteria includes a screenshot per role.

### User-testing checkpoints

Two non-code checklist items, blocking before the next phase merges:

1. After Phase 1.7 (vocabulary swap): 30-min walkthrough with one editor and the head-editor.
2. After Phase 3 (inbox): 30-min walkthrough with the head-editor; ideally also an editor seeing it for the first time.

---

## Two-week budget recommendation

If the maintainer has only two weeks of part-time capacity, ship: **Phase 0 (audit, ½ day) + Phase 1 + 1.5 (read-model and honest tiles, ~2 days) + Phase 1.7 (vocabulary swap, ½ day) + Phase 2a (pending edits surface in global counter, ~1 day)**. Stop there. Those four together fix every truthfulness problem and remove the workflow trap where editors hide their own work — the bulk of the actual user pain. The `/yfirferd` inbox, the help system, and the apply-trigger cleanup are real improvements but additive UX, not corrections to a system that currently lies to its users. A truthful dashboard is 80% of an inbox at 20% of the cost.

---

## Critical files summary

| Touched in phase | File |
|---|---|
| 1, 2a | `server/services/dashboardReadModel.js` (new) |
| 1.5, 2a | `server/routes/my-work.js` |
| 1.5, 2a | `server/routes/status.js` |
| 1.5, 1.7, 2b, 3 | `server/views/my-work.html`, `server/views/segment-editor.html`, others |
| 2b, 5 | `server/routes/segment-editor.js`, `server/services/segmentEditorService.js` |
| 3 | `server/views/yfirferd.html` (new), `server/public/js/yfirferd.js` (new) |
| 3, 4 | `server/public/js/layout.js`, `server/routes/views.js` |
| 3.5 | `server/services/notifications.js` (existing) |
| 6 | `test/services/dashboardInvariants.test.js` (new) |

---

*End of plan.*
