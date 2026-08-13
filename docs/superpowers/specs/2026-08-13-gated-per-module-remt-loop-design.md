# Design — gated per-module re-MT loop (§C82)

**Status:** design, approved section-by-section by the [LEAD] 2026-08-12/13. **Not yet an
implementation plan.**
**Owns:** the loop's architecture, state model, failure handling and validation strategy.
**Does not own:** the check list (→ [`2026-08-13-remt-check-battery.md`](2026-08-13-remt-check-battery.md)) ·
scope and budget (→ active register **§C80**) · figure-alt integration (→ **§C81**) ·
the pilot's measured baselines (→ [`docs/plans/2026-08-12-c56-pilot-re-extract-remt-runbook.md`](../../plans/2026-08-12-c56-pilot-re-extract-remt-runbook.md)).

Per CLAUDE.md § *One source of truth*, this document restates no count, no status and no
baseline owned elsewhere. Where a number is needed, it cites.

---

## 1. Problem

§C80 rules the re-MT scope: **chemistry and biology in full, organic/microbiology/physics
preview-only** — ~500 MT units, budget approved. The corpus must come out on one marker
dialect, with figure alt integrated (§C81).

A single bulk run is unacceptable to the [LEAD] for a reason §C78 makes precise:
**`propagationService` is segment-keyed, not term-keyed**, so a wrong term that reaches output
cannot be flipped back across a book. It costs a manual per-occurrence edit or a re-MT. A
corpus-wide mistake is therefore discovered *after* it is corpus-wide and expensive.

**The loop converts a corpus-wide risk into a one-module risk.**

## 2. The four [LEAD] decisions

These were taken during design and are load-bearing; the architecture follows from them.

| # | Decision | Consequence for the design |
|---|---|---|
| ① | **Quarantine + batch re-run.** An extraction-side fix marks earlier cleared modules stale; they are re-MT'd in one batch at each book's end. | Requires a mechanical staleness signal → the extraction fingerprint (§5). Each book ends on **one vintage**. |
| ② | **Auto-gate + calibrate + sample.** Checks gate mechanically. The [LEAD] reads the first 3 modules of each book, every failure, and a ~1-in-10 domain sample. | The battery must be honest about what it *cannot* see, because that defines the sample's brief. |
| ③ | **The glossary arm is settled by measurement.** Module 1 of each book runs both `--glossary` and `--no-glossary` (~1,000 ISK); the winner sets that book's arm. | §C77 stops being a blocker and becomes the loop's first experiment. Needs a winner criterion — the battery owns it. |
| ④ | **Physics preview is the shakedown** (10 files, ~2,346 ISK) before chemistry. | A broken loop costs ~2k to discover, not ~43k. |

**Why ③ is now the only way to settle the glossary question:** the desk record is exhausted
and genuinely ambiguous. Measured: exactly **one** benefit datapoint exists in the repository
(`docs/plans/2026-06-25-term-system-audit.md:69-78`, `enthalpy → vermi` vs a bare `varmi`,
a real chemistry error the glossary fixed) against several measured harms, two of them live in
today's chemistry payload. The verdict that survived adversarial review is *"the defect is in
the entries, not the mechanism"* — which no amount of further reading will refine.

## 3. Architecture

Three components. The separation is the point: the battery must be runnable standalone over
already-translated modules, so it can be validated against the existing corpus **before any
new ISK**.

| Component | Responsibility | Never does |
|---|---|---|
| the **check battery** | judge one module (and one book, and one chapter) | mutate anything |
| `remt-loop` **driver** | sequence, halt, record | judge |
| `books/<slug>/remt-ledger.json` | state | duplicate pipeline status |

The driver is `verify-b4b0-gates.js`-shaped: gates are **functions**, `--self-test` plants a
defective state and requires **the real gate function** to detect it, exit `0`/`1`/`2`.
That file's own comment (`:289-301`) records why the shape matters — an earlier version gave
`--self-test` a hand-written predicate, and a deleted assertion left the gate reporting PASS on
a live violation while the self-test still printed DETECTED.

⚠️ **Exit codes are not a uniform contract across the existing tools** — `scan-residue` and
`cnxml-render-fidelity-check` exit 0 *with* findings. The driver reads `--json` per tool and
applies its own thresholds.

## 4. The life of one module

The critical structure — and the change from the first draft — is that **most checks run
BEFORE the paid step.** They gate the spend rather than evaluate it afterwards.

```
remt-loop next <book>
  │
  ├─ TIER 0   per BOOK, once, free ─── glossary input gates
  │           halt the book before any ISK is spent
  │
  ├─ 1. PREFLIGHT   extraction fingerprint; .locked check; expected-input assertion
  │                 fingerprint changed? → mark prior cleared modules STALE, continue
  │
  ├─ 2. EXTRACT     cnxml-extract <path/to/mNNNNN.cnxml>              FREE
  │
  ├─ TIER 1   per MODULE, PRE-MT, free, LOOPS UNTIL CLEAN ─── gates the spend
  │           a halt here costs a re-extract, not money
  │
  ├─ 3. MT          api-translate --book B --chapter N --module mNNNNN  COSTS ISK
  │                 [--no-glossary if that is the book's arm]
  │                 ATTEMPTED ONCE. Never auto-retried.
  │                 module 1 of each book runs BOTH arms (decision ③)
  │
  ├─ TIER 2   per MODULE, POST-MT ─── paid, one shot
  │
  ├─ 4. INJECT / 5. RENDER   per chapter                              FREE
  ├─ TIER 3   post-inject / post-render ─── free, re-runnable
  │
  ├─ 6. LEDGER + RUN RECORD    verdict, arm, fingerprint, ISK, gate versions
  │        PASS → advance · FAIL → halt with report
  │        calibration/sample module → halt for [LEAD] review regardless
  │
  └─ TIER 4   per CHAPTER at chapter close ─── not per module
```

Inject and render run per chapter, not per module, so steps 4–5 re-render the chapter each
time. That is free and accepted: the alternative defers reader-visible feedback to the point
where acting on it is expensive.

## 5. State: the ledger and the fingerprint

`books/<slug>/remt-ledger.json`, committed. Per module: verdict, glossary arm, ISK, status
(`pending | clean | stale | failed | skipped-locked`), **extraction fingerprint**, and **the
version of every gate that judged it**.

**The fingerprint is what makes decision ① mechanical.** It is a hash over the files that
determine *what English gets sent* — and the file set is **derived from the real import graph
of `cnxml-extract.js`, never hand-listed.** A hand-maintained list is the defect class this
repo has logged repeatedly (§C75, §C76, and CLAUDE.md's own *"do not trust any enumeration
here — re-derive it"*). When the hash changes, every `clean` module carrying the old hash flips
to `stale` automatically; nobody adjudicates whether a given fix was extraction-side.

**The run record is a prerequisite, not a nicety.** `writeProvenance`
(`tools/lib/provenance.js:28`) currently writes exactly `{schemaVersion, tool, generatedAt}`.
The counters several checks depend on — `markersNormalized`, `mismatches`, `bracketDelta`,
`unwrapped` — are returned by `api-translate.js:1195-1202` and **go nowhere**; two are only
`console.error` notes. The in-pipeline repairs (`repairSegTags`, `normalizeSegMarkers`,
`unwrapInventedMarkers`) **erase their own evidence before the file is written**, so without
persisting these counters those checks are ceremony. The sidecar must be extended with the six
counters, the glossary **content hash** + arm, chars, estimated ISK, the extraction
fingerprint, and each gate's version.

**Three things the ledger is deliberately not:** a third pipeline-status model (two already
exist and CLAUDE.md warns they silently disagree); a restatement of scope; or silent about
skips — a module whose `.locked` marker survives records `skipped-locked`.

## 6. Failure handling

**The hard safety rule: the paid step is attempted once per module per invocation.** Free steps
may retry; MT never does. A re-run is always an explicit act.

**Halt semantics.** A blocking failure stops the loop, writes a report, leaves the module
`failed`. Blocking is assigned by one mechanical rule, not by hand: **a check with no known-bad
fixture cannot be blocking** — the project's own *"never shown to FAIL is not a check"*. A
second rule follows from decision ②: a post-MT check that blocks must have a **measured base
rate**, because a false halt on ~500 modules costs [LEAD] attention.

**Three abort thresholds**, all configurable, with proposed defaults so the loop is never
started with an unstated one: cumulative ISK exceeding **125%** of the book's §C80 estimate;
**3** consecutive module failures; **any** attempted write outside the expected trees (no
tolerance). The ISK threshold matters most on biology, whose estimate carries a ±15–26%
projection error (§C80) — 125% is deliberately above that band, so it fires on a *pricing
surprise*, not on the known uncertainty.

**Two guaranteed false halts must be disarmed before the shakedown**, both measured:

1. **`orverufraedi` fails extraction-coverage today** — 14 dropped lists in `m58781`/`m58782`/
   `m58783`, a pre-existing defect (`[[bio-review-option-drop]]`), not an MT regression. Micro is
   in scope, so module 1 would halt. Baseline or triage it first.
2. **Chapter 0 is falsy.** `if (args.module && !args.chapter)` at `cnxml-linguistic-check.js:240`
   and `cnxml-fidelity-check.js:297` rejects `--chapter 0`, and `--chapter 0` without `--module`
   silently scans the whole book. Chemistry ch00 holds a needed fixture.

**Three hazards specific to this repo:**

- **The ledger is a tracked data file and `lint-staged` silently drops those** — its pre-commit
  hook stashes unstaged tracked changes. **The loop commits the ledger in the same step that
  writes it.**
- **Pushing to `main` strands prod's content backup** (observed 2026-08-12). The loop batches
  commits and pushes at **book boundaries**, coordinated with a deploy — never per module.
- **Everything goes through the documented tools.** `02-mt-output` is read-only to hands, not to
  `api-translate`; the loop inherits existing `.bak` behaviour rather than inventing its own.

## 7. Validation — proving the loop before spending

1. **Self-test.** Every check with a real fixture goes red on it and green on its control,
   *through the real gate function*.
2. **Whole-corpus dry sweep** over the existing EN/IS pairs; record base rates. **Any check whose
   base rate exceeds ~5% cannot be blocking** — two candidates already fail that test.
3. **§C81 lands → re-extract chemistry ch01 → re-run Tier 1**; the alt check must flip from
   100% fail to 0.
4. **Physics preview shakedown** with the full battery live. Physics is the right shakedown
   because it has *no* fidelity allowlist and *no* residue allowlist — the battery runs with
   nothing pre-explained.
5. **Module 1 of each book runs both glossary arms** under the battery's winner criterion.
6. **Only then chemistry.**

⚠️ **State this whenever a pass rate is quoted:** the fixture corpus is chemistry-shaped —
chemistry supplies about two-thirds of the existing pairs while physics, biology and micro hold
most of the source. Every fixture predates the current extractor, and the loop re-extracts first.

**Every check emits three things, always:** its verdict, **its own version stamp**, and **the
number of units it examined.** §C60 is the precedent — a check once reported `Total findings: 0`
while reading zero files. Decision ① is the second reason: without a per-module record of which
instrument version judged it, a mid-campaign fix makes earlier green verdicts unfalsifiable and
the quarantine cannot be scoped.

## 8. Prerequisites

Ordered by what blocks what. The battery spec owns the detail.

1. **§C81 — figure `alt` into `cnxml-extract`.** Blocks all extraction; everything else assumes it.
2. **Persist the per-module MT run record** (§5). Without it, several checks are ceremony.
3. **Re-derive both allowlists after the §C81 re-extract.** `residue-allowlist.json` is
   **segmentId-keyed** and a re-extract renumbers seg-ids, so it is wholly voided;
   `fidelity-allowlist.json` is keyed on exact `moduleId+tag+diff`. Until this is done, two
   checks cannot be blocking. **This sequencing constraint appears in no existing document.**
4. **Widen the bracket-marker delta, compute per segment, make it gating** — recorded as the
   §C69 comparability call: the full run becomes stricter than the pilot, which is a [LEAD]
   decision, not a silent fix.
5. **Fix the chapter-0 truthiness bug**, or exclude ch00 explicitly and say so.
6. **The driver.**
7. **Per-module wrappers** for the four tools that lack `--module`. ⚠️ `parseArgs` **silently
   drops unknown flags**, so passing `--module` to them today is a no-op that runs the whole book.
8. ~~**Baseline `orverufraedi`'s 14 dropped lists**~~ — **RESOLVED 2026-08-13: there is nothing to
   fix and nothing to baseline.** The `processExercise` MC-option fix **already shipped**
   (`379926d3`, `orderedExerciseBlocks`/`emitExerciseSection` live in `cnxml-extract.js:1351,1389`).
   The three failing modules were last extracted **2026-03-25**, months before it — micro's
   `02-for-mt` is simply **stale pre-fix output**. **Measured:** re-extracting `m58781` alone with
   today's extractor took the book from *14 dropped lists / 3 modules* → *10 / 2*, and grew its
   segment file 26,277 → 27,488 chars (the recovered options). The natural control is inside the
   same book — micro's `m58802`, re-extracted 2026-08-12, **passes**. ▶ **The loop's own step 2
   recovers this; it is not a prerequisite.** *(The measurement was reverted; the tree is clean.)*
9. **Pre-flight**: `.locked` check, `git log` on `02-mt-output`, expected-input assertion,
   mandatory `--force`, and `--force --dry-run` for the estimate — a bare `--dry-run` reports
   `~0 ISK` once output exists.

## 9. Out of scope

- **Building a term-flip capability** (§C78). It would make glossary errors cheap and is
  probably the higher-leverage investment, but it is a separate design with an unsolved core
  (inflected target-form generation). The loop is what makes the re-MT safe *without* it.
- **Repairing the glossary entries** beyond what Tier 0 gates. §C77's population is roughly 10×
  the register's figure, and the `major → meiri` class shows the correct candidate is often
  already in the record — so the remedy is candidate **promotion**, not deletion. Its own item.
- **Anything outside §C80's scope.** Organic's 320-module gap stays dropped.

## 10. [LEAD] rulings — all three resolved 2026-08-13

1. ✅ **The §C69 comparability call is ACCEPTED.** The bracket-marker delta is widened to all
   types, computed per segment, and made gating. **The full run is therefore deliberately
   stricter than the pilot, and its marker results are NOT directly comparable to the pilot's
   headline.** Say so wherever the two are put side by side.
2. ✅ **Fix the extraction defect rather than baseline it — and it is already fixed.** See
   prerequisite 8: the code fix shipped 2026-07-16; micro's three failing modules are stale
   pre-fix *output*. Re-extraction recovers them, which the loop does anyway. **This removes a
   prerequisite instead of adding one.**
3. ✅ **Sample cadence is PER CHAPTER** — the ~1-in-10 domain read is drawn per chapter, not per
   book, so a long book gets even coverage rather than a front-loaded sample.

**Consequence of ① + ②, worth stating because it is not obvious:** both are extraction-side, so
they land in the **same** fingerprint change as §C81. Batch them into **one** re-extract per book
and there is exactly **one** fingerprint transition before the run starts — rather than three,
each of which would quarantine everything cleared before it.
