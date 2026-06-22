# Hands-on QA Checklist — June 2026 Remediation

**Date:** 2026-06-10
**Status:** Living document. Run the relevant section between roadmap units; record pass/fail and the date in the result column.
**Roadmap:** [`docs/plans/2026-06-10-remediation-roadmap.md`](./2026-06-10-remediation-roadmap.md)
**Audit:** [`docs/audit/2026-06-10-security-quality-review.md`](../audit/2026-06-10-security-quality-review.md)

> Manual QA is needed where automated tests can't easily assert the *behaviour a head-editor cares about* — authorization boundaries, reversibility, and what an editor sees on screen. Run the automated suite first; these checks are on top of it.

### Result legend + automated pass (2026-06-22)

A Claude session ran the full automated gate on 2026-06-22 (all green, **locally** — GitHub Actions are billing-blocked until ~July 1, see the deploy runbook). Rows the passing suites genuinely cover are marked below. **Key finding:** the E2E suite authenticates via a minted-JWT cookie (`server/e2e/helpers/auth.js`), so the authorization boundaries (§0.3, §1e, §3, §5a/b) are *machine-verified*, not manual.

| Mark | Meaning |
|------|---------|
| ✅ auto | Verified by a passing test on 2026-06-22 (test cited) — no manual walk needed |
| ◐ partial | Service/logic unit-tested; the UI or live-endpoint step still wants a manual look |
| 👁 eyes | Human judgment / visual / editorial / production — not automatable |
| ⏳ scriptable | No automated coverage; I can run a CLI/curl check on request (not yet done) |

Gate results: **Vitest 1299** (54 files) · **Playwright E2E 138** · **`/api/health` ok** · **`npm run validate` 24/24** (after the ESM fix + PR #141).

## How to run a session

1. `nvm use` (reads `.nvmrc` — Node 22.x) then `npm install` if dependencies changed.
2. Automated gate: `npm test` (Vitest) and, if frontend/route behaviour changed, `npm run test:e2e` (Playwright). All green before manual QA.
3. `npm run validate` if any chapter status files were touched.
4. Start the server: `npm run server:dev`. Have at least **two test accounts** available — one `editor`, one `head-editor` for a *specific* book — to exercise the authorization boundaries.
5. Walk the matching section below. Record result + date. File any regression as a new row in the roadmap Progress Log.

**Standing accounts to keep in the test DB:**
- `editorA` — role `editor`, assigned to Book X ch.1–2 only.
- `headX` — role `head-editor`, books = [Book X].
- `headY` — role `head-editor`, books = [Book Y].
- `admin` — role `admin`.

---

## §0 — Hotfix QA (Unit 0)

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 0.1a | As `editorA`, open a module preview normally | Renders HTML as before | ◐ module-load happy path covered (`segment-editor.spec`); live preview endpoint not separately asserted |
| 0.1b | `GET /api/segment-editor/<book>/1/m68664/preview?track=../../../../etc/passwd` | 400 (track rejected), no file read | ⏳ `VALID_TRACKS` constants unit-tested; live 400 not asserted — curl-checkable |
| 0.1c | Preview with `moduleId` = `../../something` | 400 (validateModule rejects) | ⏳ guard exists; live 400 not asserted — curl-checkable |
| 0.2a | Trigger a render that fails mid-pass (e.g. temporarily break one module's CNXML) on a chapter that already has published pages | On failure, previously-published pages **still present** on disk; error message accurate | ✅ auto 2026-06-22 — rollback logic extracted to `rollbackWrittenFiles` + unit-tested (`cnxml-render.test`: restores newest backup, picks newest-of-many). A full mid-pass render is still a good on-box smoke. |
| 0.2b | Confirm `.backup.*` files were restored, not left orphaned | Live files match pre-run content | ✅ auto 2026-06-22 — `rollbackWrittenFiles` test: backup is renamed onto the file (consumed, not orphaned); brand-new partials deleted |
| 0.3a | As `headY` (owns Book Y), call approve/apply on a Book X edit | 403 | ✅ auto 2026-06-22 — `requireRole.test`: "rejects a head-editor of a different book with 403" |
| 0.3b | As `headX`, approve/apply a Book X edit | Succeeds | ✅ auto — `requireRole.test`: "passes a head-editor who owns the book" |
| 0.3c | As `admin`, approve a Book X edit | Succeeds (admin bypass) | ✅ auto — `requireRole.test`: "lets admin through for any book" |
| 0.3d | As `headX`, publish a Book Y chapter | 403 | ✅ auto — `requireRole.test` `requireHeadEditorFor`: cross-book 403 |
| 0.4a | Import a term with `source` = `</script><img src=x onerror=alert(1)>`; open terminology list | Rendered as inert text, no script run | ✅ auto — `securityPayloads.test`: escapeHtml "neutralizes `<script>` tags" + attribute-injection |
| 0.4b | Render a module whose title contains `</script>`; view published page source | JSON block intact, no markup breakout | ✅ auto — `cnxml-render.test`: "escapes `<` so a `</script>` in content cannot close the page-data block" |
| 0.reg | Full editor → submit → (other head-editor) approve → apply round-trip on Book X | Works end to end | ◐ save/persist covered (`editor-lifecycle.spec`); authz steps via `rbac.spec`; full submit→approve→apply chain not asserted as one flow |

---

## §1 — Content restore QA (Unit 1)

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 1a | Apply an edit to a module (creates version N) | Faithful file updated; snapshot N-1 stored | ✅ auto — `contentVersionService.test` + `applyStatusRebuild.test` |
| 1b | Restore module to version N-1 via UI | File reverts; fresh snapshot taken first | ◐ `contentVersionService.restoreVersion` unit-tested (snapshots before restore); the UI "Saga útgáfa" modal step is manual |
| 1c | Restore is itself reversible (restore back to N) | Round-trips cleanly | ✅ auto — `contentVersionService.test` (snapshot-before-restore makes it reversible) |
| 1d | `version_restored` appears in the activity log with who/when | Present | ◐ service emits the event (unit); log-row presence on screen is manual |
| 1e | As `headY`, attempt restore on Book X | 403 (book-scoped) | ✅ auto — restore route uses `requireHeadEditor`; `requireRole.test` cross-book 403 |
| 1f | Restore a module whose extraction changed (segment IDs differ) | Graceful: warns, no crash, no data loss | 👁 needs a real divergent-extraction case + judgment |
| 1g | (If 1.4 chosen) git commit produced per apply | Commit present, message sane | N/A — decision was **no** git-per-apply (redundant with the 2h backup cron) |

---

## §2 — Localization review tier QA (Unit 2)

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 2a | `editorA` edits a localized segment, submits for review | Enters pending state, not yet live | ✅ auto — `localizationReviewService.test` |
| 2b | `headX` approves their *own* localization edit (self-approval); `editorA` tries to approve any | Self-approval **allowed** (four-eyes is policy, not enforced); approval is HEAD_EDITOR-only so `editorA` → 403 | ✅ auto — `localizationReviewService.test` (self-approval permitted, mirrors Pass 1) + `rbac.spec` (editor approve → 403). Updated 2026-06-22: original "cannot approve your own edit" expectation was superseded by the shipped self-approval model |
| 2c | `headX` approves; content goes live to `04-localized-content/` | Applied | ✅ auto — `localizationReviewService.test` |
| 2d | Snapshot taken before localized overwrite | Restore data exists | ✅ auto — `localizationReviewService.test` |
| 2e | With per-book toggle OFF, localization saves directly (legacy behaviour) | Backward-compatible | ✅ auto — `localizationReviewService.test` |
| 2f | Review queue shows localization items alongside Pass 1 | Visible | 👁 visual |

---

## §3 — Assignment enforcement QA (Unit 3)

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 3a | `enforce_assignments` OFF for Book X: unassigned editor edits ch.5 | Allowed (legacy) | ✅ auto — `assignmentEnforcement.test` |
| 3b | Turn enforcement ON for Book X: `editorA` (assigned ch.1–2) edits ch.5 | 403 | ✅ auto — `assignmentEnforcement.test` (default-deny when enforced) |
| 3c | `editorA` edits ch.1 | Allowed | ✅ auto — `assignmentEnforcement.test` |
| 3d | `headX` / `admin` edit any Book X chapter | Allowed regardless of enforcement | ✅ auto — `assignmentEnforcement.test` (admin/head bypass) |
| 3e | Assignment table missing/renamed | Fail-closed (503), not open | ✅ auto — `assignmentEnforcement.test` (missing table → 503) |
| 3f | Lead dashboard shows per-book assignment grid + progress | Renders | 👁 visual |

---

## §4 — Editor UX QA (Unit 4)

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 4a | Editor opens a task from "Today" | Header reads "Chapter N · Section title", not `m68664` | 👁 visual |
| 4b | Editor-facing URLs contain no raw module/stage/track jargon | Confirmed | 👁 visual |
| 4c | 8-stage pipeline view + tracks hidden from `editor` role | Not visible | ◐ role-gated UI covered (`admin.spec`: "admin-only buttons hidden for non-admin"); editor-specific pipeline-hide is a visual check |
| 4d | Two editors edit the same segment; second save | 409 conflict prompt (parity with localization) | ✅ auto — `concurrent-editing.spec`: "saving with stale lastModified returns 409" + `segmentEditConflict.test` |
| 4e | Labels reviewed for chemistry-teacher vocabulary | No untranslated CAT jargon on editor screens | 👁 editorial judgment |

---

## §5 — Defense & housekeeping QA (Unit 5, light)

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 5a | Hit `/admin` HTML unauthenticated | Redirect/401 server-side (not a flash of admin UI) | ◐ `viewsPageAuth.test` asserts anon → `/login` redirect; the "no visible flash" part is a visual check |
| 5b | State-changing request without valid session | Rejected | ✅ auto — `viewsPageAuth.test` (invalid/expired token → redirect) + `rbac.spec` (401 unauthenticated) |
| 5c | Server boot with a deliberately broken legacy migration | Logs error, does not hard-crash unexpectedly (per chosen policy) | 👁 boot-scenario — manual |
| 5d | Smoke test after housekeeping commits | `npm test` green; server starts; editor round-trip works | ✅ auto 2026-06-22 — Vitest 1299 green; server boots; `/api/health` ok |

---

## Regression sweep (run before any merge to `main`)

Last run 2026-06-22 (locally; Actions billing-blocked until ~July 1):

- [x] `npm test` green — **1299 passed** (54 files)
- [x] `npm run test:e2e` green — **138 passed**
- [x] `npm run validate` clean — **24/24** (after the ESM fix + PR #141)
- [ ] Editor → submit → other-head approve → apply → render round-trip works on a real book — ◐ save/persist covered by `editor-lifecycle.spec`; full chain not asserted as one flow
- [ ] No new console errors in the browser on editor, localization, terminology, admin pages — 👁 manual (Playwright loads each page without error, but the console sweep is human)
- [x] Health check `GET /api/health` returns `ok` — db, 37 migrations, 5 books, auth
