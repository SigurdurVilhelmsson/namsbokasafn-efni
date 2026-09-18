# §C155 — a `<figure>`'s `<title>` was extracted by nothing and rendered by nothing

**BANNER — FROZEN 2026-09-18.** This file is *evidence*, never status. If it disagrees with
the active register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`), **the register
wins.** Branch `feat/c155-figure-title`, stacked on `fix/c149b-figure-caption-leak` (PR #485).
0 ISK — every measurement below is free and needs no network.

---

## The defect

`processFigure` read a direct-child `<caption>` and stopped; `renderFigure` emitted the media
and the `<figcaption>` and stopped. The title survived untouched into the injected CNXML —
`buildFigure` returns the source block verbatim, swapping only caption/alt/src — and was then
dropped at render.

**It is a LOSS, not an English leak**, and that was verified *before* any code was written, on
organic ch06/m00081: the word `MECHANISM` does not appear anywhere in that module's rendered
HTML. Same symptom as §C150 (a `<table>`'s caption).

## Census — all six books, measured before building

**75 figures carry a direct-child `<title>`** (against 4,273 with a `<caption>`):

| book | titled figures | of which empty | notes |
|---|---|---|---|
| lifraen-efnafraedi | **69** | 3 | across 55 modules |
| liffraedi-2e (withheld) | 6 | **6** | all empty |
| efnafraedi-2e | 0 | — | |
| edlisfraedi-2e (withheld) | 0 | — | |
| orverufraedi | 0 | — | |

**61 of organic's 69 are the single word `MECHANISM`** (`class="mechanism-figure"`, OpenStax's
mechanism-box heading), 3 are empty, and 5 are real prose, all in ch02.

## Why build it with 0 readers affected

Organic ch03 is the only published organic chapter and holds **none** of the 69, so nobody sees
this today. What made now the moment is the opposite of urgency:

🔴 **0 of the affected modules hold committed MT**, so minting a new segment renumbers no
`auto-N` id that anything depends on. After those chapters are bought, this identical change
would invalidate 56 modules' translations. ▶ **The cheapest moment to add a segment is before
its module's MT exists.**

---

## The design fork, and why the clever option lost

61 identical `MECHANISM` titles invite a class-keyed label like `noteTypeLabels`. Rejected:

- `noteTypeLabels` exists because a CNXML `<note type="…">` carries **no text of its own**.
  Here the text is right there in the source.
- CLAUDE.md § *clean CNXML* — *"if it is in the source for a book, it stays in ours"*. A
  class-keyed label renders words absent from the CNXML and **diverges silently** if OpenStax
  edits a title without touching the class.
- The 5 prose titles need the segment path regardless, so the clever route builds a second
  mechanism to save nothing. MT renders a repeated token identically anyway, and a TM hit is free.

**Rendered as a bare `<h4>`**, matching `renderNote`'s title precedent, because class names are a
cross-repo contract: vefur's `content.css` styles `figcaption`, `.figure-label` and `.note-type`
and has **no** `.figure-title`. A new class would render unstyled until a coordinated vefur
change shipped. Styling is a vefur-side follow-up.

**All three legs use `firstDirectChildTitle`**, never a bare `/<title>([\s\S]*?)<\/title>/` —
that is depth-blind and would claim a nested `<subfigure>`'s title as the figure's own. §C82
L144 is the precedent: `getElementsByTagName('title')[0]` donated a paragraph's sub-heading to
301 of 301 chemistry examples, and **a populated slot holding the WRONG text is worse than an
empty one**, because no coverage count can see it.

---

## Corpus verification — before/after byte diff, all six books

| book | modules | identical | **changed** |
|---|---|---|---|
| lifraen-efnafraedi | 342 | 290 | **52** |
| efnafraedi-2e | 149 | **149** | **0** |
| edlisfraedi-2e | 283 | 283 | 0 |
| liffraedi-2e | 259 | 259 | 0 |
| orverufraedi | 159 | 159 | 0 |
| **total** | **1,192** | **1,140** | **52** |

Biology's 6 titled figures are **all empty**, so `addSegment`'s emptiness guard declines and its
extraction is byte-identical — the census and the diff agree without special-casing.

**At the id level, which is the unit that matters:**

- **49 modules gain ONLY a new `figure-title` id** — no shift.
- **3 also shift positional `auto-N` ids** (m00126 ×1, m00285 ×12, m00271 ×1). **All three hold
  no committed MT**, so the renumbering is inert.
- **0 modules lost any segment text** — the multiset of segment texts is preserved everywhere.

⚠️ **The first coverage control reported 3 "content losses" and they were all artifacts**: it
compared raw markdown LINES, so a `<!-- SEG:…:entry:auto-32 -->` marker whose number had shifted
read as vanished content. The segment still existed under a different number. **Compare segment
TEXT, not marker lines.**

**Segment totals emitted:** 64 `figure-title` segments across 52 organic modules, 0 in every
other book. Fully reconciled against the census: 69 organic titled figures = **64 extracted + 3
empty + 2 blocked by §C156**.

---

## The known gap — 2 figures, and a different defect is the cause

🔴 **2 of organic's titled figures gain no segment: ch29 `m00333` (fig-00001) and `m00335`
(fig-00002).** The cause is **not** this change. `processSection` matches its own title with a
depth-blind `/<title>([\s\S]*?)<\/title>/` and then **strips it**, so in those two modules it
takes the nested FIGURE's title — putting `MECHANISM` in the *section's* title segment and
leaving the figure with none. Verified pre-existing: identical before and after this change.

**Measured corpus-wide with a precise predicate** (does a section's title segment equal some
*other* element's own title?): **exactly 2 donations, both here. Chemistry is clean at 648/648,
physics 1,484, biology 1,974, microbiology 1,535 — all 0.** Logged as **§C156**; not fixed here
because that regex governs all **6,294** section titles in the corpus and needs its own
blast-radius measurement.

✅ **The render leg still improves those two**: `renderFigure` reads `figure.content` directly
and is untouched by the extract-side strip, so both titles now reach readers **in English**
where before they reached them in no language at all. Asserted. Deliberately **not** pinned as
"no segment exists" — a test that asserts a bug is present blocks the fix that removes it.

⚠️ **That census needed its normaliser fixed twice**, and it is the **third** asymmetric
normaliser of this session. Stripping `[[i:sp]]` wholesale deletes the word *sp* that really is
in the text, so 8 chemistry and 56 organic "mismatches" were manufactured. Unwrapping markers to
their CONTENT with `flattenMarkersToText`, on **both** sides, took chemistry to 0. The remaining
organic differences were representation (`[[xref:]]` for an empty `<link/>`, `[[MATH:N]]`
placeholders), which is why the final predicate asks the narrower question above instead.

---

## Mutation testing

Golden copies of all three files taken before the first mutation and restored from *those*
(never `git checkout --`, per CLAUDE.md); `cmp` after every round and once at the end. **All
three matched golden at the end.**

| mutation | result | reads as |
|---|---|---|
| M0 unmutated | 31 pass | baseline |
| M1 drop the EXTRACT leg | **7 red** | the segment is load-bearing |
| M2 drop the INJECT leg | **1 red** | the writeback is load-bearing |
| M3 drop the RENDER leg | **3 red** | the third column is load-bearing |
| M4 depth-BLIND title match | **1 red** | the `<subfigure>` control genuinely guards |
| M5 don't widen §C149 ②'s cut | **2 red** | the cut/owner coupling is pinned |

---

## The coupling with §C149 ②, which is the durable lesson

§C149 ②'s cut removes from a paragraph exactly what `processFigure` owns. Until this change
`processFigure` did **not** own a figure title, so the cut left titles alone — and the test that
asserted that **predicted its own death in writing**: *"if this test ever goes red because titles
ARE extracted now, delete the leak instead of this assertion."*

The moment `processFigure` began emitting `figure-title`, leaving the title in the paragraph
would have recreated §C149 ②'s duplicate for titles. So the cut was widened in the same commit
and that test inverted.

▶ **THE CUT AND THE OWNER MOVE TOGETHER, IN ONE COMMIT, IN BOTH DIRECTIONS** — widen the cut when
the owner widens, narrow it when the owner narrows. Neither alone is safe: owner-without-cut
duplicates, cut-without-owner loses. M5 pins it.

---

## Suite

Full `npm test` against the branch this stacks on, compared **by name**, both directions:

| | files | failed | passed | total |
|---|---|---|---|---|
| `fix/c149b-figure-caption-leak` | 13 | 36 | 6,618 | 6,655 |
| `feat/c155-figure-title` | 13 | 36 | 6,630 | 6,667 |

**only-on-C155: 0 · only-on-baseline: 0 — identical failing sets.** `+12` tests, all passing.
`npm run lint` and `npm run format:check` clean tree-wide.

---

## Reproduce

```bash
npx vitest run tools/__tests__/cnxml-figure-title.test.js                      # 12 pass
npx vitest run tools/__tests__/cnxml-extract-figure-caption-leak.test.js       # 19 pass
```

The corpus diff, the title census and the section-title donation census were one-shot harnesses
run against a `git show <base>:tools/cnxml-extract.js` sibling copy; their numbers are frozen
above. The durable assertions live in the test files.
