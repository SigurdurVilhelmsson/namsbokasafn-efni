<!-- FROZEN EVIDENCE — banner-dated 2026-08-17. Per CLAUDE.md § One source of truth this is
     EVIDENCE, never status. If it disagrees with the active register, THE REGISTER WINS. -->

<!-- Produced by the pre-planning verification gate on
     docs/superpowers/specs/2026-08-16-c88-unreachable-figure-alt-design.md, run 2026-08-17
     before any §C88 plan was written. 13 agents, 446 tool calls, 6 claim clusters.
     52 claims re-derived from the tree; every falsification then handed to an INDEPENDENT
     agent prompted to DEFEND the spec, because in this project a refuted finding is a claim
     about the verifier too. 3 upheld, 3 overturned.
     Claim-level detail → c88-spec-verification-claims-2026-08-17.json -->

# §C88 design-review briefing — verification results

**Verdict: the measured foundation is sound, but two cells of §6's emit-point table are wrong and must be corrected before a plan is written from it.** Both corrections are one-clause text edits, not design changes. Nothing found changes the A/B/C calculus — and the extraction-vintage window that makes **A** cheap is **currently open** (measured, see §6 below).

Scope of verification: 49 claims re-derived from the tree — **43 CONFIRMED**, **3 falsifications UPHELD after adjudication**, **3 falsifications OVERTURNED** (the spec was right).

---

## 1. What survived

The three load-bearing pillars all held, each re-derived independently rather than read off a pin:

- **The 197 population (§1, §2).** Counting unit = alt-bearing `<media>` **elements** in `books/efnafraedi-2e/01-source` (which coincides exactly with the alt-**attribute** count here: 1,149 alts all sit on `media@alt`, 0 on `image@alt`). 1,149 = 952 reachable + 197 unreachable, reconciling with no remainder; all five reason codes (105 / 40 / 29 / 13 / 10) and all five module counts (33 / 20 / 2 / 8 / 7) reproduce cell-for-cell. Verified three ways: the shipped `altReachability`, an independent hand-written predicate, and — strongest — the **live extractor**, which emits an alt segment for **0 of the 197** against a positive control of **951 of 952** reachable. Organic's out-of-scope numbers (245 / 0-of-245 id-bearing / 213-vs-32 preview split / 100+32=132) all confirmed, including the "two 32s are one population" claim, verified by element identity (m00032 media #2–#33), not by set size.
- **The blocking id-stability ruling (§3.1).** Confirmed and re-derived exactly: **6,085 positional `auto-N` seg-ids = 27.1% of 22,466 segments**, present in **149 of 149** chemistry modules, by type `entry` 5,824 · `title` 149 · `abstract` 112 (exhaustive — no fourth type). `generateSegmentId` matches the spec's quoted block verbatim; `counters.segment` is genuinely shared across all types. The committed probe reproduces 78 unchanged / 1,404 sheared / 2 gone on m68865, and it compares the id→**text mapping**, not the id set, as the spec says. ⚠️ Scope worth carrying: the probe inserts at position zero of the walk, so **1,404 is an upper bound for that module**, not a prediction for a realistic C88 emit point. The ruling does not depend on the magnitude — an emitter inside `processTable`'s entry loop still shifts the corpus's 5,824 `entry:auto-N` ids.
- **The §C89 boundary (§5).** Confirmed: `collectFigureAlts` is keyed on **figure id** only; no media-id-keyed lookup exists anywhere in `cnxml-inject.js`. Recovery numbers re-derived at both vintages (pre-§C89 tools extracted read-only): chemistry 324 → 950 of 951, organic 1,675 → 1,918 of 1,918 (unit = alt segments), 869 recovered. Of the 197, **0 have a `<figure>` ancestor** — a figure-keyed lookup cannot reach any of them. The shipped substitution is genuinely **best-effort** (reads via `peekSeg`, which does not record misses), verified with a three-arm experiment including a positive control that made `complete` go false.

Also confirmed, and useful to the plan author: **all 197 carry their own `id`** (so `altElementId` never touches the positional fallback for them); the `deduplicateMedia` first-wins hazard is real and reproducible, and applies to **all four** C88 containers, not just examples; §C89 did rewrite attributes in place with zero node construction.

---

## 2. What must change in the spec before planning

### 2.1 §6, `problem`/`solution` row (53 alts) — the emit point is TWO functions, the spec names one. *Most actionable defect in the document.*

- **Spec says:** owner chain `processExercise → orderedExerciseBlocks`; "add `media` as a third kind."
- **Measured:** the real chain is **`processExercise → emitExerciseSection → orderedExerciseBlocks`** — three hops, and the omitted hop is where the dispatch lives. `emitExerciseSection` appears **0 times** in the 268-line spec (positive control: `orderedExerciseBlocks` = 1 hit). A two-arm controlled experiment over all 149 chemistry modules: the **spec-literal patch is a corpus-wide no-op** (alt delta 0, 0 modules changed — instrumented proof the media blocks *did* arrive at the consumer and fell through to the para branch, where `toText` returned `''` and they were dropped); adding a `block.kind === 'media'` branch in `emitExerciseSection` recovers **all 53, across 24 modules**.
- **What a plan author builds wrong:** they change one function, no alt segment is emitted, every count-based check stays green — §C89's exact shape — and 53 of the 197 ship unfixed.
- **Two riders the corrected row needs.** (a) The alt-emitting machinery already exists at that call site (`drainInlineMediaAlts(inlineMediaMap, addSegment)` → `addSegment('alt', …)`), so the consumer branch is *small*; what is missing is a media block that makes `extractInlineText` see the element — the para branch passes `.content`, not `.fullMatch`. (b) **The branch must also push a structure entry into `content`.** Emitting the alt segment without one recreates §C89 precisely: extracted, translated, paid for, nowhere to land at inject. (The verification arm that recovered 53 deliberately did *not* push a structure entry — it was a positive control, not a proposed fix.)

### 2.2 §6, `entry` row (29 alts) — `addSegment` is never called on this path

- **Spec says:** "…the media is stripped, `text` is `''`, and `addSegment` returns `null`."
- **Measured:** both `addSegment('entry', …)` calls in `processTable` sit inside `if (text)`. With `text === ''` control goes to the **else branch at `tools/cnxml-extract.js:1465-1467`**, which pushes `{segmentId: null}` without ever entering `addSegment`. Confirmed for **29 of 29** entries (all in the single-content branch; 0 in the multi-para branch), and proved by partition closure: empty-text entries === null cells (34===34, 5===5) alongside non-empty === real ids (84===84, 14===14).
- **What a plan author builds wrong:** they go looking for the `addSegment` call to hang the emit on — and there **is** one, at `:1447` in the multi-para branch. That branch is **0/29** for this population. Wiring the emit there looks correct and fixes nothing. A false mechanism pointing at a real-but-wrong code site is worse than one pointing at nothing.
- Everything else in the row is correct, including the prescribed emit point ("inside the entry loop, where the empty text is discarded") and "walk visits it? **yes**".

### 2.3 §8 check 1 — one of the two named shortfalls contributes zero

- **Spec says:** "Two pre-existing shortfalls sit between 'reachable' and 'emitted'… `m68727`'s regex-truncation drop and the `mediaAlt`-predicate edge divergences logged as §C87 ①."
- **Measured:** the reachable-vs-emitted gap is exactly **1 alt segment**, all of it m68727 (pinned as a single-element array). §C87 ① is **latent and worth 0** — and structurally so: across all five content books, alt-only-on-`<image>` = **0** and `<media>` with more than one `<image>` descendant = **0**, so the image-fallback half of the predicate cannot fire on this corpus, including on the 197 after C88 widens the reachable set.
- **What a plan author gets wrong:** budgets for two sources of slack and finds one. Medium severity — the spec's *conclusion* (state the gate as a delta, not "1,149 of 1,149") is correct and rests soundly on m68727 alone. Keep the §C87 ① reference, but move it to "latent risks C88 inherits."

### 2.4 Two copy-edits worth making at the same time (not defects in the design)

- **§1's "these positions have never been visited for any content type."** Loosely worded. At the exact node location a different element type *is* emitted (swap a bare media for `<para>SENTINEL</para>` → 16/16 emitted). The defensible statement, which measures true 0-of-197 against a 952/952 control: *no extraction walk ever reads a `<media>` in these positions.* For the 29 `entry` rows the host `<entry>` really does emit nothing at all (sentinel test: 84→108 and 14→19, i.e. every one of the 29 hosts is silent) — the 84/14 entry segments those modules do emit come entirely from other cells.
- **§6's title says "the five emit points" over four rows; §1 lists five reason codes.** Three counts of one thing in one document.

---

## 3. Overturned — the spec was right

Three falsifications did not survive adjudication. Stated so the lead can calibrate:

- **§8 check 3 (id stability) was challenged as an unpassable gate and a mislabeled precondition — falsification does not stand.** §3.1's numbers re-derived exactly, and the check's stated purpose ("prove nothing has been extracted yet") is checkable and currently holds. The challenge rested on the claim that no pre-existing id→text mapping exists; wrong population — the mapping that check 3 protects is the **pre-existing non-alt `auto-N` ids**, which exist in duplicate and are money-backed (6,085 identical `auto-N` ids on both the `02-for-mt` source side and the purchased `02-mt-output` side, same 4,889 `:para:` control on both). Residual: filing it under "Acceptance gate" rather than a Preconditions block is loose, not wrong.
- **§8 check 1's field names** — challenged as naming a field that does not exist. `checkAltCoverage` returns `unreached`/`expected`, while `reachable`/`unreachable` are `altReachability`'s keys — but those are the source's own concept vocabulary, and the committed pin uses the same words. **Wording nit only**; suggested rewording: "`altReachability`'s `unreachable` 197 → 0 and `reachable` 952 → 1,149 — i.e. `checkAltCoverage`'s `unreached` → 0 and `expected` → 1,149." The adjacent point that check 1 is satisfiable by the model change alone is true and *already stated by the spec twice* in the same section.
- **§1's "pre-existing and orthogonal to §C81"** — held. Alt extraction did not exist before §C81 at all (0 `addSegment('alt'` in the pre-§C81 extractor against a control of 22 `addSegment(` calls), so chemistry alt coverage went 0 → 952, never 1,149 → 952.

One footnote: three items (§8 check 1 field names, §8 check 3, §C87 ①) arrived carrying a stale "provisional / unadjudicated" duplicate label. **The adjudicated verdicts above govern** — there is nothing provisional in this briefing.

---

## 4. Provisional / not settled

Nothing in the assigned set came back UNVERIFIABLE. Three limits worth knowing, none of which affects the A/B/C decision:

- **The [LEAD] scope rulings themselves** (§2 "chemistry's 197, nothing else"; §3 "C88 blocks the run") are decisions, not tree properties, and were not assessed.
- **§C89's "first cut" refusal** (§9, bullet 3) was never merged, so there is no commit to archive. The shipped code was confirmed best-effort; the historical refusal is corroborated only by the commit message and an in-code comment, both independently naming "5 phantom misses on m68687" — a number that matches m68687's actual 5 alt segments.
- **Organic's "purchased preview" is defined by a mutable tree property** (which modules currently have segments in `02-for-mt`). It resolves to 17 modules today, and §2's 213/32 split follows from that. Two independent pins agree on 17; extracting one more organic module moves the split with no other signal.

---

## 5. Pin inventory — the committed tests §C88 moves

The spec declines to supply this ("enumerate them by reading the pins"). Here it is. Unit stated per row.

| File : line | Pin | Class | Unit |
|---|---|---|---|
| `alt-coverage-corpus.test.js:45` | `reachable` 952 → 1,149 | **moves** | alt-bearing `<media>` |
| `alt-coverage-corpus.test.js:46` | `unreachable` 197 → 0 | **moves** | alt-bearing `<media>` |
| `alt-coverage-corpus.test.js:51-57` | five-key reason `toEqual` → `{}` | **moves** | reason codes |
| `alt-coverage-corpus.test.js:91-93` | `reachableTotal` 952→1,149 · `emittedTotal` 951→~1,148 · shortfall `[{m68727, 6, 5}]` (module stays, pair changes) | **moves** | alt segments |
| `alt-coverage-corpus.test.js:40,47` | 149 modules · 1,149 total | invariant | — |
| `alt-writeback-corpus.test.js:77,78,87` | chemistry `emitted` 951→~1,148 · `reached` 950→~1,148 · `dropped ['m68801']` → `[]` | **moves** | alt segments / modules |
| ⚠️ `alt-writeback-corpus.test.js:101-103` | **organic** 1,918 → 2,163, `dropped []` at risk | **at risk** | alt segments |
| `extraction-coverage.test.js:207-208, 219-234, 279` | five unit fixtures `unreachable: 1` all invert; `{reached:2,expected:2,unreached:1}` → `{3,3,0}`; describe title at :194 | **moves** | fixture assertions |
| ⚠️ `cnxml-extract-alt-corpus.test.js:94` | `positional` must stay `[]` — the five new capture sites must not mint `media-N-alt` ids | **must not move** | seg-ids |
| `cnxml-extract-alt-corpus.test.js:124,143` | duplicate-alt-**ID** `[]` | **must not move** | seg-ids |
| ⚠️ `cnxml-extract-alt-corpus.test.js:167` | organic duplicate-alt-**TEXT** `[]` | **must not move — at genuine risk** | alt text |
| `inject-roundtrip-corpus.test.js:134-139` | loss `['m00032']` / gain `['m00023','m00046']` | **must not move** | alt attributes |
| `alt-writeback.test.js` (6× `toBe(1)`), `cnxml-extract-alt.test.js`, `alt-segments.test.js`, `cnxml-inject-alt.test.js`, `cnxml-render-alt-escaping.test.js` | — | **does not move** (no C88-blind fixture; the problem/solution fixtures nest media in a `<para>`, already reachable) | — |
| `test-results/c81-alt-extraction-2026-08-15.json` | 951 / 1,149 / 442 / 197 / 32 | not a test — **frozen artifact that will silently disagree with the tree after C88** | mixed |

**Two flags the spec never makes:**

1. **`alt-writeback-corpus.test.js:101-103` (organic) will move even though §2 scopes the population to chemistry.** §6's `entry` emit point sits inside `processTable`'s entry loop, which is **book-agnostic**, and `sweep()` runs the live extractor over all **342** organic source modules — not just the 17 with committed segments. Expect organic's `emitted`/`reached` to go 1,918 → 2,163 (alt segments). Either scope the emitter, or plan to move the organic pin deliberately.
2. **`cnxml-extract-alt-corpus.test.js:167` is at real risk.** Organic's 245 `entry-not-in-figure` alts are **0-of-245 id-bearing**, so C88's entry emitter mints **id-less** segments there — and repeated table-cell alt text would trip a duplicate-alt-**text** pin that the id-based pins would not catch.

Also worth pinning at §3.1: in the corrected two-function exercise arm, **4 of 149 modules had positional `entry:auto-N` ids renumber** with segment-list lengths identical (93/93, 263/263, 356/356) — the id shear §3.1 argues, now measured.

---

## 6. Does this change A vs B vs C?

**No. A remains the right call, and the two upheld findings make it slightly more expensive to implement and measurably less risky.** Both defects were latent design-table errors; they are now measured, with the corrected mechanism and the exact recovery count (53 of 53, 24 modules) in hand.

**The precondition that makes A cheap is currently satisfied.** Nothing has been extracted at the §C81/§C88 vintage, measured three ways, each with a positive control in the same command:

- **0** `:alt:` SEG markers across 333 tracked `02-for-mt` files (control: 4,889 `:para:`);
- **0** `:alt:` across 177 purchased `02-mt-output` `.md` files (control: 4,889 `:para:`);
- **0** object-shaped `alt:{segmentId,text}` across 535 `02-structure` JSONs (control: 956 string-shaped alt keys).

Decisive same-module control: the current extractor run in memory on `m68664` emits 4 `:alt:` and 15 `:para:`; the committed `02-for-mt` file for that module holds 0 `:alt:` and **15** `:para:`. The matching `:para:` count proves the two sides are the same module and the same unit, so the 4-vs-0 is vintage, not instrument. **Scope limit, stated plainly:** this is committed state at HEAD; it would not see an extraction in flight on prod that the 2-hourly content cron has not yet pushed.

- **B** is unchanged by anything measured: it still rewrites the export corpus's join key and would still need verifying against every committed `02-for-mt` vintage. Nothing found makes it cheaper or more urgent.
- **C** is unchanged and remains the expensive option: with 6,085 positional `auto-N` ids in 149 of 149 chemistry modules, a post-run fix costs a full re-extract plus re-MT of chemistry, and the consequence of getting it wrong is **misattached** Icelandic table-cell text, not missing text.
- **A**'s window is open **today**. It closes the moment any chemistry module is extracted at the new vintage.

**Recommended action at the gate: approve A, conditional on the two §6 table cells (2.1, 2.2) being corrected in the spec first** — they are text edits of one clause each, and 2.1 in particular is the difference between recovering 53 alt segments and shipping a silent no-op that every count-based gate reports green.