# F4/F5/F6: Marker-Residue Inject Fixes + "no `[[`" Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop three marker classes (`[[TABLE:]]`, lowercased `[[math:]]`, nested `[[i:[[link:]]]]`) from leaking into injected output, and add a hard-fail gate so any future marker residue aborts inject loudly.

**Architecture:** Three targeted fixes in `tools/cnxml-inject.js` (F6 strip-before-lowercase, F5 re-run emphasis leaf-loop after links, F4 expand `[[TABLE:]]` in the exercise/example DOM builders) plus an exported `assertNoMarkerResidue` gate wired into the per-module assembly.

**Tech Stack:** Node 22 ESM, Vitest. All four touch points are already exported (`annotateInlineTerms`, `reverseInlineMarkup`, `buildExerciseDom`, `buildExampleDom`) and unit-testable directly.

**Design doc:** `docs/plans/2026-07-02-f456-marker-residue-design.md`
**Motivating audit:** `docs/audit/2026-07-02-fable5-fidelity-provenance-review.md` (findings 4/5/6).

## Global Constraints

- **No committed `03-/05-` bytes change** in this PR. No re-inject, no re-render. The gate runs at inject-time and is armed for the future batched re-inject (WS5) — **no test greps committed output**.
- **Robustness>expedience:** kill whole marker classes, not per-symbol; the gate fails loud.
- **Gate regex is marker-form with a MATH/MEDIA carve-out:** `/\[\[(?!MATH:|MEDIA:)[A-Za-z][\w]*:[^\]]*\]\]/g`. It targets placeholder syntax (catches `[[TABLE:`, lowercase `[[math:`, `[[i:`, future classes) but not legit nested chemistry brackets (`[[Ag(NH₃)₂]⁺]`, no `word:`), and not the pre-existing tolerant uppercase `[[MATH:N]]`/`[[MEDIA:N]]` soft-report path (line 1704).
- One PR off `main`; `npm test` from repo root is the gate; TDD/characterization first. If F4's DOM surgery balloons, split it out (lead-approved escape hatch).

---

### Task 1: F6 — strip all placeholders before lowercasing (two strip-chains)

**Files:**
- Modify: `tools/cnxml-inject.js` — `annotateInlineTerms` (~820-827) and the glossary EN-term chain (~1657-1667)
- Test: `tools/__tests__/cnxml-inject.test.js` (append)

**Interfaces:** `annotateInlineTerms(isSegments, enSegments)` (exported) — unchanged signature.

- [ ] **Step 1: Write the failing test** (append to `tools/__tests__/cnxml-inject.test.js`)

```js
describe('annotateInlineTerms — F6 MATH placeholder', () => {
  it('drops [[MATH:N]] from the EN annotation instead of lowercasing it', () => {
    const en = new Map([['s1', '{{term}}standard enthalpy of formation [[MATH:23]]{{/term}}']]);
    const is = new Map([['s1', '{{term}}staðalmyndunarvermi{{/term}}']]);
    const { segments } = annotateInlineTerms(is, en);
    const out = segments.get('s1');
    expect(out).not.toMatch(/\[\[math:/i); // no [[math:23]] or [[MATH:23]]
    expect(out).toContain('(e. standard enthalpy of formation'); // annotation still present
  });

  it('still unwraps [[sup:2]] to plain text in the annotation', () => {
    const en = new Map([['s2', '{{term}}mol[[sup:2]]{{/term}}']]);
    const is = new Map([['s2', '{{term}}mól{{/term}}']]);
    const { segments } = annotateInlineTerms(is, en);
    expect(segments.get('s2')).toContain('(e. mol2)');
  });
});
```

- [ ] **Step 2: Run to verify the first test fails**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js -t "F6 MATH placeholder"`
Expected: FAIL — output contains `[[math:23]]`.

- [ ] **Step 3: Fix `annotateInlineTerms`** — in the EN-term strip chain (`tools/cnxml-inject.js` ~820-827), add a drop of any remaining placeholder immediately before `.toLowerCase()`:

```js
      const enTerm = enTermRaw
        .replace(/\[\[sup:([^\]]+)\]\]/g, '$1')
        .replace(/\[\[sub:([^\]]+)\]\]/g, '$1')
        .replace(/\[\[i:([^\]]+)\]\]/g, '$1')
        .replace(/\[\[b:([^\]]+)\]\]/g, '$1')
        .replace(/\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g, '$1')
        .replace(/\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g, '$1')
        .replace(/\[\[[A-Za-z][\w]*:[^\]]*\]\]/g, '') // F6: drop MATH/MEDIA/any remaining placeholder
        .toLowerCase();
```

- [ ] **Step 4: Apply the identical fix to the glossary chain** (`tools/cnxml-inject.js` ~1657-1667) — add the same line before its `.trim().toLowerCase()`:

```js
            const enTerm = enTermRaw
              .replace(/__([^_]+)__/g, '$1')
              .replace(/\{\{term\}\}([\s\S]*?)\{\{\/term\}\}/g, '$1')
              .replace(/\[\[sup:([^\]]+)\]\]/g, '$1')
              .replace(/\[\[sub:([^\]]+)\]\]/g, '$1')
              .replace(/\[\[i:([^\]]+)\]\]/g, '$1')
              .replace(/\[\[b:([^\]]+)\]\]/g, '$1')
              .replace(/\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g, '$1')
              .replace(/\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g, '$1')
              .replace(/\[\[[A-Za-z][\w]*:[^\]]*\]\]/g, '') // F6: drop remaining placeholder
              .trim()
              .toLowerCase();
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js -t "F6 MATH placeholder"`
Expected: PASS (both).

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject.test.js
git commit -m "fix(F6): strip [[MATH:N]]/any placeholder before lowercasing term annotations"
```

---

### Task 2: F5 — resolve nested `[[i:[[link:…]]]]` (re-run emphasis leaf-loop after links)

**Files:**
- Modify: `tools/cnxml-inject.js` — `reverseInlineMarkup` bracket loop (~1148-1178) + after link conversions (~1301)
- Test: `tools/__tests__/cnxml-inject.test.js` (append)

**Interfaces:** `reverseInlineMarkup(text, equations, inlineMedia, inlineTables, inlineAttrs, blockEquationIds)` (exported).

- [ ] **Step 1: Write the failing test**

```js
describe('reverseInlineMarkup — F5 nested emphasis over link', () => {
  const rev = (t) => reverseInlineMarkup(t, {}, [], [], null, []);

  it('resolves [[i:[[link:text|url]]]] with no residue', () => {
    const out = rev('See [[i:[[link:Handbook|http://x.org/h]]]] now');
    expect(out).toContain('<emphasis effect="italics"><link url="http://x.org/h">Handbook</link></emphasis>');
    expect(out).not.toContain('[[');
  });

  it('still resolves a plain [[link:text|url]]', () => {
    const out = rev('[[link:Foo|http://y.org]]');
    expect(out).toBe('<link url="http://y.org">Foo</link>');
  });

  it('resolves deeper [[b:[[i:[[link:x|u]]]]]] fully', () => {
    const out = rev('[[b:[[i:[[link:x|http://u]]]]]]');
    expect(out).not.toContain('[[');
    expect(out).toContain('<emphasis effect="bold">');
    expect(out).toContain('<link url="http://u">x</link>');
  });
});
```

- [ ] **Step 2: Run to verify the nested tests fail**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js -t "F5 nested emphasis"`
Expected: FAIL — output retains literal `[[i:` (outer emphasis never re-processed after the link pass).

- [ ] **Step 3: Extract the emphasis leaf-loop into a local helper** inside `reverseInlineMarkup`. Replace the existing `while (bracketChanged) { … }` block (~1148-1178) with a call, and define the helper just above it:

```js
  // Resolve leaf-level emphasis/sub/sup markers to fixpoint. Runs innermost-first:
  // an outer [[i:…]] becomes leaf-level once its inner markers convert. Called again
  // after link conversion so [[i:[[link:…]]]] (emphasis wrapping a link) resolves too.
  function resolveBracketEmphasis(s) {
    let changed = true;
    while (changed) {
      const before = s;
      s = s.replace(/\[\[i:((?:(?!\[\[|\]\])[\s\S])+)\]\]/g, '<emphasis effect="italics">$1</emphasis>');
      s = s.replace(/\[\[b:((?:(?!\[\[|\]\])[\s\S])+)\]\]/g, '<emphasis effect="bold">$1</emphasis>');
      s = s.replace(/\[\[sub:((?:(?!\[\[|\]\])[\s\S])+)\]\]/g, (m, content) => {
        const inner = content
          .replace(/\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g, '<emphasis effect="bold">$1</emphasis>')
          .replace(/\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g, '<emphasis effect="italics">$1</emphasis>');
        return `<sub>${inner}</sub>`;
      });
      s = s.replace(/\[\[sup:((?:(?!\[\[|\]\])[\s\S])+)\]\]/g, (m, content) => {
        const inner = content
          .replace(/\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g, '<emphasis effect="bold">$1</emphasis>')
          .replace(/\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g, '<emphasis effect="italics">$1</emphasis>');
        return `<sup>${inner}</sup>`;
      });
      changed = s !== before;
    }
    return s;
  }

  result = resolveBracketEmphasis(result);
```

- [ ] **Step 4: Re-run the helper after link conversion.** Immediately after the `[[link:text|url]]` conversion (~line 1301, `result = result.replace(/\[\[link:([^\]|]+)\|([^\]]+)\]\]/g, '<link url="$2">$1</link>');`), add:

```js
  // F5: an emphasis marker that wrapped a link (e.g. [[i:[[link:…]]]]) is only now
  // leaf-level (its inner link became a <link>). Re-resolve emphasis to catch it.
  result = resolveBracketEmphasis(result);
```

- [ ] **Step 5: Run to verify pass + no marker-conversion regressions**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js`
Expected: PASS — F5 tests green, all pre-existing `reverseInlineMarkup` tests still green.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject.test.js
git commit -m "fix(F5): re-run emphasis leaf-loop after link conversion (resolves [[i:[[link:]]]])"
```

---

### Task 3: F4 — expand `[[TABLE:]]` in the exercise/example DOM builders

**Files:**
- Modify: `tools/cnxml-inject.js` — `buildExerciseDom` (~2601), `buildExampleDom` (~2307)
- Test: `tools/__tests__/cnxml-inject.test.js` (append — characterization first)

**Interfaces:** `buildExerciseDom(element, getSeg, equations, originalCnxml, ctx)`, `buildExampleDom(...)` (both exported, both already receive `ctx`).

- [ ] **Step 1: Write the characterization test FIRST** (it reveals the real strip/expand interaction)

```js
describe('buildExerciseDom — F4 [[TABLE:]] in exercise', () => {
  it('expands an embedded table placeholder inline, once, with no residue', () => {
    const original =
      '<exercise id="ex1"><problem id="pr1">' +
      '<para id="p1">Use the table.</para>' +
      '<table id="t1" summary="s"><tgroup cols="1"><tbody><row><entry>A</entry></row></tbody></tgroup></table>' +
      '</problem></exercise>';
    const element = { id: 'ex1', problem: { content: [{ type: 'para', id: 'p1', segmentId: 'seg-p1' }] } };
    const getSeg = (id) => (id === 'seg-p1' ? 'Notaðu töfluna. [[TABLE:t1]]' : '');
    const ctx = {
      inlineTables: [{ tableId: 't1', structure: { type: 'table', id: 't1' } }],
      figuresHandledInContainers: new Set(),
    };
    const out = buildExerciseDom(element, getSeg, {}, original, ctx);

    expect(out).not.toContain('[[TABLE:'); // no residue
    expect((out.match(/<table\b/g) || []).length).toBe(1); // exactly one table, in place
    expect(out).toContain('Notaðu töfluna.');
  });
});
```

> `buildTable(tableData.structure, getSeg, originalCnxml)` is what `buildPara` calls; the test's `ctx.inlineTables[].structure` must be shaped as `buildTable` expects. If `buildTable` needs richer structure, capture the real shape from an actual module's `02-structure` `-inline-tables` sidecar and use a trimmed real example in the fixture. Adjust the test to the real `buildTable` contract, then make it pass — do not weaken the residue/one-table assertions.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js -t "F4 \\[\\[TABLE"`
Expected: FAIL — output contains literal `[[TABLE:t1]]` and/or zero tables (stripped).

- [ ] **Step 3: Expand `[[TABLE:]]` in `buildExerciseDom.processContent`** — where para text is injected (~2625-2646, the `replaceParaContentDom(doc, paraEl, …)` calls), expand the placeholder in `paraText` first, using the same mechanism as `buildPara` (1811-1817). Add, right after `const paraText = getSeg(child.segmentId);` (and before it is used):

```js
        let paraText = getSeg(child.segmentId);
        if (!paraText) continue;
        // F4: expand embedded table placeholders (buildExerciseDom didn't; buildPara does).
        if (ctx && ctx.inlineTables && paraText.includes('[[TABLE:')) {
          paraText = paraText.replace(/\[\[TABLE:([^\]]+)\]\]/g, (m, tableId) => {
            const td = ctx.inlineTables.find((t) => t.tableId === tableId);
            return td && td.structure ? buildTable(td.structure, getSeg, originalCnxml) : m;
          });
        }
```

(Change the existing `const paraText = getSeg(child.segmentId);` at ~2625 to `let paraText = …` and remove the now-duplicated declaration; keep the existing `if (!paraText) continue;`.)

- [ ] **Step 4: Reconcile with the unconditional `<table>` strip** (~2683 `removeElementsByTag(exerciseEl, ['table']);`). The characterization test tells you which is needed:
  - If the expanded table (injected as serialized markup into the para) is **re-parsed** by `replaceParaContentDom` and then removed by the strip → the fix is **expand-and-exempt**: collect the expanded `tableId`s and skip them in the strip (mirror the `keptFigureIds` pattern — build a `keptTableIds` set, and in the strip loop remove a `<table>` only if `!keptTableIds.has(id)`).
  - If the expanded table survives the strip (injected as text, not re-parsed) → no strip change needed; the test already passes after Step 3.

  Implement whichever the failing test demands. Do **not** guess — let the assertion drive it.

- [ ] **Step 5: Apply the same expansion to `buildExampleDom`** (~2307, the `getSeg(child.segmentId)` para-injection sites). One example module (m68791, `fs-idm140502592`) has an in-example table. Add a minimal characterization test mirroring Step 1 for `buildExampleDom`, then the same expansion + strip reconciliation.

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js`
Expected: PASS — F4 tests green, all pre-existing DOM-builder tests still green.

> **BALLOON CHECK (lead escape hatch):** if Steps 4–5 require deep surgery on the strip/re-parse/serialize path or break other builder tests in ways that aren't quickly resolved, STOP, split F4 into its own PR, and ship Tasks 1, 2, 4 with the gate — flagging the split to the lead. Record where it got stuck.

- [ ] **Step 7: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject.test.js
git commit -m "fix(F4): expand [[TABLE:]] inline in buildExerciseDom/buildExampleDom"
```

---

### Task 4: The gate — hard-fail on marker residue in assembled output

**Files:**
- Modify: `tools/cnxml-inject.js` — add + export `assertNoMarkerResidue`; call it after per-module assembly (~1701)
- Test: `tools/__tests__/cnxml-inject.test.js` (append)

**Interfaces:** `assertNoMarkerResidue(cnxml, moduleId) → void` (throws on residue).

- [ ] **Step 1: Write the failing test**

```js
import { /* …existing… */ assertNoMarkerResidue } from '../cnxml-inject.js';

describe('assertNoMarkerResidue — F4/F5/F6 gate', () => {
  it('throws on a surviving [[TABLE:]] placeholder', () => {
    expect(() => assertNoMarkerResidue('<para>x [[TABLE:t1]]</para>', 'm00001')).toThrow(/marker residue/i);
  });
  it('throws on a lowercased [[math:23]]', () => {
    expect(() => assertNoMarkerResidue('<para>[[math:23]]</para>', 'm00001')).toThrow();
  });
  it('passes clean output', () => {
    expect(() => assertNoMarkerResidue('<para>hreint</para>', 'm00001')).not.toThrow();
  });
  it('passes legit nested chemistry brackets (no word: prefix)', () => {
    expect(() => assertNoMarkerResidue('<para>[[Ag(NH3)2]+]</para>', 'm00001')).not.toThrow();
  });
  it('does NOT fire on tolerated uppercase [[MATH:N]] / [[MEDIA:N]]', () => {
    expect(() => assertNoMarkerResidue('<para>[[MATH:5]] [[MEDIA:2]]</para>', 'm00001')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js -t "F4/F5/F6 gate"`
Expected: FAIL — `assertNoMarkerResidue` is not exported.

- [ ] **Step 3: Add the gate function** (near the other module-level helpers; a good spot is just above `buildCnxml`, or beside `reverseInlineMarkup`):

```js
/**
 * F4/F5/F6 gate: fail loud if any marker-form placeholder [[TYPE:…]] survived into
 * injected output. Excludes uppercase [[MATH:N]]/[[MEDIA:N]] (pre-existing tolerant
 * soft-report path). Marker-form (requires `word:`) so legit nested chemistry
 * brackets like [[Ag(NH3)2]+] are not flagged.
 *
 * @param {string} cnxml - assembled module output
 * @param {string} moduleId
 */
function assertNoMarkerResidue(cnxml, moduleId) {
  const residue = cnxml.match(/\[\[(?!MATH:|MEDIA:)[A-Za-z][\w]*:[^\]]*\]\]/g);
  if (residue) {
    const shown = [...new Set(residue)].slice(0, 10).join(', ');
    throw new Error(
      `Marker residue in injected output for ${moduleId}: ${shown} — a [[TYPE:…]] placeholder ` +
        `was not converted. Fix the inject path before publishing.`
    );
  }
}
```

Add `assertNoMarkerResidue` to the `export { … }` block (~3540).

- [ ] **Step 4: Wire it into per-module assembly** — in the function that produces `{ cnxml: output, report }`, right after `output = deduplicateMedia(output);` (~1701) and before the report is built:

```js
  output = deduplicateMedia(output);

  // F4/F5/F6 gate: no [[TYPE:…]] marker residue may reach output (fail loud).
  assertNoMarkerResidue(output, moduleId);
```

(Confirm `moduleId` is in scope at that point; if the variable is named differently, use the in-scope module identifier.)

- [ ] **Step 5: Run the gate unit tests + the FULL inject suite**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js`
Expected: PASS. **If any pre-existing inject/integration test now throws "Marker residue"**, that is a real uncaught residue class in the fixture — STOP and either extend the fixes to cover it or (if it's a genuinely tolerated placeholder) reconsider the carve-out. Do not weaken the gate to make a test pass.

- [ ] **Step 6: Full suite + validate from repo root**

Run: `npm test` then `npm run validate`
Expected: all green; `validate` 24/24.

- [ ] **Step 7: Confirm no committed content bytes changed**

Run: `git status --porcelain 'books/'`
Expected: **empty** — this PR changes tools + tests + docs only.

- [ ] **Step 8: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject.test.js
git commit -m "feat(F4/F5/F6): hard-fail gate on [[TYPE:]] marker residue in injected output"
```

---

## Self-Review

**Spec coverage:**
- F6 both strip-chains (annotateInlineTerms + glossary) → Task 1 Steps 3–4. ✓
- F5 nested emphasis-over-link via re-run leaf-loop → Task 2. ✓
- F4 `[[TABLE:]]` expansion in exercise + example builders, strip reconciliation characterization-driven → Task 3. ✓
- Hard-fail gate, marker-form + MATH/MEDIA carve-out, inject-time only → Task 4. ✓
- No committed bytes changed → Task 4 Step 7. ✓
- Split-F4 escape hatch → Task 3 balloon check. ✓

**Placeholder scan:** none. Task 3 Step 1's note (capture the real `buildTable` structure shape) and Task 4 Step 4's (confirm `moduleId` in scope) are real contingencies with concrete instructions, not TBDs.

**Type consistency:** `assertNoMarkerResidue(cnxml, moduleId)` defined and used identically (Task 4). `ctx.inlineTables[].{tableId,structure}` used consistently with `buildPara`'s existing contract (Task 3). `resolveBracketEmphasis(s) → string` internal, called twice (Task 2). ✓

## Post-plan follow-ups (not this PR)

- The gate is inject-time; today's committed `03-translated` still carries residue until the batched re-inject (WS5). The WS5 runbook must note the re-inject has to pass the new gate (and F1's re-extract lands first, so order is corrected in the same pass).
- Next clean-slate item after F4/F5/F6: **F3** (re-triage the 28 `benign` allowlist entries with per-instance byte diffs + fix glossary `<sub>` re-anchoring) — WS2's real DoD.
