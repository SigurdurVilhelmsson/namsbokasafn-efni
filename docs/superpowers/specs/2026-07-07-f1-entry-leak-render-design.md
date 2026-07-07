# F1 — `<entry>`-leak render fix + re-include m68710/m68733 (design)

**Date:** 2026-07-07 · **Roadmap item:** #2 (Tier 1, reader-facing correctness) in
`docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md`.
**Predecessors merged:** F2 render section-order (#249), buildModuleSections collection-order authority (#6, #250).

## Problem

Re-rendering m68710 (ch04, 4-2) and m68733 (ch06, 6-3) triggers a latent renderer bug on tables whose
first row starts with a **leading empty cell** (`<entry align="left"/>`, self-closing). The renderer
leaks the literal `<entry align="left">` into the first data cell and drops a `<td>`, producing a
misaligned/misleading table inside a *worked example*. Both modules were therefore **reverted/excluded**
from the STALE-STRUCT re-extract delivery (PR #248) rather than shipped broken; they ride this fix.

## Root cause (reproduced, definitive)

`extractElements` in `tools/lib/cnxml-parser.js:190` matches an element with:

```
<TAG([^>]*)(?:\/>|>([\s\S]*?)<\/TAG>)
```

The attribute capture `[^>]*` is **greedy**. On `<entry align="left"/>` it consumes ` align="left"/`
(the `/` is "not `>`"), which makes the self-closing branch `\/>` fail. Because the paired branch
`>([\s\S]*?)<\/TAG>` then *succeeds* against the following real cell, the regex swallows that next
cell's opening tag as content:

- Input row: `<entry align="left"/>` · `<entry align="left">Reactants</entry>` · `<entry align="left">Products</entry>`
- Current (buggy) parse → **2** cells; cell[0].content = `"\n<entry align=\"left\">Reactants"` (raw tag leaks; a `<td>` is dropped).

### Why it only bites now — the two stages are co-dependent

The tables are stored in `structure.json` as `rows[].cells[]` (each cell a `segmentId` + attributes),
not as raw `<entry>` CNXML. The **old** extraction *dropped* the leading empty `<entry/>` → a 3-column
table had a **2-cell** first row (structurally wrong, but no render leak). The **re-extract** correctly
captures it as `{segmentId: null, attributes: {align: "left"}}` → 3-cell row. Inject then rebuilds the
`<table>` CNXML, emitting a self-closing `<entry align="left"/>` for the null cell — which is exactly the
input that trips the render leak. So:

- Fixing extraction alone → ships the leak.
- Fixing the renderer alone → nothing to act on (stale structure has no empty entry).

F1 must do both.

## Scope fork — resolved (both modules stay in F1)

m68710 carries B4 entanglements (legacy `{{term}}` marker cleanup; list/equation double-record family),
but those are **re-MT** concerns, orthogonal to whether a *structure* re-extract changes its **segments**.
The 4-part equivalence discriminator (`tools/verify-reextract-equivalence.js`: seg-id-set +
normalized-visible-EN-text + equations shared-key + inline-attrs) returns **0 FAIL** for both m68710 and
m68733 on current main. m68733's `segments.en.md` change is a marker-format migration only (IDs stable,
EN text byte-identical); m68710's `segments.en.md` is byte-unchanged.

**Therefore F1 stays tight at two modules, re-MT-free.** No lead round-trip on B4 (consistent with the
standing B4 deferral). m68710's `{{term}}`/double-record cleanup remains in B4.

## The fix — two co-dependent parts

### Part A — parser (kills the class)

Change the attribute capture in `extractElements` from greedy `[^>]*` to **lazy** `[^>]*?`:

```
<TAG([^>]*?)(?:\/>|>([\s\S]*?)<\/TAG>)
```

Lazy expansion stops at the first position where either branch can match, so the self-closing `\/>`
branch is reached before the `/` is consumed. Verified on real + edge cases (all pass; paired cases
byte-identical to current):

| Case | Expect | Current (greedy) | Lazy fix |
|---|---|---|---|
| leading self-closing empty (real m68710 row) | 3 | 2 ❌ | 3 ✅ |
| bare `<entry/>` then paired | 2 | 1 ❌ | 2 ✅ |
| paired, no attrs | 2 | 2 | 2 ✅ |
| paired, with attrs | 2 | 2 | 2 ✅ |
| two empty self-closing | 2 | 2 | 2 ✅ |

Fixed leading-empty row content: `["", "Reactants", "Products"]` (empty first cell preserved).

**Blast radius:** `extractElements` is a shared generic parser — 31 call sites across `cnxml-render.js`
and `cnxml-extract.js`, tags `para`(17), `equation`(6), `row`(2), `entry`(2), `note`/`media`/`list`/`figure`(1).
The lazy change is behavior-preserving for **paired** elements and alters output **only** where a
self-closing-with-attributes element was previously mis-parsed (`entry`, and latently `media`/`figure`
where they appear self-closing with attrs). This larger surface is why the whole-book re-render diff
(below) is a required acceptance gate, not optional.

### Part B — content re-entry (re-extract → re-inject → re-render)

1. **Re-extract** m68710 + m68733 from `01-source` via `cnxml-extract.js --book efnafraedi-2e --input <path>`
   (regenerates `02-for-mt`/`02-structure`; reads but never writes `01-source`).
2. **Preflight gate:** re-run `verify-reextract-equivalence.js` on both → assert 0 FAIL before proceeding
   (guards against any drift since this design was written).
3. **Re-inject** both modules (existing translations, keyed by stable segment ID; marker-agnostic).
4. **Re-render** ch06 (now clean under #6) + the two table pages.

## Verification strategy

- **Unit tests** on `extractElements` (new cases in `tools/__tests__/cnxml-parser.test.js`):
  self-closing-with-attrs, bare self-closing, mixed empty+paired row, and paired-unchanged regression
  locks for the shared change.
- **Whole-book re-render diff** — the real acceptance gate. Re-render every chapter, diff
  `05-publication/`. Every changed file must be one of: (a) the two intended table pages / ch06, or
  (b) a **characterized latent fix** elsewhere (a self-closing `media`/`figure` that was previously
  mis-parsed). Any *unexplained* change is a regression that blocks.
- **Zero URL renames** in the `05-publication/` diff — hard requirement (protects #6's engineered
  reproduction of ch06's live URLs; a rename here would undo it).
- **Table render-golden** — promote m68710 or m68733 into `render-golden/` to lock the fixed
  leading-empty-cell table byte-exact. (Roadmap #13's *section-ordering* golden for F2 remains a
  separate item; this is a *table* golden.)
- **Full suite green** — `npm test` from repo root (authoritative local gate; no branch protection).

## Scope boundaries (non-goals)

- **No re-MT** — segment-safe confirmed; m68710's `{{term}}`/double-record entanglement stays in **B4**.
- Not the deferred IS→EN table-cell translation gate (`docs/plans/2026-07-06-table-cell-translation-gate-followup.md`).
- Not roadmap #13's section-ordering golden (F2 concern).
- No DOM-parser rewrite of the regex-based renderer; the lazy fix is the surgical fix for this bug class.

## Risks

- **Shared-parser regression** on paired elements — mitigated by unit tests + whole-book diff
  (paired behavior verified identical).
- **Latent fixes elsewhere** surfacing as diff noise — characterize each; a latent *fix* is acceptable
  and documented in the PR, a *regression* blocks.

## Delivery to readers

Re-render/inject changes reach namsbokasafn.is only via the lead's Phase-6 sync/deploy (vefur
`node scripts/sync-content.js --source ../namsbokasafn-efni` → build → deploy). F1 lands the corrected
bytes in the content repo; the deploy is a separate lead step.

## Out-of-scope finds (log to register if any surface)

Register: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`. Candidate during
implementation: `extractElements` has no tag-name word boundary (`<TAG` matches a prefix of a longer
tag name) — pre-existing, not triggered here; note if the whole-book diff surfaces it.
