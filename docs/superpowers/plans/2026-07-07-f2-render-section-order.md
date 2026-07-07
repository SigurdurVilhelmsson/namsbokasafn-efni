# F2 render section-order fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `cnxml-render.js` emit a section's children (loose content + nested subsections) in document order, so the rendered reading order matches the source — fixing the 10 F2 pages where nested `<section>`s currently render before the parent's intro.

**Architecture:** Unify the three ordering code paths (`renderContent` full walk, `renderTopLevelContent` loose-only, `renderSection` buggy split) into one shared `renderChildrenInDocumentOrder` helper. Deliver as a two-commit split: a pure refactor (helper + `renderContent`, goldens byte-identical) then the behavior fix (`renderSection` switches to the helper). Numbers/refs are source-decoupled, so this is pure emission-reordering.

**Tech Stack:** Node 22 ES modules, Vitest. `tools/cnxml-render.js`, `tools/__tests__/cnxml-render-golden.test.js`, the CLI `tools/cnxml-render.js`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-07-f2-render-section-order-design.md`. Ranked context: `docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md` (F2 = Tier-1 #1).
- **`npm test` from the repo root is the authoritative gate** (no branch protection).
- **The fix must not change any figure/example/table number, cross-reference, or section filename/URL** — it is pure block reordering. Numbering comes from a separate source-order pass (`cnxml-render.js:455–461`); do not touch it.
- Robustness > expedience: one real code path; the refactor commit must be provably inert (goldens byte-identical) before the fix commit.
- **Branch off `main` after STALE-STRUCT PR #248 merges** (this re-renders efnafraedi content that #248 produced), or off `content/stale-struct-reextract-delivery` if landing before #248. One PR.
- **Out of scope:** F1 table `<entry>`-leak (separate render bug, `docs/plans/2026-07-06-table-cell-translation-gate-followup.md`); numbering; module-level section-exclusion semantics (preserved).

---

### Task 1: Extract the shared ordered-walk helper (pure refactor — goldens must not change)

**Files:**
- Modify: `tools/cnxml-render.js` (extract from `renderContent` ~758–920; add `renderChildrenInDocumentOrder`)

**Interfaces:**
- Produces: `renderChildrenInDocumentOrder(content: string, context: object, opts: { excludeSections: boolean, sectionLevel: number }) → string[]` — returns the rendered HTML for each child (sections + loose elements) in document order, one array element per child. Consumed by `renderContent` (this task) and `renderSection` (Task 2).
- Consumes: existing `renderSection`, `renderFigure`, `renderNote`, `renderExample`, `renderExercise`, `renderTable`, `renderMedia`, `renderList`, `renderEquation`, `renderPara`, `extractNestedElements`, `removeNestedElements`, `extractElements`, `BOOK_CONFIG`.

- [ ] **Step 1: Establish the refactor baseline — full golden suite green**

Run: `npx vitest run tools/__tests__/cnxml-render-golden.test.js`
Expected: PASS. Record the pass count. `git status` clean under `tools/__tests__/fixtures/render-golden/` (no pending golden changes).

- [ ] **Step 2: Add the helper by moving `renderContent`'s walk into it**

In `tools/cnxml-render.js`, create `renderChildrenInDocumentOrder(content, context, { excludeSections, sectionLevel })` by moving the body of `renderContent` **from the `EXCLUDED_SECTION_CLASSES` setup through the render-switch loop** (currently ~741–910) into the new function, with exactly these three changes:
1. The section-exclusion check uses the **`excludeSections` parameter** instead of `context.excludeSections`:
   ```javascript
   const shouldExclude =
     excludeSections && EXCLUDED_SECTION_CLASSES.some((cls) => sectionClass.includes(cls));
   ```
2. The `case 'section'` uses the **`sectionLevel` parameter** instead of the hard-coded `2`:
   ```javascript
   case 'section':
     lines.push(renderSection(item, context, sectionLevel));
     break;
   ```
3. It **returns the `lines` array** (`return lines;`) instead of joining — the caller owns the join. (Returning an array, not a joined string, keeps `renderContent`'s output byte-identical, including the empty-body-with-glossary edge case.)

Everything else (the `figures`/`notes`/`examples`/`exercises`/`tables`/`media`/`lists`/`equations`/`paras` collection, the strip-order comments, the notes-inside-examples exclusion, the position sort, the switch cases) moves **verbatim**.

- [ ] **Step 3: Rewrite `renderContent` to delegate to the helper**

```javascript
function renderContent(content, context, _verbose) {
  const lines = renderChildrenInDocumentOrder(content, context, {
    excludeSections: context.excludeSections,
    sectionLevel: 2,
  });

  // Process glossary (always at end)
  const glossaryMatch = content.match(/<glossary>([\s\S]*?)<\/glossary>/);
  if (glossaryMatch) {
    lines.push(renderGlossary(glossaryMatch[1], context));
  }

  return lines.join('\n');
}
```

Leave `renderSection` and `renderTopLevelContent` untouched in this task.

- [ ] **Step 4: The refactor gate — goldens byte-identical**

Run: `npx vitest run tools/__tests__/cnxml-render-golden.test.js` → PASS (same count as Step 1).
Run: `git status --porcelain tools/__tests__/fixtures/render-golden/` → **empty** (no golden changed).
Run: `npm run fidelity:render 2>&1 | grep 'Total findings'` → `Total findings: 0`.
**If any golden differs, STOP** — the extraction changed behavior; reconcile until byte-identical before proceeding. This gate is the whole point of the two-commit split.

- [ ] **Step 5: Commit the refactor**

```bash
git add tools/cnxml-render.js
git commit -m "refactor(render): extract renderChildrenInDocumentOrder (behavior-preserving) [F2]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Fix `renderSection` to render children in document order (TDD)

**Files:**
- Modify: `tools/cnxml-render.js` (`renderSection` ~925–962; possibly remove now-dead `renderTopLevelContent`)
- Test: `tools/__tests__/cnxml-render.test.js` (or the render unit test file; create a focused describe block)

**Interfaces:**
- Consumes: `renderChildrenInDocumentOrder` (Task 1).

- [ ] **Step 1: Write the failing test**

Add to the render unit tests (adjust the import path / render entry to match the file's existing pattern — the test renders a single section and asserts child order):

```javascript
import { describe, it, expect } from 'vitest';
import { renderSection } from '../cnxml-render.js'; // export renderSection if not already exported

describe('renderSection — document-order children (F2)', () => {
  it('renders a section intro paragraph BEFORE its nested subsection', () => {
    const section = {
      id: 'sec-parent',
      attributes: {},
      content:
        '<title>Parent</title>' +
        '<para id="intro">Intro sentence that defines the concept.</para>' +
        '<section id="sub"><title>Sub</title><para id="subp">Sub body.</para></section>',
    };
    const ctx = { chapter: 7, excludeSections: false, /* minimal context the renderers need */ };
    const html = renderSection(section, ctx, 2);
    const introPos = html.indexOf('Intro sentence');
    const subPos = html.indexOf('Sub body');
    expect(introPos).toBeGreaterThan(-1);
    expect(subPos).toBeGreaterThan(-1);
    expect(introPos).toBeLessThan(subPos); // intro before subsection
  });
});
```

If `renderSection` needs a richer `context` to run, build the minimal context the existing render tests use (copy their setup) — the assertion (intro-before-sub) is what matters.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-render.test.js -t "document-order children"`
Expected: FAIL — current `renderSection` emits the nested `<section>` (Sub body) before the intro para, so `introPos > subPos`.

- [ ] **Step 3: Rewrite `renderSection`'s body to use the helper**

Replace the nested-sections-then-loose split (currently ~946–958) so the post-title content renders in document order:

```javascript
function renderSection(section, context, level) {
  const lines = [];
  const id = section.id || null;
  const className = section.attributes.class || null;

  lines.push(
    `<section${id ? ` id="${escapeAttr(id)}"` : ''}${className ? ` class="${escapeAttr(className)}"` : ''}>`
  );

  const titleMatch = section.content.match(/<title>([\s\S]*?)<\/title>/);
  if (titleMatch) {
    lines.push(`  <h${level}>${processInlineContent(titleMatch[1], context)}</h${level}>`);
  }
  const contentWithoutTitle = section.content.replace(/<title>[\s\S]*?<\/title>/, '');

  // Render children (loose content + nested subsections) in document order.
  // excludeSections:false preserves the prior behaviour of rendering all nested
  // subsections; sectionLevel deepens the heading for nested sections (capped at 6).
  lines.push(
    ...renderChildrenInDocumentOrder(contentWithoutTitle, context, {
      excludeSections: false,
      sectionLevel: Math.min(level + 1, 6),
    })
  );

  lines.push('</section>');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-render.test.js -t "document-order children"` → PASS.

- [ ] **Step 5: Remove `renderTopLevelContent` if now unused**

Run: `grep -n "renderTopLevelContent" tools/cnxml-render.js`
If the only remaining reference is its own definition, delete the function (it is subsumed by the helper). If other callers exist, leave it and note in the commit that it is now dead in the section path.

- [ ] **Step 6: Regenerate goldens + diff-review as pure reorder**

```bash
UPDATE_GOLDEN=1 npx vitest run tools/__tests__/cnxml-render-golden.test.js
git diff tools/__tests__/fixtures/render-golden/ | grep -E '^[+-]' | grep -vE '^[+-]{3}' | head -40
git diff --stat tools/__tests__/fixtures/render-golden/ | tail -5
```
Expected: goldens change **only** for fixture modules with nested-section-before-loose-content; every changed line is a **moved** block (same text, new position) — **no** text edits, no number changes, no new/removed elements. Spot-review 2–3 changed goldens to confirm the moved region is a parent-intro now preceding a subsection. Any non-reorder change → STOP and investigate.

- [ ] **Step 7: Full suite + fidelity**

```bash
npm test 2>&1 | grep -E 'Test Files|Tests ' | tail -2
npm run fidelity:render 2>&1 | grep 'Total findings'
```
Expected: all green; `Total findings: 0`.

- [ ] **Step 8: Commit the fix**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render.test.js tools/__tests__/fixtures/render-golden
git commit -m "fix(render): emit section children in document order — intro before subsections [F2]

renderSection rendered all nested <section>s before the parent's loose content
(the render half of the STALE-STRUCT reading-order bug). Now uses the shared
renderChildrenInDocumentOrder walk. Pure emission-reorder; numbers/refs unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Deliver to efnafraedi-2e + Fable reader re-read + register

**Files:**
- Modify (generated, commit): `books/efnafraedi-2e/05-publication/**` (re-rendered)
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` + `docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md` (mark F2 done)

- [ ] **Step 1: Re-render efnafraedi-2e (book-wide — the F2 bug affects any nested-section module)**

```bash
for ch in $(seq 0 21) appendices; do node tools/cnxml-render.js --book efnafraedi-2e --chapter "$ch" --track mt-preview >/dev/null 2>&1; done
for ch in 1 3; do node tools/cnxml-render.js --book efnafraedi-2e --chapter "$ch" --track faithful >/dev/null 2>&1; done
git checkout -- books/efnafraedi-2e/translation-errors.json 2>/dev/null
git status --porcelain books/efnafraedi-2e/05-publication | wc -l
```
Report the changed-page count (expected ≈ the nested-section modules book-wide, includes the 10 F2 pages). Confirm **0 filename renames**: `git diff --diff-filter=R --name-only <base> -- books/efnafraedi-2e/05-publication | wc -l` → 0.

- [ ] **Step 2: Reader-order spot-check on the 10 F2 pages**

For each of `3-2, 4-2, 7-2, 7-6, 8-4, 11-1, 18-3, 18-9, 20-1, 21-4`, confirm the parent-section intro now renders before its subsections (e.g. `grep -n 'data-figure-number' books/efnafraedi-2e/05-publication/mt-preview/chapters/07/7-6-*.html | head` → figure numbers now ascend in document order, no jump). Spot-read 7-6 and 18-3 (the worst cases per the Fable review).

- [ ] **Step 3: Commit the re-render**

```bash
git add books/efnafraedi-2e/05-publication
git commit -m "content(efnafraedi-2e): re-render with document-order sections — F2 reading order fixed for readers [F2]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Fable reader re-read of the 10 pages (the reader-level backstop)**

Dispatch a narrow Fable review over the 10 F2 pages (same prompt shape as the STALE-STRUCT reader review — compare new vs the F2-base render, focus: intro-first order, no number-jumping, no new render glitch). This is the acceptance gate the mechanical goldens cannot provide. Resolve any NEW finding before merge; log pre-existing ones to the register.

- [ ] **Step 5: Register + roadmap: mark F2 delivered**

In `docs/plans/2026-06-28-...md` (STALE-STRUCT outcome, F2 row) and the roadmap (Tier-1 #1): mark F2 ✅ delivered (book-wide re-render; 10 pages read intro-first; Fable-confirmed). Note F1 (Tier-1 #2) is now unblocked to re-include m68710/m68733.

- [ ] **Step 6: Push + PR**

```bash
git push -u origin <branch>
gh pr create --base main --title "fix(render): F2 — emit section children in document order (reading order fixed for readers)" --body "..."
```
PR body: the renderSection child-before-parent fix; two-commit refactor-then-fix; pure reorder (numbers/refs/URLs unchanged); efnafraedi re-rendered book-wide; Fable-confirmed on the 10 pages; unblocks F1. Link the spec + roadmap.

---

## Self-Review

- **Spec coverage:** shared helper → Task 1; two-commit split (refactor gate + fix) → Tasks 1 & 2; TDD unit → Task 2 Step 1; goldens-byte-identical refactor gate → Task 1 Step 4; pure-reorder golden diff-review → Task 2 Step 6; re-render + Fable re-read → Task 3. All spec sections covered.
- **Placeholder scan:** the Task 1 Step 2 helper body is a verbatim move of an identified line range with three explicitly-coded changes — not a placeholder (pasting ~150 unchanged lines would violate DRY and obscure the three real edits; the refactor gate in Step 4 mechanically proves the move was faithful). PR body text (Task 3 Step 6) is a fill-at-time summary.
- **Type/name consistency:** `renderChildrenInDocumentOrder(content, context, { excludeSections, sectionLevel }) → string[]` used identically in Task 1 (definition + renderContent caller) and Task 2 (renderSection caller); `excludeSections:false` + `sectionLevel: Math.min(level+1,6)` for the nested caller consistent with the spec.
