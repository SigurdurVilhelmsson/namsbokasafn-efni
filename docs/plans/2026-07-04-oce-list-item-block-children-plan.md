# OC-E List-Item Block-Children Order Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop hoisting block `<equation>`/`<media>` nested in `<list><item>` to top-level content so they render in their correct in-item position, clearing the last 4 element-reorder modules (m68739/m68793/m68832/m68852) in efnafraedi-2e.

**Architecture:** Two layers. **Layer 1 (required):** in `cnxml-extract.js` `processTopLevelContent`, strip list content before extracting standalone media/paras/equations (mirroring the existing para treatment) so list-nested blocks are not hoisted; they then render via their existing in-item `[[MATH:N]]`/`[[MEDIA:N]]` placeholders (no longer suppressed, no longer duplicated) — clears the order gate with **no `buildList` change**. **Layer 2 (attempt, narrow):** for the single para-wrapped multi-child item pattern (m68793 item-1), record `wrapsPara` + ordered `blockChildren` and emit the `<para>` wrapper + block sibling in `buildList`, restoring an order-invisible round-trip loss — **only if achievable with zero item-segment-text change**, else fall back and log.

**Tech Stack:** Node 22.x ESM, Vitest (run from repo root). Tools: `tools/cnxml-extract.js`, `tools/cnxml-inject.js`, `tools/analyze-order-causes.js`.

## Global Constraints

- **Segment-preserving:** no list-item segment id or text may change (byte-identical to existing `02-mt-output`). Changing item segment text forces a re-MT and is OUT of scope.
- **No committed bytes:** no changes to `books/*/01-source/`, `02-*`, `03-*`, or `05-*`. The fix is code-only and armed for WS5 re-inject.
- **Fix, not allowlist.** No fidelity-allowlist entries for these 4 modules.
- **Gate flip is OUT of scope** (deferred to post-WS5; the order check reads committed `03-translated/`, stale until WS5 re-inject — matches OC-A/OC-B).
- **Authoritative gate:** `npm test` from the **repo root** (no branch protection).
- **Measurement:** `node tools/analyze-order-causes.js --book efnafraedi-2e` must go 145/4/0 → **149/0/0** (clean/residual/build-failures) and never regress a previously-clean module.
- Design doc: [`2026-07-04-oce-list-item-block-children-design.md`](2026-07-04-oce-list-item-block-children-design.md). Triage: [`../audit/2026-07-04-order-tail-triage-list-item-block-children.md`](../audit/2026-07-04-order-tail-triage-list-item-block-children.md).

---

## File Structure

- **Modify** `tools/cnxml-extract.js`
  - `processTopLevelContent` (approx. lines 795–810): strip lists before media/para/equation extraction (Task 2).
  - `extractSegments` (post-pass before `return`, approx. line 655): fail-loud drop guard (Task 3).
  - `processList` (approx. lines 1554–1580): record `wrapsPara` + `blockChildren` for para-wrapped multi-child items (Task 4, Layer 2).
- **Modify** `tools/cnxml-inject.js`
  - `collectBlockEquationIds` (approx. line 1468) + a `blockMediaIds` analog + `buildList` (approx. line 3173): emit `wrapsPara` + `blockChildren` (Task 4, Layer 2).
- **Create** `tools/__tests__/cnxml-list-item-block-children.test.js` — order + render-in-place + tag-count-parity + guard tests (all tasks).

---

### Task 1: Pin the failing tests (RED)

**Files:**
- Create: `tools/__tests__/cnxml-list-item-block-children.test.js`

**Interfaces:**
- Consumes: `analyzeModuleOrder(sourceCnxml) → { moved: string[], counts, unresolved }` from `../analyze-order-causes.js`; `extractSegments`, `formatSegmentsMarkdown` from `../cnxml-extract.js`; `buildCnxml`, `parseSegments` from `../cnxml-inject.js`; `compareTagCounts` from `../cnxml-fidelity-check.js`.
- Produces: the module's canonical test file, referenced by all later tasks.

- [ ] **Step 1: Write the failing tests**

```javascript
// tools/__tests__/cnxml-list-item-block-children.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { analyzeModuleOrder } from '../analyze-order-causes.js';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';
import { compareTagCounts } from '../cnxml-fidelity-check.js';

const SRC = join(process.cwd(), 'books/efnafraedi-2e/01-source');
const read = (ch, m) => readFileSync(join(SRC, ch, `${m}.cnxml`), 'utf8');

/** Build fresh injected CNXML the same way analyzeModuleOrder does. */
function buildFresh(src) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(src);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  return buildCnxml(structure, parsed, equations, src, {}, inlineAttrs).cnxml;
}

const MODULES = [
  ['ch07', 'm68739'],
  ['ch12', 'm68793'],
  ['ch18', 'm68832'],
  ['ch21', 'm68852'],
];

describe('OC-E: block children inside <list><item>', () => {
  for (const [ch, m] of MODULES) {
    it(`${m}: no reordered ids`, () => {
      expect(analyzeModuleOrder(read(ch, m)).moved).toEqual([]);
    });
    it(`${m}: no dropped equation/media (tag-count parity)`, () => {
      const src = read(ch, m);
      const diffs = compareTagCounts(src, buildFresh(src));
      const lost = diffs.filter(
        (d) => (d.tag === 'equation' || d.tag === 'media') && d.difference < 0
      );
      expect(lost).toEqual([]);
    });
  }

  it('m68793: item-1 equation renders inside its list, not after it', () => {
    const out = buildFresh(read('ch12', 'm68793'));
    // The list fs-idm90348816 closes; item-1's equation fs-idm98497056 must
    // appear BEFORE that </list>, i.e. inside the list.
    const listOpen = out.indexOf('id="fs-idm90348816"');
    const listClose = out.indexOf('</list>', listOpen);
    const eq = out.indexOf('id="fs-idm98497056"');
    expect(eq).toBeGreaterThan(listOpen);
    expect(eq).toBeLessThan(listClose);
  });
});
```

- [ ] **Step 2: Run the tests to verify they FAIL**

Run: `npx vitest run tools/__tests__/cnxml-list-item-block-children.test.js`
Expected: the four `no reordered ids` tests FAIL (moved arrays are non-empty), and the `m68793 … inside its list` test FAILS (equation index > `</list>` index). The tag-count-parity tests likely PASS already (nothing is dropped today — content is merely misplaced); that is fine, they are regression guards for Tasks 2–4.

- [ ] **Step 3: Commit the RED tests**

```bash
git add tools/__tests__/cnxml-list-item-block-children.test.js
git commit -m "test(oce): pin failing order + render-in-place tests for list-item block children [OC-E]"
```

---

### Task 2: Layer 1 — strip lists before media/para/equation extraction

**Files:**
- Modify: `tools/cnxml-extract.js` — `processTopLevelContent` (approx. lines 795–810)
- Test: `tools/__tests__/cnxml-list-item-block-children.test.js` (from Task 1)

**Interfaces:**
- Consumes: existing locals in `processTopLevelContent` — `contentForSimpleElements` (containers already stripped), `extractNestedElements`, `extractElements`.
- Produces: `contentWithoutLists` (list-stripped content) used for `standaloneMedia`, `paras`, `equations`. Removes the separate `contentForParas` variable.

- [ ] **Step 1: Confirm the target block**

Read `tools/cnxml-extract.js` lines 795–810. Current state: `standaloneMedia` (795) and `equations` (810) read `contentForSimpleElements` (lists NOT stripped); only `contentForParas` (802–807) strips lists. This is the hoist bug.

- [ ] **Step 2: Apply the fix**

Replace lines 795–810 (the `standaloneMedia`/`lists`/`contentForParas`/`paras`/`equations` block) with:

```javascript
  const lists = extractNestedElements(contentForSimpleElements, 'list');

  // Strip list content before extracting standalone media, paras, AND equations.
  // Block <media>/<para>/<equation> nested inside <list><item> are captured in-item
  // by processList() and render via their [[MEDIA:N]]/[[MATH:N]] placeholders. Without
  // stripping lists here, they are ALSO hoisted to top-level content and re-emitted
  // AFTER the list (OC-E order bug). Paras were already stripped; equations/media were
  // not — this unifies all three.
  let contentWithoutLists = contentForSimpleElements;
  for (const list of lists) {
    if (list.fullMatch) {
      contentWithoutLists = contentWithoutLists.replace(list.fullMatch, '');
    }
  }

  const standaloneMedia = extractNestedElements(contentWithoutLists, 'media');
  const paras = extractElements(contentWithoutLists, 'para');
  const equations = extractElements(contentWithoutLists, 'equation');
```

(Remove the now-dead `contentForParas` variable entirely; `paras` now reads `contentWithoutLists`.)

- [ ] **Step 3: Run the Task 1 order tests — expect PASS**

Run: `npx vitest run tools/__tests__/cnxml-list-item-block-children.test.js`
Expected: all four `no reordered ids` tests PASS, `m68793 … inside its list` PASSES, tag-count-parity PASSES.

- [ ] **Step 4: Run the book-wide measurement**

Run: `node tools/analyze-order-causes.js --book efnafraedi-2e`
Expected: **149 clean / 0 residual / 0 build failures** (was 145/4/0). Confirm no previously-clean module regressed (clean count only rises).

- [ ] **Step 5: Run the existing extract/inject/order suites — expect no regressions**

Run: `npx vitest run tools/__tests__/cnxml-extract.test.js tools/__tests__/cnxml-inject.test.js tools/__tests__/cnxml-dom-comparison.test.js tools/__tests__/analyze-order-causes.test.js`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-extract.js
git commit -m "fix(extract): strip lists before equation/media extraction so in-item blocks stay in place [OC-E]"
```

---

### Task 3: Fail-loud guard against silently dropping an in-item block

**Files:**
- Modify: `tools/cnxml-extract.js` — new guard helper + call from `extractSegments` (before `return`, approx. line 655)
- Test: `tools/__tests__/cnxml-list-item-block-children.test.js`

**Interfaces:**
- Consumes: the fully-built `structure`, `segments` (array of `{id, text}`), and `equations` map (id → `{mathml, equationId?, isBlock?}`) available at the end of `extractSegments`; `structure.inlineMedia` (array of `{placeholder, ...}` with a media id field).
- Produces: `assertNoDroppedListBlocks(cnxml, structure, segments, equations)` — throws `Error` if any source `<equation id>`/`<media id>` inside a `<list>` is neither present in `structure.content` (recursively) nor referenced by a `[[MATH:N]]`/`[[MEDIA:N]]` placeholder in any segment nor recorded as an item `blockChild`.

- [ ] **Step 1: Write the failing guard unit test**

Add to the test file:

```javascript
import { extractSegments as _extract } from '../cnxml-extract.js';

describe('OC-E: fail-loud guard', () => {
  it('throws if a list-nested block equation has no in-item placeholder or content node', () => {
    // Synthetic module: a list item references a block equation by id, but the
    // equation has NO <m:math> (so no [[MATH:N]] placeholder is produced) and it
    // is inside the list (so Task 2 strips it from top-level content) → it would
    // be silently dropped. The guard must throw.
    const bad = `<?xml version="1.0"?>
<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML" id="mTEST">
<title>t</title><content>
<list id="L1"><item><equation id="EQGHOST"></equation></item></list>
</content></document>`;
    expect(() => _extract(bad, 'mTEST')).toThrow(/EQGHOST/);
  });

  it('does not throw for the real modules (all in-item blocks accounted for)', () => {
    for (const [ch, m] of [['ch07', 'm68739'], ['ch12', 'm68793']]) {
      expect(() => _extract(read(ch, m), m)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run to verify the first guard test FAILS**

Run: `npx vitest run tools/__tests__/cnxml-list-item-block-children.test.js -t "fail-loud guard"`
Expected: `throws if a list-nested block equation…` FAILS (no throw yet); the `does not throw` test PASSES.

- [ ] **Step 3: Implement the guard**

Add this helper near the other extraction helpers in `tools/cnxml-extract.js`:

```javascript
/**
 * OC-E safety net: after Task 2 stops hoisting list-nested blocks to top-level
 * content, verify no such block is silently dropped. compareElementOrder ignores
 * DROPPED ids, so a drop would look green — this guard fails loud instead.
 * Throws listing any <equation>/<media> id that is inside a <list> in source but
 * will render nowhere (not a content node, no placeholder, not a blockChild).
 */
export function assertNoDroppedListBlocks(cnxml, structure, segments, equations) {
  // 1. Source block ids inside any <list>…</list>.
  const listBlocks = cnxml.match(/<list[\s>][\s\S]*?<\/list>/g) || [];
  const inListEqIds = new Set();
  const inListMediaIds = new Set();
  for (const block of listBlocks) {
    for (const mm of block.matchAll(/<equation\b[^>]*\bid="([^"]+)"/g)) inListEqIds.add(mm[1]);
    for (const mm of block.matchAll(/<media\b[^>]*\bid="([^"]+)"/g)) inListMediaIds.add(mm[1]);
  }
  if (inListEqIds.size === 0 && inListMediaIds.size === 0) return;

  // 2. Ids that WILL render.
  const rendered = new Set();
  // 2a. content nodes (recursively) + item blockChildren + nested-list children
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.id && (n.type === 'equation' || n.type === 'media')) rendered.add(n.id);
      if (n.content) walk(n.content);
      for (const it of n.items || []) {
        for (const c of it.children || []) walk([c]);
        for (const bc of it.blockChildren || []) if (bc.id) rendered.add(bc.id);
      }
    }
  };
  walk(structure.content || []);
  // 2b. equation ids referenced by [[MATH:N]] placeholders in any segment
  const segText = segments.map((s) => s.text).join('\n');
  for (const mm of segText.matchAll(/\[\[MATH:(\d+)\]\]/g)) {
    const eq = equations[`math-${mm[1]}`];
    if (eq && eq.equationId) rendered.add(eq.equationId);
  }
  // 2c. media ids referenced by [[MEDIA:N]] placeholders
  const mediaByPlaceholder = new Map(
    (structure.inlineMedia || []).map((m) => [m.placeholder, m.id])
  );
  for (const mm of segText.matchAll(/\[\[MEDIA:\d+\]\]/g)) {
    const id = mediaByPlaceholder.get(mm[0]);
    if (id) rendered.add(id);
  }

  // 3. Assert coverage.
  const missing = [
    ...[...inListEqIds].filter((id) => !rendered.has(id)),
    ...[...inListMediaIds].filter((id) => !rendered.has(id)),
  ];
  if (missing.length > 0) {
    throw new Error(
      `OC-E guard: list-nested block(s) would render nowhere (silent drop): ${missing.join(', ')}`
    );
  }
}
```

Then call it in `extractSegments` immediately before `return { segments, structure, equations, inlineAttrs: inlineAttrsMap };`:

```javascript
  assertNoDroppedListBlocks(content, structure, segments, equations);
```

> **Impl note:** verify the exact field names in the RED step — `structure.inlineMedia[].id` (the media element id) and `equations['math-N'].equationId` (block-equation id). If `inlineMedia` entries key the id under a different field (e.g. `mediaId`), adjust `mediaByPlaceholder`. The synthetic-drop test and the two real-module `not.toThrow` tests together prove the guard is neither too loose nor too tight.

- [ ] **Step 4: Run the guard tests — expect PASS**

Run: `npx vitest run tools/__tests__/cnxml-list-item-block-children.test.js -t "fail-loud guard"`
Expected: both guard tests PASS.

- [ ] **Step 5: Re-run the full module test file + book measurement**

Run: `npx vitest run tools/__tests__/cnxml-list-item-block-children.test.js && node tools/analyze-order-causes.js --book efnafraedi-2e`
Expected: all tests PASS; measurement still 149/0/0 (the guard does not throw on any real module).

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-list-item-block-children.test.js
git commit -m "feat(extract): fail-loud guard against dropping list-nested block equation/media [OC-E]"
```

---

### Task 4: Layer 2 — restore the `<para>` wrapper on the para-wrapped multi-child item (m68793)

> **Attempt-then-fallback (lead decision).** Layer 2 restores an order-INVISIBLE round-trip loss and applies to exactly ONE pattern found in the 4 modules: m68793 item-1 (a leading `<para>` followed by a block `<equation>`). m68739/m68832/m68852 block-child items are bare text (no leading para) → already fully handled by Layer 1, no wrapper to restore. If any step below cannot be done without changing an item's segment text, STOP: revert Task 4's changes, keep Tasks 1–3, and log the `<para>`-wrapper loss as a deferred round-trip item (register + memory). Tasks 1–3 already satisfy the gate DoD.

**Files:**
- Modify: `tools/cnxml-extract.js` — `processList` else-branch (approx. lines 1554–1580)
- Modify: `tools/cnxml-inject.js` — `collectBlockEquationIds` (approx. 1468), new `blockMediaIds` set + threading through `getSeg`/`reverseInlineMarkup` (approx. 1521–1573, 1105/1122), `buildList` (approx. 3173–3207)
- Test: `tools/__tests__/cnxml-list-item-block-children.test.js`

**Interfaces:**
- Produces (extraction): a multi-child list item gains `wrapsPara: { openTag, id }` (leading para) and `blockChildren: [{ type: 'equation'|'media', id }]` (document order). The item `segmentId` and its segment TEXT are unchanged.
- Produces (inject): `buildList` emits `<item>${wrapsPara.openTag}${text}</para>` then each `blockChild`, then nested-list children, then `</item>`; `collectBlockEquationIds` adds item `blockChildren` equation ids so their in-item `[[MATH:N]]` is suppressed; a parallel `blockMediaIds` suppresses in-item `[[MEDIA:N]]` for `blockChildren` media.

- [ ] **Step 1: Write the failing render-in-place-with-para test**

Add to the test file:

```javascript
describe('OC-E Layer 2: <para> wrapper on multi-child item', () => {
  it('m68793 item-1 renders <para id=fs-idm136564352>…</para><equation …/> inside the item', () => {
    const out = buildFresh(read('ch12', 'm68793'));
    const para = out.indexOf('id="fs-idm136564352"');
    const eq = out.indexOf('id="fs-idm98497056"');
    const listClose = out.indexOf('</list>', out.indexOf('id="fs-idm90348816"'));
    // both the para wrapper and the equation are present, inside the list, in order
    expect(para).toBeGreaterThan(-1);
    expect(eq).toBeGreaterThan(para);
    expect(eq).toBeLessThan(listClose);
    // the equation is NOT nested inside the para (para closes before the equation)
    const paraClose = out.indexOf('</para>', para);
    expect(paraClose).toBeLessThan(eq);
  });
});
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `npx vitest run tools/__tests__/cnxml-list-item-block-children.test.js -t "Layer 2"`
Expected: FAIL — after Task 2, m68793 item-1 renders as bare `<item>text <equation/></item>` (no `id="fs-idm136564352"` para wrapper), so `para` is `-1`.

- [ ] **Step 3: Extraction — record `wrapsPara` + `blockChildren` for the para-wrapped multi-child item**

In `processList`, the `else` branch (no nested lists, approx. lines 1554–1580) currently only sets `wrapsPara` when the WHOLE item is a single `<para>`. Extend it: match a LEADING `<para>` optionally followed by block `<equation>`/`<media>` siblings. Keep the segment computation on the full `innerContent` UNCHANGED (so the segment text — including the block's `[[MATH:N]]`/`[[MEDIA:N]]` placeholder — is byte-identical).

Replace the else-branch body with:

```javascript
      // Single para wrapping the whole item, OR a leading para followed by block
      // siblings (equation/media). Match the leading para and any trailing blocks.
      const leadParaMatch = item.content
        .trim()
        .match(/^(<para\b[^>]*>)([\s\S]*?)<\/para>\s*([\s\S]*)$/);
      const trailing = leadParaMatch ? leadParaMatch[3].trim() : '';
      const isSingleParaItem = leadParaMatch && trailing === '';
      const isMultiChildParaItem =
        leadParaMatch && trailing !== '' && /^(?:<equation\b|<media\b|\s)+/.test(trailing);

      // Preserve the ORIGINAL segment text exactly (byte-identical constraint):
      //  - single-para item  → para INNER content (what the old code used)
      //  - multi-child item   → FULL item content (old paraWrapMatch failed → full,
      //    so segment already contains the block's [[MATH:N]]/[[MEDIA:N]] placeholder)
      //  - non-para item      → FULL item content (unchanged)
      const innerContent = isSingleParaItem ? leadParaMatch[2] : item.content;

      const text = extractInlineText(
        innerContent,
        mathMap,
        counters,
        inlineMediaMap,
        inlineTablesMap
      );
      if (text) {
        const itemId = addSegment('item', text, item.id || `${list.id}-item-${i + 1}`);
        const itemEntry = { id: item.id, segmentId: itemId };
        if (leadParaMatch && (isSingleParaItem || isMultiChildParaItem)) {
          const paraOpenTag = leadParaMatch[1];
          const paraIdMatch = paraOpenTag.match(/id="([^"]+)"/);
          itemEntry.wrapsPara = { openTag: paraOpenTag, id: paraIdMatch ? paraIdMatch[1] : null };
        }
        if (isMultiChildParaItem) {
          const blockChildren = [];
          for (const mm of trailing.matchAll(/<(equation|media)\b[^>]*\bid="([^"]+)"/g)) {
            blockChildren.push({ type: mm[1], id: mm[2] });
          }
          if (blockChildren.length > 0) itemEntry.blockChildren = blockChildren;
        }
        listStructure.items.push(itemEntry);
      }
```

> Note: `extractInlineText` runs on the FULL `item.content` exactly as before Task 4, so the segment text is unchanged. Only the new `wrapsPara`/`blockChildren` metadata is added. For `isSingleParaItem` this reproduces the previous behaviour (segment was the para inner text — verify no single-para regression via the existing extract suite).

- [ ] **Step 4: Inject — suppress in-item placeholders for blockChildren and emit them explicitly**

(a) In `collectBlockEquationIds` (approx. line 1468), after the content recursion, also collect item `blockChildren` equation ids so `[[MATH:N]]` is suppressed inside the item text:

```javascript
function collectBlockEquationIds(elements, idSet) {
  for (const el of elements) {
    if (el.type === 'equation' && el.id) idSet.add(el.id);
    if (el.type === 'example' || el.type === 'exercise') continue;
    for (const item of el.items || []) {
      for (const bc of item.blockChildren || []) {
        if (bc.type === 'equation' && bc.id) idSet.add(bc.id);
      }
      for (const child of item.children || []) collectBlockEquationIds([child], idSet);
    }
    if (el.content) collectBlockEquationIds(el.content, idSet);
  }
}
```

(b) Add a `blockMediaIds` set built the same way (collect `blockChildren` media ids), thread it into `getSeg` → `reverseInlineMarkup` alongside `blockEquationIds`, and in the `[[MEDIA:N]]` restore (approx. line 1122) return `''` when the media id is in `blockMediaIds`. Build it in `buildCnxml` next to `blockEquationIds` (approx. line 1521):

```javascript
  const blockMediaIds = new Set();
  collectBlockMediaIds(structure.content, blockMediaIds);
```

with:

```javascript
function collectBlockMediaIds(elements, idSet) {
  for (const el of elements) {
    if (el.type === 'example' || el.type === 'exercise') continue;
    for (const item of el.items || []) {
      for (const bc of item.blockChildren || []) {
        if (bc.type === 'media' && bc.id) idSet.add(bc.id);
      }
      for (const child of item.children || []) collectBlockMediaIds([child], idSet);
    }
    if (el.content) collectBlockMediaIds(el.content, idSet);
  }
}
```

> **Impl note:** thread `blockMediaIds` through the same call chain as `blockEquationIds` (the `getSeg` closure at ~1538 → `reverseInlineMarkup` signature at ~1075). The `[[MEDIA:N]]` restore must map placeholder→media id (via `inlineMedia.find(...)`) and skip if that id ∈ `blockMediaIds`. If this threading proves to require broad signature churn, note it — but it mirrors `blockEquationIds` exactly and should be mechanical.

(c) In `buildList` (approx. line 3173), handle `wrapsPara` + `blockChildren`. The item text now has the block placeholders suppressed (→ empty), so wrap the text in the para and append the block children as siblings. Extend the item loop:

```javascript
  for (const item of element.items || []) {
    const itemText = getSeg(item.segmentId);
    const itemIdAttr = item.id ? ` id="${item.id}"` : '';

    const blockChildXml = (item.blockChildren || [])
      .map((bc) => {
        if (bc.type === 'equation' && equations && equations[bc.id]) {
          const eq = equations[bc.id];
          const classAttr = eq.equationClass ? ` class="${eq.equationClass}"` : '';
          return `<equation id="${bc.id}"${classAttr}>${eq.mathml}</equation>`;
        }
        if (bc.type === 'media') {
          const m = (structure.inlineMedia || []).find((x) => x.id === bc.id);
          return m ? buildMedia({ ...m }) : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');

    if (item.children && item.children.length > 0) {
      lines.push(`<item${itemIdAttr}>${item.wrapsPara ? item.wrapsPara.openTag + (itemText || '') + '</para>' : itemText || ''}`);
      for (const child of item.children) {
        if (child.type === 'list') lines.push(buildList(child, getSeg, equations, structure));
      }
      if (blockChildXml) lines.push(blockChildXml);
      lines.push('</item>');
    } else if (item.wrapsPara && (blockChildXml || item.blockChildren)) {
      lines.push(`<item${itemIdAttr}>${item.wrapsPara.openTag}${itemText}</para>${blockChildXml ? '\n' + blockChildXml : ''}</item>`);
    } else if (itemText) {
      if (item.wrapsPara) {
        lines.push(`<item${itemIdAttr}>${item.wrapsPara.openTag}${itemText}</para></item>`);
      } else {
        lines.push(`<item${itemIdAttr}>${itemText}</item>`);
      }
    }
  }
```

> **Impl note:** `buildList` needs `equations` and `structure` in scope to emit block children. Check its current signature (`buildList(element, getSeg)`) and the recursive call at ~3191; thread `equations` and `structure` (or just `structure.inlineMedia`) through both. `buildMedia` (approx. line 3215) already exists. If `buildList` is called from multiple sites, update all call sites.

- [ ] **Step 5: Run the Layer 2 test + full module file — expect PASS**

Run: `npx vitest run tools/__tests__/cnxml-list-item-block-children.test.js`
Expected: ALL tests PASS (order, tag-count parity, guard, Layer 2 para wrapper). The equation `fs-idm98497056` renders as a sibling AFTER `</para>` of `fs-idm136564352`, inside the item.

- [ ] **Step 6: Book measurement + no-regression + no-segment-change check**

Run:
```bash
node tools/analyze-order-causes.js --book efnafraedi-2e
npx vitest run tools/__tests__/cnxml-extract.test.js tools/__tests__/cnxml-inject.test.js tools/__tests__/cnxml-dom-comparison.test.js
```
Expected: 149/0/0; all suites PASS. If `cnxml-dom-comparison` (the m68789 baseline / tag-count comparison) regresses, Layer 2 introduced a duplicate or mis-nesting — fix or invoke the fallback.

- [ ] **Step 7: Commit (or, if fallback triggered, commit the deferral log instead)**

```bash
git add tools/cnxml-extract.js tools/cnxml-inject.js tools/__tests__/cnxml-list-item-block-children.test.js
git commit -m "feat(inject): restore <para> wrapper + emit block children in place for multi-child list items [OC-E]"
```

Fallback path (if Step 3/4 needs a segment-text change or Step 6 regresses irreparably): `git checkout -- tools/cnxml-extract.js tools/cnxml-inject.js`, delete the Layer 2 `describe` block from the test file, add a deferral note to the register (`docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`) and memory, and commit that. Tasks 1–3 stand alone as the gate-satisfying fix.

---

### Task 5: Verification, measurement, and documentation

**Files:**
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (register — log completion + any out-of-scope finds)

- [ ] **Step 1: Full test suite from repo root (authoritative gate)**

Run: `npm test`
Expected: all Vitest suites green (tools + server).

- [ ] **Step 2: Final book measurement**

Run: `node tools/analyze-order-causes.js --book efnafraedi-2e`
Expected: **149 clean / 0 residual / 0 build failures.**

- [ ] **Step 3: Confirm NO committed source/generated bytes changed**

Run: `git status --porcelain books/`
Expected: EMPTY output (no `01-source/`, `02-*`, `03-*`, `05-*` changes — the fix is code-only, armed for WS5 re-inject).

- [ ] **Step 4: Update the register**

In `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`, mark OC-E done: residual 4→0 (combined OC-A+OC-B+OC-E: 60→0); note whether Layer 2 shipped or was deferred; log any out-of-scope finds surfaced during implementation.

- [ ] **Step 5: Commit docs**

```bash
git add docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md
git commit -m "docs(register): OC-E done — order residual 4→0 (60→0 combined) [OC-E]"
```

---

## Self-Review

**Spec coverage:**
- Root-cause fix (stop hoisting list-nested equation/media) → Task 2. ✓
- Both equation and media → Task 1 tests cover m68739 (media + deep nesting) and m68793 (equation); Task 2 fix strips lists for both. ✓
- Silent-drop guard (advisor's must-have) → Task 3 (code guard + tests) and Task 1 tag-count-parity tests. ✓
- `<para>`-wrapper Layer 2 with attempt-then-fallback → Task 4 (narrow scope: only m68793 item-1; explicit fallback). ✓
- Segment-preserving / no committed bytes / gate-flip deferred → Global Constraints + Task 4 impl notes + Task 5 Step 3. ✓
- Measurement 4→0 (149 clean) → Tasks 2/3/4/5. ✓

**Placeholder scan:** No TBD/TODO. Impl notes flag exact field names to confirm in RED steps (legitimate discovery, not vague hand-waving) — real code is provided for every step.

**Type consistency:** `analyzeModuleOrder(src).moved` (array) used consistently; `buildFresh` helper defined once in Task 1 and reused; `wrapsPara: {openTag, id}` and `blockChildren: [{type, id}]` names consistent across extraction (Task 4 Step 3) and inject (`collectBlockEquationIds`/`collectBlockMediaIds`/`buildList`, Task 4 Step 4); `blockEquationIds`/`blockMediaIds` parallel naming. `buildList(element, getSeg, equations, structure)` signature note added where threading is required.
