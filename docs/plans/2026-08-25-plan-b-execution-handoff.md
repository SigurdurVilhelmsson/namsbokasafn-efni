# Handoff — executing §C82 Plan B (the check battery)

**Written:** 2026-08-24, at the close of the planning session · **For:** the next session, starting cold.
**Status owner is the register's ⏩ RESUME block** (`2026-07-21-post-item17-followup-campaign.md`).
This is a briefing, not a status record. **If they disagree, the register wins.**

---

## The job, in one line

**Execute [`docs/superpowers/plans/2026-08-24-c82-plan-b-check-battery.md`](../superpowers/plans/2026-08-24-c82-plan-b-check-battery.md) — 13 tasks, subagent-driven, a fresh agent per task with review between.** Plan C follows; it imports Plan B's registry and cannot start first.

## Read these, in this order, before touching anything

1. **The plan itself**, especially its **Global Constraints** — four decisions are taken there and must not be re-litigated per task (the contract, the licence boundary, E5's expected red, the run-record SKIPPED path).
2. **The register's §C82 entry and its ⏩ RESUME top bullet** — the measured build state.
3. **The battery spec's banner AMENDMENT block** (`docs/superpowers/specs/2026-08-13-remt-check-battery.md`) — it **overrides the body** where they conflict, and item 2 binds the driver by name.
4. **CLAUDE.md § Extract-Inject-Render** — the durable rules the checks encode.

⚠️ **Do NOT re-derive the build state from the frozen specs.** Their §5 list predates Plan A, §C88 and §C115. The plan carries the audited state; three spec prerequisites are already done or void.

## State of the world at handoff

| | |
|---|---|
| `main` | at **`2166551b`** — PR #411 merged **and deployed**. Both plans, the handoff and the Phase 2.1 lock clearing are all on `main` and on production. |
| Branch | none — **cut a fresh branch from `main`** for Plan B's code |
| Runbook | Phases 0, 1.1, 1.2, **2.1**, **2.2** complete. **3.1 is Plans B + C — this work.** |
| Locks | ✅ **cleared on PROD.** 0 chemistry `.locked` on `origin/main`; biology's 1 remains, deliberately. ▶ **So E9's lock leg has NO natural fixture — synthetic only.** |
| Scope | `efnafraedi-2e` (149 modules) + `lifraen-efnafraedi` (342). **Nothing else.** |

▶ **Start by cutting a branch from `main`.** #411 is merged and deployed, so `main` already carries both plans and this briefing.

## Five things measured in the planning session that a cold reader will otherwise re-derive

1. **The run record is BUILT AND WIRED** (`tools/lib/run-record.js` → `api-translate.js:1347`) — **but no module carries one.** 200 sidecars, 200 with `"tool"` (positive control), **0** with `schemaVersion: 2`. ▶ `A2(a)`/`A4`/`A8` examine **0 of 220 pairs**; the deliverable is the **SKIPPED** path.
2. **The `{verdict, version, examined}` contract exists nowhere** — that is Plan B **Task 1**, and everything else depends on it. Build it first; do not start with a check that looks easy.
3. **E5 is wired but RED against today's tree, correctly** — **0** alt SEG markers in committed `02-for-mt` for both books, against **21,536** / **7,309** total. It goes green only after the loop's own re-extract. **Do not "fix" it by widening `analyzeModule`'s `hasFindings`** — `extraction-coverage.js:339-343` forbids it in code.
4. **The validation corpus is 220 EN/IS pairs** (chemistry **170**, organic **50**) — not the spec's 227 across five books. **Chemistry-shaped: say so in the same breath as any pass rate.**
5. **Never import `server/` from the battery.** `A2` needs no edge, `A7` is a port, and **`G5` is spawned, not imported**. If any executor adds a static import, root `LICENSE`'s enumeration must be updated in the same commit.

## Traps this repo will spring on you, measured this session

- 🔴 **`npm test | tail` reports the PIPE's exit code.** A suite with 3 failing tests came back as *"completed (exit code 0)"*. **Redirect, capture `$?`, and grep `FAIL` — two independent reads.**
- 🔴 **Do not edit source files while vitest is running.** A whole-suite red ("Opening and ending tag mismatch", files reporting `0 test`) was vitest reading files mid-edit — indistinguishable from a real defect until you re-run on a quiet tree.
- ⚠️ **`grep` here is ugrep**; an escaped-bracket pattern silently returns 0. Use `grep -aF` for literals, always `-a`.
- ⚠️ **`cd` persists between Bash calls.** A `cd server` cost a failed edit two commands later.
- ⚠️ **`tools/lib/parseArgs.js` silently drops unknown flags**, and `--output-dir` on the CNXML tools is accepted, documented and **ignored** (§C83). Never run `cnxml-extract/inject/render` from a test — import the function.

## Acceptance for Plan B as a whole

Not "everything green". The base-rate sweep (Task 13) must show:

| | expected |
|---|---|
| **R5** | ≈**46%** — over the 5% bar, correctly disqualified from blocking |
| **A5 raw** | ≈**23.5%** — same |
| **E5** | ≈**100% FAIL** — the vintage predates §C81 |
| **A2(a) / A4 / A8** | **SKIPPED, `examined: 0`** |

▶ **Seeing those confirms the sweep is measuring rather than reporting zeros.** A tidy all-green sweep is the failure mode, not the goal.

## What comes after

**Plan C** (driver + ledger + fingerprint), then runbook **Phase 3** — the run itself. ⏰ **Two things come due later and are easy to drop:**
- **§C111** — re-apply the MT locks, triggered by the END of the run. `backfill-mt-locks.js --db` **on PROD**, verified by count against `test-results/clean-break-run/locks-before-2026-08-23.txt`, never by exit code.
- ~~The lock-clearing commit must reach prod~~ — ✅ **done 2026-08-24**, verified on `origin/main`.
