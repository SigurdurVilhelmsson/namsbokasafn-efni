# A4 E2E coverage buildout — design

**Date:** 2026-07-22 · **Campaign item:** A4 (Manual QA §0–§5 walk, LEAD/L5) · **Type:** test-coverage buildout (2 PRs)
**Baseline:** main `a430d55f` · **Companion deliverable:** `docs/plans/2026-07-22-a4-execution-runbook.md`
**Source checklist:** `docs/plans/2026-06-10-qa-checklist.md` (the 39-row §0–§5 table, pre-annotated with 2026-06-22 automated-coverage marks).

## Problem

A4 is the deploy gate for the June-2026 remediation units and every server-touching change since. Today it is a **39-row human checklist** with no machine mapping, so "is A4 done?" is a judgment call each time, and the gate is re-walked by hand on every deploy. Analysis of the checklist against the existing Playwright harness (`server/e2e/`, ~138 specs, role-cookie auth via `loginAs`) shows **~70% of the rows have a browser-automatable core** — the authorization boundaries and on-screen behaviors a head-editor cares about — while a small residual is irreducibly manual (on-disk pipeline behavior, boot scenarios, editorial judgment, prod-only auth/nginx).

**Goal:** convert the automatable rows into **A4-row-tagged E2E tests** across the two repos A4 spans (efni + vefur), so the gate becomes: *run the suite → a named set of rows is machine-verified in CI → walk a short, explicit manual residual → sign off.* This turns a fuzzy [LEAD] guess into a [LEAD] sign-off over a small named set.

**Non-goal:** retiring A4. The manual residual and the prod-only cases remain a human pass; this buildout shrinks and makes auditable the automated portion, it does not remove the gate.

## Canonical facts (harness)

- **Auth:** E2E authenticates via a minted-JWT cookie (`server/e2e/helpers/auth.js` `getTestToken(role)` / `loginAs(role)`) — it **bypasses Microsoft Entra OAuth by design**. Role authz is therefore fully testable (mint editor / head-editor / admin / viewer cookies); the OAuth *mechanism* is not (→ prod-only case 1).
- **Fixture:** writer/mutating E2E targets the committed `books/__e2e-fixture__` book; `head-editor` cookies carry `books: ['efnafraedi-2e','__e2e-fixture__']`. Reuse this — do not mutate a real book.
- **Server:** E2E runs against a throwaway `e2e-sessions.db` on `:3456` (`seed-fixture.js`); kill `:3456` first. `npm run test:e2e` is the command.

## A4-row tagging (the load-bearing convention)

Every new/extended test's title begins with its A4 row id, e.g. `test('§0.3a cross-book approve → 403', …)`. This makes the automated coverage a diff you can point at: the runbook maps "these row ids are green" instead of asserting the whole gate by feel. A row is "automated" only when a tagged test asserts the **head-editor-visible behavior** (status code, resolved DOM, actual link/text), not merely the underlying function (that is the existing Vitest unit's job).

## Approach

Chosen of three: **(1) one new `a4-coverage.spec.js` for the genuinely-new cross-cutting flows + targeted extensions to the topical specs.** Rejected: (2) extend-existing-only — A4 coverage becomes untraceable, and the cross-cutting approve/apply chain has no natural home; (3) one monolith — duplicates already-green flows and grows unboundedly. Principle: **do not re-test what is already green** (`concurrent-editing.spec` §4d, `csp.spec`, `rbac.spec` basics) — extend it with the missing A4 assertion, or add the new flow.

### PR 1 — efni (`server/e2e/`)

| A4 rows | Home | Browser assertion |
|---|---|---|
| §0.reg + regression full-chain | **new** `a4-coverage.spec.js` | editor→submit→(other head-editor)approve→apply as ONE role-switching flow on `__e2e-fixture__` |
| §1b/1d restore round-trip | **new** `a4-coverage.spec.js` | drive "Saga útgáfa" modal → file reverts; `version_restored` activity row appears; restore-back round-trips |
| §0.4a stored-XSS **inert in editor** | **new** `a4-coverage.spec.js` | import a term whose `source` = `</script><img src=x onerror=…>` → no dialog fires (`page.on('dialog')`), payload is escaped text in the terminology list |
| console-error sweep (regression) | **new** `a4-coverage.spec.js` | visit editor/localization/terminology/admin as the appropriate role; `page.on('console','pageerror')` collects **0** errors |
| §5a page-auth + no-flash | **new** `a4-coverage.spec.js` | `/admin` anon → redirect to `/login?...`; admin-only DOM never painted (assert absent immediately post-nav) |
| §0.1a preview happy path | extend `segment-editor.spec.js` | module preview renders expected HTML for `editorA` |
| §0.1b/0.1c preview traversal 400 | extend `segment-editor.spec.js` | via `request` (APIRequestContext) with a role cookie: `?track=../../../etc/passwd` and `moduleId=../..` → **400**, no file read |
| §0.3a–d cross-book authz | extend `rbac.spec.js` | `headY` approve/apply/publish a Book X action → **403**; `headX`/`admin` → succeed |
| §1e cross-book restore | extend `rbac.spec.js` | `headY` restore on Book X → **403** |
| §5b no-session state-change | extend `rbac.spec.js` | mutating request without a valid session → rejected (401/redirect) |
| §3a–e enforcement toggle | extend `admin.spec.js` (or new `enforcement.spec.js`) | drive the admin toggle ON → unassigned `editorA` edits ch.5 → **403**; assigned ch.1 → allowed; OFF → legacy-allowed; missing table → **503** (fail-closed) |
| §4c pipeline hidden for editor | extend `admin.spec.js` | 8-stage pipeline / track controls not visible for the `editor` role cookie |
| §2a–f localization tier | extend `localization-editor.spec.js` | `editorA` submit → pending (not live) → `headX` approve → live to `04-localized-content/`; toggle-OFF legacy direct-save; queue lists localization items |
| §4a/4b UX surface | extend `segment-editor.spec.js` | task header reads "Chapter N · Section title" (not `mNNNNN`); editor-facing URL carries no raw module/stage/track jargon |

### PR 2 — vefur (reader-side, separate repo `namsbokasafn-vefur`)

Implemented by **relaunching in namsbokasafn-vefur** (read its `CLAUDE.md` + memory index first; confirm/establish its Playwright harness). Scope:
- **§0.4b published-page breakout:** a published module whose title contains `</script>` → view the real reader page; the page-data JSON block is intact, no markup breakout, no script executes.
- **Reader render spot-check:** a published chapter + an **appendix** page (ties to the just-merged appendix work) render the expected structure (per-letter element labels, clean `<title>`), guarding the efni→vefur render contract at the reader surface.

These are scoped here but tracked as a vefur-repo PR; the efni PR does not depend on it.

## Out of scope — the manual residual (stays in the runbook, not automated)

- **§0.2a/b on-disk render rollback** — filesystem/pipeline behavior; already Vitest-covered (`rollbackWrittenFiles`); the mid-pass on-box smoke stays manual (a browser can't witness `.backup.*` restoration meaningfully).
- **§1f divergent-extraction restore** — needs a real divergent-extraction data case + judgment.
- **§5c broken-migration boot** — process/boot scenario requiring a destructive from-scratch DB rebuild → **prod-only case 3**.
- **§4e / §2f / §3f aesthetic verdict** — the structural DOM is asserted (queue lists items, grid renders); "reads right to a chemistry teacher" / "looks right" is editorial judgment.
- **The 3 prod-only cases** (from `docs/audit/2026-07-11-server-review-joint-summary.md` §4): (1) real Entra OAuth login (clean-browser, no #208 login-loop); (2) nginx-fronted CSRF/security-header + cookie-flag posture as served in prod; (3) §5c broken-migration boot. Plus 2 UNDETERMINED cross-env facts: `GREYNIR_URL` set in prod, and mixed-chapter reader assembly (vefur).

## Testing / verification

- Root `npm test` (Vitest) stays the unit gate; the E2E gate is `npm run test:e2e`. New E2E specs must be **non-vacuous**: each must fail against a mutated app (e.g. temporarily remove a `requireHeadEditor` and confirm the §0.3 test goes red) — note the mutation check in the PR.
- Tests assert **behavior**, not mocks: real HTTP status, real resolved DOM/text, real link strings. The XSS test asserts *no dialog fired*, not just escaped source.
- Each PR lists which A4 row ids it turns green, so the runbook's "automated" set is derived from the tests, not restated by hand.

## Risks / constraints

- **Entra bypass is a permanent E2E gap** — the harness mints JWT cookies, so the real login flow (the #208 login-loop class) can never be E2E-covered here; it stays a prod-only manual case. Do not claim §5a/§5b cover the OAuth *mechanism* — they cover post-auth authz.
- **Deploy-gate sequencing unchanged** — A4 is the deploy gate; building these tests does not change the rule that server units don't deploy mid-QA. The buildout ships as normal PRs behind the same gate.
- **Fixture isolation** — mutating flows (approve/apply, restore, localization, enforcement toggle) must run on `__e2e-fixture__`, never a real book; the enforcement toggle must be reset in teardown so it doesn't leak across specs.
- **Cross-repo** — PR 2 lives in vefur with its own harness/CI; keep the efni PR self-contained so it isn't blocked on vefur.
