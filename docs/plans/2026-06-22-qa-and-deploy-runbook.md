# QA + Deploy Runbook — June 2026 (annotated)

**Date:** 2026-06-22
**Purpose:** One page for the combined efni + vefur QA/deploy pass. Splits the
remediation QA (`docs/plans/2026-06-10-qa-checklist.md` §0–§5) into **`[auto ✓]`**
(machine-verified — already run this session) vs **`[your eyes]`** (human
judgment / production), then gives the deploy + live-verification steps.

## ⚠️ GitHub Actions blocked until ~2026-07-01 (billing)

Monthly Actions credits are exhausted (renew ~July 1). **All workflows fail in
~3s with no logs** — annotation: *"job was not started because recent account
payments have failed."* This is **billing, not code**, and it affects everything:

- **CI checks** (lint, test, e2e, audit, validate) show all-red on every PR.
  The repo is free-tier (no branch protection), so PRs stay `MERGEABLE` — merge
  on the basis of a **local gate run** (`npm test`, `server` e2e, `npm run
  validate`), not the red checkmarks. Watch for a real failure hiding among the
  billing-reds.
- **Deploy/sync Actions** (e.g. "Sync Content to Vefur") are blocked too — so
  auto-sync will not fire regardless of token config. The **manual
  `node scripts/sync-content.js` path below is the only deploy route** until
  credits renew.

## Automated gate — run 2026-06-22, all green (locally)

| Gate | Result |
|------|--------|
| Vitest (full workspace) | ✅ 1299 passed (54 files) |
| Playwright E2E | ✅ 138 passed — RBAC, editor lifecycle, terminology, concurrent-editing, CSP, admin, localization |
| `GET /api/health` | ✅ ok — db, 37 migrations, 5 books, auth |
| `npm run validate` | ✅ 24/24 valid (after the ESM fix + PR #141 status fixes) |

> The E2E suite authenticates by minting a JWT (`server/e2e/helpers/auth.js`,
> `loginAs(page, role)`) and injecting it as the `auth_token` cookie — **no Entra
> ID needed**. That is why the authorization-boundary checks below are
> machine-verified, not manual.

## §0–§5 checklist — annotated

`[auto ✓]` = covered by the passing Vitest/E2E suites or a CLI check I ran.
`[your eyes]` = human judgment, visual, or production-only.

### §0 Hotfixes
- `[auto ✓]` 0.1b/0.1c preview path-traversal → 400 — `validateModule`/`VALID_TRACKS` unit tests.
- `[auto ✓]` 0.3a–d book-scoped authz (headY→403, headX→ok, admin bypass) — `rbac.spec.js`.
- `[auto ✓]` 0.4a/0.4b output escaping (terminology + page-data) — escape unit tests + render output.
- `[your eyes]` 0.2a/0.2b render restore-on-failure — *I can script this as a CLI check on request* (break a module's CNXML, render, confirm prior pages survive + `.backup.*` restored); otherwise verify on the box.

### §1 Content restore
- `[auto ✓]` 1a–1d apply/restore/round-trip/activity-log — `contentVersionService` tests + editor-lifecycle E2E.
- `[auto ✓]` 1e book-scoped restore 403 — RBAC tests.
- `[your eyes]` 1f restore across a changed extraction (graceful warn, no data loss) — needs a real divergent-extraction case + judgment.

### §2 Localization review tier
- `[auto ✓]` 2a–2e pending→approve flow, self-approve rule, toggle on/off — `localizationReviewService` tests + localization E2E.
- `[your eyes]` 2f review queue *shows localization items sensibly* alongside Pass 1 — visual.

### §3 Assignment enforcement
- `[auto ✓]` 3a–3e enforce on/off, default-deny, fail-closed 503 — `assignmentEnforcement` tests.
- `[your eyes]` 3f lead dashboard assignment grid *renders + reads right* — visual.

### §4 Editor UX  — **mostly `[your eyes]`** (this is the visual/copy unit)
- `[auto ✓]` 4d concurrent-edit 409 — `concurrent-editing.spec.js`.
- `[your eyes]` 4a/4b/4c/4e — header reads "Chapter N · Section", no raw `mNNNNN`/track/stage jargon, pipeline view hidden from `editor`, **vocabulary reads naturally to a chemistry teacher**. E2E asserts text exists; only you judge it's *right*.

### §5 Defense & housekeeping
- `[auto ✓]` 5a/5b page-auth redirect + state-change rejection — `viewsPageAuth` tests + CSP/RBAC E2E.
- `[auto ✓]` 5d smoke (server starts, suite green) — done this session.
- `[your eyes]` 5a *no visible flash* of admin UI before redirect — timing/visual; 5c broken-migration boot policy — confirm log behavior matches the chosen policy.

### Browser console-error sweep (regression sweep)
- `[your eyes]` — Playwright *can* collect console errors, but deciding which matter while logged in across editor/localization/terminology/admin is human.

## Deploy + live verification (production — `[your eyes]`)

This single sync ships everything merged-but-undeployed and resolves the slug
404s at once. Run in **namsbokasafn-vefur** on the box (or locally then deploy).
**Until ~2026-07-01 this manual sync is the only route — the auto-sync Action is
billing-blocked (see the callout up top).**

1. **Sync content** (pulls efni `05-publication`, regenerates `toc.json`):
   ```
   node scripts/sync-content.js --source ../namsbokasafn-efni
   ```
2. **Deploy** vefur (the normal production deploy step).
3. **Verify on namsbokasafn.is:**
   - [ ] **Item D 404s cleared** — these three section URLs load (not 404):
     `edlisfraedi-2e` ch4 `…-samhverfa-i`, `efnafraedi-2e` ch9 `…-blanda-og`,
     `efnafraedi-2e` ch19 `…-hlidarmalma-og`.
   - [ ] **A1** — on `efnafraedi-2e` 2-3 (Bygging atóms…), the "viðauka A" link
     navigates to the interactive periodic table (`/efnafraedi-2e/vidauki/A`),
     not a dead in-page anchor.
   - [ ] **A2** — `efnafraedi-2e` 7-exercises and 12-exercises show the footnote
     text at the bottom, and the superscript ¹ jumps to it.
   - [ ] **Feature pairs** render: section objectives (markmið), Check-Your-
     Learning answer reveal, intro-page chapter-outline links land on sections.
   - [ ] Intro-page outline links are absolute (don't drop to root).

## What's still open after this pass
- PR #141 (status.json validity) — merge to make `validate` clean in CI.
- The §4 vocabulary/copy review and §3f/§2f dashboard look — your eyes.
- E2E test-hygiene follow-up: the suite writes test markers into real
  `efnafraedi-2e` content (reverted manually this session) instead of an
  isolated fixture — worth isolating so a crashed run can't leave dirty content.
