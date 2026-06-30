# Audit #33 — inject list-flatten unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `buildExerciseDom`/`buildNoteDom` from deleting a `<list>` flattened into a math-bearing `<para>`; make all three DOM builders share one `paraHasFlattenedList` helper that preserves the list (as `buildExampleDom` already does).

**Architecture:** Extract the flattened-list detection (currently inline-duplicated 3×, with example preserving but exercise/note `removeChild`-deleting) into one helper in `tools/cnxml-inject.js`. Route all three builders through it. Behavior-changing for exercise/note (list preserved instead of dropped) in the math-gated case; byte-identical no-op for example and for every non-math / direct-child case.

**Tech Stack:** Node 22 ESM, Vitest. Single file: `tools/cnxml-inject.js` + its test `tools/__tests__/cnxml-inject.test.js`.

## Global Constraints

- **`buildExampleDom` output must stay byte-identical** — it is the reference behavior; routing it through the helper is a pure no-op.
- The fix changes behavior ONLY in the math-gated flattened-list case for exercise/note: the nested `<list>` is preserved (and its items translated by the existing list handler) instead of `removeChild`-deleted.
- No other inject behavior changes — no routing (`isApiTranslated`) changes, no table/figure handling changes, no #37/#43 work.
- Helper semantics must exactly reproduce `buildExampleDom`'s current inline condition: return true iff `paraText` contains `<m:math>` AND a sibling `<list>` (with id) is a DOM descendant of `paraEl`.
- `isDescendantOf` is a function declaration at `cnxml-inject.js:2466` (hoisted; callable from the builders above it). `replaceParaContentDom`/`replaceListItemsDom` are imported at the top.
- Local `npm test` is the authoritative gate (CI red until ~Jul 1). Run before committing.

---

### Task 1: Extract `paraHasFlattenedList`, route all three builders through it, characterization-test the fix

**Files:**
- Modify: `tools/cnxml-inject.js` — new helper near `isDescendantOf` (~`:2466`); `buildExampleDom` (~`:2376-2390`), `buildExerciseDom` (~`:2619-2634`), `buildNoteDom` (~`:2877-2891`)
- Test: `tools/__tests__/cnxml-inject.test.js` (add cases)

**Interfaces:**
- Produces: `paraHasFlattenedList(child, paraEl, contentArray, paraText, doc) → boolean`.

- [ ] **Step 1: Write the failing characterization tests**

Add to `tools/__tests__/cnxml-inject.test.js` (model on the existing `buildExampleDom nested list in para` test at ~`:703`). These assert exercise + note now PRESERVE the flattened list — pre-fix they `removeChild` it, so they fail RED:

```javascript
describe('buildExerciseDom nested list in para (audit #33)', () => {
  it('preserves a nested list when the para segment contains math', () => {
    const element = {
      type: 'exercise',
      id: 'exr-nested',
      problem: {
        content: [
          { type: 'para', id: 'p-prob', segmentId: 'm1:para:p-prob' },
          {
            type: 'list', id: 'list-x', listType: 'enumerated',
            items: [
              { id: 'it-a', segmentId: 'm1:item:it-a' },
              { id: 'it-b', segmentId: 'm1:item:it-b' },
            ],
          },
        ],
      },
    };
    const segments = new Map([
      ['m1:para:p-prob', 'Spurning með <m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mn>3</m:mn></m:math>'],
      ['m1:item:it-a', 'Liður (a)'],
      ['m1:item:it-b', 'Liður (b)'],
    ]);
    const getSeg = (id) => segments.get(id) ?? '';
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<content>
<exercise id="exr-nested"><problem id="prob-1">
<para id="p-prob"><list id="list-x" list-type="enumerated">
<item id="it-a">Item A original</item>
<item id="it-b">Item B original</item>
</list></para>
</problem></exercise>
</content>
</document>`;
    const result = buildExerciseDom(element, getSeg, {}, originalCnxml, {});
    expect(result).toContain('<list id="list-x"');
    expect(result).toContain('Liður (a)');
    expect(result).toContain('Liður (b)');
    expect(result).not.toContain('Item A original');
  });
});

describe('buildNoteDom nested list in para (audit #33)', () => {
  it('preserves a nested list when the para segment contains math', () => {
    const element = {
      type: 'note', id: 'note-nested',
      content: [
        { type: 'para', id: 'p-note', segmentId: 'm1:para:p-note' },
        {
          type: 'list', id: 'list-n', listType: 'bulleted',
          items: [{ id: 'n-a', segmentId: 'm1:item:n-a' }],
        },
      ],
    };
    const segments = new Map([
      ['m1:para:p-note', 'Athugið <m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mn>9</m:mn></m:math>'],
      ['m1:item:n-a', 'Liður eitt'],
    ]);
    const getSeg = (id) => segments.get(id) ?? '';
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<content>
<note id="note-nested" class="note"><para id="p-note"><list id="list-n" list-type="bulleted">
<item id="n-a">Item one original</item>
</list></para></note>
</content>
</document>`;
    const result = buildNoteDom(element, getSeg, {}, originalCnxml, {});
    expect(result).toContain('<list id="list-n"');
    expect(result).toContain('Liður eitt');
    expect(result).not.toContain('Item one original');
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js -t "nested list in para (audit #33)"`
Expected: both FAIL — the result is missing `<list id="list-x"`/`<list id="list-n"` (current code `removeChild`-deletes the nested list).

- [ ] **Step 3: Add the shared helper**

In `tools/cnxml-inject.js`, immediately AFTER the `isDescendantOf` function (ends ~`:2475`), add:

```javascript
/**
 * True iff `child` (a para) has a sibling <list> that extraction flattened into
 * the para's segment text. Detected by: the para's (restored) segment text
 * contains <m:math> AND a sibling <list> (with id) is a DOM descendant of paraEl.
 * When true, callers inject only the para title and leave the list for the list
 * handler to preserve — they must NOT removeChild the list. (audit #33)
 */
function paraHasFlattenedList(child, paraEl, contentArray, paraText, doc) {
  if (!paraText || !/<m:math/.test(paraText)) return false;
  for (const sibling of contentArray || []) {
    if (sibling !== child && sibling.type === 'list' && sibling.id) {
      const siblingEl = doc.getElementById(sibling.id);
      if (siblingEl && isDescendantOf(siblingEl, paraEl)) return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: Route `buildExampleDom` through the helper (no-op)**

In `buildExampleDom`, replace the inline detection block (~`:2376-2390`):

```javascript
      const paraHasExpandedContent = paraText && /<m:math/.test(paraText);
      let skipParaText = false;
      if (paraHasExpandedContent) {
        for (const sibling of element.content || []) {
          if (sibling !== child && sibling.type === 'list' && sibling.id) {
            const siblingEl = doc.getElementById(sibling.id);
            if (siblingEl && isDescendantOf(siblingEl, paraEl)) {
              skipParaText = true;
              break;
            }
          }
        }
      }
```

with:

```javascript
      const skipParaText = paraHasFlattenedList(child, paraEl, element.content, paraText, doc);
```

(Leave the following `titleText` logic and `replaceParaContentDom(doc, paraEl, skipParaText ? '' : paraText, titleCnxml)` untouched.)

- [ ] **Step 5: Fix `buildExerciseDom` (preserve instead of delete)**

In `buildExerciseDom`'s `processContent`, replace the `removeChild` block (~`:2619-2634`):

```javascript
        // Embedded list detection (same heuristic as buildExampleDom):
        // if para text has expanded math and a sibling list is inside, remove list
        const paraHasExpandedContent = /<m:math/.test(paraText);
        if (paraHasExpandedContent) {
          for (const sibling of contentArray) {
            if (sibling !== child && sibling.type === 'list' && sibling.id) {
              const siblingEl = doc.getElementById(sibling.id);
              if (siblingEl && isDescendantOf(siblingEl, paraEl)) {
                siblingEl.parentNode.removeChild(siblingEl);
              }
            }
          }
        }

        replaceParaContentDom(doc, paraEl, paraText, '');
        replacedParaIds.add(child.id);
```

with:

```javascript
        // Preserve a list flattened into this para's segment (audit #33): inject
        // only text the list handler won't duplicate, and never removeChild the list.
        const skipParaText = paraHasFlattenedList(child, paraEl, contentArray, paraText, doc);
        replaceParaContentDom(doc, paraEl, skipParaText ? '' : paraText, '');
        replacedParaIds.add(child.id);
```

- [ ] **Step 6: Fix `buildNoteDom` (preserve instead of delete)**

In `buildNoteDom`, replace the `removeChild` block (~`:2877-2891`):

```javascript
      // Same embedded-list detection as buildExampleDom
      const paraHasExpandedContent = /<m:math/.test(paraText);
      if (paraHasExpandedContent) {
        for (const sibling of element.content || []) {
          if (sibling !== child && sibling.type === 'list' && sibling.id) {
            const siblingEl = doc.getElementById(sibling.id);
            if (siblingEl && isDescendantOf(siblingEl, paraEl)) {
              siblingEl.parentNode.removeChild(siblingEl);
            }
          }
        }
      }

      replaceParaContentDom(doc, paraEl, paraText, '');
      replacedParaIds.add(child.id);
```

with:

```javascript
      const skipParaText = paraHasFlattenedList(child, paraEl, element.content, paraText, doc);
      replaceParaContentDom(doc, paraEl, skipParaText ? '' : paraText, '');
      replacedParaIds.add(child.id);
```

- [ ] **Step 7: Run the #33 tests + the existing example test**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js`
Expected: the two new audit-#33 tests PASS; the existing `buildExampleDom nested list in para` test still PASSES (example unchanged); all other inject tests PASS.

- [ ] **Step 8: Full suite**

Run: `npm test`
Expected: green (was ~1636 passing / 87 files). The example/exercise/note DOM suites are the no-op regression net.

- [ ] **Step 9: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject.test.js
git commit -m "fix(audit33): unify list-flatten handling — exercise/note preserve nested list (not delete)"
```

---

### Task 2: Docs, register, memory, PR

**Files:**
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (mark #33 done; downgrade the `blocks_next_book` label with the measured evidence)
- Modify: project `MEMORY.md`

- [ ] **Step 1: Update the roadmap register**

Mark **#33** done: one `paraHasFlattenedList` helper; exercise/note now preserve a list flattened into a math-bearing para (was `removeChild`-deleted); example unchanged. Record the measured blast radius (biology 0 trigger hits → NOT a biology blocker, contra the audit label; physics 11 / chem 3 / organic 1 are the real beneficiaries). Note the broader "biology onboarding" required set: with #14 + #33 done and #4/#6/#7 merged, the remaining biology item is the re-scoped `isApiTranslated` routing/provenance fix (B2).

- [ ] **Step 2: Update memory**

`MEMORY.md`: mark #33 done; biology onboarding's remaining gate = the `isApiTranslated` routing/provenance fix (needs B2). Add a one-line topic pointer noting `paraHasFlattenedList` unifies the three DOM builders' flattened-list handling.

- [ ] **Step 3: Commit + push + PR**

```bash
git add docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md
git commit -m "docs(audit33): mark list-flatten unification done; record blast radius + remaining biology gate"
git push -u origin fix/inject-list-flatten-unify
gh pr create --title "Audit #33: unify inject list-flatten (exercise/note preserve nested list)" --body "<summary + blast-radius evidence + scope>"
```

---

## Self-review notes (author)

- **Spec coverage:** helper + all 3 builders routed through it (Task 1 Steps 3-6) ✓; characterization proves exercise/note preserve (Steps 1-2,7) + example no-op (Step 7) ✓; docs/register/memory/PR (Task 2) ✓. Out-of-scope items (routing, #37/#43, render C-track) untouched ✓.
- **Type consistency:** `paraHasFlattenedList(child, paraEl, contentArray, paraText, doc)` called identically in all three builders — example passes `element.content`, exercise passes `contentArray`, note passes `element.content` (each is the correct sibling array in scope). Returns boolean used as `skipParaText`.
- **No-op guarantee for example:** the helper's body is a verbatim hoist of buildExampleDom's prior inline condition (math test + sibling-list-descendant), so its return value is identical → example output byte-identical. The existing `buildExampleDom nested list in para` test guards this.
- **Risk:** exercise/note previously added the para to `replacedParaIds` after deleting the list; now they still add it after `skipParaText`. The list branch checks `isDescendantOf(paraEl, listEl)` (para inside list) — here the list is inside the para, so that's false → `replaceListItemsDom` runs and preserves the list. Confirmed identical to example's flow. The characterization test is the proof.
