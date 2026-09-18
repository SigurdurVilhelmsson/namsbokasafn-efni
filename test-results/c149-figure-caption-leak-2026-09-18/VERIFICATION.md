# §C149 ② — a para-nested `<figure>` leaked its caption into the paragraph's segment

**BANNER — FROZEN 2026-09-18.** This file is *evidence*, never status. If it disagrees with
the active register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`), **the register
wins.** Branch `fix/c149b-figure-caption-leak`, commits `75503f28d` + `74cc9f298`, from `main`
at `43a0438c5`. 0 ISK — every measurement below is free and needs no network.

---

## The defect

`extractInlineText` (`tools/cnxml-extract.js`) swapped `<media>…</media>` for `[[MEDIA:N]]`
and then let `stripTags()` remove every remaining tag **while keeping its text**. A `<figure>`
nested inside a `<para>` therefore lost its wrapper but left the `<caption>`'s *words* behind,
flattened into the paragraph's own segment:

```
Although steel is denser than water … possible.[[BR]] [[MEDIA:1]] (credit: Cory Zanker)
```

`processFigure` had **already** emitted that identical text as the figure's own `caption:`
segment. So the prose existed twice, and once translated readers of chemistry
`10-exercises.html` exercise 23 got the credit twice — **in two languages**
(`(heimild: Cory Zanker)` in the paragraph, `(credit: Cory Zanker)` in the figcaption).

§C149 ① owned the raw markup and the `<figcaption>`; this is the duplicate.

---

## Why no count could see it, and what did

Both copies are legitimately present. The caption element count is 1 in and 1 out; the segment
count does not move. This is §C89's rule in its second form: **a count cannot see a duplication
any more than it can see a substitution.**

The instrument that worked is a **controlled pair on the page a reader is actually served** —
the chapter exercises rollup, which `renderCnxmlToHtml` never builds per module:

| arm | route | `Cory Zanker` occurrences |
|---|---|---|
| 1 | `01-source` → rollup render | **1** |
| 2 | `01-source` → extract → inject → rollup render | **2** (before) → **1** (after) |

Arm 1 is the reference **and** the positive control: it proves the harness renders the credit
at all, so a `1` from arm 2 cannot be a page that rendered nothing. Pinned by
`tools/__tests__/cnxml-extract-figure-caption-leak.test.js`.

---

## The cut, and why it is exactly this size

Remove **exactly what `processFigure` owns and not one character more**: the figure's *first*
`<caption>`, matched with `processFigure`'s own pattern. Everything else in the figure is left
in place.

🔴 **A `<title>` is deliberately NOT removed. 75 figures corpus-wide carry a direct-child
`<title>` and `processFigure` extracts none of them** — so stripping titles would convert this
duplicate into a silent content loss. A duplicate is recoverable from the other copy; a loss is
not recoverable at all. Guarded by a test (mutation M2 below).

**Ownership census, the precondition for dropping anything** — for every para-nested figure in
all six books, is the text it leaks exactly the text `processFigure` takes?

| book | leaking figures | fully owned | **unowned (= loss)** |
|---|---|---|---|
| edlisfraedi-2e | 81 | 81 | **0** |
| efnafraedi-2e | 1 | 1 | **0** |
| liffraedi-2e | 71 | 71 | **0** |
| lifraen-efnafraedi | 0 | 0 | **0** |
| orverufraedi | 1 | 1 | **0** |
| stjornufraedi | 0 | 0 | **0** |

⚠️ **That table needed a predicate fix before it was true.** The first run reported **9**
unowned residuals in biology. All nine were an artifact: it compared the caption's *raw source*
against the leak's *decoded* text, so `A&amp;M` failed to match `A&M`. Decoding both sides
zeroed it. **A residual you manufactured with an asymmetric normaliser reads exactly like a
finding.**

The cut runs **before** the math and media passes on purpose: `counters` is one object shared
with `processFigure`, so a caption holding `<m:math>` consumed a `[[MATH:N]]` slot *twice*.

---

## Corpus verification — before/after byte diff, all six books

Extraction of every module run through both the pre-fix (`git show main:`) and post-fix
extractor, compared byte for byte.

| book | modules | identical | **changed** | para segments fixed |
|---|---|---|---|---|
| edlisfraedi-2e (withheld) | 283 | 266 | 17 | 33 |
| efnafraedi-2e | 149 | **148** | **1** | **1** |
| liffraedi-2e (withheld) | 259 | 203 | 56 | 71 |
| lifraen-efnafraedi | 342 | **342** | **0** | 0 |
| orverufraedi | 159 | 159 | 0 | 0 |
| **total** | **1,192** | **1,118** | **74** | **105** |

- **Chemistry changed exactly 1 module — m68764 — as predicted.**
- **Organic changed 0 of 342**, the negative control: all 10 of its para-nested figures are
  bare, so the fix is inert across the whole of the second kept book.

**Coverage control — 0 content loss.** For every line present before and absent after, the
remaining prose must still be reachable in some post-fix segment of the same module.
**74 modules, 0 unrecovered.**

⚠️ **That control also needed fixing first, the same way.** Its first run flagged **8** losses
because it stripped `[[MARKER]]` tokens from the probe and not from the text it searched. With
both sides normalised, 0. Twice in one session, the same asymmetry.

**Leak detector, before → after:** 86 leaks → **0**, across all six books.

---

## Two instruments disagreed, and the weaker one was wrong

The byte diff found **74** changed modules; a probe searching for the caption's DOM
`textContent` inside a para segment found only **70**.

The 4 it missed — biology `m66484`, `m66504`, `m66514`, `m66577` — all carry **inline markup in
the caption**, so the segment holds `Regulation of the [[i:lac]] operon` and no plain-text probe
can match it. They are genuine leaks; the probe was blind to them.

▶ **The byte diff is the authority. Do not re-derive this figure from a textContent search.**
Nothing but the disagreement would have surfaced it — the probe returned a clean, confident,
4-short answer.

Set comparison, by name, both directions: **every one of the 70 predicted modules changed; 0
leaks survived the fix.**

---

## `[[MATH:N]]` renumbering — measured, not argued

Ending the double count renumbers math *where a nested caption contained math*. Measured by
comparing each segment's placeholder list across the change:

**2 modules renumber. Both are withheld physics. 0 in chemistry, organic, biology or
microbiology.**

(A DOM count of "captions containing math" gives 25 paras. That is an upper bound on the
*opportunity*, not a count of what moved.)

**Segment ids do not move at all** — no segment is added or removed, so no positional `auto-N`
shifts. Verified on m68764: 138 ids before, 138 after, lists identical.

---

## Mutation testing

Golden copy taken before the first mutation and restored from *that* (never `git checkout --`,
per CLAUDE.md); `cmp` after every round and once at the end. Final tree matched golden.

| mutation | result | reads as |
|---|---|---|
| M0 unmutated | 19 pass | baseline |
| M1 revert the cut entirely | **4 red** | the fix is load-bearing; the tests are not vacuous |
| M2 also strip `<title>` | **1 red** | the over-reach guard genuinely guards |
| M3 strip *every* caption, not just the first | 19 pass | **NOT discriminating** |

⚠️ **M3 is recorded as a known blind spot, not as a pass.** The corpus contains **0** figures
with more than one `<caption>`, so no test can distinguish "first" from "all". The code matches
`processFigure`'s single-replace deliberately; if a second caption ever appears, this is the
assertion that will not catch a change.

---

## Suite

Full `npm test` on the branch and on `main` at `43a0438c5`, compared **by name**, both
directions:

| | files | tests failed | passed | total |
|---|---|---|---|---|
| main `43a0438c5` | 13 | 36 | 6,599 | 6,636 |
| branch | 13 | 36 | 6,618 | 6,655 |

**only-on-branch: 0 · only-on-main: 0 — the failing sets are identical.** `+19` tests, all
passing, all from the new file. The 13 red files are `main`'s documented floor and clear on
re-MT, not by a code change here.

Sibling corpus guards on exactly the elements touched — `alt-writeback-corpus`,
`caption-writeback-corpus`, `cnxml-render-para-nested-figure` — **21/21 green**.

---

## What this does NOT do: the reader is not reached yet

🔴 **The code fix cannot clear the live page on its own, and the reason is CLAUDE.md's
source-drift rule.** The fix changes the *English* under a stable segment id. The committed
Icelandic for `m68764:problem:fs-idm164104512` still ends:

```
… hvernig þetta er mögulegt.[[BR]] [[MEDIA:1]] (heimild: Cory Zanker)
```

✅ **No ledger entry is owed, because the module is ALREADY blocked.** Measured: current
extraction emits **138** segments for m68764 and the committed IS covers **127**, with **25
missing** (10 `alt`, the rest positional `entry` ids) and **15** IS ids no longer emitted.
m68764 is one of the 94 chemistry modules that cannot be re-injected pending re-MT — a
pre-existing §C118 vintage gap, **not** caused by this change (segment ids are identical across
it).

▶ **So ② is closed in code now, and closes for readers at chemistry ch10's re-MT, which was
already required for independent reasons.** Until then the duplicate stands on the live
`10-exercises.html`. **Do not read "§C149 ② fixed" as "the ch10 exercises page is clean."**

⚠️ **Re-extract before any paid `api-translate` for ch10** — it reads the GENERATED
`02-for-mt`, so buying without re-extracting would re-translate the old English, reproduce the
duplicate exactly, and exit 0.

---

## Logged, not fixed

- 🆕 **A figure's `<title>` is extracted by nothing.** `processFigure` reads only `<caption>`.
  **75 figures corpus-wide carry a direct-child `<title>`.** Same shape as §C150 (a `<table>`
  caption extracted nowhere). Not measured for reader-visibility here; on the leaking paras it
  currently survives *because* it leaks, which is why this fix deliberately leaves it alone.
- **M3's blind spot** above: 0 multi-caption figures exist, so the "first caption only" choice
  is untestable on this corpus.

---

## Reproduce

```bash
npx vitest run tools/__tests__/cnxml-extract-figure-caption-leak.test.js   # 19 pass
npx vitest run tools/__tests__/alt-writeback-corpus.test.js \
               tools/__tests__/caption-writeback-corpus.test.js \
               tools/__tests__/cnxml-render-para-nested-figure.test.js     # 21 pass
```

The corpus diff, ownership census and leak detector were one-shot harnesses run against a
`git show main:tools/cnxml-extract.js` sibling copy; their numbers are frozen above. The
durable assertions all live in the test file.
