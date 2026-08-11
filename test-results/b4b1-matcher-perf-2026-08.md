# B4b-1 matcher — what the cut-over costs, measured 2026-08-11

Evidence for §C36 B4b-1 Task 8. **Dated snapshot: evidence, not status.** Re-measure
rather than trusting these numbers later — `node --expose-gc server/scripts/bench-c24.js`
reproduces every one of them.

**Code measured:** `aeccd33f` (branch `spec/c36-b4b1-matcher-cutover`), plus this task's
own rewrite of `server/scripts/bench-c24.js`.

**How it was run.** Eight runs on the dev box as the script gained its arms and then its
fix round — six biology, one chemistry, one final end-to-end check of the committed script (Node v22.22.2, 12 cores,
9.9 GB RAM, load average 1.2–2.4 — **not an idle box**; see _Timing variance_ below). Wall
times below are ranges across those runs; **every count and every memory figure was
identical in all of them**. Each run
builds its **own scratch corpus** via `server/scripts/lib/scratchCorpus.js` — every real
migration against an empty file, then the 20-collection Íðorðabankinn import from
`~/idordabanki-raw-2026-08-07/` — and deletes it on exit. No production database, no
`pipeline-output/sessions.db`, no file under `books/` was written.

```bash
node --expose-gc server/scripts/bench-c24.js                      # biology (default)
node --expose-gc server/scripts/bench-c24.js --book efnafraedi-2e \
     --modules 3:m68700,1:m68664,1:m68663,3:m68699 --curve 1,2,4  # chemistry
```

---

## 🔴 Read this before quoting any number below

1. **Every figure is a SCRATCH RECONSTRUCTION, not production.** The control that makes
   it admissible is printed on every run and aborts the run if it fails: the rebuild
   reproduces §C36 B2's recorded totals exactly — **70,187 concepts / 192,189
   `concept_term` rows**, every run.
   ⚠️ **That control is NOT a production guard, and reading it as one would be the
   "passes for the wrong reason" class this repo keeps logging.** Production holds
   _exactly_ those totals — that is what B2 recorded — so reproducing them says the corpus
   is right, never that the database is a scratch one. The **path refusal** is the only
   thing standing between this bench and a real database.
2. **Nothing here comes off `c24-terms.json`.** Register §C48 rules that the fixture's
   synthesised subject tags are no longer trustworthy as tier/issue/fallback inputs. Every
   match, issue and tier figure below comes from the **real corpus** against **real
   extracted segments**. The one place the fixture is cited is the compile-count
   comparison, and it is labelled _fixture scale_ there.
3. **Two different totals, on purpose.** The automaton is **global — one entry per distinct
   English string in the WHOLE corpus (61,042), book-independent**. `resolve()` is scoped
   to **one book's domain chain** (47,568 for `liffraedi-2e`, 19,749 for `efnafraedi-2e`).
   A number is meaningless without saying which of the two it used.
4. **No memory ceiling is asserted here, and none is derived from C24's 264–269 MB.** That
   figure was taken on a synthetic 20k-headword corpus, its own code comment says it is not
   the trie's number, and the split was never measured. Arm 1 replaces the guess with a
   measurement; setting a budget from it is the lead's call.

---

## Arm 1 — the automaton alone · CORPUS scale (61,042 entries), book-independent

`loadEnglishEntries(db)` then `buildTermAutomaton(entries)` **and nothing else**. Memory is
`heapUsed` after a forced `global.gc()` (two passes), never a bare RSS delta.

| Measurement                          | Value                                       | Scale it covers                                        |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------------------ |
| **`buildTermAutomaton` heapUsed**    | **+177.1 MB** (177.0–177.1, every run)      | 61,042 distinct EN strings, whole corpus, every domain |
| `buildTermAutomaton` wall time       | 1.53 – 2.21 s                               | same                                                   |
| `loadEnglishEntries` heapUsed        | +6.6 MB (entries array + `englishById` map) | same                                                   |
| `loadEnglishEntries` wall time, cold | 114 – 212 ms                                | same                                                   |
| Resident after both                  | heapUsed 190.0 MB                           | same                                                   |

**The trie's own number is 177 MB of JS heap, and the server holds one of them for the
process lifetime.** It is a `_automatonCache` singleton keyed on a corpus fingerprint. The
heap figure was identical to within 0.1 MB across every independent corpus rebuild.

**Three independent observations of the same structure agree to 0.1%**, which is a stronger
claim than the single delta: arm 1 reports **+177.1 MB**; the scaling table's 61,042 row
reports **+177.0 MB** through a separate build of a separately-assembled entry list; and
dropping the reference returns heapUsed to **14.1 MB** against an 11–14 MB pre-arm
baseline — i.e. all of it was the automaton and none of it leaked.

RSS agreed with heapUsed on **this** arm (+186 MB vs +177 MB, ~5%) because it is the
process's _first_ large allocation. That agreement does not generalise — see below.

### Growth in entry count (evenly **spaced** samples, not prefixes)

`loadEnglishEntries` returns `LENGTH(text) DESC`, so a prefix would be the longest strings
and would overstate. These sample every _n_-th position across the whole list:

| Entries | heapUsed  | per 1,000 entries | RSS delta, same build |
| ------- | --------- | ----------------- | --------------------- |
| 10,000  | +28.5 MB  | 2.85 MB           | **+9.3 MB**           |
| 20,000  | +57.8 MB  | 2.89 MB           | **+39.3 MB**          |
| 40,000  | +124.3 MB | 3.11 MB           | **+86.7 MB**          |
| 61,042  | +177.0 MB | 2.90 MB           | **+80.9 MB**          |

**Byte-identical across two runs**, so every row below is deterministic, not noise.

**End to end it is linear to within 2%:** 6.1× the entries (10,000 → 61,042) costs 6.2× the
heap, and extrapolating the 10,000-entry row to the full corpus predicts 174 MB against 177
measured. **Per-1,000 is NOT monotone, and the deviation reproduces exactly**: 2.85 → 2.89
→ **3.11** → 2.90. The 40,000-entry point costs ~7% more per entry than the full corpus and
does so identically on both runs. **No mechanism is offered here — it was not
investigated**, and the obvious guess (less trie prefix-sharing in a sparser sample) is
contradicted by the 10,000-entry row, which is sparser still and cheaper per entry.

**For capacity planning, use ~2.9 MB per 1,000 distinct English strings with a ±10% band**,
and prefer the end-to-end ratio over any single row.

⚠️ **SUPERSEDED 2026-08-11 (fix round 1) — the first version of this table read 2.68 /
2.53 / 2.76 / 2.89 and was captioned "evenly strided samples, not prefixes". It was
stride-then-truncate**: `filter(i % stride === 0).slice(0, n)`, whose integer stride
collapses to 1 at n = 40,000, making that row **a prefix of the 40,000 longest strings** —
dropping the entire 34.5% short tail, i.e. the exact construction the caption disavowed. It
was correct for 2 of 4 rows, and the bad row read _lower_ than the full set, so the table
looked orderly. The old numbers are kept here because the record of what was overclaimed is
worth more than a clean-looking table: they did not falsify linearity, they failed to
establish it, because the sampling bias and prefix-sharing were confounded and the spread
was the same order as the bias. **The headline 177 MB was never affected — it is the whole
set, unsampled.**

### 🔴 The RSS column above IS the evidence for using `heapUsed`

Four automata are built and dropped in one process. `heapUsed` reports each one's real
size; the RSS delta collapses — the process already grew and does not hand the pages back.
At 61,042 entries **RSS reports +81 MB for a structure that measurably costs +177 MB — a
2.2× understatement**, and at 10,000 entries it is 3.1×. This is exactly the shape
`bench-prepare-arms.js` computes its `resident memory Nx less` ratio from, and it is why
that ratio should not be read as a memory measurement. Demonstrated here rather than
asserted.

## Arm 1c — the per-call FIXED floor · corpus scale

`findTermsInSegments` re-reads **every** EN row on **every** call, deliberately: that is
what makes the automaton cache structurally unable to go stale.

| Measurement                                       | Value            | Scale                      |
| ------------------------------------------------- | ---------------- | -------------------------- |
| `loadEnglishEntries` re-read, best of 3, warm     | **119 – 134 ms** | 61,042 distinct EN strings |
| `buildScope`                                      | 1.1 – 1.4 ms     | one book's chain           |
| Short-lived heap allocated and discarded per call | ~6.6 MB          | same                       |

**This floor is paid whether the call carries 1 segment or 878**, and it is the reason the
one-segment save path is not cheap (arm 3). ⚠️ The floor is a wall-clock figure and moves
with load like every other one here: five runs gave 119–134 ms, and one run taken while a
full `npm test` was executing gave **281 ms**. The subtraction in arm 4's latency paragraph
uses ~125 ms against warm times measured **in the same runs**, so the two are consistent;
do not pair a floor from one run with a warm time from another.

## Arm 2 — the `resolve()` reference, RE-MEASURED on this box in this run

B1's recorded 0.044 ms/resolve is a **dev-box, cross-day** figure and is not comparable
across machines or days; this arm re-takes it beside everything else.

| Book                              | in-scope distinct EN | cold ms/resolve | warm ms/resolve     | winners |
| --------------------------------- | -------------------- | --------------- | ------------------- | ------- |
| `liffraedi-2e` (biology chain)    | **47,568**           | 0.0705 – 0.0736 | **0.0505 – 0.0547** | 44,861  |
| `efnafraedi-2e` (chemistry chain) | **19,749**           | 0.0941          | **0.0900**          | 18,398  |

Reconciliation with B1: same book, same 47,568 strings, same 44,861 winners — so the
populations agree exactly and only the box/day differs. **This box today is ~1.15–1.25×
slower per resolve than B1's recorded 0.044.** Both figures are the same order; neither
supersedes the other, because they are different days.

⚠️ **Chemistry's per-resolve cost is HIGHER on a smaller scope** (0.090 vs 0.051) — B1
recorded the same direction (0.060 vs 0.044). Scope _size_ and per-resolve _cost_ are not
the same axis. Total sweep cost still favours chemistry: 19,749 × 0.090 = 1.78 s against
47,568 × 0.051 = 2.40 s.

## Arm 3 — end to end on ONE REAL MODULE · corpus scale, real segments

|                                                 | `liffraedi-2e` 3:m66442 | `efnafraedi-2e` 3:m68700 |
| ----------------------------------------------- | ----------------------- | ------------------------ |
| Segments (all with EN **and** IS content)       | 137                     | 282                      |
| Cold call — **builds and caches the automaton** | 3.14 – 3.34 s           | 2.55 s                   |
| Warm call, best of 5                            | **225 – 334 ms**        | **260 ms**               |
| Save path, 1 segment, best of 5                 | **77 – 106 ms**         | **122 ms**               |
| Matches                                         | 1,241                   | 1,678                    |
| Issues emitted                                  | 596                     | 962                      |
| `resolve()` calls                               | 441                     | 409                      |
| RegExp compiles (per call, whole function)      | 1,494                   | 1,783                    |

Counts were **bit-identical across all runs**; only wall times moved.

**The save path is floor-dominated.** 77–106 ms for a single segment against a 119–130 ms
measured floor — i.e. essentially all of a one-segment call is the corpus re-read, not the
segment.

## Arm 4 — the SEGMENT axis, and the verdict on Task 4's memo

Corpus held constant (61,042 entries); only the segment set grows, by concatenating whole
real modules — **no segment is duplicated to reach a size**.

`Σhits` is the counterfactual, measured with the shipped automaton rather than modelled:
`findFirstOccurrences` already returns one entry per headword _per segment_, so **Σhits is
exactly what the call would cost with a per-segment memo — i.e. Task 4's memo removed.**

### `liffraedi-2e` — biology chain (47,568 in scope), corpus scale

| segs | Σhits (no memo) | `resolve()` calls | distinct EN hit | saved | matches | issues | compiles | compiles/match | warm         |
| ---- | --------------- | ----------------- | --------------- | ----- | ------- | ------ | -------- | -------------- | ------------ |
| 137  | 1,642           | **441**           | 441             | 3.72× | 1,241   | 596    | 1,494    | 1.20           | 220 – 334 ms |
| 243  | 2,647           | **578**           | 578             | 4.58× | 1,946   | 943    | 2,383    | 1.22           | 348 – 392 ms |
| 439  | 4,712           | **840**           | 840             | 5.61× | 3,539   | 1,757  | 4,341    | 1.23           | 336 – 574 ms |
| 817  | 9,414           | **1,266**         | 1,266           | 7.44× | 7,016   | 3,525  | 8,563    | 1.22           | 718 – 833 ms |
| 878  | 9,856           | **1,281**         | 1,281           | 7.69× | 7,387   | 3,708  | 9,124    | 1.24           | 625 – 976 ms |

### `efnafraedi-2e` — chemistry chain (19,749 in scope), corpus scale

| segs | Σhits (no memo) | `resolve()` calls | distinct EN hit | saved | matches | issues | compiles | compiles/match | warm   |
| ---- | --------------- | ----------------- | --------------- | ----- | ------- | ------ | -------- | -------------- | ------ |
| 282  | 2,207           | **409**           | 409             | 5.40× | 1,678   | 962    | 1,783    | 1.06           | 280 ms |
| 354  | 3,096           | **587**           | 587             | 5.27× | 2,410   | 1,347  | 2,567    | 1.07           | 275 ms |
| 368  | 3,242           | **627**           | 627             | 5.17× | 2,531   | 1,403  | 2,668    | 1.05           | 340 ms |

### ✅ VERDICT — the memo bounds the segment axis, measured

**`resolve()` calls == distinct English strings hit, at every point of both curves, exactly.**
Not once does the count track Σhits. At the largest point an un-memoised call would make
**9,856** resolve calls; the shipped code makes **1,281** — **7.69× fewer**.

**How the saving moves with segment count is text- and order-dependent, and must not be
read as a law.** It rose 3.72× → 7.69× across biology's 6.4× segment range, with modules
added **largest-first _within each chapter_** — `DEFAULT_MODULES` is descending inside ch03
and inside ch05 but interleaved between them (chapter pattern 3333 5555 33 5), so it is
**not globally sorted by size**: 137, 106, 104, 92, **128**, 87, 86, 77, 55, 3, 3. At the
curve's actual sampling points the steps add **137 / 106 / 196 / 378 / 61** segments —
_increasing_ at two of the four. **Whether that ordering contributes to the trend is a
candidate confound, not a measured one**, and the decline it would describe is ordinary
vocabulary saturation, which this run did not separate from it either. Chemistry's
narrower 1.3× range shows a slight **decline** over the same measurement: 5.40× → 5.27× →
5.17×. Both curves are printed above; neither generalises to the other.

⚠️ **SUPERSEDED 2026-08-11 (fix round 1).** This claimed the saving _grows_ "because
distinct vocabulary saturates while hits keep accumulating" — a Heaps'-law mechanism that
is sound in principle but generalised from one curve while the other, two rows above in
this same document, trends the other way, and while the curve's own construction supplies a
competing explanation.

⚠️ **SUPERSEDED AGAIN 2026-08-11 (fix round 2), and the second wording was wrong in the
same way as the first.** Round 1 replaced it with _"modules added largest-first, which makes
vocabulary-per-segment decline **by construction**"_. Both halves fail against the module
list: the order is **not** globally largest-first (position 5 is 128 segments against 104
and 92 before it), and "by construction" does not hold where the curve samples, since two
of its four steps add MORE segments than the step before. The mechanism that clause was
reaching for is **ordinary vocabulary saturation — the very thing the paragraph had just
disavowed as unmeasured**, renamed rather than measured. **The conclusion it was offered in
support of is untouched**: "text- and order-dependent, not a law" rests on chemistry's
printed decline, and no number moved in either round. **The memo verdict does not rest on this and is unaffected**: it
rests on the 8/8 exact equality of calls to distinct strings hit.

Controls, so the verdict is not an artefact of a counter that never bound:

- `resolve()` calls > 0 is asserted; a wrapper that failed to bind reads as 0, which is
  indistinguishable from a perfect memo. The wrapper is installed **before**
  `terminologyService` is required, because that module destructures `resolve` at require
  time — a wrapper installed after binds to nothing.
- Σhits > calls is required for the run to mean anything. The ratio is 3.7–7.7×, far from
  the ~1.0 that would make "no duplicate hits in this sample" and "the wrapper never
  bound" indistinguishable.
- Both counts are derived from real text, and the vacuousness guard prints how many
  segments carry EN and IS content (878/878 and 368/368).

**Consequence for latency, stated without a mechanism:** warm time is consistent with a
**fixed ~125 ms floor plus a term linear in segments**. Subtracting the independently
measured floor (arm 1c, 119–130 ms) from the best warm times leaves ~95 ms at 137 segments
and ~500 ms at 878 — **6.4× the segments for 5.3× the variable time, i.e. essentially
linear** — and a two-point fit puts the intercept at ~145 ms, within noise of the measured
floor. **The memo's contribution to latency was NOT separated from the floor in this run.**

⚠️ **SUPERSEDED 2026-08-11 (fix round 1).** This paragraph read: _"because resolve calls
saturate, warm time grows sub-linearly in segments — 6.4× the segments costs ~2.2–2.9× the
time."_ The observation is right and the "because" was unmeasured. The floor alone produces
sub-linearity: adding the memo's saving back at this run's ~0.05 ms/resolve gives ~280 ms
and ~1,055 ms, **still sub-linear**, so an un-memoised matcher would show the same shape and
the memo cannot be what produces it. The memo's real, measured benefit is the **call-count**
bound above, not this curve's shape.

## The regex-compile bound (§C48 asked Task 8 to see this number)

§C48 records per-call compiles rising **11 → 56** at fixture scale, and claims the rise is
**not** a §C24 relapse because 56 scales with _match count_, not _corpus size_. Measured:

| Scale                                                    | corpus EN strings | matches | compiles | compiles per match |
| -------------------------------------------------------- | ----------------- | ------- | -------- | ------------------ |
| c24 fixture (recorded, §C48 / `findTermsGolden.test.js`) | 304               | 40      | 56       | **1.40**           |
| biology module, corpus scale                             | 61,042            | 1,241   | 1,494    | **1.20**           |
| whole biology set, corpus scale                          | 61,042            | 7,387   | 9,124    | **1.24**           |
| chemistry module, corpus scale                           | 61,042            | 1,678   | 1,783    | **1.06**           |

**The bound holds.** The corpus grew **200×** (304 → 61,042 distinct EN strings) while
compiles per match did not rise at all — it _fell_, 1.40 → 1.05–1.24 — and within one
corpus it is flat across a 6.4× change in segment count (1.20 → 1.24). Compiles track
matches, not corpus size. Neither `loadEnglishEntries` nor `buildTermAutomaton` constructs
a `RegExp` at all; the compiles are `matchesForm`'s winner checks plus issue-path
candidates. (The counter is the `RegExp` Proxy from `findTermsGolden.test.js` — the same
instrument, so the numbers are comparable — and it counts **every** construction during the
call, not `matchesForm` alone.)

## What could NOT be measured here, and why

- **🔴 An old-vs-new A/B at ANY scale, including fixture scale.** The brief expected a
  fixture-scale A/B via `verify-b4b0-gates.js`'s `seedC24(db)`. That seeds the old _data_,
  but **there is no old matcher left to run it**: Task 4 replaced `findTermsInSegments`
  outright, and `verify-b4b1-gates.js`'s caveat 3 already states it — _"the concept import
  writes nothing to `terminology_headwords` (measured: 0 rows in the scratch corpus), the
  dev DB holds 6, and Task 4 DELETED the old matcher — so 'old vs new' cannot be run, only
  compared against a recorded capture."_ Restoring the pre-cut-over service from git into
  the tree to create an arm was considered and **rejected**: it would also need
  `book_subject_mapping` seeded (which `seedC24` does not do), and a 316-headword arm
  cannot characterise a matcher whose old cost scaled with corpus size. The standing
  comparison is §C48's recorded capture (11 → 56 compiles, 5 → 22 issues, fixture scale) —
  **and per §C48 its issue half reads synthesised tier tags, not corpus truth.**
- **Anything at production scale, on production.** Not attempted by rule.
- **A tier / fallback-badge / issue figure that can be called corpus truth off the c24
  fixture** — §C48 forbids it. The issue counts in arms 3 and 4 avoid this by coming from
  the real corpus.

## Timing variance, stated rather than smoothed

The box carried other load (load average 1.2–2.4). Wall times move ±30–50% between runs;
the 878-segment warm point ranged 625–976 ms. **Counts, memory and the memo verdict were
bit-identical across all runs** — only latency is noisy. Treat every wall-clock figure
here as an order of magnitude on a _busy dev box_, and every count as exact.

## Observations that are not performance, logged because the numbers surfaced them

- **Issue volume at cut-over is high on unedited MT text:** 596 issues over 137 real
  biology segments (4.3/segment) and 962 over 282 chemistry segments (3.4/segment), corpus
  scale, real segments. These are Icelandic-side checks against MT output no editor has
  touched yet, so a high count is expected — but it is what an editor opening a module at
  cut-over would see, and nothing has yet decided whether that volume is usable.
- **The 177 MB automaton is transiently doubled on a rebuild.** `_automatonCache` is set to
  `null` before the new build, so the old one is unreferenced — but unreferenced is not
  collected, so a fingerprint change can leave ~354 MB resident until GC runs. Not observed
  as a fault; recorded because the rebuild path is the one no benchmark exercises twice.
