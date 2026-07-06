# OC-B Container-Table Translation Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OC-B's kept direct-child container tables emit their translated `<entry>` cells (not English source), and add a producer-side fail-loud gate that catches any table whose available cell translation didn't reach the output.

**Architecture:** OC-B keeps a table that is a direct DOM child of an example/exercise/note "in place" inside the serialized container, but that serialized DOM carries the **source** cells — the standalone `buildTable(node, getSeg, originalCnxml)` path it bypassed is what translates cells. Fix: after each container serializes, splice `buildTable`'s translated table over the source table block for exactly the OC-B-kept (direct-child, non-inline) tables, using a new table-id→structure-node map on `ctx`. Gate: after assembly, assert every table cell with a non-empty translation has that translation present in its table block.

**Tech Stack:** Node 22.x, vanilla JS (CommonJS in `tools/`), Vitest. `@xmldom/xmldom` DOM already in use by the container builders.

## Global Constraints

- Node 22.x LTS; run `npm test` **from the repo root** (authoritative gate — no branch protection).
- Never modify `books/*/01-source/` (READ ONLY).
- **Fail loud** — no silent fallback to untranslated source; an unresolved kept table or a
  missing-translation cell must throw (project rule: robustness > expedience).
- **One real code path** — reuse the existing `buildTable`; do not fork a second table-translation path.
- Do not change OC-B's ordering behavior (`tablesHandledInContainers` registration + `buildElement`
  `case 'table'` null-skip stay as-is); only the *bytes* emitted for kept container tables change.
- Only re-translate OC-B **direct-child non-inline** tables — never the F4 inline-expanded tables
  (already translated by `expandInlineTables`).
- All new/changed code in `tools/cnxml-inject.js`; tests in `tools/__tests__/`.

---

### Task 1: `collectTableNodes` — table-id → structure-node map on `ctx`

**Files:**
- Modify: `tools/cnxml-inject.js` (add collector near `collectFigureCaptions` ~line 1516; wire into
  `buildCnxml` ctx ~line 1752)
- Test: `tools/__tests__/cnxml-collect-table-nodes.test.js` (create)

**Interfaces:**
- Produces: `collectTableNodes(elements, map)` — mutates `map` (`{ [tableId]: tableNode }`) where
  `tableNode` is the structure node with `.id`, `.type === 'table'`, `.rows[].cells[]`. Exported.
- Produces: `ctx.tableNodesById` — the built map, available to all container builders.

- [ ] **Step 1: Write the failing test**

```js
// tools/__tests__/cnxml-collect-table-nodes.test.js
import { describe, it, expect } from 'vitest';
import { collectTableNodes } from '../cnxml-inject.js';

describe('collectTableNodes', () => {
  it('maps table ids to their structure nodes, including nested ones', () => {
    const structure = [
      { type: 'section', id: 's1', content: [
        { type: 'para', id: 'p1' },
        { type: 'table', id: 't-top', rows: [{ cells: [{ segmentId: 'seg:a' }] }] },
        { type: 'example', id: 'ex1', content: [
          { type: 'table', id: 't-nested', rows: [{ cells: [{ segmentId: 'seg:b' }] }] },
        ] },
      ] },
    ];
    const map = {};
    collectTableNodes(structure, map);
    expect(Object.keys(map).sort()).toEqual(['t-nested', 't-top']);
    expect(map['t-top'].rows[0].cells[0].segmentId).toBe('seg:a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-collect-table-nodes.test.js`
Expected: FAIL — `collectTableNodes` is not exported / not a function.

- [ ] **Step 3: Add the collector** (near `collectFigureCaptions`, ~line 1516)

```js
/**
 * Recursively map every <table> node's id to its structure node (with .rows/.cells).
 * Used so container builders can translate direct-child tables they keep in place
 * (their structure node is a sibling of the container, not held by the builder). OC-B fix.
 */
function collectTableNodes(elements, map) {
  for (const el of elements) {
    if (el.type === 'table' && el.id) {
      map[el.id] = el;
    }
    if (el.content) {
      collectTableNodes(el.content, map);
    }
  }
}
```

- [ ] **Step 4: Wire into `buildCnxml` ctx** (~line 1752, beside `collectFigureCaptions`)

Add after `collectFigureCaptions(structure.content, figureCaptions);`:

```js
  const tableNodesById = {};
  collectTableNodes(structure.content, tableNodesById);
```

Add `tableNodesById,` to the `ctx` object literal (next to `tablesHandledInContainers,`).

- [ ] **Step 5: Export `collectTableNodes`**

Add `collectTableNodes` to the ES `export { … }` block (~line 3946, beside `assertNoMarkerResidue`).

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-collect-table-nodes.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-collect-table-nodes.test.js
git commit -m "feat(inject): collectTableNodes — table-id->structure-node map on ctx [OC-B fix]"
```

---

### Task 2: `translateKeptContainerTables` — splice translated tables into a serialized container

**Files:**
- Modify: `tools/cnxml-inject.js` (add helper after `buildTable`, ~line 2175)
- Test: `tools/__tests__/cnxml-translate-kept-container-tables.test.js` (create)

**Interfaces:**
- Consumes: `buildTable(node, getSeg, originalCnxml)` (existing) → translated `<table>…</table>` CNXML
  or `null`; `ctx.tableNodesById` (Task 1).
- Produces: `translateKeptContainerTables(result, keptContainerTableIds, ctx, getSeg, originalCnxml, moduleId)`
  → new `result` string with each id's source table block replaced by its `buildTable` translation.
  Throws on: missing structure node, `buildTable` returns null, or the id-anchored `<table>` block not
  found in `result`. Exported. `keptContainerTableIds` is a `Set<string>` (may be empty → returns
  `result` unchanged).

- [ ] **Step 1: Write the failing test**

```js
// tools/__tests__/cnxml-translate-kept-container-tables.test.js
import { describe, it, expect } from 'vitest';
import { translateKeptContainerTables } from '../cnxml-inject.js';

const originalCnxml = `<table id="t1"><row><entry>Reactants</entry></row></table>`;
const node = { id: 't1', type: 'table', rows: [{ cells: [{ segmentId: 's:1' }] }] };
const ctx = { tableNodesById: { t1: node } };
const getSeg = (id) => (id === 's:1' ? 'Hvarfefni' : '');

describe('translateKeptContainerTables', () => {
  it('splices the translated table over the source block', () => {
    const result = `<example><table id="t1"><row><entry>Reactants</entry></row></table></example>`;
    const out = translateKeptContainerTables(result, new Set(['t1']), ctx, getSeg, originalCnxml, 'mX');
    expect(out).toContain('Hvarfefni');
    expect(out).not.toContain('Reactants');
    expect(out).toContain('<example>'); // surrounding structure preserved
  });

  it('returns result unchanged when the id set is empty', () => {
    const result = `<example>x</example>`;
    expect(translateKeptContainerTables(result, new Set(), ctx, getSeg, originalCnxml, 'mX')).toBe(result);
  });

  it('throws (fail loud) when the structure node is missing', () => {
    const result = `<example><table id="t9"></table></example>`;
    expect(() =>
      translateKeptContainerTables(result, new Set(['t9']), ctx, getSeg, originalCnxml, 'mX')
    ).toThrow(/t9/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-translate-kept-container-tables.test.js`
Expected: FAIL — `translateKeptContainerTables` is not a function.

- [ ] **Step 3: Implement the helper** (after `buildTable`, ~line 2175)

```js
/**
 * Replace, inside an already-serialized container fragment, each OC-B-kept direct-child
 * table's SOURCE block with its buildTable() translation. Fail loud rather than leave a
 * source (untranslated) table in the published output.
 * @param {Set<string>} keptContainerTableIds - OC-B direct-child, non-inline table ids only.
 */
function translateKeptContainerTables(result, keptContainerTableIds, ctx, getSeg, originalCnxml, moduleId) {
  for (const tableId of keptContainerTableIds) {
    const node = ctx && ctx.tableNodesById && ctx.tableNodesById[tableId];
    if (!node) {
      throw new Error(
        `translateKeptContainerTables: no structure node for kept container table id="${tableId}" in module ${moduleId} — cannot translate; refusing to emit source table.`
      );
    }
    const translated = buildTable(node, getSeg, originalCnxml);
    if (!translated) {
      throw new Error(
        `translateKeptContainerTables: buildTable returned null for table id="${tableId}" in module ${moduleId}.`
      );
    }
    const blockRe = new RegExp(`<table[^>]*\\sid="${tableId}"[^>]*>[\\s\\S]*?<\\/table>`);
    if (!blockRe.test(result)) {
      throw new Error(
        `translateKeptContainerTables: source table block id="${tableId}" not found in serialized container for module ${moduleId}.`
      );
    }
    result = result.replace(blockRe, () => translated);
  }
  return result;
}
```

Note: the `.replace(blockRe, () => translated)` uses a function replacement so `$`-sequences in the
translated CNXML are not interpreted.

- [ ] **Step 4: Export the helper** (ES `export { … }` block, ~line 3946)

Add `translateKeptContainerTables,`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-translate-kept-container-tables.test.js`
Expected: PASS (all three cases).

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-translate-kept-container-tables.test.js
git commit -m "feat(inject): translateKeptContainerTables helper (splice buildTable output, fail loud) [OC-B fix]"
```

---

### Task 3: Wire the helper into all three container builders

**Files:**
- Modify: `tools/cnxml-inject.js` — `buildExampleDom` (~2664–2706), `buildExerciseDom` (~2946–2986),
  `buildNoteDom` (~3225–3247)
- Test: `tools/__tests__/cnxml-inject-container-table-order.test.js` (extend — OC-B's own suite)

**Interfaces:**
- Consumes: `translateKeptContainerTables(...)` (Task 2), `ctx.tableNodesById` (Task 1).
- Each builder tracks a local `keptContainerTableIds = new Set()` holding **only** the direct-child
  non-inline tables (the ones added at the `else if (child.nodeName === 'table')` branch), and calls
  the helper on its serialized `result` before returning.

- [ ] **Step 1: Write the failing test** (append to `cnxml-inject-container-table-order.test.js`)

This suite drives a real extract→inject round-trip (`extractSegments` → `parseSegments(formatSegmentsMarkdown(...))` → `buildCnxml(...).cnxml`); `parseSegments` returns a **Map** (`.get`/`.set`). The round-trip is identity (English), so translate the extracted cell segments to a distinct Icelandic-marked string, then assert they land in the kept table.

```js
it('translates a table kept in place inside an example (OC-B fix)', () => {
  const CNXML_T = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Doc</title>
<content>
<section id="s1"><title>S1</title>
<example id="ex1"><title>Ex</title>
<para id="ep1">Intro.</para>
<table id="tX" class="unnumbered" summary="s"><tgroup cols="2"><tbody><row><entry>Reactants</entry><entry>Products</entry></row></tbody></tgroup></table>
</example>
</content>
</document>`;
  const { segments, structure, equations, inlineAttrs } = extractSegments(CNXML_T);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  // Translate EVERY extracted segment (Map) to a distinct Icelandic-marked string.
  for (const id of [...parsed.keys()]) parsed.set(id, 'ISL_' + parsed.get(id));
  const out = buildCnxml(structure, parsed, equations, CNXML_T, {}, inlineAttrs).cnxml;
  expect(out).toContain('ISL_Reactants');   // kept container-table cell translated
  expect(out).toContain('ISL_Products');
  expect(out).not.toMatch(/<entry[^>]*>Reactants<\/entry>/); // no bare source cell survives
  expect((out.match(/<table\b[^>]*\bid="tX"/g) || []).length).toBe(1); // position/uniqueness (OC-B) held
});
```

(The suite already imports `extractSegments`, `formatSegmentsMarkdown`, `buildCnxml`, `parseSegments` — reuse them; don't add a new driver.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject-container-table-order.test.js`
Expected: FAIL — output still contains `Reactants` (source), missing `Hvarfefni`.

- [ ] **Step 3: Edit `buildExampleDom`** — track container tables + translate before Step 6 dedup

At the direct-child scan (~line 2674), add the id to a new set as well. First declare it near
`const keptTableIds = new Set();` (~2564):

```js
  const keptContainerTableIds = new Set();
```

Change the `else if` branch (~2673-2674) to:

```js
    } else if (child.nodeName === 'table') {
      const tId = child.getAttribute('id');
      if (tId && !exampleInlineTableIds.has(tId)) {
        keptTableIds.add(tId);
        keptContainerTableIds.add(tId);
      }
    }
```

Immediately after `let result = serializeCnxmlFragment(exampleEl);` (~line 2706):

```js
  result = translateKeptContainerTables(
    result, keptContainerTableIds, ctx, getSeg, originalCnxml, element.id
  );
```

- [ ] **Step 4: Edit `buildExerciseDom`** — same pattern

Declare `const keptContainerTableIds = new Set();` near its `const keptTableIds = new Set();` (~2872).
Change its table branch (~2956) to add to both sets (as in Step 3). After
`let result = serializeCnxmlFragment(exerciseEl);` (~2986):

```js
  result = translateKeptContainerTables(
    result, keptContainerTableIds, ctx, getSeg, originalCnxml, element.id
  );
```

(Keep the existing `result = deduplicateMedia(result); ...` lines that follow.)

- [ ] **Step 5: Edit `buildNoteDom`** — capture return into a var, translate, return

Declare `const keptContainerTableIds = new Set();` near its `const keptTableIds = new Set();` (~3168).
Change its table branch (~3231) to add to both sets. Replace the final
`return serializeCnxmlFragment(noteEl);` (~3247) with:

```js
  let result = serializeCnxmlFragment(noteEl);
  result = translateKeptContainerTables(
    result, keptContainerTableIds, ctx, getSeg, originalCnxml, element.id
  );
  return result;
```

- [ ] **Step 6: Run the new test + the OC-B suite**

Run: `npx vitest run tools/__tests__/cnxml-inject-container-table-order.test.js`
Expected: PASS — the new case passes AND OC-B's existing order tests still pass (position unchanged).

- [ ] **Step 7: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject-container-table-order.test.js
git commit -m "fix(inject): translate OC-B kept container tables via buildTable in example/exercise/note [OC-B fix]"
```

---

### Task 4: `assertTableCellsTranslated` gate

**Files:**
- Modify: `tools/cnxml-inject.js` (add gate near `assertNoMarkerResidue` ~1596; call in `buildCnxml`
  ~1849)
- Test: `tools/__tests__/cnxml-assert-table-cells-translated.test.js` (create)

**Interfaces:**
- Produces: `assertTableCellsTranslated(output, tableNodesById, getSeg, moduleId)` — throws if a table
  cell with a non-empty translation is absent from that table's block in `output`. Exported.
- Uses a normalizer so markers/tags/whitespace don't cause false negatives:
  `normalizeForTableGate(s)` — strip `[[type:` and `]]` bracket delimiters (keep inner text), strip
  `<...>` tags, collapse whitespace, trim.

- [ ] **Step 1: Write the failing test**

```js
// tools/__tests__/cnxml-assert-table-cells-translated.test.js
import { describe, it, expect } from 'vitest';
import { assertTableCellsTranslated } from '../cnxml-inject.js';

const nodes = { t1: { id: 't1', type: 'table', rows: [
  { cells: [{ segmentId: 's:1' }, { segmentId: 's:formula' }] },
] } };
const getSeg = (id) => ({ 's:1': 'Hvarfefni', 's:formula': 'CCl<sub>4</sub>' }[id] || '');

describe('assertTableCellsTranslated', () => {
  it('passes when every non-empty translation is present in the table block', () => {
    const output = `<table id="t1"><row><entry>Hvarfefni</entry><entry>CCl<sub>4</sub></entry></row></table>`;
    expect(() => assertTableCellsTranslated(output, nodes, getSeg, 'mX')).not.toThrow();
  });

  it('throws when a cell reverted to source (translation missing)', () => {
    const output = `<table id="t1"><row><entry>Reactants</entry><entry>CCl<sub>4</sub></entry></row></table>`;
    expect(() => assertTableCellsTranslated(output, nodes, getSeg, 'mX')).toThrow(/t1/);
  });

  it('does not throw for a cell whose translation is empty (no false positive)', () => {
    const emptyNodes = { t1: { id: 't1', type: 'table', rows: [{ cells: [{ segmentId: 's:none' }] }] } };
    const output = `<table id="t1"><row><entry>whatever</entry></row></table>`;
    expect(() => assertTableCellsTranslated(output, emptyNodes, () => '', 'mX')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-assert-table-cells-translated.test.js`
Expected: FAIL — `assertTableCellsTranslated` is not a function.

- [ ] **Step 3: Implement the gate** (near `assertNoMarkerResidue`, ~line 1596)

```js
function normalizeForTableGate(s) {
  return String(s)
    .replace(/\[\[[a-zA-Z]+:/g, '')   // drop bracket-marker opener, keep inner text
    .replace(/\]\]/g, '')
    .replace(/<[^>]+>/g, '')          // drop tags
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fail loud if any table cell that HAS a non-empty translation did not land in the
 * output. Source-independent: cells with empty/absent translation (formulae, constants)
 * are skipped, so no allowlist and no false positives. Catches the OC-B class (a table
 * emitted from source bypasses cell translation). OC-B fix.
 */
function assertTableCellsTranslated(output, tableNodesById, getSeg, moduleId) {
  for (const tableId of Object.keys(tableNodesById || {})) {
    const node = tableNodesById[tableId];
    const blockRe = new RegExp(`<table[^>]*\\sid="${tableId}"[^>]*>[\\s\\S]*?<\\/table>`);
    const m = blockRe.exec(output);
    if (!m) continue; // table not emitted (e.g. dropped elsewhere) — not this gate's concern
    const block = normalizeForTableGate(m[0]);
    for (const [rowIdx, row] of (node.rows || []).entries()) {
      for (const [cellIdx, cell] of (row.cells || []).entries()) {
        const segIds = cell.paras ? cell.paras.map((p) => p.segmentId) : [cell.segmentId];
        for (const segId of segIds) {
          if (!segId) continue;
          const tr = normalizeForTableGate(getSeg(segId) || '');
          if (!tr) continue; // no translation available → skip
          if (!block.includes(tr)) {
            throw new Error(
              `assertTableCellsTranslated: module ${moduleId} table id="${tableId}" row ${rowIdx} cell ${cellIdx}: translation ${JSON.stringify(tr)} missing from output (cell likely reverted to English source — OC-B class).`
            );
          }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Call it in `buildCnxml`** — right after `assertNoMarkerResidue(output, structure.moduleId);` (~line 1849)

```js
  assertTableCellsTranslated(output, tableNodesById, getSeg, structure.moduleId);
```

- [ ] **Step 5: Export the gate** (ES `export { … }` block, ~line 3946)

Add `assertTableCellsTranslated,`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-assert-table-cells-translated.test.js`
Expected: PASS (all three cases).

- [ ] **Step 7: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-assert-table-cells-translated.test.js
git commit -m "feat(inject): assertTableCellsTranslated gate — fail loud on IS->EN table cell reversion [OC-B fix]"
```

---

### Task 5: Real-module regression (m68710, in-memory) + full suite — CODE-ONLY

**Scope decision (pre-flight, lead-approved 2026-07-06):** this PR is **code + tests only — no
content bytes, no golden regeneration.** Reason: `renderTranslatedModule` (the golden harness) reads
the **on-disk `03-translated`**, which — untouched by a code-only change — still holds the pre-OC-B
(correct, Icelandic) state, so the render goldens already **pass 7/7** on this branch and the committed
`m68710` golden already shows Icelandic tables. Re-injecting/regenerating goldens here would (a) bake
WS4 (`rate→hraði`) changes that belong to WS5 into this PR, and (b) commit a *partial* `03-translated`
(one module fixed, ~29 stale). Golden regeneration + the full re-inject happen together in **WS5
Phase 1** (see "After the plan"). So: **do NOT re-inject to disk, do NOT run `UPDATE_GOLDEN`, do NOT
commit any `books/**` file.** The real-module check below builds m68710 **in memory** (reads committed
inputs, never writes).

**Files:**
- Test: `tools/__tests__/cnxml-inject-m68710-table-regression.test.js` (create)
- (No `books/**` or golden fixture changes.)

**Interfaces:**
- Consumes: `buildCnxml(structure, segments, equations, originalCnxml, options, inlineAttrs)` → `{ cnxml }`
  (existing); `parseSegments(content)` → Map (existing).

- [ ] **Step 1: Write the in-memory real-module regression test**

```js
// tools/__tests__/cnxml-inject-m68710-table-regression.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

// Build m68710 in memory from its COMMITTED inputs (no disk writes) and assert the
// Reactants/charge container table is translated to Icelandic (OC-B regression guard).
const B = join(import.meta.dirname, '..', '..', 'books', 'efnafraedi-2e');

describe('m68710 container-table translation (OC-B regression, in-memory)', () => {
  it('emits Icelandic table cells, not English source', () => {
    const structure = JSON.parse(
      readFileSync(join(B, '02-structure', 'ch04', 'm68710-structure.json'), 'utf8')
    );
    const equations = JSON.parse(
      readFileSync(join(B, '02-structure', 'ch04', 'm68710-equations.json'), 'utf8')
    );
    const segments = parseSegments(
      readFileSync(join(B, '02-mt-output', 'ch04', 'm68710-segments.is.md'), 'utf8')
    );
    const originalCnxml = readFileSync(join(B, '01-source', 'ch04', 'm68710.cnxml'), 'utf8');

    // inlineAttrs={} is fine: table cell text comes from segments, not inline attrs.
    const { cnxml } = buildCnxml(structure, segments, equations, originalCnxml, {}, {});

    expect(cnxml).toContain('<entry align="left">Hvarfefni</entry>');
    expect(cnxml).toContain('<entry align="left">Hleðsla</entry>');
    expect(cnxml).not.toContain('<entry align="left">Reactants</entry>');
    expect(cnxml).not.toContain('<entry align="left">charge</entry>');
  });
});
```

- [ ] **Step 2: Run it — must PASS with the fix (Tasks 1–4) applied**

Run: `npx vitest run tools/__tests__/cnxml-inject-m68710-table-regression.test.js`
Expected: PASS. (To confirm it genuinely guards the bug, optionally `git stash` the `cnxml-inject.js`
changes, run → observe FAIL with English `Reactants`/`charge`, then `git stash pop`.)

- [ ] **Step 3: Confirm no `books/**` or fixture bytes changed**

Run: `git status --porcelain`
Expected: only the new test file (+ any Task 1–4 code) — **no `books/**`, no `render-golden/**`.**
If a `books/**` file appears, a step wrote to disk — investigate and restore it.

- [ ] **Step 4: Run the full suite from repo root**

Run: `npm test`
Expected: PASS — including `cnxml-render-golden.test.js` (green because on-disk `03-translated` is
unchanged) and all inject suites. Baseline before this work: ~1889 passing; expect that plus the new
tests from Tasks 1–5.

- [ ] **Step 5: Commit**

```bash
git add tools/__tests__/cnxml-inject-m68710-table-regression.test.js
git commit -m "test(inject): m68710 OC-B container-table regression guard (in-memory, code-only) [OC-B fix]"
```

---

## Self-Review

**Spec coverage:**
- Fix A (translate-and-splice, ctx table map) → Tasks 1–3. ✓
- Gate A (source-independent fail-loud cell assertion) → Task 4. ✓
- Only OC-B direct-child (non-inline) tables re-translated → Task 3 `keptContainerTableIds` (separate
  from `keptTableIds`, populated only at the direct-child branch). ✓
- OC-B ordering unchanged → Tasks 3 (registration/skip untouched; OC-B order tests must still pass). ✓
- Tests: unit fix (T2/T3), unit gate (T4), in-memory real-module regression (T5), full suite (T5). ✓
- Fail loud (no silent source fallback) → Task 2 + Task 4 throws. ✓
- **Code-only PR (no content bytes, no golden regen)** — scope decision above; golden regeneration +
  full re-inject deferred to WS5 (see "After the plan" + WS5 followup checklist). ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `collectTableNodes(elements, map)`, `ctx.tableNodesById`,
`translateKeptContainerTables(result, keptContainerTableIds, ctx, getSeg, originalCnxml, moduleId)`,
`assertTableCellsTranslated(output, tableNodesById, getSeg, moduleId)`, `keptContainerTableIds` used
consistently across Tasks 1–4. `buildTable(node, getSeg, originalCnxml)` matches its existing
signature.

**Harness verified:** Task 3 Step 1 uses the suite's real `extractSegments → parseSegments (Map) →
buildCnxml(...).cnxml` round-trip (confirmed against the file's existing imports); no new driver
introduced. `parseSegments` returns a Map — the test overrides via `.set`. `getSeg` reads
`segments.get(id)` (confirmed).

## After the plan — WS5 followup checklist (deferred from this PR; do NOT let these fall through)

This PR is **code-only**. The following were deliberately deferred to **WS5 Phase 1** (runbook
`docs/plans/2026-07-06-ws5-reinject-rerender-sync-runbook.md`) so they happen consistently for the
whole book, not piecemeal. Each is now the WS5 owner's responsibility:

1. **Re-inject both tracks** with the fixed tool — the **new `assertTableCellsTranslated` gate must
   pass** for all 149 modules (it will hard-fail any residual IS→EN table cell). Handle the 15
   false-positive-residue modules with per-module `--allow-incomplete` (list in the WS5 audit /
   chemistry-clean-slate memory).
2. **Regenerate ALL render goldens** (`UPDATE_GOLDEN=1 npx vitest run tools/__tests__/cnxml-render-golden.test.js`)
   from the fixed on-disk `03-translated`, and **review the diff**: expect WS4 relabels
   (`rate→hraði`, `mol→mól`, `acid→sýra`, …) on m68683/m68710/m68727/m68789 and **Icelandic table
   cells** on m68710/m68789 — **no English-reverted table cell may remain**. Commit the regenerated
   goldens with the WS5 content.
3. **Regenerate `render-fidelity-baseline.json` from the FIXED render** (the one captured during the
   halted WS5 attempt was from the buggy render and was discarded).
4. **Re-do the F3 fidelity-allowlist re-triage** against fixed output (the halted attempt's emphasis
   reconciliations — m68733 −4→−3, add emphasis known-loss-deferred for m68741/m68791/m68822/m68842,
   m68811 −1→+1 — are table-independent and should re-apply; re-verify).
5. **Verify the ~30 formerly-regressed modules** now show Icelandic table cells + comma-decimals in
   both `03-translated` and rendered HTML before sync/deploy.

Cross-book: the gate is book-agnostic — it protects biology onboarding for free at its next inject.
