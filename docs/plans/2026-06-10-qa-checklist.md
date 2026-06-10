# Hands-on QA Checklist — June 2026 Remediation

**Date:** 2026-06-10
**Status:** Living document. Run the relevant section between roadmap units; record pass/fail and the date in the result column.
**Roadmap:** [`docs/plans/2026-06-10-remediation-roadmap.md`](./2026-06-10-remediation-roadmap.md)
**Audit:** [`docs/audit/2026-06-10-security-quality-review.md`](../audit/2026-06-10-security-quality-review.md)

> Manual QA is needed where automated tests can't easily assert the *behaviour a head-editor cares about* — authorization boundaries, reversibility, and what an editor sees on screen. Run the automated suite first; these checks are on top of it.

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
| 0.1a | As `editorA`, open a module preview normally | Renders HTML as before | |
| 0.1b | `GET /api/segment-editor/<book>/1/m68664/preview?track=../../../../etc/passwd` | 400 (track rejected), no file read | |
| 0.1c | Preview with `moduleId` = `../../something` | 400 (validateModule rejects) | |
| 0.2a | Trigger a render that fails mid-pass (e.g. temporarily break one module's CNXML) on a chapter that already has published pages | On failure, previously-published pages **still present** on disk; error message accurate | |
| 0.2b | Confirm `.backup.*` files were restored, not left orphaned | Live files match pre-run content | |
| 0.3a | As `headY` (owns Book Y), call approve/apply on a Book X edit | 403 | |
| 0.3b | As `headX`, approve/apply a Book X edit | Succeeds | |
| 0.3c | As `admin`, approve a Book X edit | Succeeds (admin bypass) | |
| 0.3d | As `headX`, publish a Book Y chapter | 403 | |
| 0.4a | Import a term with `source` = `</script><img src=x onerror=alert(1)>`; open terminology list | Rendered as inert text, no script run | |
| 0.4b | Render a module whose title contains `</script>`; view published page source | JSON block intact, no markup breakout | |
| 0.reg | Full editor → submit → (other head-editor) approve → apply round-trip on Book X | Works end to end | |

---

## §1 — Content restore QA (Unit 1)

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 1a | Apply an edit to a module (creates version N) | Faithful file updated; snapshot N-1 stored | |
| 1b | Restore module to version N-1 via UI | File reverts; fresh snapshot taken first | |
| 1c | Restore is itself reversible (restore back to N) | Round-trips cleanly | |
| 1d | `version_restored` appears in the activity log with who/when | Present | |
| 1e | As `headY`, attempt restore on Book X | 403 (book-scoped) | |
| 1f | Restore a module whose extraction changed (segment IDs differ) | Graceful: warns, no crash, no data loss | |
| 1g | (If 1.4 chosen) git commit produced per apply | Commit present, message sane | |

---

## §2 — Localization review tier QA (Unit 2)

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 2a | `editorA` edits a localized segment, submits for review | Enters pending state, not yet live | |
| 2b | `editorA` tries to approve their own localization edit | "Cannot approve your own edit" | |
| 2c | `headX` approves; content goes live to `04-localized-content/` | Applied | |
| 2d | Snapshot taken before localized overwrite | Restore data exists | |
| 2e | With per-book toggle OFF, localization saves directly (legacy behaviour) | Backward-compatible | |
| 2f | Review queue shows localization items alongside Pass 1 | Visible | |

---

## §3 — Assignment enforcement QA (Unit 3)

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 3a | `enforce_assignments` OFF for Book X: unassigned editor edits ch.5 | Allowed (legacy) | |
| 3b | Turn enforcement ON for Book X: `editorA` (assigned ch.1–2) edits ch.5 | 403 | |
| 3c | `editorA` edits ch.1 | Allowed | |
| 3d | `headX` / `admin` edit any Book X chapter | Allowed regardless of enforcement | |
| 3e | Assignment table missing/renamed | Fail-closed (503), not open | |
| 3f | Lead dashboard shows per-book assignment grid + progress | Renders | |

---

## §4 — Editor UX QA (Unit 4)

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 4a | Editor opens a task from "Today" | Header reads "Chapter N · Section title", not `m68664` | |
| 4b | Editor-facing URLs contain no raw module/stage/track jargon | Confirmed | |
| 4c | 8-stage pipeline view + tracks hidden from `editor` role | Not visible | |
| 4d | Two editors edit the same segment; second save | 409 conflict prompt (parity with localization) | |
| 4e | Labels reviewed for chemistry-teacher vocabulary | No untranslated CAT jargon on editor screens | |

---

## §5 — Defense & housekeeping QA (Unit 5, light)

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 5a | Hit `/admin` HTML unauthenticated | Redirect/401 server-side (not a flash of admin UI) | |
| 5b | State-changing request without valid session | Rejected | |
| 5c | Server boot with a deliberately broken legacy migration | Logs error, does not hard-crash unexpectedly (per chosen policy) | |
| 5d | Smoke test after housekeeping commits | `npm test` green; server starts; editor round-trip works | |

---

## Regression sweep (run before any merge to `main`)

- [ ] `npm test` green
- [ ] `npm run test:e2e` green (if UI/routes touched)
- [ ] `npm run validate` clean (if status files touched)
- [ ] Editor → submit → other-head approve → apply → render round-trip works on a real book
- [ ] No new console errors in the browser on editor, localization, terminology, admin pages
- [ ] Health check `GET /api/health` returns `ok`
