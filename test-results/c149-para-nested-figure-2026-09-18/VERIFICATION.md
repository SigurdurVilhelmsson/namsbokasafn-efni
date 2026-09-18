# §C149 ① — a para-nested `<figure>` in an example/exercise · VERIFICATION

**🧊 FROZEN 2026-09-18.** Evidence, never status. Status lives in the active register
(`docs/plans/2026-07-21-post-item17-followup-campaign.md`). If this file and the register
disagree, the register wins.

Branch `fix/c149-figure-in-para-hoist`, off `main` at `6f3f4a9e7` (the §C146/§C154 merge).
Cost **0 ISK**.

---

## 1. The defect

`figure` was in the dispatch map of **both** `renderExample` and `renderExercise` but in
**neither's `hoistTags`**, so `renderBlockChildrenInOrder` never detached it and
`renderPara` emitted it inside the `<p>`, raw, with its CNXML `<caption>` untransformed.

`<figure>` is not permitted in a `<p>`. A browser therefore closes the paragraph early and
treats the `</p>` as stray.

### What readers actually got — chemistry `10-exercises.html`, exercise 23 (m68764)

```html
<p id="fs-idm164104512">Þrátt fyrir að stál hafi meiri eðlismassa en vatn …<br/>  (heimild: Cory Zanker)<figure id="CNX_Chem_10_02_Needlefloa" class="scaled-down">
<img src="/content/efnafraedi-2e/chapters/10/images/media/CNX_Chem_10_02_Needlefloa_img.jpg" …/>
<caption>(credit: Cory Zanker)</caption>
</figure></p>
```

An HTML parser **drops a stray `<caption>` tag but keeps its text**, so the same credit
appeared **twice, in two languages**.

---

## 2. The logged exposure was wrong in the direction that matters

The register recorded *"chemistry has exactly 1 captioned `exercise/para` figure (m68764);
organic 0"*. That is true **of captioned figures only** — and a **bare** `<figure>` in a
`<p>` is equally invalid markup.

Parser census of `01-source`, unit = a `<figure>` whose parent is a `<para>` with an
`<example>`/`<exercise>` ancestor:

| book | container | captioned | bare | total |
|---|---|---|---|---|
| `efnafraedi-2e` | exercise | 1 | 0 | **1** |
| `lifraen-efnafraedi` | example | 0 | 10 | **10** |
| `edlisfraedi-2e` (withheld) | exercise | 23 | 14 | **37** |

**Live on published pages: 5, not 1** — chemistry `10-exercises.html` ×1, organic ch03
`3-2-alkanar…` ×1, `3-4-nafngiftir-alkana` ×2, `3-7-stellingar…` ×1. Measured directly
against the committed `05-publication/` trees.

▶ **Mutation M2 (revert the example site alone) turns 9 tests red**, so that second site is
independently load-bearing — the register merely suggested checking it.

### `media` is deliberately NOT hoisted, and the census is the reason

Same census for `<media>`: chemistry **204** in exercises + **6** in examples, organic 1,
physics 4. `<img>` **is** permitted inside a `<p>`, so none of these is a defect — hoisting
media would move every one of those 204 images out of its paragraph, a large reader-visible
layout change with no measured defect behind it. **Decided from the corpus, not from
symmetry with `figure`.** Mutation M4 pins it.

---

## 3. Instruments — and why one was not enough

### ⚠️ The per-module corpus render cannot see the chemistry case — so the ROLLUP was rendered

A `class="exercises"` section is excluded from its module page (`EXCLUDED_SECTION_CLASSES`)
and reaches readers only through the **chapter rollup**, which `renderCnxmlToHtml` never
builds. So the 491-module sweep reports **10** — all organic — and misses m68764 entirely.

🔴 **THAT IS A REASON TO REACH THE ROLLUP, NOT A REASON TO STOP AT THE EXERCISE.**
`renderCompiledExercises` **is exported**, so the third column of
`emitted → injected → RENDERED` (§C82 L149) is reachable. Verifying only `renderExercise`'s
fragment would pass on output **no reader is served** — precisely the failure §C82 L149
records (organic example titles reached the injected CNXML 102/102 and the RENDERED page
0/102). Both legs are measured:

| leg | instrument | `<figure>` in a `<p>` | `<figcaption>` | raw `<caption>` |
|---|---|---|---|---|
| the exercise fragment | `renderExercise` | **false** | present | absent |
| **the page readers get** | `renderCompiledExercises` | **false** | present | absent |

Both carry a positive control — the question's prose (*"a steel needle or paper clip"*) is
present in each, so a renderer that emitted nothing could not pass. Pinned by a test
([`m68764-exercise-probe.mjs`](m68764-exercise-probe.mjs) and
[`c149-rollup-probe.mjs`](c149-rollup-probe.mjs) are the frozen scratch instruments).

### ✅ A controlled pair separates §C149 ① from ②, by measurement rather than inheritance

The same rollup renderer, the same figure, the same page, differing only in how the CNXML
reached it — counting occurrences of `Cory Zanker` on the rendered page:

| arm | credit occurrences |
|---|---|
| `01-source` rendered directly | **1** |
| extract → inject → rendered | **2** |

▶ **The duplication is introduced at EXTRACT, and the renderer is innocent of it.** The
register asserted this; the pair confirms it instead of carrying the claim forward. It also
hands ② a ready-made detector: the fix should move that number **2 → 1** on the rendered
page — the column readers actually receive.

### 🔴 The unit probe's first predicate was GREEDY and reported a false RED

`/<p[^>]*>[\s\S]*<figure/` matches a `<figure>` emitted **after** `</p>`, so it reported the
defect as still present on correctly-fixed output. The corpus harness had used the
non-greedy `/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?<figure/` from the start — **two instruments
disagreeing is what exposed it.** A false red is the safe direction; the identical bug in
the other arm would have read broken output as clean. **The scan must not cross a `</p>`.**

### ⚠️ `rawCaption` is keyed on the `<figure>` parent, and a bare count is meaningless

A first pass counted `<caption` anywhere and reported **161** corpus-wide. `<caption>` is
**valid HTML** as a direct child of `<table>`, and `renderTable` emits exactly that for every
table label — so 161 was almost entirely legitimate. Re-keyed on a `<figure>` parent it is
**0**. ▶ Same tag-name collision that made `<figure: 862` meaningless in §C146's census:
**CNXML and HTML share tag names, so a bare tag census over rendered HTML measures the wrong
population.**

---

## 4. Corpus verification — EN round-trip over all 491 modules of both kept books

Harness: [`corpus-render-harness.mjs`](corpus-render-harness.mjs).

| metric | before | after |
|---|---|---|
| `<figure>` inside a `<p>` | **10** | **0** |
| raw `<caption>` inside a `<figure>` | 0 | 0 |
| empty `<p></p>` | 0 | **0** |
| render errors | 1 (the known §C145 gate hit on `m00061`) | 1 |

**Byte-identity: 483 of 491 identical; the 8 changed are exactly the 8 predicted, by name** —
organic `m00028`, `m00033`, `m00035`, `m00038`, `m00045`, `m00051`, `m00054`, `m00070`.

### The check that matters most: hoisting moved the figure and nothing else

Text content (all markup stripped, whitespace collapsed) compared before/after on each of
the 8 changed modules: **identical in all 8**, character for character. A structural change
that silently dropped prose would be invisible to the `figInP` metric, so this is its
control.

### Why no empty paragraph appeared — an existing guard, not luck

`renderExample`'s `paraHandler` ends in `if (contentWithoutTitle.trim())`, so a para left
whitespace-only after hoisting emits nothing. Of organic's 10, **7 are figure-only after the
title strip** (suppressed) and **3 carry body text** (kept). That predicts `emptyP: 0 → 0`
exactly, which is what was measured. The behaviour is now pinned by a test.

### 📋 Latent, logged and deliberately NOT fixed

`renderExercise` uses `renderSectionContent`'s plain `para: renderPara` and has **no**
empty-para guard, and physics (withheld) has **26 figure-only exercise paras**. Those would
emit 26 empty `<p>`.

**It is not a regression:** today they already render as `<p><figure/></p>`, which a browser
turns into an empty paragraph plus the figure — **the rendered result is identical**.
Guarding it would mean changing `renderSectionContent`'s shared para dispatch, a far wider
blast radius than this fix warrants. Revisit if physics is ever un-withheld.

---

## 5. Tests

`tools/__tests__/cnxml-render-para-nested-figure.test.js` — **17 tests, all passing.**

Every null has a control: *"no figure inside a `<p>`"* is paired with **"the figure is
rendered AFTER the `</p>`"**, because a renderer that **dropped** the figure entirely would
satisfy the first. The corpus legs assert `<figure` is still present for the same reason.

⚠️ One assertion was **over-specified and failed on correct output**: `toContain(
'<figcaption>Credit line</figcaption>')`. A numbered figure's caption legitimately opens
with `<span class="figure-label">Mynd N.N</span>`. The renderer was right; the expectation
was wrong. It now asserts the **property** (caption text inside a `figcaption`, no raw
`<caption>` surviving), not one rendering of it.

### Mutation-tested against the broken code — 4 rounds

Golden copy taken before the first mutation; restored and `cmp`-verified after every round.

| round | mutation | red | verdict |
|---|---|---|---|
| M1 | revert `figure` hoist at **both** sites | **13 of 16** | the whole fix (before the rollup leg) |
| M2 | revert the **example** site only | **9 of 16** | example + all 8 organic corpus legs |
| M3 | revert the **exercise** site only | **4 of 16** | exercise legs + the m68764 corpus leg |
| M4 | **also** hoist `media` (the over-reach) | **1 of 16** | exactly the media guard |
| M5 | revert both sites, **with the rollup leg added** | **14 of 17** | the rollup leg is a real assertion, not vacuous |

▶ **M2 and M3 are the point:** each site is killed independently, so neither is a
symmetry-only change, and M4 shows the deliberate non-change is pinned too.

---

## 6. Suite — compared against CI's own floor, by name

| arm | Test Files | Tests |
|---|---|---|
| `main` (CI run `35285243721`, sha `0577af980`) | 13 failed | 36 failed / 6,545 passed / 18 skipped (6,599) |
| §C149 branch (local) | 13 failed | 36 failed / 6,598 passed / 1 skipped (6,635) |

Parser proven against each run's own summary count first (13 = 13, 36 = 36).
**0 only-branch, 0 only-main — IDENTICAL on BOTH axes.** Totals 6,619 → 6,635 = **+16**,
exactly this change's new file.

⚠️ CI job logs were read through the REST `actions/jobs/<id>/logs` route, which prefixes every
line with an ISO timestamp and ANSI codes; both must be stripped or a naive matcher silently
reports zero failures.

---

## 7. What this does NOT fix

- **The duplicated credit line remains.** §C149 ② — the extract-side half, recorded as C13
  follow-up 2 — flattens the figure's caption prose into the paragraph's own segment text
  (`[[MEDIA:1]] (credit: Cory Zanker)`). After this fix a reader still sees the credit in
  the paragraph **and** in the figcaption. **This fix owns the raw markup and the caption
  element; it does not own the duplicate.**
- **The caption stays English on m68764 until that module is re-injected.** §C148 makes it
  Icelandic at the next inject, which is refused today pending re-MT.
- **Nothing is re-rendered or published.** The 5 live pages keep the raw markup until the
  affected chapters are re-rendered — chemistry ch10 and organic ch03, in addition to the
  chemistry ch04/ch17 and organic ch03 that §C146 already owes.
- ✅ **The faithful-overlay hazard was checked and does NOT apply.** A fix landing only in
  `mt-preview` can miss the page readers actually get when a `faithful` overlay exists. Per
  track: chemistry `mt-preview` 1 (ch10), organic `mt-preview` 4 (ch03), **both `faithful`
  tracks 0** — and organic has **no `faithful` track at all** (only `mt-preview`), while
  chemistry's covers ch01 and ch03, not ch10. **So the "5 live" count and the re-render list
  stand.** Recorded because "it happens not to apply" is a different fact from "nobody
  looked".
- ✅ **The class is closed, and the pattern says why.** `renderBlockChildrenInOrder` has four
  call sites. Two pass **no** `hoistTags` — `renderChildrenInDocumentOrder` and `renderNote`
  — and therefore default to `Object.keys(dispatch)`, i.e. hoist-everything, which is correct
  and self-maintaining (`renderNote`'s own comment documents relying on it). The **only two
  that passed an explicit list** were `renderExample` and `renderExercise`, and **both** had
  the omission. ▶ **An explicit allowlist that must track a dispatch map drifts from it; the
  default cannot.** Prefer the default when adding a container.
