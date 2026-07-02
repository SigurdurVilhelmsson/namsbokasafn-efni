# Design — F1: fix section-content reordering in extraction + add an order check

**Date:** 2026-07-02. **Status:** design approved by lead 2026-07-02 (both scope forks decided);
ready for the implementation plan. **Scope:** the `processSection` order bug + a fidelity order
check. **Type:** extraction correctness fix + new detection. **No regeneration** of committed
`02-*`/`03-*`/`05-*` in this PR (deferred — see Scope).

Part of the chemistry clean-slate arc (`docs/plans/2026-07-01-chemistry-clean-slate-design.md`),
DO-NOW item #2 after F2, per the Fable-5 review
(`docs/audit/2026-07-02-fable5-fidelity-provenance-review.md`, finding 1).

## Why this exists

`processSection` (`tools/cnxml-extract.js:672–700`) appends **all** nested subsections to the
section's `content[]`, then **all** loose content (paras/examples/equations) after — discarding
document order. A section shaped `<para>intro</para><section>sub</section><para>outro</para>`
extracts as `[sub, intro, outro]`. Injection faithfully rebuilds the wrong order, and the fidelity
check compares only a tag-name multiset (order-blind), so the module still certifies **PERFECT**.
Verified live in m68702 (ch03) and m68833 (ch18); the Fable-5 scans put 15–36 certified-PERFECT
modules in this state. It is deterministic → it will corrupt biology's reading order too, and every
future re-render re-bakes it.

The **module** level already solves this (`cnxml-extract.js:497–525`): it tags each section and each
loose element with a `content.indexOf(...)` position and sorts the combined list. The section level
never got that fix. F1 ports the proven pattern down, and adds an order check so this class of loss
stops being invisible.

## Verified facts (2026-07-02)

| Fact | Evidence |
|---|---|
| The bug is a missing **interleave**: `processSection` pushes subsections (672–686) then loose elements (688–700), never sorting the two together. | code read |
| The module level does it right — position via `content.indexOf(section.fullMatch)` (sections) and `content.indexOf('id="${el.id}"')` (elements), then `.sort()`. | `cnxml-extract.js:497–525` |
| `processTopLevelContent` returns element structures that each carry `.id` (e.g. para `id: item.id`); id-less elements fall back to position 0 — same as the module level's `element.id ? … : 0`. | `cnxml-extract.js:~925` |
| **Re-extracting a module keeps segment ids/order identical** (`m68702-structure.json` byte-identical on re-run) **but rewrites `02-for-mt` markers** legacy→bracket (`{{i}}`→`[[i:]]`, `[#xref]`→`[[xref:]]`, `[video](url)`→`[[link:…]]`) — the committed `02-for-mt` came from the old (March) extractor. | determinism probe on m68702 |
| The fidelity check reads `01-source` + `03-translated` CNXML and calls `compareTagCounts`. | `cnxml-fidelity-check.js:248–250` |

**Design consequence of the probe:** re-extract is **not** an order-only operation — it also
modernizes markers across every module touched (the Track-B4 migration). Therefore F1 does **not**
regenerate; it ships the fix + the check, and a later batched re-extract (with/after B4) does the
regeneration that reaches readers via WS5.

## Scope (decided by lead 2026-07-02)

**In scope:**
- **Part A** — the `processSection` interleave fix (assembly-sort) + unit test.
- **Part B** — a fidelity **order check** (source vs translated id-sequence), reported orthogonally,
  run in warn-only/reporting mode + unit test + a book-wide validation run.

**Explicitly out of scope (deferred):** re-extract, re-inject, re-render of any module; wiring the
order check into `green`/the allowlist; the Track-B4 marker migration. Regeneration is a later
batched pass feeding WS5. F1's order check flips warn-only → hard gate **after** that regeneration.

## Constraints (inherited)

- **Sort the assembly, not the processing.** Keep the two processing passes in their current order so
  `addSegment` auto-counters increment identically → **segment ids stay byte-identical** → `02-for-mt`
  segment *ids* and `02-mt-output` alignment are preserved. (The probe confirmed structure.json is
  byte-identical on re-run.) Only the two `.push()` sites change.
- One PR off `main`; local `npm test` from repo root is the gate; TDD/characterization first.
- The order check must **not** hard-fail `npm test` against the still-scrambled committed
  `03-translated` — it is warn-only until regeneration.
- Robustness>expedience: mirror the module-level pattern literally; fail loud only where safe.

---

## Part A — `processSection` interleave fix

**File:** `tools/cnxml-extract.js` (`processSection`, 653–703).

**Change (only the assembly, mirroring 497–525):** replace the two separate `.push()` blocks with a
single position-tagged, sorted assembly. Keep the nested-sections loop and the
`processTopLevelContent` call in their current order so ids don't move.

```js
  // Process nested sections first (UNCHANGED — keeps addSegment order stable)
  const nestedSections = extractNestedElements(contentWithoutTitle, 'section');
  const itemsWithPositions = [];
  for (const nested of nestedSections) {
    const nestedStructure = processSection(nested, moduleId, addSegment, mathMap, counters,
      verbose, inlineMediaMap, inlineTablesMap);
    const position = nested.fullMatch ? contentWithoutTitle.indexOf(nested.fullMatch) : 0;
    itemsWithPositions.push({ item: nestedStructure, position: position !== -1 ? position : 0 });
  }

  // Process loose content (UNCHANGED call — sections already stripped)
  const contentWithoutSections = removeNestedElements(contentWithoutTitle, 'section');
  const elements = processTopLevelContent(contentWithoutSections, moduleId, addSegment, mathMap,
    counters, verbose, inlineMediaMap, inlineTablesMap);
  for (const element of elements) {
    const idStr = element.id ? `id="${element.id}"` : null;
    const position = idStr ? contentWithoutTitle.indexOf(idStr) : 0;
    itemsWithPositions.push({ item: element, position: position !== -1 ? position : 0 });
  }

  // Interleave by document position (the fix)
  itemsWithPositions.sort((a, b) => a.position - b.position);
  for (const { item } of itemsWithPositions) {
    sectionStructure.content.push(item);
  }
```

**Why safe:** identical to the module-level algorithm already in production; `addSegment` is still
called sections-first-then-loose, so ids are unchanged; only the final `content[]` array order
changes.

**Test:** a focused unit test drives `processSection` with a stubbed `addSegment`/`counters` on a
synthetic section `<section id="s"><title>T</title><para id="p1">intro</para><section
id="sub"><title>ST</title><para id="p2">x</para></section><para id="p3">outro</para></section>` and
asserts `content[]` is `[para p1, section sub, para p3]` (not `[section sub, para p1, para p3]`), and
that the emitted segment ids/order are unchanged vs the pre-fix run for the same input.

## Part B — fidelity order check (orthogonal, warn-only)

**File:** `tools/cnxml-fidelity-check.js` (add exported helpers near `compareTagCounts`:63; call in
`main()`:~250; the file is 303 lines — no split needed).

**`extractIdSequence(cnxml) → string[]`** — every `id="…"` in document order (regex scan, dedup not
needed; keep first occurrence per id to avoid child-echo). Pure, exported.

**`compareElementOrder(sourceCnxml, translatedCnxml) → { ok, moved }`** — take the two id-sequences,
restrict each to the **intersection** of ids present in both (add/drop is already the tag-count
check's job), and compare relative order. `ok:false` when the two intersected sequences differ;
`moved` lists ids whose relative position changed (a lightweight positional diff — not full LCS;
YAGNI). Pure, exported.

**Integration in `main()`:** alongside the existing `compareTagCounts`, compute
`compareElementOrder` and, when `!ok`, print a distinct `ORDER` line per module (module id + moved
ids). It is **reported only** — it does **not** feed `diffs`, the exit code, `green`, or the
allowlist. This keeps it independent of the F7 allowlist overhaul.

**Warn-only rationale:** committed `03-translated` is still scrambled (no regen in F1), so a hard gate
would fail immediately. The check is a detector now; it becomes authoritative after regeneration.

**Tests:**
- unit: `compareElementOrder` returns `ok:true` on identical order; `ok:false` + correct `moved` on a
  swapped pair; ignores an id present in only one side.
- unit: `extractIdSequence` returns ids in document order.
- **validation (not an assertion that can fail the suite):** a book-wide report over efnafraedi-2e
  `03-translated` mt-preview; confirm the flagged-module count lands in the audit's **15–36** range
  (sanity that the check sees what Fable-5 saw). Recorded in the PR body, not asserted in CI.

## Components & isolation

| Unit | Purpose | Depends on |
|---|---|---|
| `processSection` assembly-sort | correct extraction order | existing extract helpers |
| `extractIdSequence` | ordered ids from CNXML | — (pure) |
| `compareElementOrder` | source-vs-translated order verdict | extractIdSequence |
| `main()` ORDER report | surface reordered modules (warn-only) | compareElementOrder |

## Definition of done

- `processSection` interleaves subsections and loose content by document position; unit test proves
  order **and** id-stability.
- `compareElementOrder`/`extractIdSequence` implemented + unit-tested; `main()` reports reordered
  modules without affecting exit code / green.
- Book-wide report count reconciles with the audit's 15–36 (PR body).
- **No committed `02-*`/`03-*`/`05-*` bytes changed** in F1; `npm test` + `npm run validate` green
  from repo root.

## Decisions (lead, 2026-07-02)

1. **Scope** → *code fix + check only; defer regeneration* (re-extract entangles the B4 marker
   migration; keep F1 clean).
2. **Order check** → *separate orthogonal pass* (id-sequence compare, reported distinctly, not routed
   through allowlist/green).

## Out-of-scope finds to log (register: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`)

- The committed `02-for-mt` for chemistry predates the bracket-marker migration; a future full
  re-extract will modernize markers legacy→bracket across the book (couples to Track B4). Flag when
  planning the batched regeneration so it is a deliberate, reviewed change — not a surprise diff.
