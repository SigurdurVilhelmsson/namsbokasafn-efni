# A4 execution runbook — how to walk the manual QA §0–§5 deploy gate

**Date:** 2026-07-22 · **For:** the lead (A4 is a [LEAD] item, L5) · **Gate:** A4 blocks deploying server-touching units.
**Companion:** the automated coverage is defined in `docs/superpowers/specs/2026-07-22-a4-e2e-coverage-design.md` (E2E buildout, 2 PRs).
**Row reference:** `docs/plans/2026-06-10-qa-checklist.md` (the 39-row §0–§5 table). Record pass/date in that table's result column as you go.

## What this is

A4 = the manual QA §0–§5 walk plus 3 prod-only cases. This runbook runs it **automated-first**: run the suites (which machine-verify ~70% of the rows once the buildout lands), then walk the short manual residual, then the 3 prod-only cases, then deploy, then sign off.

**Legend for each step:**
- 🟢 **auto** — a passing test covers it; you just confirm green.
- 🟡 **auto-once-built** — will be 🟢 after the A4 E2E buildout PRs land; **until then, walk it by hand** (steps given).
- 🔴 **manual-always** — no test can witness it; human/on-box/prod judgment.

> ⚠️ **Sequencing:** do NOT deploy any server-touching unit while walking A4 (Phase 1–3). Deploy is Phase 4, after sign-off.
> ⚠️ **Never touch `books/*/01-source/`** in any step below — those CNXML files are legally load-bearing (see CLAUDE.md). Break only *generated* files (`03-translated/`), and restore them.

---

## Phase 0 — Pre-flight (5 min)

1. `nvm use` (reads `.nvmrc` → Node 22.x); `npm install` if dependencies changed since your last run.
2. Confirm nothing is mid-deploy and you're on a clean checkout of the tip of `main` (or the branch under test).
3. Have test intent ready: the automated suites mint their own role cookies; the manual steps below tell you which role to act as.

## Phase 1 — Automated gate (10 min, mostly waiting)

4. **Unit gate (efni):** from the repo root, `npm test` → **all green**. This is the authoritative unit gate (authz logic, restore/version service, enforcement, escaping, render rollback). 🟢
5. **E2E gate (efni):** `npm run test:e2e` → **all green** (kill anything on `:3456` first). Once the buildout PR 1 lands, this turns these rows 🟢: **§0.1a–c, §0.3a–d, §0.4a, §0.reg, §1b/1d/1e, §2a–f, §3a–e, §4a/4b/4c, §5a/5b**, plus the console-error sweep. 🟡→🟢
6. **E2E gate (vefur):** after buildout PR 2 lands, run vefur's E2E (in `namsbokasafn-vefur`) → green. Covers **§0.4b** (published-page breakout) + reader render spot-check. 🟡→🟢
7. **Status validation:** `npm run validate` → clean (if any chapter status files changed).

> If the buildout PRs are **not yet landed**, treat rows marked 🟡 above as manual for this pass and walk them from the checklist (`2026-06-10-qa-checklist.md`) — the buildout is what removes that hand-walking.

## Phase 2 — Manual residual (🔴 never automatable — ~30 min)

8. **§0.2 on-disk render rollback (on-box smoke).** Pick a chapter that already has published pages under `books/<book>/05-publication/mt-preview/chapters/NN/`. Break **one** generated module: introduce a malformed tag in `books/<book>/03-translated/mt-preview/chNN/mNNNNN.cnxml` (a *generated* file — safe). Run `node tools/cnxml-render.js --book <book> --chapter <N>`.
   - **Expect:** the render fails on that module; the **previously-published pages are still present** on disk (not deleted); each touched file's `.backup.*` was **renamed back onto it** (restored, not left orphaned); the error message names the real failing module/phase.
   - **Restore:** re-run inject for that chapter (`node tools/cnxml-inject.js <book> <N>`) to regenerate the module you broke, then re-render. ✅ record result.
9. **§1f divergent-extraction restore.** Only if a real case exists (a module re-extracted so its segment IDs differ from a stored content version): restore that older version via the "Saga útgáfa" modal.
   - **Expect:** graceful — a warning, **no crash, no data loss**. If no divergent case is available, mark **deferred** with that reason (it's opportunistic, not blocking).
10. **§4e / §2f / §3f editorial + visual judgment.** As `head-editor`, open the editor, localization editor, terminology, and admin/assignments screens.
    - **Expect:** chemistry-teacher vocabulary throughout (no untranslated CAT/pipeline jargon on editor screens); the review queue lists Pass-1 **and** localization items sensibly; the per-book assignment grid + progress renders. ✅ record — this is your editorial sign-off, not a pass/fail script.
11. **Browser console sweep** (if buildout not yet landed): with devtools open, visit editor / localization / terminology / admin — **0 uncaught console errors**. (Becomes 🟢 in Phase 1 once built.)

## Phase 3 — The 3 prod-only cases (🔴 real production surface — ~20 min, on prod)

> These need real Entra OAuth / nginx-fronted prod / a destructive boot — synthetic sessions never exercise them, and they have caused real incidents (the #208 login loop).

12. **Prod-only 1 — real Entra OAuth login.** In a **clean browser with no existing session** (fresh incognito, or a browser that has never logged in — the #208 bug hid in already-authenticated Chrome and only surfaced in clean Edge): go to `https://namsbokasafn.is`, sign in via Microsoft.
    - **Expect:** the OAuth return lands you **logged in at `/`, with NO login loop**; the `auth_token` cookie is `SameSite=Lax`, `Secure`, `HttpOnly` (devtools → Application → Cookies). **Do not restore `SameSite=Strict`** (it re-breaks this — code comment says so). ✅
13. **Prod-only 2 — nginx security posture.** Against prod: `curl -sI https://namsbokasafn.is/` (and check a logged-in response in devtools).
    - **Expect:** the security headers (Helmet + nginx) are present as served in prod; the session cookie flags are `Secure`/`HttpOnly`/`SameSite=Lax`; mutating endpoints are POST (SameSite is the deliberate CSRF control). ✅
14. **Prod-only 3 — broken-migration boot (§5c).** On a **throwaway box / disposable DB copy — never prod data**: deliberately corrupt one legacy migration file, rebuild the DB from scratch, start the server.
    - **Expect:** it **logs the migration error and fails per the fail-loud policy** (boot aborts cleanly, no silent half-migrated DB, no unexpected hard crash). Discard the throwaway DB afterward. ✅
    - *(Adjacent UNDETERMINED cross-env facts to eyeball while you're on prod: `GREYNIR_URL` is actually set in the prod `.env`; and a reader sees a correctly-assembled "mixed" chapter page when only some modules are past mt-preview — the latter lives in vefur.)*

## Phase 4 — Deploy (gate lifts — only after Phases 1–3 pass + your sign-off)

15. Deploy the pending server units: `./scripts/deploy.sh` (DB backup → pull → `npm ci` → restart → health). Confirm `GET /api/health` = `ok` (or the expected `degraded` if A2 off-box backup isn't activated yet — that's whitelisted).
16. Run the **pending appendix backfill** (the outstanding PR #324 [LEAD] data-op): `node scripts/backfill-appendix-sections.js --db` — **dry-run first** (no flag) to review the row count, then `--db`. Add-only / idempotent.

## Phase 5 — Sign-off

17. Record pass + date in the result column of `docs/plans/2026-06-10-qa-checklist.md` for each row walked, and note any regression as a new row in the roadmap Progress Log.
18. Mark **A4 done** in the campaign register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, L5). **The deploy gate is now lifted** for the units that were behind it.

---

## Quick map: what each phase covers

| Phase | Rows / cases | Effort after buildout |
|---|---|---|
| 1 Automated | §0.1–0.4, §0.reg, §1a–e, §2, §3, §4a–d, §5a/b/d + console sweep | run 2 commands, confirm green |
| 2 Manual residual | §0.2, §1f, §4e, §2f/§3f judgment | ~30 min hand-walk |
| 3 Prod-only | Entra OAuth · nginx posture · §5c boot | ~20 min on prod |
| 4 Deploy | — | `deploy.sh` + backfill |
| 5 Sign-off | record + lift gate | 5 min |

Before the buildout lands, Phase 1's 🟡 rows move into your hand-walk; that hand-walk is exactly what the two E2E PRs remove.
