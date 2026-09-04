# Term English glosses: from inline prose to a `data-en` attribute

> **FROZEN DESIGN RECORD — written 2026-09-01.** Evidence, never status. Progress on this
> item lives in the active register's ⏩ RESUME block (`docs/plans/2026-07-21-post-item17-followup-campaign.md`);
> if this document and the register disagree, **the register wins**. Every number below was
> measured on 2026-09-01 against the corpus as it stood after the §C118 paid run; re-measure
> before relying on one.

## 1. What this changes, in one sentence

The English gloss a reader sees after a term — `Hreyfifræði (e. dynamics)` — stops being
**text spliced into the translation at inject** and becomes a **`data-en` attribute emitted at
render**, which vefur turns into visible, toggleable presentation.

## 2. Why

Three problems, one cause: the gloss is currently written into the segment text.

- **It corrupts nested terms (register ⑰).** `annotateInlineTerms` rewrites
  `[[term:X|id]]` → `[[term:X (e. EN)|id]]`, and its `TERM_TEXT` pattern tolerates **one**
  level of nested markers while the corpus has **two**. On
  `[[term:tala Avogadros ([[i:N[[sub:A]]]])|term-00003]]` the match truncates, and a literal
  unresolved `[[term:` reached written CNXML in m68700. Measured: **6 of 1,542** term markers
  nest two levels (chemistry ch03/ch06/ch08/ch19; organic 0).
- **It is unstylable.** The English lands inside the `<dfn>` text node with no markup and no
  attribute, so vefur cannot hide, toggle, restyle or relocate it.
- **It pollutes `03-translated`.** That tree is meant to track source structure for the
  OpenStax remerge; editorial text added to a `<term>` works against that.

A fourth, and the reason this is cheap: **vefur already built the consumer.**
`src/lib/actions/glossaryTerms.ts` documents a three-tier match whose **tier 1 reads
`dfn.getAttribute('data-term')` — an attribute efni emits zero times**, in source and in every
published file. vefur has been running on tier 2 and tier 3 only.

## 3. What was measured, and what each number decides

| Measurement | Result | What it decides |
|---|---|---|
| Published terms matching the shipped glossary by Icelandic string | **282 of 795 = 35.5%** | vefur **cannot** derive the English itself. Misses are inflection: `tilgátu`, `kenningar`, `efnasambönd`, `Smásæja svið`. |
| Extracted English term texts resolving to an Icelandic lemma | 57.7%, **77.9%** with singularization | A `data-term` lemma attribute would be **partial**; dropped from this design (§7). |
| Extracted `[[term:…]]` markers carrying an id | **1,406 of 1,406** | The inline-prose join key is universal. |
| Injected `<term>` elements **without** an id | **765 of 1,656 = 46%** | A second population exists; covering only the id-bearing one would be a regression. |
| Source `<definition>` elements carrying an id | **4 of 4** on m68700; segments already keyed `glossary-term:<defId>-term` | The second population has an **exact** join key too — no fuzzy matching anywhere. |
| Collisions between `<term>` ids and `<definition>` ids | **0** (24 term ids, 762 definition ids) | One flat map is unambiguous. |
| `<dfn>` id uniqueness | unique **within a module**; collide across a chapter (`term-00001` ×4) | The join must happen where module scope exists — i.e. in render, not in vefur. |
| Terms glossed today in the freshly-run chapters | chemistry ch03 **16 id-bearing + 16 id-less**; organic ch03 **38 + 0** | The no-regression acceptance number. |

## 4. Design

### 4.1 Producer — `tools/cnxml-extract.js`

Extract already holds every join key paired with its English. It writes one map into the
existing per-module manifest; **no new artifact**.

```jsonc
// books/<book>/02-structure/chNN/mNNNNN-manifest.json
{
  "version": 1,
  "moduleId": "m68700",
  "extractedAt": "2026-09-01T16:51:41.260Z",
  "sourceHash": "8b0d4d033c6a1cce",
  "elementIds": { "figure": [], "table": [] },
  "termEnglish": {
    "term-00001":     "formula mass",
    "fs-idp40901280": "Avogadro's number (NA)"
  }
}
```

- **Inline prose terms** are keyed on the `<term id>` extract already emits in
  `[[term:EN|term-0000N]]`.
- **Glossary definition terms** are keyed on the parent `<definition id>`, which the segment
  layer already uses (`SEG:m68700:glossary-term:fs-idp40901280-term`).
- Values are **plain text**. `Avogadro's number ([[i:N[[sub:A]]]])` must be flattened at write
  time, so the consumer stays trivial and no marker can leak into an attribute.
  ⚠️ **The existing helper is `stripTermMarkersToText`, and it lives in `tools/cnxml-inject.js:849`
  — not in `tools/lib/`.** Importing it from `cnxml-extract.js` would create a new dependency
  between the two largest tools in the pipeline. **Move it to `tools/lib/` as part of this
  work** (it takes `(text, equations)`, both of which extract already has), rather than
  reaching across.
- ⚠️ **The same term legitimately appears in BOTH key spaces and that is not an error.** In
  m68700, `term-00001` and `fs-idp40905984` both resolve to `"formula mass"` — the inline
  mention and its glossary definition. Chemistry ch03 shows this as a mirrored 20 id-bearing /
  20 id-less. Duplicate *values* under distinct keys are expected; duplicate *keys* are not
  (§6.2).
- The manifest is chosen over a new sidecar because it already carries `sourceHash` and
  `extractedAt` (§4.4) and already establishes the per-module id-registry pattern via
  `elementIds`. `02-structure/` is GENERATED, so a re-extract regenerates it at zero cost.

### 4.2 Consumer — `tools/cnxml-render.js` and `tools/lib/cnxml-elements.js`

> 🔴 **AMENDED 2026-09-03, MEASURED — §4.2's THREE-SITE ENUMERATION IS WRONG IN KIND, NOT
> COUNT. Read this before the text below.** *(Amended, not rewritten: this is a frozen design
> record. The original stands as evidence of what was believed.)*
>
> - **Site 1, `renderTerm`, has ZERO callers.** Exported dead code. Patching it changes no
>   rendered byte, and a test importing it directly passes while asserting on an unreachable
>   function. ⚠️ The naive grep returns 2 hits for `renderTerms`, **plural** — an unrelated
>   browser function in `server/views/my-work.html`.
> - **Site 3 is unreachable for the population it was chosen to serve: a glossary
>   definition's `<term>` never becomes an id-less `<dfn>`.** `extractChapterGlossary` matches
>   `/<term>([\s\S]*?)<\/term>/` and passes `termMatch[1]`, so the tag is stripped before
>   `processInlineContent` ever sees it — **0 of 763** in-definition terms.
> - **§8's "✅ ANSWERED" resolves a scoping question in a function that never runs.**
>   `renderGlossary` is reached via `renderContent` matching `doc.rawContent` (i.e. `<content>`'s
>   inner), but **`<glossary>` is a SIBLING of `<content>` in 109 of 109 modules** that have one,
>   across both live books' READ-ONLY `01-source`. **0 are inside.** Not dead code — a synthetic
>   nested glossary reaches it — but unexercised by the corpus.
> - **The real second site is `renderCompiledGlossary`, and it emits `<dt>`, not `<dfn>`.** That
>   is outside the `dfn.term` contract §4.5 promises and outside what vefur's `glossaryTerms.ts`
>   walks. ▶ **This BLOCKS §4.7**: flipping `annotateEn` off would strip `(e. …)` from the
>   published `<dt>` elements with nothing rendering in their place, until either vefur widens
>   its walker or the `<dt>` wraps its term in a `<dfn>`.
> - **§4.4's vintage guard cannot fire, and its premise is false.** Both sides hash the same
>   immutable `01-source` file, so they agree across every extraction vintage (`sourceHash`
>   byte-identical across the committed vintages of `m68700-manifest.json` while `segmentCount`
>   moved 282 → 312). And extract does **not mint** `term-0000N` — those are OpenStax's own ids
>   in `01-source`. ▶ The real hazard is a **wrong-MODULE** map, because `term-0000N` restarts in
>   every module: a flat chapter merge is wrong on **31 of 79** ch03 `(module, key)` pairs, all
>   31 carrying different English — a HIT with the wrong value, which no count can see.
>
> ▶ **The corrected design lives in the plan's replaced Tasks 3–6**
> ([`2026-09-02-term-english-attribute.md`](../plans/2026-09-02-term-english-attribute.md)).
> Per § *One source of truth*, that plan and the active register win over this frozen record.

The map is threaded through the `context` object built at `cnxml-render.js:668`, which already
carries `moduleId`. **Three call sites emit a `<dfn>` and all three change:**

1. `renderTerm()` — `tools/lib/cnxml-elements.js:646`, the structured path.
2. The id-bearing regex branch — `tools/lib/cnxml-elements.js:802`.
3. The **id-less** regex branch — `tools/lib/cnxml-elements.js:805`. This one needs the
   enclosing `<definition>`'s id passed down. ✅ **RESOLVED 2026-09-02 by reading
   `renderGlossary`:** `cnxml-render.js:2001` binds `const id = def.id || null`, which **is**
   the `<definition>` id, and it is in scope at the exact call that renders the term. So this
   is a **scoped context clone, not a new parameter** — materially smaller than feared:

   ```js
   const termHtml = processInlineContent(termInner, { ...context, definitionId: id });
   const meaning  = processInlineContent(meaningMatch[1], context);   // deliberately NOT cloned
   ```

   🔴 **The scoping is the correctness detail, not the plumbing.** `renderGlossary` calls
   `processInlineContent` twice — once for the term, once for the meaning. Putting
   `definitionId` on a definition-wide context would let a `<term>` nested inside a
   **`<meaning>`** inherit the wrong English. Measured: **0 of 763** definitions do that today,
   so nothing is broken now — and it is scoped anyway, because exposure here is set by the
   corpus, not by the code.

> 🔴 **Site 3 is 46% of the corpus and is the one a plan omits.** §C118 ① needed "three sites,
> not the two that looked obvious" and a **fourth** was found on the paid-MT leg the same week.
> Do not treat this enumeration as complete — §6's acceptance test measures reach at the
> rendered HTML, which is what actually settles it.

Output: `<dfn id="term-00001" class="term" data-en="formula mass">formúlumassa</dfn>`.
Where the key is absent, the attribute is absent. Nothing else about the `<dfn>` changes.

### 4.3 Failure behaviour

A missing key degrades (no gloss on that term); it never corrupts. But a silent drop is this
project's recurring failure, so **render counts annotated vs skipped per module and prints
it**, in the style of inject's residue line. A number that moves is visible; an absence is not.

### 4.4 Vintage guard

Render compares the manifest's `sourceHash` against the module being rendered and **warns
loudly** on a mismatch.

This is not hypothetical. Extract **mints** ids for terms the source leaves un-id'd — m68700
carries 8 source `<term>` of which only 4 have an id — and minting is positional, so a stale
manifest shifts every inline term's English silently and plausibly. This is the same-unit,
same-vintage invariant §C82 L136 already names, made checkable at the point of use.

### 4.5 Presentation — namsbokasafn-vefur

**This half is vefur's and is specified here as a contract, not implemented from this repo.**

- **What efni promises:** `dfn.term` may carry `data-en` holding plain-text English. Absent
  when unknown. No other change to the element.
- **Rendering:** extend the existing `glossaryTerms.ts` action — it already walks every
  `dfn.term` node — to append a real `<span class="term-en"> (e. …)</span>`.
  **A real element rather than a CSS `::after`**, because generated content is not selectable,
  not copyable, and is announced inconsistently by screen readers. In a textbook a student may
  legitimately want to copy the English term. (`::after` remains the zero-JS fallback if the
  DOM approach is rejected; it loses all three properties.)
- **Toggle:** `showTermEnglish: boolean` in the settings store, default `true`, following
  `glossaryHighlighting` exactly — same `isBoolean` validator, same `set`/`toggle` pair.
- **Tier 1 finally works:** with a reliable English string on the element, vefur's existing
  `englishMap` + `singularize` path becomes exact instead of scraping the English out of
  display text.

### 4.6 Transition — both shapes coexist

Rollout is **per chapter**, as content is re-rendered. No big-bang re-render; `05-publication`
is already a mixed vintage and 94 of 149 chemistry modules currently refuse re-injection.

🔴 **The edge case that bites:** during rollout a page can carry an old inline `(e. dynamics)`
in the text **and** a new `data-en`. vefur must render `Hreyfifræði (e. dynamics)` and never
`Hreyfifræði (e. dynamics) (e. dynamics)`. Its existing `stripEnglishSuffix()` already detects
the inline form, so the rule is: **if the text already ends in `(e. …)`, add no span.** Tiers 2
and 3 continue to serve un-re-rendered chapters unchanged.

### 4.7 Retiring `annotateInlineTerms`

Flip `annotateEn` to default **off**, keep `--annotate-en` for one cycle, then delete the
function. This removes register ⑰'s entire class rather than the single instance, and it makes
m68700's current `--no-annotate-en` holding state simply the default.

## 5. Rejected alternatives

- **Inject writes the attribute into the CNXML `<term>`.** Simplest data flow — and forbidden.
  CLAUDE.md's clean-CNXML ruling prohibits resolving a pipeline gap "with a construct CNXML
  does not have"; a custom attribute on `<term>` is exactly that. It would also register as an
  attribute discrepancy in the fidelity check and pollute the remerge tree.
- **Ship an id→English map and let vefur join it.** `<dfn>` ids are module-scoped and collide
  across a chapter, so vefur would need module identity in the HTML plus a two-level lookup —
  more cross-repo coupling to reach where render already stands.
- **Let vefur derive the English from the shipped glossary.** Measured **35.5%**. Icelandic
  inflection defeats it, and no amount of client-side cleverness recovers the alignment that
  exists upstream and is destroyed downstream.
- **Also emit `data-term` (the Icelandic lemma).** Tops out at **77.9%**, duplicates
  singularization logic vefur already has, and buys nothing the reader sees — the parentheses
  render from `data-en`, which is 100%. Deferred, not forbidden: revisit only if tier-3
  matching proves insufficient in practice.

## 6. Acceptance

1. Extract writes both key shapes into the manifest — unit test over both populations.
2. The two key spaces are **asserted** disjoint, not assumed (0 collisions measured today).
3. **No regression in reach, counted at the rendered HTML**: every term glossed today carries
   `data-en` after — **16 + 16** in chemistry ch03, **38** in organic ch03. Counted at the
   output rather than at the manifest, because a manifest entry is not evidence that the
   renderer used it.
4. A stale-manifest `sourceHash` produces a loud warning, proven by a test that supplies a
   mismatched manifest.
5. A cross-repo assertion in the `tools/__tests__/css-contract.test.js` style pins that
   rendered `dfn.term` carries `data-en`.
6. Round-trip unaffected: `tools/source-roundtrip-check.js` on both ch03 chapters shows no new
   difference, and `tools/render-oracle-check.js --control` still passes on both books.

## 7. Out of scope, logged deliberately

- **`data-term`** — see §5. Revisit only on evidence that tier 3 is insufficient.
- **`cnxml-render.js:353` resolves its dictionary path with `path.join('books', …)`** —
  cwd-relative, which CLAUDE.md forbids because the server runs with `cwd=server/`. Found while
  reading this path; unrelated to this change and not fixed here. **Trigger: the next edit to
  `loadEquationTextDictionary` or any report of a render failing under a non-root cwd.**
- **Register ⑯ — a whole-segment `[[docref:]]` is never translated (49 of 49).** Same marker
  layer, different defect, and it is a **precondition on publishing organic ch03**. It is not
  resolved by this design and must not be assumed to be.

## 8. Open questions for implementation

> 🔴 **AMENDED 2026-09-03 — THE "✅ ANSWERED" BELOW ANSWERS A QUESTION ABOUT A FUNCTION THAT
> NEVER RUNS.** `renderGlossary`'s `<dt>` path is unreachable on this corpus: `<glossary>` is a
> **sibling** of `<content>` in **109 of 109** modules that have one, while `renderContent`
> matches against `<content>`'s inner. The glossary population's real destination is
> `renderCompiledGlossary`, which needs no `definitionId` context clone at all — `def.id` and
> `def.moduleId` are already loop locals on the line that writes the `<dt>`. **A correct answer
> to the wrong question.** Full detail in the §4.2 amendment above.

- ~~Does the glossary renderer's `<dt>` path reach `processInlineContent` with the definition
  id available, or does it need a new parameter?~~ ✅ **ANSWERED 2026-09-02 — see §4.2 site 3.**
  The id is in scope; a scoped context clone suffices, and the scoping (term yes, meaning no)
  is the part that matters.
- Should `showTermEnglish` default on for existing readers, or on only for new ones? The
  settings store persists, so an existing reader's stored object lacks the key — confirm the
  store's migration behaviour for an absent boolean.
