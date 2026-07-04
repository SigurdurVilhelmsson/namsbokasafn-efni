# OC-B Container-Table Positioning Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a `<table>` that is a direct child of an `<example>`/`<exercise>`/`<note>` inside its container (in document position), instead of stripping it and rendering a mispositioned standalone copy.

**Architecture:** Inject-only. Add `ctx.tablesHandledInContainers` (a Set) — the table analog of the existing `ctx.figuresHandledInContainers`. Each container builder collects its direct-child (non-inline) table ids into `keptTableIds` (so `removeTablesExceptKept` keeps them) and registers them in `ctx.tablesHandledInContainers`; the standalone `case 'table':` dispatch skips a registered id (mirrors `buildFigure`'s skip). Extraction untouched.

**Tech Stack:** Node 22 ESM, Vitest, `@xmldom/xmldom`. Touches `tools/cnxml-inject.js` + a new test; verified by re-running `tools/analyze-order-causes.js`.

## Global Constraints

- **No committed `02-`/`03-`/`05-` regeneration.** Armed for WS5; verified fresh in-memory + diagnostic re-run. No `books/` bytes change.
- **Must not reintroduce F4's duplication or weaken its fail-loud guard.** The collection adds only tables whose id is **not** in `inlineTableIds` (inline `[[TABLE:]]` tables stay on the expand-or-throw path); `removeStaleExpandedTables` still runs first; the `removeTablesExceptKept` throw is unchanged.
- The fix may only **correct** order, never worsen it — the diagnostic clean count must **rise** (no previously-clean module regresses).
- `npm test` from the repo root is the authoritative gate. Also `npm run validate`.
- One PR off `main`, branch `fix/chem-ocb-container-tables` (created; design committed).
- Pre-fix diagnostic baseline (verification target): **130 clean / 19 residual**; 16 of the 19 have a `table` cause.

---

### Task 1: `tablesHandledInContainers` — keep direct-child tables in their container

**Files:**
- Modify: `tools/cnxml-inject.js` — ctx init (~1648), `case 'table':` dispatch (~1815), `buildExampleDom` (~2562/2574/2588), `buildExerciseDom` (~2833/2843/2857), `buildNoteDom` (~3106)
- Test: `tools/__tests__/cnxml-inject-container-table-order.test.js` (create)

**Interfaces:**
- Produces: `ctx.tablesHandledInContainers: Set<string>` — ids of tables kept inside a container; the standalone `case 'table':` build returns `null` for a registered id. `buildCnxml` output renders a direct-child container table once, in its source position inside the container.

- [ ] **Step 1: Write the failing behavioral test**

Create `tools/__tests__/cnxml-inject-container-table-order.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { extractSegments } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';
import { formatSegmentsMarkdown } from '../cnxml-extract.js';

// A <table> that is a DIRECT child of an <example>, with a para after it inside
// the example, and a top-level para after the example. Pre-fix the table is
// stripped from the example and rendered standalone AFTER the example's inner
// paras; post-fix it stays before ep2.
const CNXML = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Doc</title>
<content>
<section id="s1"><title>S1</title>
<example id="ex1"><title>Ex</title>
<para id="ep1">Before the table.</para>
<table id="tX" class="unnumbered" summary="s"><tgroup cols="1"><tbody><row><entry>a</entry></row></tbody></tgroup></table>
<para id="ep2">After the table.</para>
</example>
<para id="after">Top-level after the example.</para>
</content>
</document>`;

function build(cnxml) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(cnxml);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  return buildCnxml(structure, parsed, equations, cnxml, {}, inlineAttrs).cnxml;
}

describe('direct-child container table keeps its in-container position (OC-B)', () => {
  const out = build(CNXML);

  it('renders the table exactly once', () => {
    expect((out.match(/<table\b[^>]*\bid="tX"/g) || []).length).toBe(1);
  });

  it('places the table before the following in-example para (ep2), not after it', () => {
    expect(out.indexOf('id="tX"')).toBeGreaterThan(-1);
    expect(out.indexOf('id="ep2"')).toBeGreaterThan(-1);
    // pre-fix: standalone tX renders after ep2 → this fails
    expect(out.indexOf('id="tX"')).toBeLessThan(out.indexOf('id="ep2"'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject-container-table-order.test.js`
Expected: the second test FAILS — pre-fix the table is stripped from the example and rendered standalone after `ep2`, so `indexOf('id="tX"') < indexOf('id="ep2"')` is false.

> If it unexpectedly passes pre-fix, the fixture isn't triggering the strip-and-standalone path — verify `tX` is extracted as a standalone top-level `type:'table'` (add a check) and adjust before proceeding. A test that passes pre-fix proves nothing.

- [ ] **Step 3: Add `tablesHandledInContainers` to ctx**

In `tools/cnxml-inject.js`, ctx init (~1647-1655), beside `figuresHandledInContainers`:
```js
  const figuresHandledInContainers = new Set();
  const tablesHandledInContainers = new Set();
  const ctx = {
    figureCaptions,
    figuresHandledInNotes,
    figuresHandledInContainers,
    tablesHandledInContainers,
    inlineMedia: structure.inlineMedia || [],
    inlineTables: structure.inlineTables || [],
    imageMapping: options.imageMapping || new Map(),
  };
```

- [ ] **Step 4: Skip registered tables in the standalone dispatch**

In the `buildElement` dispatch, change `case 'table':` (~1815):
```js
    case 'table':
      if (ctx && ctx.tablesHandledInContainers && ctx.tablesHandledInContainers.has(element.id)) {
        return null;
      }
      return buildTable(element, getSeg, originalCnxml);
```

- [ ] **Step 5: Keep + register direct-child tables in `buildExampleDom`**

In `buildExampleDom`, the Step 4a direct-child **figure** loop (`for (const child of Array.from(exampleEl.childNodes))`, ~2562) — extend it to also collect direct-child **tables** (excluding inline-referenced ones), and register them after the strip. Replace the figure loop with:
```js
  // Step 4a: keep figures AND non-inline tables that are direct children of the example.
  const exampleInlineTableIds = new Set((ctx?.inlineTables || []).map((t) => t.tableId));
  for (const child of Array.from(exampleEl.childNodes)) {
    if (child.nodeName === 'figure') {
      const figId = child.getAttribute('id');
      if (figId) keptFigureIds.add(figId);
    } else if (child.nodeName === 'table') {
      const tId = child.getAttribute('id');
      if (tId && !exampleInlineTableIds.has(tId)) keptTableIds.add(tId);
    }
  }
```
Then, after the existing `figuresHandledInContainers` registration block (~2588-2592), add:
```js
  if (ctx && ctx.tablesHandledInContainers) {
    for (const tId of keptTableIds) ctx.tablesHandledInContainers.add(tId);
  }
```

- [ ] **Step 6: Keep + register direct-child tables in `buildExerciseDom`**

In `buildExerciseDom`, the direct-child figure loop over `containers` (`[exerciseEl, ...problems, ...solutions]`, ~2833-2840) — extend to collect direct-child tables too:
```js
  const exerciseInlineTableIds = new Set((ctx?.inlineTables || []).map((t) => t.tableId));
  for (const container of containers) {
    for (const child of Array.from(container.childNodes)) {
      if (child.nodeName === 'figure') {
        const figId = child.getAttribute('id');
        if (figId) keptFigureIds.add(figId);
      } else if (child.nodeName === 'table') {
        const tId = child.getAttribute('id');
        if (tId && !exerciseInlineTableIds.has(tId)) keptTableIds.add(tId);
      }
    }
  }
```
Then, after the `figuresHandledInContainers` registration (~2857-2861), add the same table-registration block:
```js
  if (ctx && ctx.tablesHandledInContainers) {
    for (const tId of keptTableIds) ctx.tablesHandledInContainers.add(tId);
  }
```

- [ ] **Step 7: Keep + register direct-child tables in `buildNoteDom`**

`buildNoteDom` has no direct-child figure loop (it uses `figuresHandledInNotes`). Before its strip
`removeTablesExceptKept(noteEl, …)` (~3106), add a direct-child table keep+register (children of the note element):
```js
  // Keep + register non-inline tables that are direct children of the note (OC-B).
  const noteInlineTableIds = new Set((ctx?.inlineTables || []).map((t) => t.tableId));
  for (const child of Array.from(noteEl.childNodes)) {
    if (child.nodeName === 'table') {
      const tId = child.getAttribute('id');
      if (tId && !noteInlineTableIds.has(tId)) keptTableIds.add(tId);
    }
  }
  if (ctx && ctx.tablesHandledInContainers) {
    for (const tId of keptTableIds) ctx.tablesHandledInContainers.add(tId);
  }
```
(Place this immediately before the `removeTablesExceptKept(noteEl, …)` call so the strip keeps them.)

- [ ] **Step 8: Run the behavioral test — now passes**

Run: `npx vitest run tools/__tests__/cnxml-inject-container-table-order.test.js`
Expected: PASS (both tests).

- [ ] **Step 9: Add the m68789 both-paths regression test**

Append to the same test file (proves OC-B doesn't regress F4's inline-table handling — m68789 has BOTH an inline exercise table and a direct-child example table):
```js
import { readFileSync } from 'fs';
import { join } from 'path';

describe('m68789 renders both the inline (F4) and direct-child (OC-B) tables once each', () => {
  const src = readFileSync(
    join(import.meta.dirname, '..', '..', 'books', 'efnafraedi-2e', '01-source', 'ch12', 'm68789.cnxml'),
    'utf8'
  );
  const out = build(src);
  it('inline exercise table fs-idm121830912 appears exactly once (F4 path intact)', () => {
    expect((out.match(/<table\b[^>]*\bid="fs-idm121830912"/g) || []).length).toBe(1);
  });
  it('direct-child example table fs-idm205685856 appears exactly once (OC-B path)', () => {
    expect((out.match(/<table\b[^>]*\bid="fs-idm205685856"/g) || []).length).toBe(1);
  });
});
```

- [ ] **Step 10: Run the inject + table suites for regressions**

Run: `npx vitest run tools/__tests__/cnxml-inject-container-table-order.test.js tools/__tests__/cnxml-inject.test.js tools/__tests__/cnxml-inject-table-expand.test.js tools/__tests__/cnxml-table-double-model.test.js tools/__tests__/cnxml-dom-comparison.test.js`
Expected: all PASS. If a table/inject test fails, inspect whether it encodes the old strip-standalone behavior — report, don't silently rewrite.

- [ ] **Step 11: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject-container-table-order.test.js
git commit -m "fix(inject): keep direct-child container tables in place (tablesHandledInContainers) [OC-B]"
```

---

### Task 2: Integration verification — measure the residual drop + full suite + register

**Files:**
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (register — OC-B done + measured drop)

**Interfaces:**
- Consumes: `node tools/analyze-order-causes.js --book efnafraedi-2e`.

- [ ] **Step 1: Re-run the diagnostic**

Run: `node tools/analyze-order-causes.js --book efnafraedi-2e | tee /tmp/order-ocb.txt`
Read the clean / residual / FAILED counts and the per-module residuals.

- [ ] **Step 2: Assert the effect**

Confirm from `/tmp/order-ocb.txt`:
- Residual count **dropped** below 19 and clean count **rose** above 130.
- **No regression**: clean count did NOT fall (the fix only corrects). If it fell, STOP and investigate.
- The `table`-cause modules improved; the expected floor is the 3 non-table residual modules
  (m68739, m68832, m68852). Record the final numbers (expected ≈ 130+16 clean / ≈ 3 residual; a partial
  improvement is still success — some `table`-cause modules may retain a non-OC-B residual).
- Spot-check m68789: `node tools/analyze-order-causes.js --book efnafraedi-2e --json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const e=j.perModule.find(x=>x.moduleId==='m68789');console.log('m68789', e?('moved='+e.moved):'CLEAN')})"`

- [ ] **Step 3: Full suite + validate**

Run: `npm test`
Expected: all green.
Run: `npm run validate`
Expected: 24/24 (or current known-good).

- [ ] **Step 4: Record the result in the register**

In `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`, mark **OC-B ✅ DONE** with: the fix (`tablesHandledInContainers`, inject-only figure-analog), the measured residual drop (19 → `<N>`, clean 130 → `<M>`), m68789's after-state, and the remaining tail (the non-table residual modules) as the last step before the id-order gate flip. No committed `books/` bytes changed.

- [ ] **Step 5: Commit + push + PR**

```bash
git add docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md
git commit -m "docs(register): OC-B done — measured order-residual drop [OC-B]"
git push -u origin fix/chem-ocb-container-tables
gh pr create --base main --title "Fix OC-B: keep direct-child container tables in place" \
  --body "See docs/plans/2026-07-04-ocb-container-tables-{design,plan}.md. Inject-only tablesHandledInContainers (table analog of F4's figuresHandledInContainers); residual dropped 19→<N> (see register). No committed books/ bytes changed; armed for WS5."
```

---

## Self-Review Notes

- **Spec coverage:** ctx set + dispatch skip + 3 builders keep/register → Task 1; behavioral + m68789 both-paths tests → Task 1; diagnostic-drop proof + register → Task 2. All spec sections mapped.
- **F4-safety** (the key risk): every collection filters out `inlineTableIds`, so inline `[[TABLE:]]` tables stay on the expand-or-throw path and the fail-loud missing-translation guard is preserved. Stated in Global Constraints and each builder step.
- **Behavioral test fails pre-fix** — Step 2 guards against a vacuous test; the m68789 test proves no F4 regression.
- **Numbers measured, not guessed** (Task 2) — same pattern as OC-A/F4.
