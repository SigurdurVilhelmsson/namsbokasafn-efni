<!-- FROZEN EVIDENCE — banner-dated 2026-08-16. Per CLAUDE.md § One source of truth this is
     EVIDENCE, never status. If it disagrees with the active register, THE REGISTER WINS. -->

<!-- ⚠️ AMENDED 2026-08-17 — the pre-planning verification gate. 52 claims in this document were
     re-derived from the tree; 43 confirmed, 3 falsifications upheld after adversarial
     adjudication, 3 overturned (this document was right and the verifier erred).
     Amendments are inline and banner-dated at §1, §6, §7 and §8. Nothing is silently edited.
     Evidence → test-results/c88-spec-verification-2026-08-17.md
     ▶ THE TWO THAT MATTER, both in §6's table: the problem/solution emit point names TWO of a
     THREE-function chain (a plan built on it is a corpus-wide no-op), and the entry row's
     mechanism cites an `addSegment` call that is never reached on that path. -->

> ## ⚠️ READ BEFORE PLANNING FROM §6
>
> **The design (approach A) is sound and the population is confirmed.** But §6's table — the part
> a plan author implements directly — has **two wrong cells**, both measured 2026-08-17 and both
> corrected in the amendment block immediately after the table. A plan written from the table as
> originally drafted recovers **144 of 197**, not 197, and the missing 53 fail *silently* with
> every count-based gate green. **Read §6's "⚠️ AMENDED 2026-08-17" block before writing tasks.**

# §C88 — reaching the 197 chemistry figure-alt attributes the extractor never visits

**Owns:** the measured population, the two [LEAD] rulings, the id-stability constraint that
shapes the whole design, the design itself, and the acceptance gate.
**Depends on:** **§C89** (translated alt must actually reach injected output). Emitting more
alt segments into a path that discards them produces more waste, not more coverage.
**Companion to:** §C81's design (which built the three capture paths this extends) and
`2026-08-13-remt-check-battery.md` (which owns the checks this moves).
**Cites, never restates:** pinned corpus numbers. Where this document and a committed test
pin disagree, **the test pin is the owner** — read it there.

---

## 1. Why this exists

Figure `alt` is what a screen-reader user hears instead of seeing the figure. §C81 made it
translatable everywhere the extractor already walks. **It does not walk everywhere.**

Measured 2026-08-16 with the shipped `checkAltCoverage` over all 149 chemistry source modules:

| | count | share |
|---|---|---|
| alt-bearing `<media>` in `books/efnafraedi-2e/01-source` | **1,149** | 100% |
| reachable by the extractor today | **952** | 82.9% |
| **unreachable — this item's population** | **197** | **17.1%** |

By `altReachability`'s own reason codes:

| reason code | count | modules |
|---|---|---|
| `bare-media-in-example` | 105 | 33 |
| `bare-media-in-problem` | 40 | 20 |
| `entry-not-in-figure` | 29 | 2 |
| `bare-media-in-solution` | 13 | 8 |
| `bare-media-in-note` | 10 | 7 |

⚠️ **Pre-existing and orthogonal to §C81** — these positions have never been visited for **any**
content type. Not a regression that branch caused.

> **⚠️ AMENDED 2026-08-17 — the *orthogonal* half is CONFIRMED; the *never visited* half is
> loosely worded and should be read in its corrected form.**
>
> **Confirmed:** alt extraction did not exist at all before §C81 — **0** `addSegment('alt'` calls
> in the pre-§C81 extractor, against a positive control of 22 `addSegment(` calls total. Chemistry
> alt coverage therefore went **0 → 952**, never 1,149 → 952. §C81 caused no regression here.
>
> **Corrected wording:** at these node locations a *different* element type **is** emitted — swap a
> bare `<media>` for `<para>SENTINEL</para>` and 16 of 16 are extracted. The defensible statement,
> which measures true at **0 of 197** against a **952 of 952** control, is: ▶ *no extraction walk
> ever reads a `<media>` in these positions.*
>
> One sub-case is stronger than the general claim and is worth carrying into §6: for the **29
> `entry` rows the host `<entry>` really does emit nothing at all** (sentinel test: 84→108 and
> 14→19 — every one of the 29 hosts is silent). The 84/14 entry segments those modules do emit come
> entirely from *other* cells.

---

## 2. Scope — RULED

> ⚠️ **BANNER 2026-08-17 — THE "OUT" RULING BELOW RESTS ON A PREMISE §C80 HAS SINCE VOIDED.**
> It reads *"213 of them sit in modules §C80 is not buying"*. §C80's 2026-08-17 scope-up buys
> **all 342 organic modules**, so **all 245 are now in purchased modules.** This spec is frozen
> evidence; **the register is status and the register wins.**
>
> ▶ **The IN scope is UNCHANGED and this item proceeds:** chemistry's 197 are still exactly the
> population, and organic's 245 stay out — but **for a different and stronger reason than the one
> written below.** They are excluded on *design* grounds, not spend: **0 of 245 carry a media
> `@id` or a figure `@id`**, the only two keys §C89's write-back can address. Emitting them would
> extract, pay for and discard — §C89's shape. That exclusion is now enforced mechanically, by the
> `if (!media.id) continue` guard in all four emitters.
>
> ⚠️ **Two consequences that are NOT discharged by this banner:** ① organic's 245 are now
> in-scope-and-unreachable, which is a gap needing its own item, not a scope footnote. ② **§8's
> acceptance gate is chemistry-derived** (197 unreachable of 1,149); organic's shape is 245 of
> 2,163 (11.3%), all one position, with 1,918 of 1,918 reaching injected output. **Re-state the
> gate for organic before organic module 1.**

**IN: chemistry's 197. Nothing else.** [LEAD] ruling, 2026-08-16.

**OUT:** organic's 245 `entry-not-in-figure` alts — **0 of 245 carry an id**, and **213 of them
sit in modules §C80 is not buying**; only 32 are inside the purchased preview. A separate,
smaller decision later. The other three books are outside §C80 entirely.

### 📌 The two "32"s are ONE population — settled by measurement, and the clean argument was wrong

§C81 recorded "the id-less case is now 32 attributes, all in organic" and shipped at "organic
preview **100/132**". This item measured **32** id-less `entry-not-in-figure` alts in organic's
preview. **Same set.** Organic's preview holds **132** id-less alt-bearing `<media>`: **100
inside `<figure>`** (reachable — exactly §C81's 100) and **32 inside `<entry>`** (unreachable).
`100 + 32 = 132` reconciles §C81's shipped figure exactly.

⚠️ Recorded because the wrong answer was the plausible one. The first reading was that the sets
*must* be disjoint since one position is reachable and the other is not — a clean structural
argument that is false, because these 32 are **both** id-less **and** in table cells. §C81 named
them by the first property, this item by the second. ▶ **Two descriptions of one population read
exactly like two populations.**

---

## 3. Sequencing — RULED, and now PROVEN necessary

**C88 blocks the §C82 run.** [LEAD] ruling 2026-08-16, and unlike the ruling it was originally
based on, this is now measured rather than assumed.

### 🔴 3.1 The id-stability check — the finding that governs this entire design

The original argument for relaxing C88 to a follow-up was: all 197 media carry their own id, so
`altElementId` returns `` `${mediaId}-alt` `` — derived, stable, incapable of renumbering
anything. **That argument is true and irrelevant, and acting on it would have corrupted the run.**

`addSegment` increments a **shared** `counters.segment` on every call, and:

```js
function generateSegmentId(moduleId, type, elementId, counter) {
  if (elementId) return `${moduleId}:${type}:${elementId}`;   // derived — safe
  return `${moduleId}:${type}:auto-${counter}`;                // positional — SHIFTS
}
```

So **any inserted `addSegment` call shifts every later `auto-N` id in that module.** That
population is not marginal:

| chemistry | |
|---|---|
| segments total | 22,466 |
| positional `auto-N` ids | **6,085 (27.1%)** |
| modules containing at least one | **149 of 149** |
| by type | `entry` 5,824 · `title` 149 · `abstract` 112 |

**Measured directly.** One simulated C88 emitter inserted early in `m68865`, then the id→text
mapping compared:

| | |
|---|---|
| ids whose text is UNCHANGED | 78 |
| **ids now pointing at DIFFERENT text** | **1,404** |
| ids gone entirely | 2 |

```
m68865:entry:auto-3
  was: "Substance"
  now: "Standard Thermodynamic Properties for Selected Sub…"
```

⚠️⚠️ **AND THE FIRST MEASUREMENT OF THIS SAID "2 ids changed", WHICH WAS NEARLY THE OPPOSITE OF
TRUE.** Comparing id **sets** shows almost no movement, because `auto-3 … auto-1484` exist in
both sets — bolted onto **different content**. The set barely moves while the mapping shears by
one across the whole module. ▶ **Compare the id→content MAPPING, never the id set.** This is the
project's own "right property, wrong instrument" lesson, and it nearly produced a confident
recommendation to relax a blocking constraint.

▶ **The consequence is not lost translations — it is MISATTACHED ones.** Every table cell's
Icelandic text slides one position. Silent, and worse than a missing segment, which at least
announces itself.

▶ **This also corrects how the project's standing rule should be read.** Memory says *"extract-
traversal depth-blindness is LOAD-BEARING for the export corpus — do not rewrite it; it
renumbers frozen seg-ids (the join key)."* "Rewrite" reads as "reorder". It applies to **any
insertion anywhere before an `auto-N` segment**.

▶ **And it explains §C82's quarantine rule.** That rule is not conservatism; it is the only
correct response to this mechanism.

---

## 4. Non-goals

- **Not** organic, microbiology, biology or physics.
- **Not** a repair of the `auto-N` scheme itself. Making positional ids insertion-stable would
  permanently remove this class of run-blocker, but it changes the **join key of the export
  corpus** — its own item, its own risk, and not a prerequisite for C88. → §6, approach B.
- **Not** a fix for §C85 (inject dropping/duplicating whole `<media>` in organic). Adjacent
  shape, different cause; bundling makes both harder to review.
- **Not** a change to how alt is rendered. The published-page renderer is untouched.

---

## 5. What §C89 already settled, and what it did not

§C89 (merged on `fix/c89-alt-writeback`) fixed **write-back for figures**: `buildFigure` and the
note/example/exercise container builders now substitute a translated alt into preserved CNXML,
via a `collectFigureAlts` lookup keyed on **figure id**. Chemistry went 324→950 of 951, organic
1,675→1,918 of 1,918.

**What that does NOT cover, and C88 must:** C88's five positions are **bare `<media>` with no
`<figure>` wrapper**. A figure-keyed lookup cannot reach them. §C89's own single residual —
`m68801`, a bare media at `media < item < list < example` — **is exactly this shape**, and is
therefore the smallest live instance of C88's write-back problem, already pinned by name in
`tools/__tests__/alt-writeback-corpus.test.js`.

▶ **So C88 is two pieces, and the order matters: write-back for bare media in preserved
containers FIRST, emitters SECOND.** Emitting first produces segments that are extracted,
translated, paid for and discarded — §C89's defect, recreated deliberately.

---

## 6. Design

### Approach A — emitters + bare-media write-back, landed before extraction *(RECOMMENDED)*

Add the five emitters; add a media-id-keyed write-back lookup mirroring `collectFigureAlts`;
update `altReachability`'s model in the same commit so E5 does not go red; land before any
module is extracted. Accepts the `auto-N` fragility rather than fixing it.

**Why recommended:** smallest diff that closes the gap, and the sequencing constraint is
satisfied by *when* it lands rather than by changing anything risky. The write-back half is
already scoped by `m68801`.

### Approach B — repair the `auto-N` scheme first, then A

Make positional ids stable under insertion (derive from document position rather than emission
order), then land A. **Removes this class of run-blocker permanently** — future extraction
changes would stop invalidating already-purchased MT.

**Why not now:** it rewrites the join key the export corpus depends on, which memory flags as
load-bearing, and it would have to be verified against every committed `02-for-mt` vintage. That
is a larger item than C88 and should not be smuggled inside it. ▶ **Log it as its own item.**

### Approach C — accept 82.9%, revisit after the run

Cheapest. Leaves 197 figures serving English alt to screen-reader users in the book being bought
in full, and — because of §3.1 — makes a later fix cost a full re-extract and re-MT of chemistry.
**Not recommended**, but stated so the choice is explicit rather than inherited.

### The five emit points (approach A)

> **⚠️ AMENDED 2026-08-17 — "five" is a count of REASON CODES, not of code sites.** §1 lists five
> reason codes; this table has **four rows**, because `problem` (40) and `solution` (13) share one
> owner. A planner will hunt for a missing fifth row: **there is none.**
>
> ▶ **And do not read the row count as a count of functions to change either.** The
> problem/solution row spans **two** functions, not one — see the amendment below the table. The
> total number of code sites is **not asserted here**; derive it from the corrected rows when
> writing tasks, and state it once, in the plan.

| position | owner | walk visits it? | emit point |
|---|---|---|---|
| `example` (105) | `processExample` | **no** — extracts only paras/lists/equations/notes, and `processTopLevelContent` strips `example.fullMatch` before the standalone-media scan | new media pass after the para loop, using the existing strip idiom |
| `problem`/`solution` (53) | 🔴 **WRONG — see amendment ①** ~~`processExercise` → `orderedExerciseBlocks`~~ | **no** — returns only `para`/`list` kinds | 🔴 **INSUFFICIENT — see amendment ①.** ~~**the one natural document-order point**: `orderedExerciseBlocks` already sorts blocks by source offset; add `media` as a third kind~~ |
| `note` (10) | `processNote` | **no** | new scan after the para loop. ⚠️ **9 of 10 are notes nested inside `<example>`**, reached through a 5-arg `processNote` call with no `inlineMediaMap` — a direct `addSegment` works there; anything routed through `inlineMediaMap` silently misses 9 of 10 |
| `entry` (29) | `processTable` | **yes** — but calls `extractInlineText` without `inlineMediaMap`, so the media is stripped and `text` is `''`. 🔴 ~~and `addSegment` returns `null`~~ — **WRONG, see amendment ②: `addSegment` is never called** | inside the entry loop, where the empty text is discarded *(this cell is correct)* |

> ## ⚠️ AMENDED 2026-08-17 — two cells of the table above are wrong. Measured.
>
> ### ① `problem`/`solution` (53 alts): the emit point spans TWO functions; the table names one.
>
> **The real chain is `processExercise` → `emitExerciseSection` → `orderedExerciseBlocks`** —
> three hops. The omitted middle hop is **where the dispatch lives**. `emitExerciseSection` is at
> `tools/cnxml-extract.js:1688`, calls `orderedExerciseBlocks` at `:1704`, and is itself called
> from `processExercise` at `:1771` and `:1787`. The name appears **0 times** in this document as
> originally written (positive control: `orderedExerciseBlocks`, 1 occurrence).
>
> **Two-arm controlled experiment, all 149 chemistry modules:**
>
> | arm | alt delta | modules changed |
> |---|---|---|
> | the table's literal prescription — add a `media` kind in `orderedExerciseBlocks` only | **0** | **0** |
> | add a `block.kind === 'media'` branch in **`emitExerciseSection`** | **+53** | **24** |
>
> 🔴 **The literal prescription is a corpus-wide NO-OP, and it fails SILENTLY.** Instrumentation
> confirms the media blocks *do* reach the consumer — they fall through to the para branch, where
> `toText` returns `''` and they are dropped. No error, no count moves, every gate green.
> ▶ **That is §C89's exact shape, reproduced inside the document written to prevent it.**
>
> **Two riders the corrected row needs, neither obvious from the diff:**
> - **(a)** The alt-emitting machinery already exists at that call site —
>   `drainInlineMediaAlts(inlineMediaMap, addSegment)` → `addSegment('alt', …)`. So the consumer
>   branch is *small*. What is missing is a media block shaped so `extractInlineText` can see the
>   element: **the para branch passes `.content`, not `.fullMatch`.**
> - **(b) 🔴 The branch MUST also push a structure entry into `content`.** Emitting the alt segment
>   without one recreates §C89 literally — extracted, translated, paid for, nowhere to land at
>   inject. *(The verification arm that recovered 53 deliberately did NOT push a structure entry.
>   It was a positive control proving reachability, **not** a proposed patch. Do not copy it.)*
>
> ### ② `entry` (29 alts): `addSegment` is never called on this path.
>
> The table says the media is stripped, `text` is `''`, **"and `addSegment` returns `null`"**. The
> first two clauses are right; the third is wrong. **Both** `addSegment('entry', …)` calls in
> `processTable` sit inside `if (text)`. With `text === ''`, control reaches the **else branch at
> `tools/cnxml-extract.js:1465-1467`**, which pushes `{ segmentId: null, attributes }` **without
> ever entering `addSegment`**.
>
> Confirmed for **29 of 29** — all in the single-content branch, **0** in the multi-para branch —
> and proved by partition closure: empty-text entries === null cells (34===34, 5===5) alongside
> non-empty === real ids (84===84, 14===14).
>
> ⚠️ **Why this one is more dangerous than it looks.** There *is* an `addSegment('entry', …)` at
> `:1447`, in the **multi-para** branch. A plan author who goes looking for "the `addSegment` that
> returns null" finds it, wires the emit there, and fixes **0 of 29** — the branch is 0/29 for this
> population. ▶ **A false mechanism pointing at a real-but-wrong code site is worse than one
> pointing at nothing**, because the wrong site compiles, runs and passes review.
>
> **Everything else in the row is correct**, including "walk visits it? **yes**" and the prescribed
> emit point ("inside the entry loop, where the empty text is discarded").

⚠️ **Counter safety.** All 197 carry ids, so `altElementId` never consults the positional
fallback *for them*. That does **not** make insertion safe — see §3.1. It only means C88 adds no
*new* positional ids.

> **✅ CONFIRMED 2026-08-17** — all 197 do carry their own `id`. Also confirmed: the
> `deduplicateMedia` first-wins hazard below is real and reproducible, and it applies to **all four**
> C88 containers, not only examples. §C89 did avoid it by rewriting attributes in place with zero
> node construction.
>
> ⚠️ **And §3.1's id shear is now measured on a realistic emit point, not only on the synthetic
> position-zero probe:** in the corrected two-function exercise arm, **4 of 149 chemistry modules
> had positional `entry:auto-N` ids renumber** — with segment-list lengths *identical* on both
> sides (93/93, 263/263, 356/356). ▶ **Equal lengths, sheared mapping. The blocking ruling holds at
> the emit points C88 will actually use.**

⚠️ **`deduplicateMedia` hazard.** `buildExampleDom` keeps the **first** `<media>` by id, so a
newly-built translated copy appended after a preserved English one is **silently deleted** —
byte-for-byte the §C81 Critical's shape. §C89 avoided it by rewriting attributes **in place** and
never constructing a `<media>`; C88 must do the same.

---

## 7. What moves

- `altReachability` / `ALT_BLIND_DIRECT_PARENTS` and the `entry-not-in-figure` branch — the
  reachable/unreachable split changes in the same commit, or E5 goes red everywhere.
- ⚠️ The 🔴 comment in `extraction-coverage.js` warning **not** to add `'exercise'` to
  `ALT_BLIND_DIRECT_PARENTS` reasons from `1149 = 952 + 197` reconciling exactly, with no slack.
  **That reconciliation changes.** Re-derive the warning; do not carry it forward unexamined.
- Every committed pin recording alt counts. **Enumerate them by reading the pins, not the prose.**
- `alt-writeback-corpus.test.js`'s chemistry pin — `m68801` should stop being the residual.

> ## ✅ AMENDED 2026-08-17 — the enumeration, done by reading the pins
>
> The instruction above ("enumerate them by reading the pins, not the prose") was carried out.
> ⚠️ **This list is dated. Re-read the pins before trusting it** — that is what the original
> instruction is for, and it still governs. Predicted post-C88 values are marked `→`.
>
> | file | pin | class |
> |---|---|---|
> | `alt-coverage-corpus.test.js:45,46` | `reachable` 952 → **1,149** · `unreachable` 197 → **0** | moves |
> | `alt-coverage-corpus.test.js:51-57` | five-key reason `toEqual` → `{}` | moves |
> | `alt-coverage-corpus.test.js:91-93` | `reachableTotal` 952→1,149 · `emittedTotal` 951→~1,148 · shortfall `[{m68727, 6, 5}]` (module stays, pair changes) | moves |
> | `alt-coverage-corpus.test.js:40,47` | 149 modules · 1,149 total | **invariant** |
> | `alt-writeback-corpus.test.js:77,78,87` | chemistry `emitted` 951→~1,148 · `reached` 950→~1,148 · `dropped ['m68801']` → `[]` | moves |
> | 🔴 `alt-writeback-corpus.test.js:101-103` | **organic** 1,918 → **2,163**, `dropped []` at risk | **at risk — see hazard ⓐ** |
> | `extraction-coverage.test.js:207-208, 219-234, 279` | five unit fixtures `unreachable: 1` all invert; `{reached:2,expected:2,unreached:1}` → `{3,3,0}`; describe title at `:194` | moves |
> | ⚠️ `cnxml-extract-alt-corpus.test.js:94` | `positional` must stay `[]` — the new capture sites must not mint `media-N-alt` ids | **must not move** |
> | ⚠️ `cnxml-extract-alt-corpus.test.js:124,143` | duplicate-alt-**ID** `[]` | **must not move** |
> | 🔴 `cnxml-extract-alt-corpus.test.js:167` | organic duplicate-alt-**TEXT** `[]` | **must not move — see hazard ⓑ** |
> | `inject-roundtrip-corpus.test.js:134-139` | loss `['m00032']` / gain `['m00023','m00046']` | **must not move** |
> | `alt-writeback.test.js` (6× `toBe(1)`), `cnxml-extract-alt.test.js`, `alt-segments.test.js`, `cnxml-inject-alt.test.js`, `cnxml-render-alt-escaping.test.js` | — | **does not move** — no C88-blind fixture; the problem/solution fixtures nest media in a `<para>`, already reachable |
> | `test-results/c81-alt-extraction-2026-08-15.json` | 951 / 1,149 / 442 / 197 / 32 | **not a test — a frozen artifact that will silently disagree with the tree after C88** |
>
> ### 🔴 Two hazards this document does not otherwise mention
>
> **ⓐ Organic's pin moves even though §2 scopes the population to chemistry alone.** §6's `entry`
> emit point sits inside `processTable`, which is **book-agnostic**, and the corpus sweep runs the
> live extractor over all **342** organic source modules — not merely the 17 with committed
> segments. Expect organic `emitted`/`reached` 1,918 → **2,163** alt segments. ▶ **Either scope the
> emitter to the book, or move the organic pin deliberately and say so in the PR.** Silently
> re-baselining it is how a scope ruling gets widened without a decision.
>
> **ⓑ `cnxml-extract-alt-corpus.test.js:167` is at genuine risk, and the id-based pins cannot see
> it.** Organic's 245 `entry-not-in-figure` alts are **0-of-245 id-bearing**, so C88's entry
> emitter mints **id-less** segments there. Repeated table-cell alt text would then trip a
> duplicate-alt-**TEXT** pin while every duplicate-alt-**ID** pin stays green. ▶ **Different
> property, different instrument** — do not treat the ID pins as cover for the TEXT one.

---

## 8. Acceptance gate

**Three checks, and the first two must both pass or the result means nothing.**

1. **Coverage rose** — `checkAltCoverage`'s `unreachable` count for chemistry goes **197 → 0**,
   with the reachable total rising to 1,149.
   ⚠️ **State the gate as a DELTA, not as "1,149 of 1,149 emitted".** Two pre-existing shortfalls
   sit between "reachable" and "emitted" and **neither is C88's to close**: `m68727`'s
   regex-truncation drop (6→5, recorded out of scope by §C82 Plan A Task 9) and the
   `mediaAlt`-predicate edge divergences logged as §C87 ①. An absolute gate would be
   unachievable for reasons that have nothing to do with this item — and a gate that cannot pass
   gets relaxed by whoever meets it next, which is how a real check turns into a formality.
2. **The translations SURVIVE** — the §C89 sentinel (`alt-writeback-corpus.test.js`) reports
   chemistry's `reached` rising by the number of newly-emitted alt segments, with `m68801` no
   longer in the dropped list and no module newly appearing there.
   ▶ **Check 1 without check 2 is precisely the §C89 defect**: more segments extracted, more
   discarded, more money spent, no reader benefit.
3. 🔴 **Id stability, measured as id→TEXT mapping** — for every chemistry module, re-extract at
   the C88 vintage and confirm every pre-existing seg-id still carries the same text. **Compare
   the mapping, never the id set** (§3.1). This is expected to FAIL for `auto-N` ids, which is
   exactly why C88 must land before extraction; the gate exists to prove nothing has been
   extracted yet, not to prove the ids are stable.

> ## ⚠️ AMENDED 2026-08-17 — one correction, two things that were CHALLENGED AND HELD
>
> ### ③ Check 1: one of the two named shortfalls contributes **zero**. *(correction)*
>
> Check 1's rationale names **two** pre-existing shortfalls between "reachable" and "emitted".
> Measured: the gap is **exactly 1 alt segment**, all of it `m68727` (pinned as a single-element
> array). **§C87 ① is latent and worth 0** — and structurally so, not just today: across all five
> content books, alt-only-on-`<image>` = **0** and `<media>` with more than one `<image>`
> descendant = **0**, so the image-fallback half of the `mediaAlt` predicate **cannot fire on this
> corpus**, including on the 197 after C88 widens the reachable set.
>
> ▶ **The conclusion is unaffected — state the gate as a DELTA — and it rests soundly on `m68727`
> alone.** Keep the §C87 ① reference, but move it from "shortfalls to budget for" to "latent risks
> C88 inherits". A planner who budgets for two sources of slack and finds one will assume they
> mismeasured.
>
> ### Check 1's field names: a wording nit, **not** a defect. *(challenged, overturned)*
>
> `checkAltCoverage` returns **`unreached` / `expected`**; **`reachable` / `unreachable`** are
> `altReachability`'s keys. Both are the source's own concept vocabulary and the committed pin uses
> the same words, so the check is unambiguous as written. Optional rewording if you touch it:
> *"`altReachability`'s `unreachable` 197 → 0 and `reachable` 952 → 1,149 — i.e. `checkAltCoverage`'s
> `unreached` → 0 and `expected` → 1,149."*
>
> ### 🔴 Check 3 is SOUND. A challenge that it is an unpassable gate was REFUTED. *(overturned)*
>
> Recorded because the challenge is the plausible reading, and acting on it would relax the
> blocking constraint — the same failure §3.1 already narrowly avoided once.
>
> The challenge held that check 3 cannot pass, protects no existing mapping, and is really a
> precondition mis-filed as an acceptance criterion. **The empirical leg is false.** The mapping
> check 3 protects is **not** alt ids — it is the pre-existing **non-alt `auto-N` ids**, which
> exist in duplicate and are **money-backed**: 6,085 identical `auto-N` ids on the `02-for-mt`
> source side *and* on the purchased `02-mt-output` side, with the same 4,889 `:para:` control on
> both. Shear those and you have misattached Icelandic text in a corpus you have already paid for.
>
> ▶ **Residual, and it is taxonomy rather than substance:** filing check 3 under "Acceptance gate"
> rather than a Preconditions block is *loose, not wrong*. Read it as: **"prove nothing has been
> extracted at the C88 vintage yet"** — which is checkable, and which **measured TRUE on
> 2026-08-17** (three independent instruments, each with a positive control in the same command;
> see the verification artifact). **That window is what makes approach A cheap, and it closes the
> moment any chemistry module is extracted.**

**Positive control for each:** the in-`<para>` and standalone positions must stay at 100%
throughout. A sweep that examined nothing reports clean, and this project's rule is that an
absence is not an answer.

---

## 9. The failures this exists not to repeat

- **§C81's Critical** — a fix stripped `alt` from 14 media while every extraction-side count
  stayed clean and 4,600+ tests stayed green, because `structure.inlineMedia` carried no `alt`
  key and `readAlt(undefined)` was falsy. **The segments were right; the rendered CNXML was
  wrong.** C88 adds five capture positions — five new chances for that exact shape.
- **§C89** — the same class one level up: translations extracted and paid for, then discarded by
  a preserved-verbatim builder, with every count-based gate green.
- **§C89's own fix, first cut** — reading the translation through `readAlt(alt, getSeg)` recorded
  a *missing segment*, which made inject REFUSE every pre-§C81 vintage module. **Alt substitution
  must be best-effort**: translate when a translation exists, leave the source alone when it does
  not. §C82 runs both vintages simultaneously for weeks.
- **The id-set measurement in §3.1** — the first instrument said "2 ids changed" and the true
  answer was 1,404. Right property, wrong instrument, and it nearly relaxed a blocking constraint.
