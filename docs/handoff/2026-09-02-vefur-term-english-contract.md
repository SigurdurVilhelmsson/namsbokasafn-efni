# Contract: `data-en` on term elements (efni → vefur)

**Written:** 2026-09-03 · **Branch:** `feat/term-english-data-attribute` (not yet merged)
**Spec:** [`docs/superpowers/specs/2026-09-01-term-english-attribute-design.md`](../superpowers/specs/2026-09-01-term-english-attribute-design.md)
— ⚠️ read its **2026-09-03 amendments** under §4.2 and §8; the original three-site enumeration
is wrong.
**Plan:** [`docs/superpowers/plans/2026-09-02-term-english-attribute.md`](../superpowers/plans/2026-09-02-term-english-attribute.md)

> Every number here was measured on 2026-09-03 against the corpus as it then stood. **Re-derive
> before relying on one**, and note the counting unit — this contract states it every time,
> because the plan this replaced shipped a bug from transposing "`<term>` elements in CNXML"
> with "rendered `<dfn>` elements".

## What efni now emits

```html
<dfn id="term-00001" class="term" data-en="formula mass">formúlumassa</dfn>
```

- `data-en` holds **plain-text English**, **original case**, no marker syntax.
- It is **absent** when the English is unknown. Absence is normal, not an error.
- Nothing else about the element changed.
- It appears only in **re-rendered** chapters. Rollout is per chapter.

### 🔴 …on TWO element shapes, and vefur only consumes one of them

| shape | where | ch03 count (rendered elements) |
|---|---|---|
| `<dfn id class="term" data-en>` | section pages | chemistry **20**, organic **39** |
| **`<dt id data-en>`** | `*-key-terms.html` | chemistry **20**, organic **0** |

`src/lib/actions/glossaryTerms.ts` walks `dfn.term`. **A `<dt data-en>` is invisible to it**, so
the key-terms half has no consumer today. Emitting it is additive and reader-invisible, so it
ships — but a choice has to be named:

- **(i)** vefur widens its walker to `dt[data-en]` — no efni change; or
- **(ii)** efni wraps the `<dt>`'s term in `<dfn class="term" data-en>` — an efni change that
  alters the key-terms DOM and is a `content.css` contract change to coordinate.

▶ **Until one is built and shipped, retiring `annotateInlineTerms` (spec §4.7) is BLOCKED.**
Flipping `annotateEn` off before then strips `(e. …)` from every published `<dt>` with nothing
rendering in its place.

*(Organic ch03's key-terms page **exists** — 4,438 bytes — but collects 0 definitions, so it
carries 0 `<dt>`. "No page" and "an empty page" are different things.)*

## What vefur should do

1. In `glossaryTerms.ts`, which already walks every `dfn.term`: append a real
   `<span class="term-en"> (e. …)</span>`. **A real element, not a CSS `::after`** — generated
   content is not selectable, not copyable, and is announced inconsistently by screen readers.
   In a textbook a student may legitimately want to copy the English term.
2. **Do not double-render.** A page may carry an old inline `(e. dynamics)` in the text **and**
   a new `data-en`. `stripEnglishSuffix()` already detects the inline form: if the text already
   ends in `(e. …)`, add no span.
   - 🔴 **DEDUPE ON THE MARKER, NEVER ON EQUALITY WITH `data-en`.** The inline gloss is
     **lowercased** by the inject-side annotator; `data-en` is **case-preserving**. Measured on
     the same element: `data-en="Avogadro’s number (NA)"` against published text reading
     `(e. avogadro’s number (na)`. **A string comparison between the two will never match**, so
     an equality-based dedupe renders the gloss twice.
3. 🔴 **`EN === IS` must not render `"R (e. R)"`.** Organic ch03's
   `<dfn id="term-00002" class="term">R</dfn>` has manifest English `"R"`. Today's
   `annotateInlineTerms` skips that case; the presentation layer must skip it too.
4. Add `showTermEnglish: boolean` to the settings store, default `true`, following
   `glossaryHighlighting` exactly — same `isBoolean` validator, same `set`/`toggle` pair.
5. Tier 1 of the three-tier match can now use `data-en` against `englishMap` instead of scraping
   the English out of display text.
6. Add a test in vefur's own suite that fails if `data-en` stops being read. **efni cannot pin
   this from its side today** — the consumer does not exist, so an efni-side assertion would
   assert nothing, which is worse than no test. Once it exists, efni adds the mirror assertion in
   the `tools/__tests__/css-contract.test.js` style, which already reads vefur's
   `static/styles/content.css` across the repo boundary.

## ⚠️ A separate DOM change rides on the same branch

`fix(render): read the <term> id order-independently` corrects a pre-existing defect where
render required `id` to be a `<term>`'s **first** attribute and silently discarded it otherwise.
Measured over both live books, counting unit = rendered `<dfn>` element:

```
before   withId 810   idLess 83   conservation 893
after    withId 891   idLess  2   conservation 893
```

▶ **81 published `<dfn>` gain an `id=`.** Anchors, deep links, and **any vefur selector keyed on
`dfn[id]` presence** shift. Unrelated to `data-en`; flagged here because the cross-repo surface
is the same one.

## The gate that must not be skipped

efni keeps emitting the inline `(e. …)` gloss until vefur ships. **Tell efni when this is live**;
only then does efni flip `annotateEn` to default off and retire `annotateInlineTerms`, which is
the cause of register defect ⑰.

## Two structural limits — do not write a reach test against an impossible 100%

- **2 of 854** in-content chemistry `<term>` carry no id in READ-ONLY `01-source`
  (`ch04/m68709` *efnajöfnu*, `ch06/m68735` *samrafeinda*). Extract does **not mint** ids — they
  are OpenStax's own — so no id join will ever reach them. The ceiling is **852 of 854**.
- **510 of 523** manifests have no `termEnglish` key. Rollout is per chapter, on re-extraction;
  until then those chapters render `0/N` and the render log says so, naming the re-extract
  command. **That is the degrade rule working, not a code failure.**

## Not covered by this contract

Register **⑯** — a whole-segment `[[docref:]]` is never translated (49 of 49) — is a separate
defect in the same marker layer and is a **precondition on publishing organic ch03**. This
contract does not address it.
