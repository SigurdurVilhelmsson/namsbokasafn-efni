# F1: Fix Section-Content Reordering + Order Check — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `processSection` preserve document order (interleave subsections with loose content), and add an orthogonal, warn-only fidelity check that detects reordered content.

**Architecture:** Part A ports the module-level position-sort (`cnxml-extract.js:497–525`) into `processSection`, changing only the assembly (the two `.push()` sites) so segment ids stay byte-identical. Part B adds `extractIdSequence` + `compareElementOrder` to `cnxml-fidelity-check.js`, reported distinctly and never wired into `green`/the allowlist.

**Tech Stack:** Node 22 ESM, Vitest. Tested through the exported `extractSegments` (no need to export `processSection`).

**Design doc:** `docs/plans/2026-07-02-f1-extract-section-order-design.md`
**Motivating audit:** `docs/audit/2026-07-02-fable5-fidelity-provenance-review.md` (finding 1).

## Global Constraints

- **Sort the assembly, not the processing.** Keep the nested-sections loop and the `processTopLevelContent` call in their current order (sections processed before loose content) so `addSegment` auto-counters increment identically → segment ids unchanged. Only the final `content[]` order changes.
- **No committed `02-*` / `03-*` / `05-*` bytes may change** in this PR. No re-extract, re-inject, or re-render.
- **The order check is warn-only** — it must never affect `cnxml-fidelity-check.js`'s exit code, and must not be routed through `green` or the allowlist. Committed `03-translated` is still scrambled; a hard gate would fail.
- Path/test conventions: run `npm test` from the **repo root** (authoritative gate, no branch protection). One PR off `main`. TDD.

---

### Task 1: Part A — `processSection` interleave fix

**Files:**
- Create: `tools/__tests__/fixtures/interleaved-section.cnxml`
- Modify: `tools/cnxml-extract.js` (`processSection`, 672–700)
- Test: `tools/__tests__/cnxml-extract.test.js` (append a describe block)

**Interfaces:**
- Consumes: exported `extractSegments(cnxml, { moduleId }) → { segments, structure, … }`; `structure.content[]` holds `{ type, id, content? }` nodes.
- Produces: `processSection` assembles `content[]` in document order.

- [ ] **Step 1: Create the fixture**

`tools/__tests__/fixtures/interleaved-section.cnxml`:

```xml
<document xmlns="http://cnx.rice.edu/cnxml">

<title>Order Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml">
  <md:content-id>m00099</md:content-id>
  <md:title>Order Test</md:title>
  <md:abstract/>
  <md:uuid>00000000-0000-0000-0000-000000000099</md:uuid>
</metadata>

<content>
<section id="sec-outer">
<title>Outer</title>
<para id="para-intro">Intro paragraph before the subsection.</para>
<section id="sec-inner">
<title>Inner</title>
<para id="para-inner">Paragraph inside the subsection.</para>
</section>
<para id="para-outro">Outro paragraph after the subsection.</para>
</section>
</content>
</document>
```

- [ ] **Step 2: Write the failing test** (append to `tools/__tests__/cnxml-extract.test.js`)

```js
// ─── processSection document order (F1) ───────────────────────────

describe('section content order (F1)', () => {
  it('interleaves loose paras and nested subsections by document position', () => {
    const cnxml = readFileSync(join(FIXTURES, 'interleaved-section.cnxml'), 'utf8');
    const { structure } = extractSegments(cnxml, { moduleId: 'm00099' });

    const outer = structure.content.find((c) => c.type === 'section' && c.id === 'sec-outer');
    const order = outer.content.map((c) => `${c.type}:${c.id}`);

    expect(order).toEqual(['para:para-intro', 'section:sec-inner', 'para:para-outro']);
  });

  it('keeps segment emission order (ids) stable — processing order unchanged', () => {
    const cnxml = readFileSync(join(FIXTURES, 'interleaved-section.cnxml'), 'utf8');
    const { segments } = extractSegments(cnxml, { moduleId: 'm00099' });

    // Sections are still processed before loose content, so segment ids emit in this fixed order.
    const ids = segments.map((s) => s.id);
    expect(ids).toEqual([
      'm00099:title:sec-outer-title',
      'm00099:title:sec-inner-title',
      'm00099:para:para-inner',
      'm00099:para:para-intro',
      'm00099:para:para-outro',
    ]);
  });
});
```

- [ ] **Step 3: Run to verify the order test fails**

Run: `npx vitest run tools/__tests__/cnxml-extract.test.js -t "section content order"`
Expected: the first test FAILS — current order is `['section:sec-inner', 'para:para-intro', 'para:para-outro']`. The second (id-stability) test **passes already** (processing order is unchanged by the fix) — that's intended; it's a regression guard.

> If the second test fails at this step, the fixture's expected id list is wrong for this codebase — fix the *expected* list to match the actual pre-change output (capture it via a one-off `console.log(segments.map(s=>s.id))`), because id-stability is the invariant, not a specific literal.

- [ ] **Step 4: Apply the fix** — replace the two push blocks in `processSection` (`tools/cnxml-extract.js`, currently 672–700):

Replace:

```js
  // Process nested sections first
  const nestedSections = extractNestedElements(contentWithoutTitle, 'section');
  for (const nested of nestedSections) {
    const nestedStructure = processSection(
      nested,
      moduleId,
      addSegment,
      mathMap,
      counters,
      verbose,
      inlineMediaMap,
      inlineTablesMap
    );
    sectionStructure.content.push(nestedStructure);
  }

  // Process other content (excluding nested sections)
  const contentWithoutSections = removeNestedElements(contentWithoutTitle, 'section');
  const elements = processTopLevelContent(
    contentWithoutSections,
    moduleId,
    addSegment,
    mathMap,
    counters,
    verbose,
    inlineMediaMap,
    inlineTablesMap
  );
  sectionStructure.content.push(...elements);
```

with:

```js
  // Collect subsections and loose content with document positions, then interleave.
  // Processing order is unchanged (sections first) so segment ids stay stable; only
  // the assembled content[] is sorted — mirrors the module level (cnxml-extract.js:497-525).
  const itemsWithPositions = [];

  // Process nested sections first (UNCHANGED processing order)
  const nestedSections = extractNestedElements(contentWithoutTitle, 'section');
  for (const nested of nestedSections) {
    const nestedStructure = processSection(
      nested,
      moduleId,
      addSegment,
      mathMap,
      counters,
      verbose,
      inlineMediaMap,
      inlineTablesMap
    );
    const position = nested.fullMatch ? contentWithoutTitle.indexOf(nested.fullMatch) : 0;
    itemsWithPositions.push({ item: nestedStructure, position: position !== -1 ? position : 0 });
  }

  // Process other content (excluding nested sections) — UNCHANGED processing order
  const contentWithoutSections = removeNestedElements(contentWithoutTitle, 'section');
  const elements = processTopLevelContent(
    contentWithoutSections,
    moduleId,
    addSegment,
    mathMap,
    counters,
    verbose,
    inlineMediaMap,
    inlineTablesMap
  );
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

- [ ] **Step 5: Run to verify both tests pass + no extract regressions**

Run: `npx vitest run tools/__tests__/cnxml-extract.test.js`
Expected: PASS — the order test now green, id-stability green, all pre-existing extract tests still green.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract.test.js tools/__tests__/fixtures/interleaved-section.cnxml
git commit -m "fix(F1): processSection interleaves subsections + loose content by document order"
```

---

### Task 2: Part B — order-check helpers + unit tests

**Files:**
- Modify: `tools/cnxml-fidelity-check.js` (add exports near `compareTagCounts`:63)
- Test: `tools/__tests__/cnxml-fidelity-check.test.js` (append)

**Interfaces:**
- Produces:
  - `extractIdSequence(cnxml) → string[]` — every `id="…"` in document order, first occurrence per id.
  - `compareElementOrder(sourceCnxml, translatedCnxml) → { ok: boolean, moved: string[] }` — compares the relative order of ids common to both; `moved` lists positions where source and translated order diverge.

- [ ] **Step 1: Write the failing tests** (append to `tools/__tests__/cnxml-fidelity-check.test.js`)

```js
import { extractIdSequence, compareElementOrder } from '../cnxml-fidelity-check.js';

describe('extractIdSequence', () => {
  it('returns ids in document order, first occurrence only', () => {
    const cnxml = '<a id="p1"/><b id="p2"><c id="p3"/></b><d id="p2"/>';
    expect(extractIdSequence(cnxml)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('compareElementOrder', () => {
  it('ok:true when common ids are in the same relative order', () => {
    const src = '<x id="a"/><x id="b"/><x id="c"/>';
    const trans = '<x id="a"/><x id="b"/><x id="c"/>';
    expect(compareElementOrder(src, trans)).toEqual({ ok: true, moved: [] });
  });

  it('ok:false and reports moved ids when order differs', () => {
    const src = '<x id="a"/><x id="b"/><x id="c"/>';
    const trans = '<x id="b"/><x id="a"/><x id="c"/>'; // a and b swapped
    const r = compareElementOrder(src, trans);
    expect(r.ok).toBe(false);
    expect(r.moved).toContain('a');
    expect(r.moved).toContain('b');
  });

  it('ignores ids present in only one side (add/drop is the tag-count check job)', () => {
    const src = '<x id="a"/><x id="b"/>';
    const trans = '<x id="a"/><x id="z"/><x id="b"/>'; // z extra, a/b order preserved
    expect(compareElementOrder(src, trans)).toEqual({ ok: true, moved: [] });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tools/__tests__/cnxml-fidelity-check.test.js -t "ElementOrder"`
Expected: FAIL — `extractIdSequence`/`compareElementOrder` are not exported.

- [ ] **Step 3: Add the helpers** to `tools/cnxml-fidelity-check.js` (immediately after `compareTagCounts`, ~line 80):

```js
/**
 * Every id="..." in document order, first occurrence per id.
 * @param {string} cnxml
 * @returns {string[]}
 */
export function extractIdSequence(cnxml) {
  const seq = [];
  const seen = new Set();
  const re = /\bid="([^"]+)"/g;
  let m;
  while ((m = re.exec(cnxml)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      seq.push(m[1]);
    }
  }
  return seq;
}

/**
 * Compare the relative document order of ids common to source and translated CNXML.
 * Add/drop (ids in only one side) is the tag-count check's job and is ignored here.
 * Orthogonal to the tag-count/green/allowlist machinery (F1; do not wire into green).
 *
 * @param {string} sourceCnxml
 * @param {string} translatedCnxml
 * @returns {{ ok: boolean, moved: string[] }}
 */
export function compareElementOrder(sourceCnxml, translatedCnxml) {
  const srcSeq = extractIdSequence(sourceCnxml);
  const transSeq = extractIdSequence(translatedCnxml);
  const srcSet = new Set(srcSeq);
  const transSet = new Set(transSeq);

  const srcCommon = srcSeq.filter((id) => transSet.has(id));
  const transCommon = transSeq.filter((id) => srcSet.has(id));

  const moved = [];
  for (let i = 0; i < srcCommon.length; i++) {
    if (srcCommon[i] !== transCommon[i]) moved.push(srcCommon[i]);
  }
  return { ok: moved.length === 0, moved };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tools/__tests__/cnxml-fidelity-check.test.js`
Expected: PASS (new tests + all pre-existing fidelity-check tests).

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-fidelity-check.js tools/__tests__/cnxml-fidelity-check.test.js
git commit -m "feat(F1): add extractIdSequence + compareElementOrder (order-check helpers)"
```

---

### Task 3: Part B — wire warn-only ORDER report into `main()` + validate book-wide

**Files:**
- Modify: `tools/cnxml-fidelity-check.js` (`main()`, ~229–260 module loop + summary)

**Interfaces:**
- Consumes: `compareElementOrder` (Task 2), `sourceCnxml`/`translatedCnxml` already read at ~248–249.
- Produces: warn-only `ORDER` output; **exit code unchanged**.

- [ ] **Step 1: Add the warn-only report** in `main()`. Just after the existing
`const diffs = compareTagCounts(sourceCnxml, translatedCnxml);` (~line 250), add:

```js
      const order = compareElementOrder(sourceCnxml, translatedCnxml);
      if (!order.ok) {
        orderMismatchModules.push(moduleId);
        const shown = order.moved.slice(0, 8).join(', ');
        const more = order.moved.length > 8 ? ` …(+${order.moved.length - 8})` : '';
        console.log(
          `  ORDER [warn-only]: ${moduleId} — ${order.moved.length} id(s) out of document order: ${shown}${more}`
        );
      }
```

Declare the accumulator near the top of `main()` (with the other per-run state, before the chapter loop):

```js
  const orderMismatchModules = [];
```

And after the loops, before the final exit, add a summary line that does **not** change the exit code:

```js
  console.log(
    `Order check (warn-only): ${orderMismatchModules.length} module(s) with reordered content`
  );
```

- [ ] **Step 2: Confirm the exit code is still driven only by unexplained tag-count discrepancies**

Read the end of `main()` (~line 298) and verify the `process.exit(...)` / return value does **not** reference `orderMismatchModules`. It must not. (No test change — this is an inspection step.)

- [ ] **Step 3: Full suite green (no gate regressions)**

Run: `npm test` (repo root)
Expected: all green — the warn-only report adds stdout only, no assertion depends on it.

- [ ] **Step 4: Book-wide validation run (record in PR body, NOT a CI assertion)**

Run: `node tools/cnxml-fidelity-check.js --book efnafraedi-2e --track mt-preview 2>&1 | grep -c "ORDER \[warn-only\]"`
Expected: a count in the audit's **15–36** range (finding 1). Record the exact number + a few example module ids in the PR body. If the count is 0 or wildly outside 15–36, STOP — the id-sequence granularity is wrong (e.g. matching attribute `id=` on non-structural elements); reconcile before proceeding.

- [ ] **Step 5: Confirm no committed content bytes changed**

Run: `git status --porcelain 'books/'`
Expected: **empty** — F1 changes tools + tests + docs only, never `books/`.

- [ ] **Step 6: `npm run validate` + commit**

```bash
npm run validate   # expect 24/24
git add tools/cnxml-fidelity-check.js
git commit -m "feat(F1): warn-only ORDER report in fidelity check main() (orthogonal to green)"
```

---

## Self-Review

**Spec coverage:**
- Part A `processSection` interleave fix → Task 1. ✓
- Segment-id stability (assembly-sort, not processing-sort) → Task 1 Step 2 second test + the "processing order UNCHANGED" comments in Step 4. ✓
- Part B `extractIdSequence` + `compareElementOrder`, intersection-only, orthogonal → Task 2. ✓
- Warn-only report, exit code unaffected, not in green/allowlist → Task 3 Steps 1–2. ✓
- Book-wide validation reconciles with 15–36 → Task 3 Step 4. ✓
- No committed `02-/03-/05-` bytes changed → Task 3 Step 5 explicit check. ✓

**Placeholder scan:** none. Task 1 Step 3 includes a fallback instruction (capture actual ids if the literal list is wrong) — that's a real contingency, not a placeholder.

**Type consistency:** `compareElementOrder → { ok, moved }` used identically in Task 2 tests and Task 3 report. `extractIdSequence → string[]` consistent. `structure.content[]` node shape `{ type, id }` matches Task 1 assertions. ✓

## Post-plan follow-ups (not F1)

- Regeneration (re-extract → re-inject → re-render) of the ~15–36 affected modules is **deferred**; it belongs to a later batched pass (with/after Track B4 marker migration, since re-extract modernizes `02-for-mt` markers) that feeds WS5. At that point flip the order check from warn-only to a hard gate.
- Next clean-slate critical-path item after F1: **F4/F5/F6** marker-residue inject bugs + the "no `[[` in output" completeness-gate assertion.
