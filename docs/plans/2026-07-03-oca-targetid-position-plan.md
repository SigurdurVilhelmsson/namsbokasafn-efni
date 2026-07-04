# OC-A/OC-C target-id Collision Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `id="X"` reads from colliding with `target-id="X"` in the extract position-sort and in `extractIdSequence`, so cross-referenced elements keep document order.

**Architecture:** One collision-safe primitive — the `(?<![\w-])id="` negative-lookbehind. A new exported `elementIdPosition(content, id)` in `cnxml-extract.js` replaces every id-based `content.indexOf('id="X"')` position lookup; `extractIdSequence` in `cnxml-fidelity-check.js` gets the same lookbehind. Verified by re-running the `analyze-order-causes` diagnostic (residual drop from the 60 baseline), not by regenerating committed artifacts.

**Tech Stack:** Node 22 ESM, Vitest. Touches `tools/cnxml-extract.js`, `tools/cnxml-fidelity-check.js`, their tests, and the diagnostic `tools/analyze-order-causes.js` (run only).

## Global Constraints

- **No committed `02-structure`/`02-for-mt`/`03-*`/`05-*` regeneration.** The fix is *armed* for WS5; all testing is fresh in-memory. No `books/` bytes change.
- The change may only **correct** element order, never worsen it: `elementIdPosition` returns the same offset as the old `indexOf` whenever there was no earlier `target-id` reference. **No previously-clean module may regress** (verified by the diagnostic re-run: clean count must rise, not fall).
- `npm test` from the repo root is the authoritative gate. Also `npm run validate`.
- One PR off `main`, branch `fix/chem-oca-targetid-position` (already created; design committed).
- The collision-safe pattern (verbatim from the `classifyMovedIds` fix): a structural `id="X"` read must use `(?<![\w-])id="X"` (an `id` attribute not preceded by a word char or `-`), so it never matches the tail of `target-id="X"`.
- Pre-fix diagnostic baseline (verification target): **89 clean / 60 residual / 149** on `main`.

---

### Task 1: `elementIdPosition` helper + `escapeRegExp` (`cnxml-extract.js`)

**Files:**
- Modify: `tools/cnxml-extract.js` — add two functions near the other module-level helpers (e.g. just after `generateSegmentId`, ~line 121); export `elementIdPosition` in the existing `export { … }` block (`:1910`)
- Test: `tools/__tests__/cnxml-extract-element-id-position.test.js` (create)

**Interfaces:**
- Produces: `elementIdPosition(content: string, id: string) → number` — the document offset of the opening tag that DEFINES `id="<id>"` (matched via `<[\w:-]+\b[^>]*(?<![\w-])id="ESCAPED"`), or `-1` if no such definition exists (including when `id` is falsy). Never returns the offset of a `target-id="<id>"` reference.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/cnxml-extract-element-id-position.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { elementIdPosition } from '../cnxml-extract.js';

describe('elementIdPosition', () => {
  it('returns the element definition offset, not an earlier target-id reference', () => {
    const src = `<para id="p1">see <link target-id="figZ"/></para><figure id="figZ"><media id="m"/></figure>`;
    const pos = elementIdPosition(src, 'figZ');
    // must point at the <figure id="figZ">, which is AFTER the <link target-id="figZ"/>
    expect(pos).toBe(src.indexOf('<figure id="figZ"'));
    expect(pos).toBeGreaterThan(src.indexOf('target-id="figZ"'));
  });

  it('returns -1 for an id that only appears as a target-id reference (no local definition)', () => {
    const src = `<para id="p1">see <link target-id="ghost" document="m999"/></para>`;
    expect(elementIdPosition(src, 'ghost')).toBe(-1);
  });

  it('returns the offset for a normally-defined id (never referenced)', () => {
    const src = `<para id="pA">a</para><note id="nB">b</note>`;
    expect(elementIdPosition(src, 'nB')).toBe(src.indexOf('<note id="nB"'));
  });

  it('is not fooled by an id that is a substring of another id', () => {
    const src = `<para id="p10">a</para><note id="p1">b</note>`;
    expect(elementIdPosition(src, 'p1')).toBe(src.indexOf('<note id="p1"'));
  });

  it('returns -1 for a falsy id (defensive)', () => {
    expect(elementIdPosition(`<para id="p1">a</para>`, '')).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-extract-element-id-position.test.js`
Expected: FAIL — `elementIdPosition` is not exported.

- [ ] **Step 3: Implement the helper + escapeRegExp**

In `tools/cnxml-extract.js`, add (near the other helpers, after `generateSegmentId`):

```js
/** Escape a string for safe literal use inside a RegExp. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Document offset of the element DEFINING id="<id>" — never a target-id="<id>"
 * reference. The (?<![\w-]) lookbehind ensures `id="` is a real attribute, not
 * the tail of `target-id="` (`-` is a non-word char, so a bare \b would match
 * inside target-id). Returns the index of the opening `<tag … id="<id>">`, or -1.
 * @param {string} content
 * @param {string} id
 * @returns {number}
 */
export function elementIdPosition(content, id) {
  if (!id) return -1;
  const m = content.match(new RegExp(`<[\\w:-]+\\b[^>]*(?<![\\w-])id="${escapeRegExp(id)}"`));
  return m ? m.index : -1;
}
```

Add `elementIdPosition` to the existing export block at the bottom (`:1910`):
```js
export { generateSegmentId, extractInlineText, extractSegments, formatSegmentsMarkdown, elementIdPosition };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-extract-element-id-position.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract-element-id-position.test.js
git commit -m "feat(extract): elementIdPosition — collision-safe element-definition offset [OC-A]"
```

---

### Task 2: Sweep the id-based position lookups to `elementIdPosition` (`cnxml-extract.js`)

**Files:**
- Modify: `tools/cnxml-extract.js` — 11 position-lookup sites (module-level `:520`, `processSection` `:708`, para `:798`, figure `:805`, table `:816`, example `:827`, exercise `:838`, note `:851`, list `:889`, media `:896`, equation `:878`)
- Test: `tools/__tests__/cnxml-extract-target-id-order.test.js` (create)

**Interfaces:**
- Consumes: `elementIdPosition` (Task 1).
- Produces: `extractSegments` orders an element after an earlier `<link target-id="…"/>` reference to it, instead of hoisting it to the reference's position.

- [ ] **Step 1: Write the failing behavioral test**

Create `tools/__tests__/cnxml-extract-target-id-order.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { extractSegments } from '../cnxml-extract.js';

// A figure cross-referenced by an EARLIER <link target-id="figZ"/> inside pA,
// with pB BETWEEN the reference and the figure's real definition. Correct order
// is pA, pB, figZ. Pre-fix, figZ's position resolves to the target-id reference
// (inside pA, BEFORE pB), so figZ is hoisted ahead of pB → pA, figZ, pB. The
// discriminating assertion is "pB before figZ": true only after the fix.
const CNXML = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Doc</title>
<content>
<section id="s1"><title>S1</title>
<para id="pA">As shown in <link target-id="figZ"/>, the trend holds.</para>
<para id="pB">Additional discussion appears in this paragraph.</para>
<figure id="figZ"><media id="mZ" alt="x"><image src="z.png" mime-type="image/png"/></media><caption>Cap</caption></figure>
</content>
</document>`;

function idsInOrder(structure) {
  const ids = [];
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.id) ids.push(n.id);
      if (n.content) walk(n.content);
    }
  };
  walk(structure.content);
  return ids;
}

describe('extract keeps a target-id-referenced element in document order (OC-A)', () => {
  it('does not hoist figZ ahead of pB via the earlier target-id reference', () => {
    const { structure } = extractSegments(CNXML);
    const ids = idsInOrder(structure);
    for (const id of ['pA', 'pB', 'figZ']) expect(ids).toContain(id);
    // The collision would put figZ (resolved to the target-id inside pA) before pB.
    expect(ids.indexOf('pB')).toBeLessThan(ids.indexOf('figZ'));
    // Full correct order:
    expect(ids.indexOf('pA')).toBeLessThan(ids.indexOf('pB'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-extract-target-id-order.test.js`
Expected: FAIL — pre-fix, `figZ` sorts before `pA` (its position resolves to the `target-id="figZ"` inside pA), so `indexOf('pA') < indexOf('figZ')` is false.

> If it unexpectedly passes pre-fix, the collision isn't reaching this path for this fixture — add a second referenced element or move the `<link>` earlier, and confirm the test genuinely fails before Step 3. A test that passes before the fix proves nothing.

- [ ] **Step 3: Sweep the call sites**

Apply `elementIdPosition` to each id-based lookup. Exact edits:

**(a) Module-level (`:519-520`)** — replace:
```js
    const idStr = element.id ? `id="${element.id}"` : null;
    const position = idStr ? content.indexOf(idStr) : 0;
```
with:
```js
    const position = element.id ? elementIdPosition(content, element.id) : 0;
```

**(b) `processSection` (`:707-708`)** — replace:
```js
    const idStr = element.id ? `id="${element.id}"` : null;
    const position = idStr ? contentWithoutTitle.indexOf(idStr) : 0;
```
with:
```js
    const position = element.id ? elementIdPosition(contentWithoutTitle, element.id) : 0;
```

**(c) para (`:797-798`)** — replace:
```js
    const idPattern = para.id ? `id="${para.id}"` : null;
    const position = idPattern ? content.indexOf(idPattern) : content.indexOf('<para');
```
with:
```js
    const position = para.id ? elementIdPosition(content, para.id) : content.indexOf('<para');
```

**(d) equation (`:877-878`)** — replace:
```js
    const idPattern = eq.id ? `id="${eq.id}"` : null;
    const position = idPattern ? content.indexOf(idPattern) : content.indexOf('<equation');
```
with:
```js
    const position = eq.id ? elementIdPosition(content, eq.id) : content.indexOf('<equation');
```

**(e) fullMatch-first sites** — figure `:803-805`, table `:814-816`, example `:825-827`, exercise `:836-838`, note `:849-851`, list `:887-889`, media `:894-896`. Each currently reads `element.fullMatch ? content.indexOf(element.fullMatch) : content.indexOf(\`id="${element.id}"\`)`. Change ONLY the id-based fallback branch to `elementIdPosition(content, element.id)`, keeping the `fullMatch`-first branch. E.g. figure:
```js
    const position = figure.fullMatch
      ? content.indexOf(figure.fullMatch)
      : elementIdPosition(content, figure.id);
```
Do the same for table (`table.id`), example (`example.id`), exercise (`exercise.id`), note (`note.id`), list (`list.id`), media (`media.id`).

**Do NOT touch** the `fullMatch`-only lookups (`:512`, `:690`, and the note-containment `content.indexOf(ex.fullMatch)` at `:856`/`:863`) — `fullMatch` is the whole element string, collision-free.

- [ ] **Step 4: Run the behavioral test + the full extract suite**

Run: `npx vitest run tools/__tests__/cnxml-extract-target-id-order.test.js tools/__tests__/cnxml-extract.test.js tools/__tests__/cnxml-extract-table-dedup.test.js`
Expected: the new order test PASSES; the existing extract suites still PASS (the sweep only changes positions for elements that had an earlier target-id collision; collision-free elements get the identical offset). If an existing test fails, inspect whether it encodes the OLD (buggy) order — if so that's a real find, report it, don't silently rewrite it.

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract-target-id-order.test.js
git commit -m "fix(extract): use elementIdPosition at all id-based position sorts — target-id no longer hoists elements [OC-A]"
```

---

### Task 3: Harden `extractIdSequence` against `target-id` (`cnxml-fidelity-check.js`)

**Files:**
- Modify: `tools/cnxml-fidelity-check.js:89` (`extractIdSequence`)
- Test: `tools/__tests__/cnxml-fidelity-check.test.js` (extend — it already imports from this module)

**Interfaces:**
- Produces: `extractIdSequence(cnxml)` returns element-definition ids in document order, skipping `target-id` references.

- [ ] **Step 1: Write the failing test**

Add to `tools/__tests__/cnxml-fidelity-check.test.js` (import `extractIdSequence` if not already imported):

```js
import { extractIdSequence } from '../cnxml-fidelity-check.js';

describe('extractIdSequence skips target-id references (OC-C)', () => {
  it('does not emit a phantom id for a target-id reference (order-discriminating)', () => {
    // An element BETWEEN the reference and the definition exposes the ref-vs-def
    // position difference (Set-dedup alone hides it): old \bid= → ['p1','figZ','mid'];
    // new lookbehind skips the target-id → definition order ['p1','mid','figZ'].
    const src = `<para id="p1">see <link target-id="figZ"/></para><para id="mid">x</para><figure id="figZ"/>`;
    expect(extractIdSequence(src)).toEqual(['p1', 'mid', 'figZ']);
  });

  it('drops a cross-document target-id that has no local definition', () => {
    const src = `<para id="p1">see <link target-id="ghost" document="m999"/></para>`;
    expect(extractIdSequence(src)).toEqual(['p1']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-fidelity-check.test.js -t "target-id"`
Expected: FAIL — the current `/\bid="([^"]+)"/g` matches inside `target-id="…"`, so `ghost`/`figZ` appear as phantom ids.

- [ ] **Step 3: Harden the regex**

In `tools/cnxml-fidelity-check.js`, `extractIdSequence` (~line 89), change:
```js
  const re = /\bid="([^"]+)"/g;
```
to:
```js
  // (?<![\w-]) excludes the tail of `target-id="…"` (and any `*-id="…"`) so a
  // cross-reference is never counted as an element id in the order sequence. (OC-C)
  const re = /(?<![\w-])id="([^"]+)"/g;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-fidelity-check.test.js`
Expected: PASS (the two new tests + all existing fidelity-check tests, incl. `compareElementOrder`).

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-fidelity-check.js tools/__tests__/cnxml-fidelity-check.test.js
git commit -m "fix(fidelity): extractIdSequence skips target-id references (negative lookbehind) [OC-C]"
```

---

### Task 4: Integration verification — measure the residual drop + full suite + register

**Files:**
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (register — record OC-A/OC-C fixed + the measured drop)

**Interfaces:**
- Consumes: `node tools/analyze-order-causes.js --book efnafraedi-2e` (the diagnostic built in PR #224).

- [ ] **Step 1: Re-run the diagnostic and capture the numbers**

Run: `node tools/analyze-order-causes.js --book efnafraedi-2e | tee /tmp/order-after.txt`
Read the header (`Clean modules`, `Modules with residual reorder`, `FAILED to build`) and the per-cause table.
Compare to the pre-fix baseline **89 clean / 60 residual**.

- [ ] **Step 2: Assert the fix's effect (the real proof)**

Confirm from `/tmp/order-after.txt`:
- Residual count **dropped** below 60 and clean count **rose** above 89 (the fix corrected order).
- **No regression**: clean count did NOT fall. If it fell, STOP — a previously-clean module went dirty, which contradicts the "only-corrects" property; investigate before proceeding.
- The four confirmed OC-A modules (m68710, m68674, m68795, m68830) are cleaner:
  `node tools/analyze-order-causes.js --book efnafraedi-2e --json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);for(const m of ['m68710','m68674','m68795','m68830']){const e=j.perModule.find(x=>x.moduleId===m);console.log(m, e?('moved='+e.moved):'CLEAN')}})"`
  Record each module's before (m68710=125-ish on stale is irrelevant; use the fresh pre-fix number if known, else just report the after) → after.

> The remaining residual is expected: OC-B (direct-child container tables) and the needs-deeper-look tail are NOT fixed here. A partial drop is success; full-zero is not required (and not expected).

- [ ] **Step 3: Full suite + validate**

Run: `npm test`
Expected: all green.
Run: `npm run validate`
Expected: 24/24 (or current known-good).

- [ ] **Step 4: Record the result in the register**

In `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`, update the OC-A and OC-C entries to **✅ DONE** with: the fix (elementIdPosition + sweep; extractIdSequence lookbehind), the measured residual drop (from 60 to `<N>`, clean from 89 to `<M>`), the four OC-A modules' after-state, and the note that the remaining residual is OC-B + the needs-deeper-look tail (still to be fixed before the gate flip). No committed `books/` bytes changed.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md
git commit -m "docs(register): OC-A/OC-C fixed — measured order-residual drop [OC-A]"
```

- [ ] **Step 6: Push + open PR**

```bash
git push -u origin fix/chem-oca-targetid-position
gh pr create --base main --title "Fix OC-A/OC-C: target-id collision in extract position-sort + extractIdSequence" \
  --body "See docs/plans/2026-07-03-oca-targetid-position-{design,plan}.md. Collision-safe elementIdPosition + extractIdSequence lookbehind; residual dropped from 60 (see register). No committed books/ bytes changed; armed for WS5."
```

---

## Self-Review Notes

- **Spec coverage:** helper + unit tests → Task 1; the ~11-site sweep + behavioral test → Task 2; `extractIdSequence` hardening → Task 3; the diagnostic-re-run proof + register → Task 4. All spec sections mapped.
- **Only-corrects-never-worsens** (the key safety property) is asserted twice: Task 2 Step 4 (existing suites unchanged) and Task 4 Step 2 (clean count must not fall).
- **The behavioral test in Task 2 must fail pre-fix** — Step 2 explicitly guards against a vacuous test that passes before the change.
- **Numbers are measured, not guessed** (Task 4 Steps 1-2) — the register entry (Task 4 Step 4) is filled from the actual run, same pattern as the F4/OC plans.
