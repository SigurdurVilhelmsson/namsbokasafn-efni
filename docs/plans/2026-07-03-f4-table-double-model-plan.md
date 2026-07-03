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
- Produces: after this task, a table embedded inside an exercise/example/note/list para appears **only** in `structure.inlineTables` (as a `[[TABLE:]]` ref target), never as a standalone `{ type: 'table' }` in `structure.content`. A table that is a direct section child still appears as a standalone `{ type: 'table' }`.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/cnxml-extract-table-dedup.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { extractSegments } from '../cnxml-extract.js';

// Minimal CNXML with a table in each container + one direct section child.
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

describe('extraction models container-embedded tables once (inline ref, not standalone)', () => {
  const { structure } = extractSegments(CNXML);
  const inlineIds = (structure.inlineTables || []).map((t) => t.tableId);
  const standaloneIds = standaloneTableIds(structure);

  it('captures each container table as an inline ref', () => {
    for (const id of ['t-ex', 't-exa', 't-note', 't-list']) {
      expect(inlineIds).toContain(id);
    }
  });

  it('does NOT emit container tables as standalone structure elements', () => {
    for (const id of ['t-ex', 't-exa', 't-note', 't-list']) {
      expect(standaloneIds).not.toContain(id);
    }
  });

  it('still emits a direct-section-child table as standalone', () => {
    expect(standaloneIds).toContain('t-standalone');
    expect(inlineIds).not.toContain('t-standalone');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-extract-table-dedup.test.js`
Expected: FAIL — the "does NOT emit container tables as standalone" cases fail (container tables currently appear in both `inlineTables` and `content`).

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
        // [[TABLE:]] ref inside a container (exercise/example/note/list), skip the
        // standalone emission — the container owns it, in place. Containers sort
        // before the tables nested within them, so inlineTablesMap is populated by
        // now. A table NOT inline-referenced (e.g. a direct <problem>/<section>
        // child) is absent from inlineTablesMap and still emits standalone. (F4)
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

Run: `npx vitest run tools/__tests__/cnxml-extract` `tools/__tests__/cnxml-dom-comparison.test.js`
Expected: `cnxml-extract*` PASS. `cnxml-dom-comparison` may now FAIL on **m68789** — that is expected and fixed in Task 6 (it reads stale on-disk structure). Note the failure; do not fix it here.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract-table-dedup.test.js
git commit -m "fix(extract): model container-embedded tables once (skip standalone when inline-referenced) [F4]"
```

---

### Task 2: Inject — shared `expandInlineTables` helper + `removeTablesExceptKept`, wired into `buildExerciseDom`

**Files:**
- Modify: `tools/cnxml-inject.js` — add two module-local helpers near `buildTable` (~1999); wire into `buildExerciseDom` (~2662 `processContent`, ~2726 strip)
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

- [ ] **Step 7: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject-table-expand.test.js
git commit -m "fix(inject): expand [[TABLE:]] inline in buildExerciseDom, strip source tables except kept [F4]"
```

---

### Task 3: Inject — wire the same expansion into `buildExampleDom` and `buildNoteDom`

**Files:**
- Modify: `tools/cnxml-inject.js` — `buildExampleDom` (~2350, para sites ~2426/2448, strip ~2482); `buildNoteDom` (~2868, its para site, strip ~2977)
- Test: extend `tools/__tests__/cnxml-inject-table-expand.test.js`

**Interfaces:**
- Consumes: `expandInlineTables`, `removeTablesExceptKept` (Task 2).
- Produces: `buildExampleDom` and `buildNoteDom` render an embedded table inline, once, no residue. `buildNoteDom` keeps its `example`/`exercise` stripping unchanged; only table stripping becomes keep-unless-kept.

- [ ] **Step 1: Write the failing tests**

Append to `tools/__tests__/cnxml-inject-table-expand.test.js`:

```js
import { buildExampleDom, buildNoteDom } from '../cnxml-inject.js';

describe('buildExampleDom expands [[TABLE:]] inline', () => {
  const ORIGINAL = `<example id="exa1"><para id="ea1">Data:<newline/><table id="t2" class="unnumbered" summary="s"><tgroup cols="1"><tbody><row><entry>a</entry></row></tbody></tgroup></table></para></example>`;
  const element = { type: 'example', id: 'exa1', content: [{ type: 'para', id: 'ea1', segmentId: 's1' }] };
  const getSeg = (id) => (id === 's1' ? 'Gögn:[[TABLE:t2]]' : '');
  const ctx = {
    figuresHandledInContainers: new Set(), figuresHandledInNotes: new Set(),
    inlineTables: [{ tableId: 't2', structure: { type: 'table', id: 't2', class: 'unnumbered', summary: 's', rows: [['a']] } }],
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
  const getSeg = (id) => (id === 's1' ? 'Gögn:[[TABLE:t3]]' : '');
  const ctx = {
    figuresHandledInContainers: new Set(), figuresHandledInNotes: new Set(),
    inlineTables: [{ tableId: 't3', structure: { type: 'table', id: 't3', class: 'unnumbered', summary: 's', rows: [['a']] } }],
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

- [ ] **Step 3: Wire `buildExampleDom`**

Add `const keptTableIds = new Set();` beside its `keptFigureIds` (~2398). At both `replaceParaContentDom` sites (~2426 figure-para path, ~2448 normal path), wrap the injected text with `expandInlineTables(..., ctx, getSeg, originalCnxml, keptTableIds)` exactly as in Task 2. Change the strip (~2482) `removeElementsByTag(exampleEl, ['table']);` → `removeTablesExceptKept(exampleEl, keptTableIds);`.

- [ ] **Step 4: Wire `buildNoteDom`**

Add `const keptTableIds = new Set();` beside its kept sets. Wrap its para-injection text site(s) with `expandInlineTables(...)` (same signature). Change the strip (~2977) from:

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

### Task 6: Re-point m68789's comparison-test entry to fresh single-model structure

**Files:**
- Modify: `tools/__tests__/cnxml-dom-comparison.test.js` — `TEST_MODULES` (:50), `loadModule` (:66)

**Interfaces:**
- Consumes: `extractSegments`, `formatSegmentsMarkdown` (`cnxml-extract.js`).
- Produces: m68789 validated against single-model structure; its baseline reflects the post-F4 discrepancy count (expected to drop from 5 as the duplicate table disappears).

- [ ] **Step 1: Mark m68789 for fresh extraction**

In `TEST_MODULES` (:59) change:

```js
  { moduleId: 'm68789', chapter: 'ch12', baseline: 5 },
```
to (baseline updated in Step 3 after measuring):

```js
  { moduleId: 'm68789', chapter: 'ch12', baseline: 5, freshExtract: true },
```

- [ ] **Step 2: Branch `loadModule` on `freshExtract`**

At the top of `loadModule(moduleId, chapter)` (~:66), before the on-disk reads, add a fresh-extract path (import `extractSegments`, `formatSegmentsMarkdown` at the top of the file, and reuse the existing `parseSegments`):

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
  // ...existing on-disk loading unchanged, returning the same shape...
}
```

Pass the flag through at the call site in the test loop:

```js
    const { structure, segments, equations, inlineAttrs, originalCnxml } =
      loadModule(mod.moduleId, mod.chapter, mod.freshExtract);
```

> Match the exact object keys `loadModule` currently returns (inspect :66–:110) so the fresh-extract branch returns the identical shape.

- [ ] **Step 3: Measure and set the real baseline**

Run: `npx vitest run tools/__tests__/cnxml-dom-comparison.test.js -t m68789`
Read the reported discrepancy count for m68789 on single-model structure. Set `baseline` to that exact number (it should be ≤ 5; if the duplicate table was the whole gap, it may reach 0). Re-run to confirm PASS.

- [ ] **Step 4: Run the full comparison suite**

Run: `npx vitest run tools/__tests__/cnxml-dom-comparison.test.js`
Expected: PASS — all other modules keep their on-disk sourcing and baselines.

- [ ] **Step 5: Commit**

```bash
git add tools/__tests__/cnxml-dom-comparison.test.js
git commit -m "test(f4): validate m68789 comparison against fresh single-model structure"
```

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
- **Robustness follow-up:** `buildList` (`cnxml-inject.js:3011`) has no `ctx` and cannot expand `[[TABLE:]]`; a table embedded in a list item now hard-fails the gate (fail-loud, not silent). No chemistry module has one today; biology may. Plumbing `ctx`+`buildTable` into `buildList` is the fix if one appears.
- **Pre-existing (not F4):** a table embedded in a *top-level para* still renders as a standalone sibling (extraction strips it from para content at `cnxml-extract.js:771–775` before para extraction, so no inline ref is generated). Separate finding.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md
git commit -m "docs(register): F4 table double-model done + deferred WS5 re-inject + buildList robustness follow-up"
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
