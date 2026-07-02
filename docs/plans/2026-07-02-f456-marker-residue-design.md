# Design — F4/F5/F6: fix marker-residue inject bugs + "no `[[`" completeness gate

**Date:** 2026-07-02. **Status:** design approved by lead 2026-07-02 (both forks decided); ready for
the implementation plan. **Scope:** three marker-residue bugs in `cnxml-inject.js` + a hard-fail
output gate. **No regeneration** of committed `03-/05-` in this PR (deferred to the batched WS5 pass).
**Type:** injection correctness fixes + fail-loud gate.

Part of the chemistry clean-slate arc (`docs/plans/2026-07-01-chemistry-clean-slate-design.md`),
DO-NOW item #3 after F1/F2, per the Fable-5 review
(`docs/audit/2026-07-02-fable5-fidelity-provenance-review.md`, findings 4/5/6).

## Why this exists

Three independent inject bugs leak literal pipeline markers into published prose, and the completeness
gate never checks for them (it strips bracket markers before its EN-residue scan, so nothing catches
them):

- **F4 `[[TABLE:id]]`** (finding 4): `buildPara` expands `[[TABLE:]]` via `ctx.inlineTables` (1811),
  but `buildExerciseDom`/`buildExampleDom` inject para text **without** expanding it and then
  **unconditionally strip `<table>`** (2683). The placeholder publishes as literal text and the table
  floats out of its exercise.
- **F5 nested `[[i:[[link:…]]]]`** (finding 5): the bracket leaf-loop (1148-1178) only converts
  `i/b/sub/sup`; `[[link/xref/docref:]]` convert **once, after** the loop (1285-1301). An outer
  `[[i:]]` wrapping a link is non-leaf during the loop, then never re-processed → literal `[[i:`
  published, emphasis lost.
- **F6 `[[MATH:N]]` → `[[math:n]]`** (finding 6): `annotateInlineTerms` (820-827) strips
  `[[i/b/sub/sup:]]` from EN term text before `.toLowerCase()` but **not** `[[MATH:N]]`, so the
  placeholder is lowercased into an unrestorable `[[math:n]]` literal. The glossary path has the twin
  strip-chain.

## Verified universe (2026-07-02, live `03-translated/mt-preview`, `.backup.*` excluded)

Matches the audit exactly; **no 4th residue class exists**:

| Class | Occurrences | Modules | Container |
|---|---|---|---|
| `[[TABLE:` (F4) | 13 | 6 (m68764, m68770, m68789, m68791, m68793, m68829) | 12× `<exercise>`, 1× `<example>` — **none in `<note>`** |
| `[[math:` (F6) | 6 | 3 | inline term / glossary |
| `[[i:` (F5) | 2 | 1 (m68811) | nested `[[i:[[link:]]]]` |

**Design consequences:** F4 touches only `buildExerciseDom` + `buildExampleDom` (not `buildNote`). The
gate's universe is these three marker classes plus any future one.

## Constraints (inherited)

- **No committed `03-/05-` bytes change** in this PR. No re-inject, no re-render.
- **Robustness>expedience:** prefer the fix that kills a whole class over per-symbol whack-a-mole; the
  gate fails loud.
- One PR off `main` (split F4 out only if the DOM surgery balloons — lead decision); `npm test` from
  repo root is the gate; TDD/characterization first.
- The gate is **inject-time only** — no test greps today's committed output (it still has residue until
  the batched re-inject).

## Scope (decided by lead 2026-07-02)

**In scope:** the three fixes + the hard-fail gate + unit/characterization tests.

**Deferred (not this PR):** re-injecting the ~10 affected modules. Reason: re-inject runs against the
still-scrambled on-disk `02-structure` (F1's extract fix isn't regenerated yet), so it would
half-correct modules (markers fixed, order still wrong). Regeneration is the single batched pass
(F1 re-extract → these inject fixes → re-render) feeding WS5. The gate arms against **that** re-inject.

---

## F6 — strip all `[[…]]` placeholders before lowercasing

**Files:** `tools/cnxml-inject.js` — `annotateInlineTerms` (820-827) + the twin glossary strip-chain
(~1667, to be located precisely in the plan).

**Change:** the EN-term strip chain currently removes `[[sup/sub/i/b:]]` then `.toLowerCase()`. Add a
single strip of **any** remaining `[[TYPE:…]]` placeholder *before* the lowercase, so no placeholder is
ever case-folded into an unrestorable literal:

```js
const enTerm = enTermRaw
  .replace(/\[\[(?:sup|sub|i|b):([^\]]+)\]\]/g, '$1')     // unwrap inline emphasis/scripts
  .replace(/\{\{[ib]\}\}([\s\S]*?)\{\{\/[ib]\}\}/g, '$1') // legacy
  .replace(/\[\[[A-Za-z][\w]*:[^\]]*\]\]/g, '')            // F6: drop MATH/MEDIA/any placeholder
  .toLowerCase();
```

(Placeholders like `[[MATH:23]]` carry no translatable meaning inside a parenthetical "(e. …)" hint;
dropping them is correct and matches how the annotation is a plain-text reference.)

**Test:** an EN term containing `[[MATH:23]]` yields an annotation with **no** `[[math` and no
`[[MATH`; a term with `[[sup:2]]` still unwraps to `2`.

## F5 — resolve `[[link/xref/docref:]]` inside the leaf-loop

**Files:** `tools/cnxml-inject.js` — the `while (bracketChanged)` loop (1148-1178) and the current
post-loop link conversions (1285-1301).

**Change:** move `[[link:]]`, `[[xref:]]`, `[[docref:]]` conversion **into** the loop body (alongside
`[[i/b/sub/sup:]]`), each guarded to leaf-level (content has no `[[`/`]]`). Because the loop repeats
until stable, an outer `[[i:]]` becomes leaf-level once its inner link is converted and is picked up on
the next iteration — resolving `[[i:[[link:…]]]]` (and deeper) innermost-first. Remove the now-redundant
post-loop link block (or leave the legacy non-bracket link formats, which are unaffected).

**Test:** `[[i:[[link:Foo|http://x]]]]` → `<emphasis effect="italics"><link url="http://x">Foo</link></emphasis>`
with **no** `[[` residue; a plain `[[link:Bar|http://y]]` still converts; a deeper
`[[b:[[i:[[link:…]]]]]]` resolves fully.

## F4 — expand `[[TABLE:]]` in the exercise/example DOM builders

**Files:** `tools/cnxml-inject.js` — `buildExerciseDom` (2601), `buildExampleDom` (2307). Both must
receive `ctx` (for `ctx.inlineTables`) as `buildPara` does.

**Change:** where these builders inject a para's translated text into the DOM (e.g.
`replaceParaContentDom` in `buildExerciseDom.processContent`), expand `[[TABLE:id]]` first — the same
`ctx.inlineTables.find(...) → buildTable(...)` that `buildPara` uses (1811-1817). Reconcile with the
unconditional `<table>` strip (2683): a **characterization test** written first determines whether the
correct fix is *expand-before-strip* (place the built table so the strip doesn't remove it) or
*expand-and-exempt* (skip the strip for the table the placeholder names). The test is the source of
truth; the design commits to "the placeholder's table renders in place, exactly once, no residue."

**Test (characterization, write first):** a synthetic `<exercise>` whose problem para contains
`[[TABLE:t1]]` and whose original XML holds `<table id="t1">`; run `buildExerciseDom` with a `ctx`
providing `t1`'s structure; assert the output contains the built table **inline**, **zero** `[[TABLE:`
residue, and **no duplicate** table. Repeat minimal for `buildExampleDom`.

**If the DOM reconciliation balloons** (the strip/re-parse interaction proves deep), split F4 into its
own PR and ship F5+F6 with the gate in warn mode — per the lead's fork answer. Decision point: after
the characterization test reveals the real behavior.

## The gate — hard-fail "no marker residue in output"

**Files:** `tools/cnxml-inject.js` — after a module's translated CNXML is fully assembled, before it is
written (exact line located in the plan).

**Change:** scan the assembled module output for marker-form residue and **throw** on any hit:

```js
const residue = assembledCnxml.match(/\[\[[A-Za-z][\w]*:[^\]]*\]\]/g);
if (residue) {
  throw new Error(
    `Marker residue in injected output for ${moduleId}: ${[...new Set(residue)].slice(0, 10).join(', ')} ` +
    `— a [[TYPE:…]] placeholder was not converted. Fix the inject path before publishing.`
  );
}
```

**Marker-form, not bare `[[`:** the regex requires a `word:` prefix so it targets the placeholder
syntax (`TABLE`/`MATH`/`i`/…) and any future class, while leaving legitimately nested chemistry
brackets (e.g. a concentration `[[Ag(NH₃)₂]⁺]`) untouched — critical because a false positive would
abort inject.

**Hard-fail rationale (lead):** publishing literal `[[…]]` junk is worse than a loud abort; the fixes
eliminate all three live classes, so the future batched re-inject passes. Any new class fails loud and
is fixed at the source.

**Test:** an assembled string with a surviving `[[TABLE:x]]` throws; a clean string (and one with a
legit `[[Ag]]`-style non-marker bracket) does not.

## Components & isolation

| Unit | Purpose | Depends on |
|---|---|---|
| `annotateInlineTerms` strip (F6) | drop placeholders before lowercase | — |
| bracket leaf-loop (F5) | resolve nested emphasis+link innermost-first | — |
| `buildExerciseDom`/`buildExampleDom` (F4) | expand `[[TABLE:]]` in containers | `ctx.inlineTables`, `buildTable` |
| output residue gate | fail loud on any `[[TYPE:…]]` in output | — |

## Definition of done

- No live `[[TABLE:`/`[[math:`/`[[i:` residue is *producible* by inject for the affected modules
  (proven by unit/characterization tests on the builders + marker converter, not by re-injecting).
- The gate throws on any marker-form residue in assembled output; passes on clean output and on legit
  nested chemistry brackets.
- **No committed `03-/05-` bytes changed**; `npm test` + `npm run validate` green from repo root
  (the gate does not break existing inject tests — if it does, that reveals real residue the fixes must
  cover).

## Decisions (lead, 2026-07-02)

1. **PR structure** → one PR (all three + hard gate); split F4 out only if the DOM surgery balloons.
2. **Gate strictness** → hard-fail at inject time (robustness>expedience), armed for the batched
   re-inject.

## Split outcome (2026-07-02): F4 deferred to its own PR

F5, F6, and the gate shipped in this PR. **F4 was split out** (the lead-approved escape hatch fired)
after its characterization test surfaced a **root cause deeper than an inject-side strip fix**:

> **F4 root cause — extraction double-models inline tables.** In m68789, table `fs-idm121830912` is
> captured **both** as a standalone structure element (`section#fs-idm273385984 > table#fs-idm121830912`,
> emitted by the structure-tree walk via `buildTable`) **and** as an `inlineTables` entry referenced by
> `[[TABLE:fs-idm121830912]]` inside a `problem` segment (`m68789:problem:fs-idm84914160`). So expanding
> the placeholder inline is *additive* on top of the standalone emission → the table triples
> (`table: 14→16`, all `tgroup/tbody/row/entry/colspec` inflated; verified via `compareTagCounts`).
> The naive inject-side fix (expand + strip-only-non-para tables) passes an isolated synthetic exercise
> but duplicates on real modules. **The real fix is likely at extraction** (`cnxml-extract.js`): a table
> should be modelled *once* — either a structure element or an inline ref, not both — mirroring how
> `figuresHandledInContainers` suppresses the standalone figure copy. F4's PR should start there, not
> from an inject-side suppression hack.

The gate ships with `[[TABLE:…]]` **carved out** (silent, not warn-plumbing) so the still-live TABLE
residue doesn't hard-fail existing tests (the comparison test calls `buildCnxml` on m68789) or the
future batched re-inject before F4 lands. **F4's PR flips TABLE from carve-out to hard-fail.**

## Out-of-scope finds to log (register: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`)

- **F4 (deferred):** `[[TABLE:]]` inline expansion — root cause above (extraction double-modelling).
  Fix at extraction; then remove the TABLE carve-out from `assertNoMarkerResidue`; re-inject the 6
  modules (m68764/70/89/91/93, m68829) in the batched WS5 pass.
- The gate only runs at inject time; today's committed `03-translated` still carries residue until the
  batched re-inject (WS5). Note in the WS5 runbook that the re-inject must pass the new gate.
