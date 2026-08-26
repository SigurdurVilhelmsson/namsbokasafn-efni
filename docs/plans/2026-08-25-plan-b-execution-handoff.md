# Handoff — executing §C82 Plan B (the check battery)

**Written:** 2026-08-24, at the close of the planning session · **For:** the next session, starting cold.
**Status owner is the register's ⏩ RESUME block** (`2026-07-21-post-item17-followup-campaign.md`).
This is a briefing, not a status record. **If they disagree, the register wins.**

---

## The job, in one line

**Execute [`docs/superpowers/plans/2026-08-24-c82-plan-b-check-battery.md`](../superpowers/plans/2026-08-24-c82-plan-b-check-battery.md) — subagent-driven, a fresh agent per task with review between.** Plan C follows; it imports Plan B's registry and cannot start first.

> ⏩ **UPDATED 2026-08-26 (Task 10) — TASKS 1-10 ARE ALL MERGED (#419 → squash `43b43238`); TASK 10 IS NOT YET DEPLOYED.**
> ▶ **Start at Task 11.** Tier 2 is complete: 10 checks, 3 blocking.
> ✅ **[LEAD] 2026-08-26: extraction sequencing CONFIRMED** — organic's remaining 323 modules are
> extracted **after Plan B, before Plan C's ctx-loader decision** (§C82 L59).
> ✅ **`m00032` needs NO bypass** — the defect was fixed by §C85-alt on 2026-08-24 and the register
> entry claiming otherwise was written a day later from a stale premise. Withdrawn by execution.
>
> ⏩ **PREVIOUS (2026-08-26, Task 10 in progress) — TASK 10 WAS ON A BRANCH.**
> Branch `c82-plan-b-task-10` (`624830cb` + fix round `3ac1a3c2`) carries Tier 2's gating half
> (`A3`/`A5`/`A7`), so **Tier 2 is complete: 10 checks, 3 blocking.** ▶ **Start at Task 11** once
> it merges. 🔴 **ALL THREE SHIP ADVISORY — the plan's heading says "A3 gating" and the measured
> base rate (54.31% / 10.89% vs a ≤5% bar) refuses it.** 🔴 **Read §C82 L51-L62 before Task 11.**
> Three that generalise: **a vacuous test is why a real bug shipped (L55)**; **an identity claim
> that nothing cross-checks is worth nothing (L54, found by 4 of 5 lenses)**; **a gate keyed on one
> representation of "nothing" is walked past by another (L57)**.
> ⚠️ **TWO INHERITED PREMISES IN THIS FILE ARE NOW MEASURED FALSE — do not re-inherit them:**
> the "220 pairs" corpus (it is **197**), and **"A5 stage 1 is blocking only after the allowlist is
> re-derived"** — 0 of 16 allowlist entries use the volatile `auto-N` id form, so the re-extract
> does **not** void them (§C82 L58). A5 stays advisory for different, honest reasons.
> ⚠️ **AND ORGANIC IS 5% EXTRACTED** (342 source modules, 19 extracted). The download is complete;
> the extraction is not. **Extract AFTER Plan B, BEFORE Plan C's loader decision** — doing it
> sooner destroys Task 13's base-rate sweep (§C82 L59).
>
> ⏩ **PREVIOUS (2026-08-26) — TASKS 1-9 ARE ALL MERGED.** Tasks 1-7 = PR #416, Task 8 = PR #417
> (both **deployed**), Task 9 = PR #418 — Tier 2's run-record half (`A2a`, `A4`, `A8`, all
> advisory) and the SKIPPED path — ✅ **deployed 2026-08-26 [OPERATOR-REPORTED, not verifiable
> from a dev session].** ▶ **Start at Task 10** (A3 gating, A5 stages, A7 port). **4 Plan B tasks remain,
> then all 11 of Plan C.**
> 🔴 **Read §C82 L48 before Task 10: the plan named a producer field that does not exist, and
> with 0 of 200 sidecars carrying a run record no corpus test could have caught it. Re-derive
> every field a check reads FROM THE PRODUCER, not from the plan.** The same question is worth
> asking of Task 10's own inherited premises — L45 and L48 are the same shape twice.
> ⚠️ ~~**Task 10 carries a sequencing constraint that appears in no other document: A5 stage 1 is
> BLOCKING only AFTER `residue-allowlist.json` is re-derived** — it is segmentId-keyed and the
> re-extract renumbers seg-ids, so it is wholly voided until then.~~ 🔴 **MEASURED FALSE at
> Task 10 and corrected in place (§C82 L58): 0 of 16 allowlist entries use the volatile `auto-N`
> id form, so the re-extract does NOT void them.** A5 is advisory for other reasons.
> 🔴 **The ctx-loader decision (§C82 L19/L21/L36①) is still open and still blocks Plan C.**
> **Status is the register's ⏩ RESUME block, not this file.**

## Read these, in this order, before touching anything

1. **The plan itself**, especially its **Global Constraints** — four decisions are taken there and must not be re-litigated per task (the contract, the licence boundary, E5's expected red, the run-record SKIPPED path).
2. **The register's §C82 entry and its ⏩ RESUME top bullet** — the measured build state.
3. **The battery spec's banner AMENDMENT block** (`docs/superpowers/specs/2026-08-13-remt-check-battery.md`) — it **overrides the body** where they conflict, and item 2 binds the driver by name.
4. **CLAUDE.md § Extract-Inject-Render** — the durable rules the checks encode.

⚠️ **Do NOT re-derive the build state from the frozen specs.** Their §5 list predates Plan A, §C88 and §C115. The plan carries the audited state; three spec prerequisites are already done or void.

## State of the world at handoff

| | |
|---|---|
| `main` | ⚠️ **No sha is recorded here on purpose — this table pinned `d6c5e38b` and went stale the day Task 8 merged.** Tiers 0+1 (PR #416) and Tier 2's free half (PR #417) are both on `main` and both deployed. **`git rev-parse --short main` is the answer; the register's ⏩ RESUME owns what is merged.** |
| Branch | none — **cut a fresh branch from `main`** |
| Runbook | Phases 0, 1.1, 1.2, **2.1**, **2.2** complete. **3.1 is Plans B + C — this work.** |
| Locks | ✅ **cleared on PROD.** 0 chemistry `.locked` on `origin/main`; biology's 1 remains, deliberately. ▶ **So E9's lock leg has NO natural fixture — synthetic only.** |
| Scope | `efnafraedi-2e` (149 modules) + `lifraen-efnafraedi` (342). **Nothing else.** |

▶ **Start by cutting a branch from `main`.** #416 and #417 are merged and deployed, so `main` already carries Tiers 0+1, Tier 2's free half, both plans and this briefing.

## Five things measured in the planning session that a cold reader will otherwise re-derive

⚠️ **Item 2 has since been discharged by Task 1; the other four still hold.**

1. **The run record is BUILT AND WIRED** (`tools/lib/run-record.js` → `api-translate.js:1347`) — **but no module carries one.** 200 sidecars, 200 with `"tool"` (positive control), **0** with `schemaVersion: 2`. ▶ `A2(a)`/`A4`/`A8` examine **0 of 220 pairs**; the deliverable is the **SKIPPED** path.
2. ~~The `{verdict, version, examined}` contract exists nowhere~~ — ✅ **BUILT at Task 1** (`tools/lib/remt-battery.js`) and merged. Its guards are the chokepoint every later check relies on; **read its top-of-file docstring before writing a new check** — it records, in code, why each guard exists and which of them a defect walked past.
3. **E5 is wired but RED against today's tree, correctly** — **0** alt SEG markers in committed `02-for-mt` for both books, against **21,536** / **7,309** total. It goes green only after the loop's own re-extract. **Do not "fix" it by widening `analyzeModule`'s `hasFindings`** — `extraction-coverage.js:339-343` forbids it in code.
4. ~~**The validation corpus is 220 EN/IS pairs** (chemistry **170**, organic **50**)~~ 🔴 **MEASURED AT TASK 10: it is 197** — chemistry **149**, organic **48**, `chapter-metadata-*` excluded, walked by `tools/__tests__/helpers/remt-corpus.js`, which is authoritative. (Micro adds 10 fixture-only pairs = 207.) The spec's "227 across five books" and this file's own "220" are both populations that no longer exist. **Chemistry-shaped: say so in the same breath as any pass rate — and note that organic's 48 files are only 17 modules plus 31 `exercises` bundles, in a book that is 5% extracted.**
5. **Never import `server/` from the battery.** `A2` needs no edge, `A7` is a port, and **`G5` is spawned, not imported**. If any executor adds a static import, root `LICENSE`'s enumeration must be updated in the same commit.

## Traps this repo will spring on you, measured this session

- 🔴 **`npm test | tail` reports the PIPE's exit code.** A suite with 3 failing tests came back as *"completed (exit code 0)"*. **Redirect, capture `$?`, and grep `FAIL` — two independent reads.**
- 🔴 **Do not edit source files while vitest is running.** A whole-suite red ("Opening and ending tag mismatch", files reporting `0 test`) was vitest reading files mid-edit — indistinguishable from a real defect until you re-run on a quiet tree.
- ⚠️ **`grep` here is ugrep**; an escaped-bracket pattern silently returns 0. Use `grep -aF` for literals, always `-a`.
- ⚠️ **`cd` persists between Bash calls.** A `cd server` cost a failed edit two commands later.
- ⚠️ **`tools/lib/parseArgs.js` silently drops unknown flags**, and `--output-dir` on the CNXML tools is accepted, documented and **ignored** (§C83). Never run `cnxml-extract/inject/render` from a test — import the function.

## What Tasks 1-7 established that Tasks 8-13 inherit

Read the register's **§C82 L1-L44** before any task — they are numbered findings from executing
1-7, and several are things a literal transcription of the plan would ship broken. The five that
generalise furthest:

1. 🔴 **A ruling recorded against ONE check is not a change to the others (L41).** E9's "a leg the
   ctx does not carry is itself a finding" was fixed at Task 6 and then shipped broken again in G5
   at Task 7, three commits later. **When an L-item states a RULE, sweep the other tier modules for
   it.**
2. 🔴 **Validate the PAYLOAD, not the container (L33/L35).** `Array.isArray(x)` and
   `typeof x === 'object'` are TYPE tests; both were walked past by an empty array and by a
   `Dirent`. And in tests, **`[].every(...)` is vacuously true** — assert the COUNT beside the
   predicate (L37).
3. 🔴 **When a gate's `blocking` rests on a claim about what the world contains, go read the
   PRODUCER (L32).** E6 was blocking on the premise that 14,634 backups were history; `safeWrite`
   mints five per module per run, so the gate could never converge. No test could see it.
4. 🔴 **Mutation-test the predicate's BREADTH, not only its presence (L39).** A corpus exercising
   one spelling of an alternation certifies nothing about the others — and mutation testing also
   found real DEAD CODE behind a comment claiming it was load-bearing.
5. ⚠️ **A local green is not evidence about CI.** CI checks out **shallow** (no `fetch-depth`), and
   gitignored artefacts are absent there — two of this branch's tests were measuring the dev box.
   Verify anything corpus-derived in a `git clone --depth 1`. **And `/tmp` is a 4.9 GB tmpfs**: a
   scratch clone took it to 97% and produced three `ENOSPC` failures that read exactly like code
   faults.

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
