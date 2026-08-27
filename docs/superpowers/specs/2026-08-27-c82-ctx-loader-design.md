# §C82 — the ctx loader, and the Plan C task-level revision

> ⚠️ **BANNER — FROZEN 2026-08-27. THIS IS A DESIGN RECORD, NOT STATUS.**
> Per CLAUDE.md § *One source of truth*, open work has exactly one owner: the active
> register's ⏩ RESUME block. **If this document disagrees with the register, the register
> wins** — and against executable code and its tests, **the code beats both**.
> Cite this file as evidence for *why* the design is shaped this way; never as a work list.
>
> **Owner of the decisions this file implements:** §C82 **L136** (the [LEAD] ctx-loader
> ruling) and **L137** (the G5 finding). Both are in the register. This file does not
> restate them; it builds on them.

---

## ⏱ AMENDMENT — 2026-08-27, the user-review gate. THREE RULINGS AND FOUR CORRECTIONS.

> **This block is newer than everything below it.** Where it disagrees with §§0-10, this block
> wins. It was written after the gate; the sections below were written before it.
> 🔴 **Do not read §§2-8 as final without reading this first** — one of the rulings ADDS a
> fourth invariant, which §3 does not have.

### The gate's three rulings [LEAD], 2026-08-27

**① I4 IS ADDED AS A BINDING INVARIANT.** §3 states three; **there are four.**

> **I4 — same-unit, same-vintage provenance.** Every ctx the loader emits for a unit carries
> values derived from **that unit only**, and from **one extraction vintage**. No ctx mixes
> modules; no ctx mixes vintages.

**Why the other three cannot see it.** `E3` is **blocking**, reads **only** `segText`, and
cannot detect that it was handed the wrong module's or the wrong vintage's text — it answers
*correctly about the wrong module* and returns **PASS**. Against that: **I1** sees no SKIP,
**I2** sees a well-formed string, **I3** sees the right unit count. All three pass; the gate is
silently wrong. **The code itself already assigned this to the loader** —
`tools/lib/remt-checks-extract.js:795`, verbatim: *"handed another module's `segText`, E3
answers correctly about the wrong module. That is the LOADER's contract (§C82 L21), not a
guard's."* ▶ **This is exactly L21**, the one item of the L19/L21/L36① group the ctx-loader
ruling did **not** settle. **This document mentioned `L21` zero times before this amendment.**
⚠️ **Not hypothetical:** CLAUDE.md records that §C82 keeps **two extraction vintages live for
weeks**, which is the window in which a mixed-vintage ctx is a normal accident rather than an
exotic one.

**② TASK 8's GAP IS STATED AS AN EXPLICIT LIMIT, NOT LEFT SILENT.** §7 amendment 1 closes the
injected-verdict gap for Task 6. **Measured: the same shape is in Tasks 5, 8 and 11** —
`runPreflight({mtOutputPath: lockedFixture()})` (:379), `recordModule({provenance: {...}})`
(:508), `selfTest({overrides: {skipE9: true}})` (:634). A Tier-0/1-only loader closes Tasks
5-6 and **leaves Task 8 satisfiable with injected verdicts** — the same defect one layer over,
in the **post-spend** half. ▶ **The revision must carry an amendment saying so**, and must mark
Task 8 as **NOT** closing its own gap, so a later executor can tell an open gap from a closed
one. ⚠️ **Task 11's planted-state table has two Tier-1 rows** — *"a blocking Tier-1 FAIL"* and
*"a blocking Tier-1 SKIPPED"* — **whose planting mechanism is unspecified**: real broken data,
or an injected verdict? Under I1 it must be the former. The revision closes that ambiguity.

**③ N1 IS WRITTEN INDEPENDENTLY, WITH A RECORDED DO-NOT-COPY NOTE.** See correction ③ below
for the prior art and why reusing it is a trap.

### Four corrections to the sections below

**① 🔴 `runTier`'s EMPTY-SET THROW IS A `main`-ONLY HARDENING. PLAN B, AS A DOCUMENT, DOES NOT
HAVE IT.** §7 amendment 2's 🔴 bullet is true of merged `main` and **false of Plan B's text**:
Plan B:358 writes the same `runTier(tier, ctx, checks)` signature with the same
`checks || [...]` fallback but goes **straight from `const set = ...` to the result loop** —
no refusal. ▶ **A literal Plan B transcription returns a clean run over an EMPTY SET**, which
is precisely the failure the spec says is guarded. Anyone treating Plan B as the contract gets
the opposite behaviour. ⚠️ And the JS edge is real and confirmed: `[]` is **truthy**, so
`[] || fallback` yields `[]` — an empty array reaches the throw path while `undefined`/`null`
reach the fallback.

**② 🔴 THE CONTRACT TEST CANNOT SEE ALIASED ctx ACCESS, AND `E9` IS 100% ALIASED.** §6 says the
contract test enforces one direction (checks ⊆ contract). **Even that direction is enforced by
a coincidence of prose here.** Its `readKeys` arm is `/ctx\??\.(NAME)/` — a literal `ctx`
followed by `.` or `?.`. Measured, **6 of 6 aliased forms are invisible** (destructuring,
renamed destructuring, alias-then-dot, bracket access, param destructuring, nested
destructuring) against **3 of 3 positive controls found in the same probe**.
`E9` — **blocking, and the check with the most loader obligations** — reads **all five** of its
keys through `const c = ctx || {}` (`remt-checks-extract.js:1106`). As `ctx.<key>` those five
names appear **only inside error-message STRING LITERALS** (:1123, :1133, :1169, :1183, :1238).
▶ Rename `c.force` to `c.forced` and leave the message, and **the contract test still passes
while the check reads `undefined`.** ▶ This **vindicates** [LEAD]'s *property, not enumeration*
ruling: a regex-derived key list mis-derives exactly the check that matters most.
⚠️ **So N2 must NOT derive "what checks require" by regex.**

**③ FIVE ctx BUILDERS ALREADY EXIST ON MERGED `main`, AND THEIR CONTRACT IS THE NEGATION OF
I1's.** §4 cites `tools/remt-sweep.js` only as a *placement* precedent. It is more than that:
1,330 lines holding `tier0Ctx` (:427), `tier1Ctx` (:445), `tier2Ctx` (:457), `tier3Ctx` (:487),
`tier4Ctx` (:586), unit discovery for all four unit kinds and `collectSpawns()`. **L112 already
ruled the sweep loader is not the run's loader; that ruling stands and this does not reopen
it.** ▶ **But the reason must be recorded, because the code looks reusable and is not:**
`tier1Ctx` supplies **5 keys** (`book`, `chapter`, `module`, `cnxml`, `segText`) where Tier 0+1
read **14**; the sweep is **designed** to under-supply — it exports an `UNMEASURABLE` registry
(:131) and `SKIPPED` is a legitimate sweep outcome. **The run's loader is the exact inverse:
I1 forbids a blocking SKIP.** Copying `tier1Ctx` produces a loader that violates I1 on most of
Tier 1. **N1 is written independently and the plan carries this note.**

**④ TWO FACTUAL CORRECTIONS, ONE OF THEM TO A CLAIM THIS DOCUMENT NEVER MADE.**
- The `source-write-guard` ALLOW set is **23 entries — 20 read-only + THREE writers**
  (`download-source.js`, `generate-source-manifest.js`, `resolve-os-embed.js`), not one.
  ⚠️ **This spec never stated that count**; "20 + 1 writer" was a controller paraphrase at the
  gate. **There is no line here to hunt for.** The likely origin is reading
  `download-source.js`'s *"the ONLY guarded CNXML writer"* as *"the only writer"*.
- `remt-battery.js` contains **0** occurrences of `01-source`, so it was never netted by the
  guard — **nothing "intentional" is being described** by saying it is excluded. `remt-loop.js`
  does not exist repo-wide, so its exclusion is **vacuous**. §4's own rule is the one that
  holds: *do not add a filename to the ALLOW set before the classification is true.*
- ⚠️ **The guard's blind spot is LIVE, not theoretical: 12 files under `tools/lib/` contain the
  string `01-source` and are invisible to the tripwire — including three of the battery's own
  check modules.** This is the second, better reason §4 puts the loader at top level.

### What the gate re-measured and CONFIRMED (safe to build on)

Eight parallel verifiers, each required to pair every null with a positive control:
- **§1's census zeros are REAL, not manufactured by a NUL-blinded grep** — the Plan C file holds
  no NUL bytes; plain `grep` and `grep -a` agree term for term; `Task`=17 is the control. *(This
  was the single largest risk to the spec's premise and it did not materialise.)*
- **§2's census** — 13 checks, 11 blocking; whole battery 33 / 19; there is no `E8`.
- **§3's I3 warning**, and its **conclusion is better-founded than its premise**: there is **no**
  exported work-list builder in `api-translate.js` at all. Two `discover*` exports exist
  (`discoverModules` 166, `discoverExercisesFile` 31); `discoverChapters` (:1061) is
  **unexported** and the work-list is assembled inline in `main()`. **197 / 220 / 23 confirmed.**
- **§5's G5 table**, both arms, with its positive control. ⚠️ Refinement: G5 has **two** literal
  `examined` values (`0` on its SKIPPED path, `1` on its verdict path) — *"hardcoded to 1"* is
  exact only for the verdict-bearing path. The consequence is unchanged: **G5 can never return
  PASS with examined 0.** Census: **G5 is the ONLY one of the 13 whose verdict path uses a
  literal.**
- **§6's `skipIfMissing` claim** — 0 in tiers 0/1, 7 in tier 2, one command, tier membership
  resolved from the **live REGISTRY** rather than from import comments.
- **§4's top-level-only scope** — proved structurally (`readdirSync` non-recursive; `lib` does
  not survive `.endsWith('.js')`), not by reading the comment.
- ⚠️ **Importing the top-level CLI does not self-execute `main()` — confirmed by a matched pair
  — but it is NOT a no-op**: it transitively evaluates the five tier modules, each calling
  `registerChecks()` at import time, taking `REGISTRY` from 0 to 33 in the importing process.
  **That side effect is what makes `runTier(tier, ctx, undefined)` select anything at all.**

### 🔴 ADJUDICATION ROUND — 2026-08-27, later the same day. ONE OF MY OWN CORRECTIONS WAS WRONG.

Eight adjudicators re-measured every `PARTLY-TRUE` from scratch, briefed that **a refuted
finding is a claim about the verifier too**. Result: **7 SPEC-IS-RIGHT · 1 BOTH-PARTLY-RIGHT ·
0 SPEC-IS-WRONG.** Three outcomes change what is written above.

**🔴 ① WITHDRAWN — "the 14,634 backup-file figure is mis-scoped" WAS ITSELF THE ERROR, AND
§C82 L115 HAD ALREADY ADJUDICATED IT.** The number is **CORRECT**. `emittedFiles` is documented
as *"filenames the extract emitted"*, so the population is the extract's **own** output trees —
**`02-for-mt` + `02-structure`, which hold 14,634 historical backups (15,605 files, counted with
E6's own `classifyEmittedFile`)**. The 26,618 figure sweeps in `03-translated` and `tm`, which
belong to the **injector** and which the key cannot describe. **The first verifier reproduced
L115's error verbatim and cited L115 as its authority while inverting its finding** — and its
glob `*.backup.*` also **under-reached by 14 files**, exactly the CLAUDE.md
`{name}.{YYYY-MM-DD-HHMM}.bak` spelling E6 does classify, so the very arm offered as proof the
glob was *"neither over- nor under-reaching"* was itself under-reaching.
▶ **What IS defective is the LABEL, not the number:** *"generated trees"* is under-specified —
CLAUDE.md § *File Permissions* defines GENERATED as **four** trees, so a careful reader follows
that definition, computes 26,618, and concludes the cited figure is stale. **Say `02-for-mt` +
`02-structure`.** This is the remedy L115 prescribed and which never reached the typedef.
▶ **AND THE STATED RATIONALE IS THE WRONG HAZARD.** Measured: **0** orphan-backup findings over
4 tree listings and 112 per-directory listings — backups are accounted for, because a tree
listing contains the base files too (§C82 L29, **discharged** 2026-08-25 by L32). What a
tree-scoped listing actually costs is **(i)** the **49 committed parenthesised duplicates**,
which FAIL **9 of 112** directories on a blocking gate *forever* and which no run-scoped listing
can contain, and **(ii)** `examined` is **content-keyed** (§C82 L6), so a tree listing reports
`examined: 12,035` for a **one-module** run — a sweep of history reported as a sweep of this run.
**The obligation stands and must not be withdrawn; it cites the harmless population and omits
the harmful one.** ⚠️ The typedef and `remt-selftest.js:342` carry the same stale framing — that
is code work, outside this frozen spec.
🔑 **The lesson, and it is this file's third instance: a correction is not privileged over the
thing it corrects.** Mine was newer, measured, and wrong; the register had settled it eleven days
earlier. **Check whether a number you are about to "fix" has already been adjudicated.**

**🔴 ② A SECOND `runTier` HAZARD, AND IT LANDS ON OPTION C: with `checks` supplied, `tier` is a
LABEL, not a FILTER.** Measured on `main`: **`runTier(1, ctx, [G1])` ran the TIER-0 check `G1`
and returned `{tier: 1, ranIds: ['G1'], exit: 1}`** — no validation, no warning. **The
no-`checks` fallback path DOES filter**, which is what makes the mislabel invisible: the safe
path validates and the explicit path does not. ▶ **A loader assembling per-unit-kind subsets
owns the tier↔`checks` agreement outright; nothing downstream re-checks it.** Same class as the
empty-set refusal — **the mechanism trusts the caller's list completely.** ⚠️ **And the parameter
is documented as a TEST SEAM** (*"explicit set, for tests"*): **Option C promotes it to a
production selection path**, recorded so the promotion is deliberate rather than read later as
misuse of a test hook. ⚠️ `runTier` returns only `{tier, results, blockingFailures}` — **no
`selected`/`excluded` field**, so L136's *"exclusions reported per unit"* has no existing
mechanism and the loader owns it.

**⚠️ ③ CALIBRATIONS, each small and each worth carrying.**
- **"Plan B's `runTier` has no empty-set throw" is TRUE BUT LARGELY INERT.** Plan B is finished
  and merged (PR #422 → `dd941fe8`); its code shipped six PRs ago and nobody transcribes its
  prose. **Keep it as a reading instruction — anchor on merged `main` — not as a repair.**
- **"G5 is the ONLY one of the 13 whose verdict path uses a literal" is a bare ENUMERATION**, the
  form this repo has been burned by twice. **State the property instead:** *`runCheck`'s
  `PASS + examined 0 → SKIPPED` backstop protects only checks whose `examined` is DERIVED from
  the population they judged; a literal defeats it.* Then G5 is an instance, not a list.
- **`197 / 220 / 23` CARRY NO SCOPE QUALIFIER and are scope-dependent** — two kept books give
  197/220/23; **all six books give 227/255/28.** Every rate carries its denominator or it
  describes nothing. **Say "over the two kept books".**
- The `G3` plus/minus item in §9 is **runbook 1.4**, not this scope; its adjudication found the
  audit right on both factual halves and wrong on the label. Not folded in here.

### A positive exemplar the invariants should be written against — `E9`

`remt-checks-extract.js:1100-1258`. E9 emits `{kind: 'leg-not-checked', leg, why}` for **every**
input it could not use, naming the key **and its required provenance** (*"must be a boolean
produced by `isMtLocked()`"*, *"must be `{isk, withForce}` from `--force --dry-run`"*). Its
verdict is `findings.length ? FAIL : PASS`, and those findings are **in** `findings`. So:
- a **partially** loaded ctx becomes a **FAIL** — loud, not a quiet PASS;
- an **entirely** absent one gives `examined 0` → **SKIPPED**, with a message naming the
  **loader** as the cause;
- `examined++` fires only for legs actually checked, so `runCheck`'s backstop works.

**This is I2-compliance by construction, and it is the exact inverse of G5.** ▶ **A mechanisable
form of I1 that needs no key list and is immune to correction ② 's regex blindness:**

> for every unit the loader emits, no blocking Tier-0/1 check returns `SKIPPED`, **and none
> returns a finding of `kind: 'leg-not-checked'`.**

⚠️ **Tier 1 is in better shape than §5's Tier-0 evidence implies, and N3 should carry that
prior:** `skipIfCtxUnusable` (`:165`) guards `E1`/`E2`/`E4`/`E5`; `E3` opts out **with its
reason stated at `:795`**; `E6` guards on `Array.isArray(emittedFiles)`; `E9` has its own
equivalent. `leg-not-checked` by file: extract 2, glossary 1, mt/output/chapter 0. **N3 is still
owed — Tier 1 has never been swept — but Tier 0's first-attempt blocking silent-pass is not the
prior to carry into it.**

---

## 0. In one paragraph

Plan B built a battery of 33 pure checks — handed an already-read `ctx` object, returning a
verdict, never touching disk. Plan C builds the driver that sequences a re-translation run
around them. **Neither plans the thing in between**: the *ctx loader*, which reads the world
and hands each check what it sees. Plan C names `"loader"`, `"ctx"` and `"context"` **0 times**
and its file-structure table lists no such file, yet its tests pass verdicts in directly
(`tier1: failing('E2')`) — so the plan is fully implementable while the loader does not exist.
This document specifies the loader for the **pre-spend half only** (Tier 0 + Tier 1), states the
three invariants that gate it, and lists the three new tasks and four amendments that make
Plan C executable.

---

## 1. The gap, measured

| term, in `docs/superpowers/plans/2026-08-24-c82-plan-c-driver-and-ledger.md` | occurrences |
|---|---|
| `runCheck` | 3 |
| `runTier`, `REGISTRY` | 1 each |
| **`CheckContext`, `ctx`, `loader`, `buildCtx`, `remt-battery`** | **0** |
| `source-write-guard`, `PROV-1` | **0** |

Its file-structure table names five files — `import-graph`, `extraction-fingerprint`,
`remt-ledger`, the driver `remt-loop.js`, and tests. **None is a loader.**

▶ **Why a plan-writing pass could not see this.** Plan B is right about the checks; Plan C is
right about the driver. The loader is the **seam between two units that each work**, and a
task-scoped plan on either side structurally cannot see one. → `[[review-lens-framing]]`.

---

## 2. Scope — Tier 0 + Tier 1 only ([LEAD], 2026-08-27)

Measured from the live `REGISTRY`: **13 checks, 11 blocking.**

| tier | checks | blocking |
|---|---|---|
| 0 | `G1` `G2` `G3` `G5` blocking · `G4` advisory | 4 |
| 1 | `E1` `E2` `E3` `E4` `E5` `E6` `E9` blocking · `E7` advisory | 7 |

That is **11 of the battery's 19 blocking checks**, and it is exactly the set that runs
**before money is spent**. Tiers 2–4 judge what has already been paid for and are deferred.

⚠️ **There is no `E8`.** The tier-1 ids are `E1`–`E7` and `E9`.

⚠️ **Tier 0 is the only tier whose input the re-MT loop does not regenerate.** A tier-0
blocking failure is therefore a **precondition on the run**; a tier-1..4 one is a statement
about a committed vintage. Two opposite readings of the same-looking red.

---

## 3. The invariants — ⚠️ THIS SECTION LISTS THREE; **THERE ARE FOUR**

> 🔴 **`I4` (same-unit, same-vintage provenance) was added at the 2026-08-27 gate and lives in
> the AMENDMENT block at the top of this file, not here.** The heading below said *"The three
> invariants"* until then. A count in prose drifts — CLAUDE.md's § *One source of truth* records
> this exact failure in its own table — so the count is stated here only to point at the owner.
> **`I1`+`I2`+`I3` are NOT sufficient: each of the three passes on the `E3` wrong-module case.**

**No per-check key enumeration anywhere.** [LEAD] chose *property, not enumeration*
(2026-08-27), on the standing rule that an enumeration wrong twice should be replaced by the
property it was approximating.

### I1 — no blocking check SKIPs over a unit the loader emitted

> For every unit the loader emits, no blocking Tier-0/1 check returns `SKIPPED`.

Catches: the loader failed to load something it could have. **The symptom is a false halt**,
which is the failure mode [LEAD] ruled against when rejecting Option A.

Checkable against the `REGISTRY` with no hand-maintained list.

### I2 — never a partial object from a spawn or a parse

> For every ctx key whose value comes from a **spawn** or a **parse**, the loader emits either
> a well-formed value or **`null`/absent — never a partial object.**

Catches: the loader handed a shapeless-but-truthy value to a check that guards with
`v && typeof v === 'object'`. **The symptom is a silent pass.**

🔴 **I1 alone is insufficient, and this was measured, not reasoned** — see §5. I2 is the same
discipline the contract already mandates three times as `loadAllowlistOrNull` /
`loadResidueAllowlistOrNull`.

### I3 — the loader's unit count equals the spender's work-list

> A test pins the loader's unit count against the spender's work-list.

From L136 condition (c). ⚠️ **Do not derive it from `api-translate.js`'s exported discovery**
so the two agree "by construction": measured, that export returns **197 of 220** spend units
and silently omits **all 23** `chapter-metadata` units. The principle — whatever the spender
pays for must have a Tier-1 verdict — is sound; the mechanism is not. **Assert the counts;
do not assume the import.**

---

## 4. Placement — `tools/remt-ctx.js`, top-level, deliberately

`tools/__tests__/source-write-guard.test.js` nets **top-level `tools/*.js` only** and forces a
reviewer to classify each file that names the read-only source tree. Anything under
`tools/lib/` is **invisible to it**.

**Decision: a new top-level `tools/remt-ctx.js`, netted by the guard, classified read-only.**

🔴 **The tempting choice is `tools/lib/`, because the guard's scope gap makes the red go away.
That is the wrong reason to pick a directory.** The typedef says the expected red is *"the
review prompt it is"*. `remt-sweep.js` is the precedent: top-level, in the ALLOW set,
classified *"read-only: walks the source to build the battery's populations; VERIFIED — its
only fs calls are existsSync/read."*

▶ **Second and better reason:** if the loader owns **all** source reading, the driver
(`tools/remt-loop.js`) never touches the source tree and stays out of the guard's scope
entirely. One file is the reader, classified once, reviewably.

⚠️ **Do not add the filename to the ALLOW set before the classification is true.** Listing a
non-toucher dilutes the tripwire for the one moment it exists to catch.

---

## 5. Why I2 exists — the measured counter-example

A probe supplying **only scope keys** (`book`/`chapter`/`module`) to all 13 checks returned
`SKIPPED, examined=0` for **every one** — raw `check.run()` *and* through `runCheck`, with a
positive control (real glossary → `G1 FAIL/840`, `G2 PASS/838`, `G3 FAIL/838`) proving the
probe could produce non-`SKIPPED` verdicts.

**That measurement was correct, and it licensed a false generalisation** — *"the pre-spend half
fails uniformly loud"* — because every key was absent **together**. With `payloadText` present
and `payloadVerdict` varied:

| `ctx.payloadVerdict` | `G5` |
|---|---|
| absent · `null` | `FAIL` ✅ |
| `{}` · `{error: msg}` · `[]` · `{kind:'ok'}` | **`PASS`** 🔴 |

`G5` is **blocking**, and its `examined` is hardcoded to `1`, so `runCheck`'s
`PASS + examined 0 → SKIPPED` backstop — the net protecting `G1`–`G4` — is **structurally
disabled for exactly this check**. Full account and the loader's binding remedy: **L137**.

▶ **The reusable lesson: a probe of the all-empty case cannot see a partial-state hole, and
partial is the state a loader actually produces.** Enumerate the ctx **states** — absent ·
`null` · shapeless-but-truthy · well-formed — and probe the **mixed** ones.

Probe committed and re-runnable from the repo root:
`test-results/c82-ctx-state-probe-2026-08-27.mjs`.

---

## 6. The loader's specification is already written

`tools/remt-battery.js:22–353` is a 34-key `@typedef` that states, per key: where the value
comes from, **which loader function to use**, the tri-state hazards, the chapter-convention
mapping, and the sequencing obligations. **The loader task is closer to transcription than to
design.** Non-obvious obligations it already records, for the Tier-0/1 keys:

- **`residueAllowlist` → `loadResidueAllowlistOrNull`**, never `loadResidueAllowlist`: the
  latter returns `{entries: []}` for a *missing file* and for a *deliberately empty* one —
  identical values — so the guard accepts the state it exists to refuse.
- **`emittedFiles` is a listing, not a path**, and must be scoped to **this run's** output:
  the two kept books' generated trees already hold **14,634 historical backup files**, and
  `E6` is blocking.
- **`chapter` takes the bare string form** (`'4'`, `'04'`, `'0'`, `'appendices'`). `'ch04'`
  and the `-1` appendix sentinel both read as empty. ⚠️ **CLAUDE.md sends you to `-1`** — that
  is right for `chapterLabel.chapterDir()` and wrong here.
- **`locked` comes from `isMtLocked()`**, not `fs.existsSync`.
- **`costEstimate` must come from `--force --dry-run`** — a bare `--dry-run` reports `~0 ISK`
  once output exists, a wrong answer that looks like an answer.
- **`committedExtract` / `freshExtract`** were read by `E7` and documented nowhere until Task
  13 — the sixth instance of *a key a check consumes that the contract does not list is a
  detector a loader built to the doc leaves unrun.*

⚠️ **`tools/__tests__/remt-ctx-contract.test.js` enforces only one direction** —
*no check reads a key the contract does not document* (checks ⊆ contract). **Nothing enforces
loader ⊇ what checks require.** That is what I1/I2/I3 are for.

⚠️ **Tier 0 and Tier 1 do NOT use `skipIfMissing`.** Seven Tier-2 checks declare their required
keys with it; in `remt-checks-glossary.js` and `remt-checks-extract.js` the count is **zero**
(verified against a positive control). So the pre-spend half's requirements exist only as
hand-written guards inside each function — which is *why* the design is property-based.

---

## 7. The revision to Plan C

Plan C's 11 tasks are structurally sound for the driver. This is **surgical, not a rewrite.**

### Three new tasks

| | task | notes |
|---|---|---|
| **N1** | **`tools/remt-ctx.js`** — the Tier-0/1 loader + its `source-write-guard` ALLOW classification | Largely transcription from §6. Classification is a **reviewer's** call, not self-approved. |
| **N2** | **I1, I2, I3 as tests** | The inverse-direction gate that does not exist today. |
| **N3** | **A partial-state sweep across Tier 1's 8 checks** | The technique exists and is committed (§5). Tier 1 has never been swept this way; Tier 0 yielded one blocking silent-pass on the first attempt. |

**N3 is a deliverable, not a prerequisite.** A per-check key list is not needed under a
property-based design; what is needed is the sweep, executed against real code with a
committed harness.

### Four amendments

1. **Task 6** — its tests inject `tier1: failing('E2')`. **They must additionally drive the
   real `REGISTRY` through the loader.** Without this the plan stays fully satisfiable with no
   loader in existence. *This is the amendment that closes the original gap.*
2. **Tasks 5–6** — carry L136: the judgeable-subset call list for source-less unit kinds,
   **`E3` on every one**, exclusions **reported per unit**. **Verified on merged `main`:**
   `runTier(tier, ctx, checks)` is `export async function` at **`tools/remt-battery.js:455`**,
   and `checks` is an optional explicit list (`checks || [...REGISTRY.values()].filter(...)`).
   So Option C's mechanism exists — **no change to Plan B and none to the ctx contract.**
   - ⚠️ **It lives in the top-level CLI, NOT in `tools/lib/remt-battery.js`** (whose exports
     are `VERDICT`, `defineCheck`, `runCheck`, `REGISTRY`, `registerChecks`). Importing it is
     safe — the CLI is guarded by
     `if (process.argv[1] === fileURLToPath(import.meta.url))`, so it does not self-execute —
     but the driver's module graph then crosses from `lib/` into a top-level tool, which
     **Task 1's ESM import-graph walker and Task 2's extraction fingerprint both see.**
   - 🔴 **AN EMPTY CHECK LIST THROWS, AND THIS IS EXACTLY OPTION C's EDGE.** `runTier` refuses
     *"a clean run over an empty set"* by design. If the loader ever computes a judgeable
     subset that is **empty** for some unit kind, the tier does not report — it **throws**.
     ▶ **The loader must guarantee the subset is non-empty, or catch and report per unit.**
     L136 condition (a) — `E3` on every source-less unit — is what keeps it non-empty today,
     so that condition is load-bearing for more than coverage: **it is what stops Option C
     from throwing.**
3. **File-structure table** — add `tools/remt-ctx.js`; record that the driver stays out of the
   guard's scope *because* the loader owns all source reading.
4. **Repo-hazards section** — add `source-write-guard` / PROV-1 (currently 0 mentions).

---

## 8. Definition of done — and what it excludes

**Done:** the loader builds a ctx for Tier-0/1 units · I1, I2, I3 hold as tests · N3's sweep
has run and its findings are logged to the register · root `npm test` green · the guard entry
classified by a reviewer.

🔴 **Done does NOT mean "Tier 0 runs clean."** Measured 2026-08-27 on organic's live glossary:
**`G1` FAIL (1 finding)** and **`G3` FAIL (7 findings)**. Both blocking, both Tier 0 — the tier
the loop does not regenerate. **No amount of loader work reaches them.** They are runbook
**1.4**, a separate open item; L136 says do not count them twice.

**Three things this revision must not absorb**, each owed separately:

| owed | owner | why not here |
|---|---|---|
| per-module `exercise-extract.js` reshape | L136 ② | changes an output shape; its own PR |
| Tier 0's `G1`/`G3` | runbook 1.4 | a precondition, not loader work |
| the `G5` guard repair | L137 | [LEAD] ruled *work around it*, not fix it |

---

## 9. Evidence, and what is NOT verified

**Independently re-measured — safe to build on:**
- the 13-check tier/blocking census (live `REGISTRY`)
- the all-empty sweep, both arms, with its positive control
- the `G5` partial-state table (re-measured through the real `runCheck`; → L137)
- `G1`/`G3` failing on organic
- `skipIfMissing` present in Tier 2 (7 checks), absent in Tiers 0–1 (positive control)
- the Plan C term census in §1

🔴 **Relayed, NOT re-measured — execute before acting:**
- the Tier 0 audit's claim that `G3`'s docstring is stale and 2 of its 7 findings are false
  positives, and its findings #2 and #3
  → `test-results/c82-ctx-audit-tier0-2026-08-27.md` (banner-labelled)
- **everything** in the Tier 2 audit, including a second claimed silent-PASS surface
  (mis-scoped `provenance`), `A2c` absent from the typedef while blocking, and a typedef
  reference to a check id said not to exist
  → `test-results/c82-ctx-audit-tier2-2026-08-27.md` (banner-labelled)

⚠️ **Tiers 3 and 4 were audited but the reports never reached disk** — **0 of 5 reader agents
wrote a file unprompted; 2 of 5 did after an explicit write-first instruction, and one of those
only on a second, single-instruction message.** Those two tiers are deferred
scope, so nothing here depends on them; **whoever builds the second half starts that audit
fresh.** → `[[sdd-agent-mortality]]`: only files survive.

---

## 10. Open for the deferred half — recorded so it is not rediscovered as novel

🔴 **PROVENANCE, STATED BEFORE THE CONTENT, BECAUSE §9's HONESTY ABOUT UNVERIFIED RELAY IS
WORTHLESS IF THIS SECTION LAUNDERS THE SAME MATERIAL INTO ASSERTION.** Every item below is a
claim **the `CheckContext` typedef makes about itself** (`tools/remt-battery.js:22–353`), read
there directly. **None has been executed.** The Tier 3 and Tier 4 agent audits never reached
disk, so nothing here is corroborated by a second reader either.

▶ **Treat all four as hypotheses to execute, never as findings** — the governing rule is
CLAUDE.md's: *"the plan says X is missing/broken" is a hypothesis to execute, never a finding*,
and *a stale premise can be written AFTER the fix that kills it*, so neither the typedef's
specificity nor its date is evidence. This is not idle caution: the typedef's own text records
**six** prior instances of its key list being wrong, and several of its annotations are
in-place corrections of earlier annotations.

- **`publishedBefore` (Tier 4, `K3`) — the typedef states** this is the one obligation no pure
  gate can check: a snapshot taken *after* the render is claimed to be the inverse of
  `renderedModules`, so the rename set is empty and `K3` reports a clean "zero unaccounted" on
  exactly the runs that destroyed the information — with `snapshotSize` identical in both arms,
  so the backstop stays silent. **If true, a sequencing obligation on the driver.** ⚠️ This is
  the highest-value one to verify first, because it is the only claim here whose subject
  (*when* a value was taken) leaves no trace on disk to check afterwards.
- **`renderBaseline` (Tier 4, `K1`) — the typedef claims** seven representations of "nothing",
  of which `{}` is truthy and malformed JSON throws uncaught, killing the whole run rather than
  one chapter. **Verify each of the seven separately**; they are not equally likely to be right.
- **Tier 3 takes three values from spawns or exported calls** (`schemaVerdict`, `auditResults`,
  `injectReport`) — **this one is structural and cheap to confirm**, and if it holds, that is
  precisely the population **I2** exists for.
- **`slugMap` — the typedef claims** `readSlugMap` re-stamps `track` from the caller's argument
  and discards the on-disk value, making `K3`'s cross-track guard a tautology. **If true, the
  loader must read the file's own `track` field.**

⚠️ **The Tier-0/1 half of this spec does NOT rest on any of the above.** Sections 2–8 are
independently measured (§9 lists exactly what and how). This section is a head start for the
second half, not a foundation for the first.
