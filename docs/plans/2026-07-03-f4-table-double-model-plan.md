# F4 Table Double-Model Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop extraction double-modelling container-embedded tables, expand `[[TABLE:]]` inside the container DOM builders, and flip the marker-residue gate to hard-fail on `[[TABLE:]]` — so tables render once, in place, with zero placeholder residue.

**Architecture:** Two coordinated fixes. (1) `cnxml-extract.js` skips the standalone `section > table` emission for any table already captured as an inline `[[TABLE:]]` ref (`inlineTablesMap` membership). (2) `cnxml-inject.js` container builders (`buildExerciseDom`/`buildExampleDom`/`buildNoteDom`) expand `[[TABLE:]]` into a real `<table>` via a shared helper, record the id in a `keptTableIds` set, and strip source tables *except* the kept ones — mirroring the existing `keptFigureIds` pattern. Then `assertNoMarkerResidue` un-carves `TABLE` and hard-fails. Tests source structure from the exported in-memory `extractSegments()` so **no committed fixtures are regenerated**.

**Tech Stack:** Node 22 ESM, Vitest, `@xmldom/xmldom` DOM (via `tools/lib/cnxml-dom.js`), the CNXML extract/inject pipeline.

## Global Constraints

- **No committed `01-source/`, `02-structure/`, `02-for-mt/`, `03-*/`, `05-*/` bytes change.** Actual re-extract/re-inject/re-render of the 6 affected modules is deferred to the batched WS5 pass; this PR only *arms* the fixes and gate.
- **`npm test` from the repo root is the authoritative gate** (no branch protection). Also run `npm run validate`.
- Resolve resource paths against something intrinsic (`import.meta.url`), never `process.cwd()`.
- One PR off `main`, branch `feat/chem-f4-table-double-model` (already created; design doc already committed there).
- Robustness > expedience: fail loud; the escape-hatch (a container type whose builder can't expand `[[TABLE:]]`) must abort inject via the gate, never silently publish residue.
- Affected modules (the live `[[TABLE:]]` residue universe): `m68764`, `m68770`, `m68789`, `m68791`, `m68793`, `m68829` — 12× `<exercise>`, 1× `<example>`, none in `<note>`/`<list>`.

---

### Task 1: Extraction — suppress standalone tables already captured as inline refs

**Files:**
- Modify: `tools/cnxml-extract.js` — `processTopLevelContent`, `case 'table':` (~957)
- Test: `tools/__tests__/cnxml-extract-table-dedup.test.js` (create)

**Interfaces:**
- Consumes: exported `extractSegments(cnxml, options)` → `{ segments, structure, equations, inlineAttrs }` (`cnxml-extract.js:1910`). `structure.content` is the top-level element array; `structure.inlineTables` is `[{ tableId, structure }]`.
- Produces: after this task, a table embedded inside an **exercise/example/note** para appears **only** in `structure.inlineTables` (as a `[[TABLE:]]` ref target), never as a standalone `{ type: 'table' }` in `structure.content`. A table that is a **direct section child** — or embedded in a **list item** (pre-existing: extraction strips it out of `contentForSimpleElements` before `lists` is extracted, so it is never inline-referenced) — still appears as a standalone `{ type: 'table' }`. The guard is self-scoping: it suppresses exactly the ids present in `inlineTablesMap`.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/cnxml-extract-table-dedup.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { extractSegments } from '../cnxml-extract.js';

// Minimal CNXML: a table in each of exercise/example/note (inline-referenced),
// plus a direct-section-child table and a list-item table (both standalone).
const CNXML = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Doc</title>
<content>
<section id="s1"><title>S1</title>
<para id="p-direct">Intro.</para>
<table id="t-standalone" summary="direct child"><tgroup cols="1"><tbody><row><entry>A</entry></row></tbody></tgroup></table>
<exercise id="ex1"><problem id="pr1"><para id="pp1">See data:<table id="t-ex" summary="in exercise"><tgroup cols="1"><tbody><row><entry>X</entry></row></tbody></tgroup></table></para></problem></exercise>
<example id="exa1"><para id="ea1">Ex table:<table id="t-exa" summary="in example"><tgroup cols="1"><tbody><row><entry>Y</entry></row></tbody></tgroup></table></para></example>
<note id="n1"><para id="na1">Note table:<table id="t-note" summary="in note"><tgroup cols="1"><tbody><row><entry>Z</entry></row></tbody></tgroup></table></para></note>
<list id="l1"><item><para id="la1">Item table:<table id="t-list" summary="in list"><tgroup cols="1"><tbody><row><entry>W</entry></row></tbody></tgroup></table></para></item></list>
</section>
</content>
</document>`;

function standaloneTableIds(structure) {
  const ids = [];
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.type === 'table' && n.id) ids.push(n.id);
      if (n.content) walk(n.content);
    }
  };
  walk(structure.content);
  return ids;
}

describe('extraction models inline-referenced tables once (inline ref, not standalone)', () => {
  const { structure } = extractSegments(CNXML);
  const inlineIds = (structure.inlineTables || []).map((t) => t.tableId);
  const standaloneIds = standaloneTableIds(structure);

  it('captures exercise/example/note tables as inline refs', () => {
    for (const id of ['t-ex', 't-exa', 't-note']) {
      expect(inlineIds).toContain(id);
    }
  });

  it('does NOT emit those container tables as standalone structure elements', () => {
    for (const id of ['t-ex', 't-exa', 't-note']) {
      expect(standaloneIds).not.toContain(id);
    }
  });

  it('still emits a direct-section-child table as standalone', () => {
    expect(standaloneIds).toContain('t-standalone');
    expect(inlineIds).not.toContain('t-standalone');
  });

  // Pre-existing behaviour (NOT changed by F4): a list-item table is stripped from
  // contentForSimpleElements before `lists` is extracted, so it is never inline-
  // referenced and survives only as a standalone entry. Documented here so a future
  // change to that behaviour trips this test deliberately.
  it('leaves a list-item table as standalone (pre-existing, never inline-referenced)', () => {
    expect(standaloneIds).toContain('t-list');
    expect(inlineIds).not.toContain('t-list');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-extract-table-dedup.test.js`
Expected: FAIL — the "does NOT emit those container tables as standalone" case fails (exercise/example/note tables currently appear in both `inlineTables` and `content`). The direct-child and list-item cases already pass.

- [ ] **Step 3: Implement the guard**

In `tools/cnxml-extract.js`, `processTopLevelContent`, change the `case 'table':` block (~957) from:

```js
      case 'table': {
        const tableStructure = processTable(item, moduleId, addSegment, mathMap, counters);
        elements.push(tableStructure);
        break;
      }
```

to:

```js
      case 'table': {
        // Model each table once. If this table was already captured as an inline
        // [[TABLE:]] ref inside a container (exercise/example/note process their
        // paras with inlineTablesMap on untouched content), skip the standalone
        // emission — the container owns it, in place. Containers sort before the
        // tables nested within them, so inlineTablesMap is populated by now. A
        // table NOT inline-referenced (a direct <problem>/<section> child, or a
        // list-item table — stripped before list extraction) is absent from
        // inlineTablesMap and still emits standalone, so nothing is lost. (F4)
        if (inlineTablesMap && inlineTablesMap.has(item.id)) break;
        const tableStructure = processTable(item, moduleId, addSegment, mathMap, counters);
        elements.push(tableStructure);
        break;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-extract-table-dedup.test.js`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Run the broader extract + comparison suites to check for fallout**

Run: `npx vitest run tools/__tests__/cnxml-extract tools/__tests__/cnxml-dom-comparison.test.js`
Expected: **all PASS.** The guard only affects *fresh* in-memory extracts; `cnxml-dom-comparison` reads *stale on-disk* structure, so it is unaffected here (m68789 stays green). It only goes red once inject-expand lands in Task 2 — which is why the m68789 re-point is folded into Task 2, not this task.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract-table-dedup.test.js
git commit -m "fix(extract): model container-embedded tables once (skip standalone when inline-referenced) [F4]"
```

---

### Task 2: Inject — shared `expandInlineTables` helper + `removeTablesExceptKept`, wired into `buildExerciseDom` (+ re-point m68789 comparison)

> **Why the re-point is in this task, not a later one:** the m68789 comparison test reads
> *stale on-disk* structure that still double-models the table. Adding the inject-expand here makes
> `buildCnxml(stale m68789)` render the stale standalone table **plus** the newly-expanded inline
> table = a duplicate → the comparison test goes red. The only structure that stays green is *fresh
> single-model + inject-expand together*. So this task must both add the expansion **and** re-point
> m68789's comparison entry to fresh extraction, in one commit, or the suite is left red.

**Files:**
- Modify: `tools/cnxml-inject.js` — add two module-local helpers near `buildTable` (~1999); wire into `buildExerciseDom` (~2662 `processContent`, ~2726 strip)
- Modify: `tools/__tests__/cnxml-dom-comparison.test.js` — re-point m68789 to fresh extract (Steps 8–11)
- Test: `tools/__tests__/cnxml-inject-table-expand.test.js` (create)

**Interfaces:**
- Consumes: `buildTable(structure, getSeg, originalCnxml)` (`cnxml-inject.js:1999`); `ctx.inlineTables` = `[{ tableId, structure }]`; `replaceParaContentDom` (imported as such); DOM helpers on parsed nodes (`getElementsByTagName`, `getAttribute`, `parentNode.removeChild`).
- Produces:
  - `expandInlineTables(text, ctx, getSeg, originalCnxml, keptTableIds) → string` — replaces each `[[TABLE:id]]` whose id is in `ctx.inlineTables` with the built `<table>` string and adds the id to `keptTableIds`; leaves unknown ids as the literal placeholder.
  - `removeTablesExceptKept(parentElement, keptTableIds) → void` — removes every `<table>` descendant whose id is **not** in `keptTableIds`.
  - `buildExerciseDom` now renders an exercise-embedded table inline, once, with no `[[TABLE:]]` residue.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/cnxml-inject-table-expand.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildExerciseDom } from '../cnxml-inject.js';

// Original CNXML the builder re-parses (table lives inside the problem para).
const ORIGINAL = `<exercise id="ex1"><problem id="pr1"><para id="pp1">See data:<newline/><table id="t1" class="unnumbered" summary="s"><tgroup cols="2"><tbody><row><entry>a</entry><entry>b</entry></row></tbody></tgroup></table></para><para id="pp2">Find the rate.</para></problem></exercise>`;

// Structure element as extraction (post-F4) produces it: para segment carries the [[TABLE:]] ref.
const element = {
  type: 'exercise',
  id: 'ex1',
  problem: {
    content: [
      { type: 'para', id: 'pp1', segmentId: 'seg-pp1' },
      { type: 'para', id: 'pp2', segmentId: 'seg-pp2' },
    ],
  },
  solution: null,
};

const segs = {
  'seg-pp1': 'Sjá gögn:[[TABLE:t1]]',
  'seg-pp2': 'Finndu hraðann.',
};
const getSeg = (id) => segs[id] || '';

const ctx = {
  figuresHandledInContainers: new Set(),
  figuresHandledInNotes: new Set(),
  inlineTables: [
    {
      tableId: 't1',
      structure: { type: 'table', id: 't1', class: 'unnumbered', summary: 's', rows: [['a', 'b']] },
    },
  ],
};

describe('buildExerciseDom expands [[TABLE:]] inline and keeps exactly one table', () => {
  const out = buildExerciseDom(element, getSeg, {}, ORIGINAL, ctx);

  it('leaves no [[TABLE: residue', () => {
    expect(out).not.toContain('[[TABLE:');
  });

  it('renders exactly one <table id="t1">', () => {
    const count = (out.match(/<table\b[^>]*\bid="t1"/g) || []).length;
    expect(count).toBe(1);
  });

  it('places the table inside the problem para pp1', () => {
    // the table must appear within pp1's replaced content, before pp2
    expect(out.indexOf('<table')).toBeGreaterThan(out.indexOf('id="pp1"'));
    expect(out.indexOf('<table')).toBeLessThan(out.indexOf('id="pp2"'));
  });
});
```

> Note: adjust the `structure`/`rows` shape in `ctx.inlineTables[0].structure` to match what `buildTable` actually consumes — inspect `buildTable` (`cnxml-inject.js:1999`) and an existing `inlineTables` entry in a real `02-structure/ch12/m68789-structure.json` before finalizing the fixture, so `buildTable` produces a real `<table id="t1">`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject-table-expand.test.js`
Expected: FAIL — output contains literal `[[TABLE:t1]]` (builder does not expand it) and/or zero `<table>` (strip removed it).

- [ ] **Step 3: Add the two helpers**

In `tools/cnxml-inject.js`, immediately after `buildTable` (~end of its definition near line ~2050), add:

```js
/**
 * Expand [[TABLE:id]] placeholders in a para's translated text into full <table>
 * markup, recording each expanded id so the container's post-strip pass keeps it.
 * Mirrors buildPara's inline-table restoration (cnxml-inject.js ~1853). (F4)
 * @param {string} text - translated para text possibly containing [[TABLE:id]]
 * @param {object} ctx - inject context; ctx.inlineTables = [{ tableId, structure }]
 * @param {Function} getSeg - segment resolver
 * @param {string} originalCnxml - original module CNXML (buildTable dependency)
 * @param {Set<string>} keptTableIds - mutated: ids that were expanded inline
 * @returns {string} text with known [[TABLE:id]] replaced by <table> markup
 */
function expandInlineTables(text, ctx, getSeg, originalCnxml, keptTableIds) {
  if (!text || !ctx || !ctx.inlineTables) return text;
  return text.replace(/\[\[TABLE:([^\]]+)\]\]/g, (match, tableId) => {
    const tableData = ctx.inlineTables.find((t) => t.tableId === tableId);
    if (tableData && tableData.structure) {
      keptTableIds.add(tableId);
      return buildTable(tableData.structure, getSeg, originalCnxml);
    }
    return match; // unknown id → leave placeholder; the gate will catch it
  });
}

/**
 * Remove every <table> descendant of parentElement whose id is NOT in keptTableIds.
 * Mirrors the keep-unless-kept figure loop (cnxml-inject.js ~2727). (F4)
 * @param {Element} parentElement
 * @param {Set<string>} keptTableIds
 */
function removeTablesExceptKept(parentElement, keptTableIds) {
  const tables = Array.from(parentElement.getElementsByTagName('table'));
  for (const table of tables) {
    const id = table.getAttribute('id');
    if (!keptTableIds.has(id)) {
      table.parentNode.removeChild(table);
    }
  }
}
```

- [ ] **Step 4: Wire into `buildExerciseDom`**

In `buildExerciseDom` (~2644): add a `keptTableIds` set beside `keptFigureIds` (~2660):

```js
  const replacedParaIds = new Set();
  const keptFigureIds = new Set();
  const keptTableIds = new Set();
```

Inside `processContent`, expand the table placeholder on the para text **before** each `replaceParaContentDom` call. Change the two injection sites:

```js
          const textWithoutMedia = paraText.replace(/<media\s[^>]*>[\s\S]*?<\/media>/g, '').trim();
          replaceParaContentDom(doc, paraEl, textWithoutMedia, '');
```
to
```js
          const textWithoutMedia = expandInlineTables(
            paraText.replace(/<media\s[^>]*>[\s\S]*?<\/media>/g, '').trim(),
            ctx, getSeg, originalCnxml, keptTableIds
          );
          replaceParaContentDom(doc, paraEl, textWithoutMedia, '');
```
and
```js
        const skipParaText = paraHasFlattenedList(child, paraEl, contentArray, paraText, doc);
        replaceParaContentDom(doc, paraEl, skipParaText ? '' : paraText, '');
```
to
```js
        const skipParaText = paraHasFlattenedList(child, paraEl, contentArray, paraText, doc);
        const expandedParaText = skipParaText
          ? ''
          : expandInlineTables(paraText, ctx, getSeg, originalCnxml, keptTableIds);
        replaceParaContentDom(doc, paraEl, expandedParaText, '');
```

Then change the unconditional strip (~2726):

```js
  removeElementsByTag(exerciseEl, ['table']);
```
to
```js
  removeTablesExceptKept(exerciseEl, keptTableIds);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-inject-table-expand.test.js`
Expected: PASS (all 3).

- [ ] **Step 6: Run the inject unit suite for regressions**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js`
Expected: PASS (no existing inject unit test relies on the old unconditional table strip; if one fails, it reveals a real table it was silently dropping — inspect before adjusting).

- [ ] **Step 7: Confirm the m68789 comparison test is now red (the reason for Steps 8–11)**

Run: `npx vitest run tools/__tests__/cnxml-dom-comparison.test.js -t m68789`
Expected: **FAIL** — `buildCnxml` on stale on-disk structure now renders the stale standalone table plus the expanded inline table (duplicate), exceeding baseline 5. This is expected; Steps 8–11 fix it by sourcing single-model structure.

- [ ] **Step 8: Mark m68789 for fresh extraction**

In `tools/__tests__/cnxml-dom-comparison.test.js`, add the imports at the top of the file (beside the existing imports):

```js
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
```

In `TEST_MODULES` (~:59) change:

```js
  { moduleId: 'm68789', chapter: 'ch12', baseline: 5 },
```
to (baseline updated in Step 10 after measuring):

```js
  { moduleId: 'm68789', chapter: 'ch12', baseline: 5, freshExtract: true },
```

- [ ] **Step 9: Branch `loadModule` on `freshExtract`**

Give `loadModule` a `freshExtract` parameter and, when set, source structure/segments/equations/inlineAttrs from a fresh in-memory extract instead of the on-disk `02-structure`/`02-for-mt` files. At the top of `loadModule(moduleId, chapter)` (~:66):

```js
function loadModule(moduleId, chapter, freshExtract = false) {
  const originalCnxml = readFileSync(
    join(BOOKS, '01-source', chapter, `${moduleId}.cnxml`), 'utf8'
  );

  if (freshExtract) {
    const { segments, structure, equations, inlineAttrs } = extractSegments(originalCnxml);
    return {
      structure,
      segments: parseSegments(formatSegmentsMarkdown(segments)),
      equations,
      inlineAttrs,
      originalCnxml,
    };
  }
  // ...existing on-disk loading unchanged, returning the SAME object shape...
}
```

> Match the exact keys the existing `loadModule` returns (inspect :66–:110) so the fresh-extract branch returns an identical shape; if it also returns e.g. `enSegments`, add the equivalent from `result` or omit only if the caller tolerates it.

Pass the flag through at the call site in the test loop (find where `loadModule(mod.moduleId, mod.chapter)` is called):

```js
    const { structure, segments, equations, inlineAttrs, originalCnxml } =
      loadModule(mod.moduleId, mod.chapter, mod.freshExtract);
```

- [ ] **Step 10: Measure and set the real baseline**

Run: `npx vitest run tools/__tests__/cnxml-dom-comparison.test.js -t m68789`
Read the reported discrepancy count for m68789 on single-model structure and set `baseline` to that exact number (expected ≤ 5; may reach 0 if the duplicate table was the whole gap). Re-run to confirm PASS. Then run the full comparison suite to confirm no other module regressed:

Run: `npx vitest run tools/__tests__/cnxml-dom-comparison.test.js`
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject-table-expand.test.js tools/__tests__/cnxml-dom-comparison.test.js
git commit -m "fix(inject): expand [[TABLE:]] inline in buildExerciseDom; re-point m68789 comparison to fresh single-model structure [F4]"
```

---

### Task 3: Inject — wire the same expansion into `buildExampleDom` and `buildNoteDom`

**Files:**
- Modify: `tools/cnxml-inject.js` — `buildExampleDom` (~2350, para sites ~2426/2448, strip ~2482); `buildNoteDom` (~2868, its para site, strip ~2977)
- Test: extend `tools/__tests__/cnxml-inject-table-expand.test.js`

**Interfaces:**
- Consumes: `expandInlineTables`, `removeTablesExceptKept`, **and `removeStaleExpandedTables`** — all three module-local helpers already exist in `cnxml-inject.js` from Task 2. No new helper is needed; this task only wires them into two more builders.
- Produces: `buildExampleDom` and `buildNoteDom` render an embedded table inline, once, no residue (no duplicate from the preserved block child). `buildNoteDom` keeps its `example`/`exercise` stripping unchanged; only table stripping becomes keep-unless-kept.
- **Out of scope (do NOT fix here; pre-existing, table-unrelated):** the `buildExample`(regex)-vs-`buildExampleDom` figure/caption/equation parity diff on m68789 example `fs-idm234815200` (see Task 2 report). Leave the `domRegexParityKnownGap` flag on m68789 as-is. If your wiring happens to close it, that's a bonus, but do not chase it — log status to the register in Task 7.

- [ ] **Step 1: Write the failing tests**

Append to `tools/__tests__/cnxml-inject-table-expand.test.js`:

```js
import { buildExampleDom, buildNoteDom } from '../cnxml-inject.js';

describe('buildExampleDom expands [[TABLE:]] inline', () => {
  const ORIGINAL = `<example id="exa1"><para id="ea1">Data:<newline/><table id="t2" class="unnumbered" summary="s"><tgroup cols="1"><tbody><row><entry>a</entry></row></tbody></tgroup></table></para></example>`;
  const element = { type: 'example', id: 'exa1', content: [{ type: 'para', id: 'ea1', segmentId: 's1' }] };
  const getSeg = (id) => (id === 's1' ? 'Gögn:[[TABLE:t2]]' : id === 'c2' ? 'a' : '');
  const ctx = {
    figuresHandledInContainers: new Set(), figuresHandledInNotes: new Set(),
    inlineTables: [{ tableId: 't2', structure: { type: 'table', id: 't2', class: 'unnumbered', summary: 's', rows: [{ cells: [{ segmentId: 'c2' }] }] } }],
  };
  const out = buildExampleDom(element, getSeg, {}, ORIGINAL, ctx);
  it('no residue, one table', () => {
    expect(out).not.toContain('[[TABLE:');
    expect((out.match(/<table\b[^>]*\bid="t2"/g) || []).length).toBe(1);
  });
});

describe('buildNoteDom expands [[TABLE:]] inline', () => {
  const ORIGINAL = `<note id="n1" class="note"><para id="np1">Data:<newline/><table id="t3" class="unnumbered" summary="s"><tgroup cols="1"><tbody><row><entry>a</entry></row></tbody></tgroup></table></para></note>`;
  const element = { type: 'note', id: 'n1', class: 'note', content: [{ type: 'para', id: 'np1', segmentId: 's1' }] };
  const getSeg = (id) => (id === 's1' ? 'Gögn:[[TABLE:t3]]' : id === 'c3' ? 'a' : '');
  const ctx = {
    figuresHandledInContainers: new Set(), figuresHandledInNotes: new Set(),
    inlineTables: [{ tableId: 't3', structure: { type: 'table', id: 't3', class: 'unnumbered', summary: 's', rows: [{ cells: [{ segmentId: 'c3' }] }] } }],
  };
  const out = buildNoteDom(element, getSeg, {}, ORIGINAL, ctx);
  it('no residue, one table', () => {
    expect(out).not.toContain('[[TABLE:');
    expect((out.match(/<table\b[^>]*\bid="t3"/g) || []).length).toBe(1);
  });
});
```

> Confirm `buildNoteDom`'s element shape (`element.content` vs a `content` sub-object) against an existing note in a real structure JSON and adjust the fixture if needed before running.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/cnxml-inject-table-expand.test.js`
Expected: the two new describes FAIL (literal `[[TABLE:` in output).

**IMPORTANT — reuse Task 2's three-helper pattern exactly.** Task 2 discovered that
`replaceParaContentDom` *preserves* block children (a `<table>` is a `BLOCK_TAG`), so expanding
`[[TABLE:]]` in the para text and calling `replaceParaContentDom` leaves the original untranslated
table **plus** the expanded translated copy = a duplicate. Task 2 added a **third** module-local
helper, `removeStaleExpandedTables(paraElement, keptTableIds, idsBefore)`, already present in
`cnxml-inject.js`. `buildExampleDom`/`buildNoteDom` use the same `replaceParaContentDom` and need
the identical treatment. Study Task 2's `buildExerciseDom` `processContent` wiring and mirror it.

- [ ] **Step 3: Wire `buildExampleDom`**

Add `const keptTableIds = new Set();` beside its `keptFigureIds` (~2398). At **each** `replaceParaContentDom` site (the figure-para path ~2426 and the normal path ~2448), do exactly what Task 2's `buildExerciseDom` does at its injection sites — for each site:

```js
    const idsBefore = new Set(keptTableIds);
    const expandedText = expandInlineTables(<the text arg>, ctx, getSeg, originalCnxml, keptTableIds);
    removeStaleExpandedTables(paraEl, keptTableIds, idsBefore);
    replaceParaContentDom(doc, paraEl, expandedText, <the title arg unchanged>);
```

(substitute the exact text/title arguments each existing `replaceParaContentDom` call passes; keep the `skipParaText`/`textWithoutMedia` logic intact — expand whatever text was going to be injected). Change the strip (~2482) `removeElementsByTag(exampleEl, ['table']);` → `removeTablesExceptKept(exampleEl, keptTableIds);`.

- [ ] **Step 4: Wire `buildNoteDom`**

Add `const keptTableIds = new Set();` beside its kept sets. At its para-injection site(s), apply the same four-line pattern (`idsBefore` snapshot → `expandInlineTables` → `removeStaleExpandedTables(paraEl, keptTableIds, idsBefore)` → `replaceParaContentDom`). Change the strip (~2977) from:

```js
  removeElementsByTag(noteEl, ['table', 'example', 'exercise']);
```
to
```js
  removeElementsByTag(noteEl, ['example', 'exercise']);
  removeTablesExceptKept(noteEl, keptTableIds);
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tools/__tests__/cnxml-inject-table-expand.test.js`
Expected: PASS (all describes).

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject-table-expand.test.js
git commit -m "fix(inject): expand [[TABLE:]] inline in buildExampleDom + buildNoteDom [F4]"
```

---

### Task 4: Gate — flip `[[TABLE:]]` carve-out to hard-fail

**Files:**
- Modify: `tools/cnxml-inject.js` — `assertNoMarkerResidue` (:1499), comment (:1743)
- Test: `tools/__tests__/cnxml-inject-marker-gate.test.js` (create)

**Interfaces:**
- Consumes: exported `assertNoMarkerResidue(cnxml, moduleId)` (`cnxml-inject.js:3591`).
- Produces: the gate throws on any surviving `[[TABLE:…]]`; still tolerates `[[MATH:…]]` / `[[MEDIA:…]]`.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/cnxml-inject-marker-gate.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { assertNoMarkerResidue } from '../cnxml-inject.js';

describe('assertNoMarkerResidue hard-fails on [[TABLE:]]', () => {
  it('throws on surviving [[TABLE:id]]', () => {
    expect(() => assertNoMarkerResidue('<para>see [[TABLE:t1]] here</para>', 'mTest')).toThrow(/TABLE:t1/);
  });
  it('still tolerates [[MATH:]] and [[MEDIA:]]', () => {
    expect(() => assertNoMarkerResidue('<para>[[MATH:3]] and [[MEDIA:1]]</para>', 'mTest')).not.toThrow();
  });
  it('does not fire on legit nested chemistry brackets', () => {
    expect(() => assertNoMarkerResidue('<para>concentration [[Ag(NH3)2]+]</para>', 'mTest')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/cnxml-inject-marker-gate.test.js`
Expected: FAIL — the first test does not throw (TABLE is still carved out).

- [ ] **Step 3: Flip the carve-out**

In `assertNoMarkerResidue` (:1499) change:

```js
  const residue = cnxml.match(/\[\[(?!MATH:|MEDIA:|TABLE:)[A-Za-z][\w]*:[^\]]*\]\]/g);
```
to
```js
  const residue = cnxml.match(/\[\[(?!MATH:|MEDIA:)[A-Za-z][\w]*:[^\]]*\]\]/g);
```

Update the comment at ~1743 from:

```js
  // [[TABLE:]] is carved out until F4 lands (see assertNoMarkerResidue).
```
to
```js
  // Marker-residue gate: any unconverted [[TYPE:…]] (incl. [[TABLE:]]) hard-fails. (F4)
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tools/__tests__/cnxml-inject-marker-gate.test.js`
Expected: PASS (all 3).

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject-marker-gate.test.js
git commit -m "fix(inject): hard-fail marker-residue gate on [[TABLE:]] (un-carve) [F4]"
```

---

### Task 5: End-to-end regression — fresh-extract the 6 affected modules, assert single-model + no residue

**Files:**
- Test: `tools/__tests__/cnxml-table-double-model.test.js` (create)

**Interfaces:**
- Consumes: `extractSegments`, `formatSegmentsMarkdown` (`cnxml-extract.js:1910`); `buildCnxml` + `parseSegments` (`cnxml-inject.js`); `compareTagCounts` (`cnxml-fidelity-check.js`); source CNXML under `books/efnafraedi-2e/01-source/`.
- Produces: proof that, on **single-model** (fresh) structure, each affected module builds with exactly one table per source table and zero `[[TABLE:]]` residue — end-to-end, without regenerating any committed fixture.

- [ ] **Step 1: Write the test**

Create `tools/__tests__/cnxml-table-double-model.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

const SRC = join(import.meta.dirname, '..', '..', 'books', 'efnafraedi-2e', '01-source');

const MODULES = [
  { moduleId: 'm68764', chapter: 'ch09' },
  { moduleId: 'm68770', chapter: 'ch10' },
  { moduleId: 'm68789', chapter: 'ch12' },
  { moduleId: 'm68791', chapter: 'ch12' },
  { moduleId: 'm68793', chapter: 'ch12' },
  { moduleId: 'm68829', chapter: 'ch17' },
];

function countTag(xml, tag) {
  return (xml.match(new RegExp(`<${tag}\\b`, 'g')) || []).length;
}

describe.each(MODULES)('F4 single-model build: $moduleId', ({ moduleId, chapter }) => {
  const source = readFileSync(join(SRC, chapter, `${moduleId}.cnxml`), 'utf8');
  const { segments, structure, equations, inlineAttrs } = extractSegments(source);
  // Round-trip segments through the on-disk markdown format so getSeg sees them
  // exactly as the CLI does.
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  const output = buildCnxml(structure, parsed, equations, source, {}, inlineAttrs);

  it('produces no [[TABLE: residue', () => {
    expect(output).not.toContain('[[TABLE:');
  });

  it('emits the same number of <table> as the source (no duplication)', () => {
    expect(countTag(output, 'table')).toBe(countTag(source, 'table'));
  });
});
```

> Correct each module's `chapter` from its real path (`ls books/efnafraedi-2e/01-source/*/m687XX.cnxml`) before running. If `buildCnxml`'s parameter order differs, match its signature in `cnxml-inject.js`.

- [ ] **Step 2: Run the test**

Run: `npx vitest run tools/__tests__/cnxml-table-double-model.test.js`
Expected: PASS for all 6 modules. If a module still shows `table` count mismatch, inspect whether its table sits directly under `<problem>` (not inside a para) — if so it is legitimately standalone and the source count still matches; a true failure means a container type whose builder wasn't wired (revisit Task 3).

- [ ] **Step 3: Commit**

```bash
git add tools/__tests__/cnxml-table-double-model.test.js
git commit -m "test(f4): end-to-end single-model build for the 6 table-double-model modules"
```

---

### Task 6: (folded into Task 2 — no separate work)

The m68789 comparison re-point was merged into **Task 2** (Steps 7–11), because the inject-expand
in Task 2 is precisely what turns that comparison test red, and only *fresh-extract + inject-expand
committed together* keeps it green. Do not dispatch this task separately; it exists only to keep the
numbering stable. Proceed from Task 7.

---

### Task 7: Full-suite verification + log deferred/robustness follow-ups

**Files:**
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (register — append F4 outcome + follow-ups)

**Interfaces:** none (verification + documentation).

- [ ] **Step 1: Run the entire suite from the repo root**

Run: `npm test`
Expected: all green. Investigate any failure before proceeding — do not adjust baselines to paper over a real regression.

- [ ] **Step 2: Run status validation**

Run: `npm run validate`
Expected: 24/24 (or current known-good count).

- [ ] **Step 3: Append to the register**

Add under the register in `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`:
- F4 **done**: extraction models container tables once (inline-ref guard); inject expands `[[TABLE:]]` in `buildExerciseDom`/`buildExampleDom`/`buildNoteDom` with `keptTableIds`; `assertNoMarkerResidue` hard-fails `[[TABLE:]]`.
- **Deferred:** actual re-extract + re-inject + re-render of `m68764/70/89/91/93, m68829` → batched WS5 pass; the WS5 runbook re-inject **must pass the new gate**.
- **Pre-existing (not F4), confirmed in Task 1:** a table embedded in a *top-level para* **or a
  `<list>` item* renders as a standalone sibling — extraction strips it from `contentForSimpleElements`
  at `cnxml-extract.js:771–778` before para/list extraction, so it is never inline-referenced (never
  a `[[TABLE:]]` ref) and survives only via the standalone `tables` array; the list item's own segment
  text loses the table. Because no list `[[TABLE:]]` ref is ever produced, `buildList` needs no change
  and there is no gate landmine. Fixing the list-table-to-standalone placement would need a coordinated
  extraction-reorder + `buildList` inject change — its own future task, out of F4 scope.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md
git commit -m "docs(register): F4 table double-model done + deferred WS5 re-inject + list-table-standalone pre-existing find"
```

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/chem-f4-table-double-model
gh pr create --title "F4: fix table double-model (extract dedup + inject expand + gate hard-fail)" \
  --body "See docs/plans/2026-07-03-f4-table-double-model-design.md. No committed 02-/03-/05- bytes changed; WS5 re-inject arms against the new hard-fail gate."
```

---

## Self-Review Notes

- **Spec coverage:** extraction dedup → Task 1; inject expand across all three DOM builders → Tasks 2–3; gate flip → Task 4; fresh-extract testing / no fixture regen → Tasks 5–6; robust-guard coupling + list fail-loud + deferred WS5 → Task 7. All design sections mapped.
- **The `buildTable` structure-shape assumption** in Tasks 2–3 fixtures is the one place the plan can't be fully literal without inspecting a real `inlineTables` entry — each task flags this explicitly with the exact file to check, rather than hand-waving.
- **Baseline for m68789** (Task 6) is measured, not guessed — the plan says run-observe-set, because the exact post-F4 count depends on the module's other discrepancies.
