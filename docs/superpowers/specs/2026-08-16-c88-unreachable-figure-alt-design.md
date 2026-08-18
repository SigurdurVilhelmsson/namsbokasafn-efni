<!-- FROZEN EVIDENCE — banner-dated 2026-08-16. Per CLAUDE.md § One source of truth this is
     EVIDENCE, never status. If it disagrees with the active register, THE REGISTER WINS. -->

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

| position | owner | walk visits it? | emit point |
|---|---|---|---|
| `example` (105) | `processExample` | **no** — extracts only paras/lists/equations/notes, and `processTopLevelContent` strips `example.fullMatch` before the standalone-media scan | new media pass after the para loop, using the existing strip idiom |
| `problem`/`solution` (53) | `processExercise` → `orderedExerciseBlocks` | **no** — returns only `para`/`list` kinds | **the one natural document-order point**: `orderedExerciseBlocks` already sorts blocks by source offset; add `media` as a third kind |
| `note` (10) | `processNote` | **no** | new scan after the para loop. ⚠️ **9 of 10 are notes nested inside `<example>`**, reached through a 5-arg `processNote` call with no `inlineMediaMap` — a direct `addSegment` works there; anything routed through `inlineMediaMap` silently misses 9 of 10 |
| `entry` (29) | `processTable` | **yes** — but calls `extractInlineText` without `inlineMediaMap`, so the media is stripped, `text` is `''`, and `addSegment` returns `null` | inside the entry loop, where the empty text is discarded |

⚠️ **Counter safety.** All 197 carry ids, so `altElementId` never consults the positional
fallback *for them*. That does **not** make insertion safe — see §3.1. It only means C88 adds no
*new* positional ids.

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
