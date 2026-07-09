# Generalize appendix-link resolution across render contexts — Implementation Plan (#18 + #19)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thread the appendix-resolution fields (`bookSlug`, `appendixIdMap`, `appendixModuleLetters`) into every `main()` render context that emits CNXML, via one shared `appendixResolution` object — closing the `appendixModuleLetters`/`appendixIdMap` asymmetry piece 2 left (#18) and extending resolution to the glossary and key-equations paths (#19).

**Architecture:** Define `const appendixResolution = { bookSlug: BOOK_SLUG, appendixIdMap, appendixModuleLetters }` once in `main()`; spread `...appendixResolution` into the per-module context, the four compiled-page contexts, and `glossaryContext`; pass it to `renderKeyEquations` via a new parameter. All dormant today (0 live instances) → **0 published pages change, no re-render.** Contract tests use synthetic appendix links against exported renderers.

**Tech Stack:** Node.js 22 (ESM), Vitest.

## Global Constraints

- **Run `npm test` from the repo ROOT** — the authoritative gate (no branch protection).
- **Zero `books/` changes.** No `05-publication/` re-render (dormant — 0 pages change), never touch `books/*/01-source/`.
- **No vefur change.**
- **Render goldens must stay byte-identical** — the per-module context conversion is behaviour-preserving; a golden diff means something is wrong. Never regenerate a golden in this branch.
- Only add `appendixResolution` (the appendix fields). Do NOT add other context fields (chapterIdToModule, moduleSections, etc.) to the Tier-2 contexts — out of scope.
- Emit appendix URLs exactly as the resolver already does: `/{bookSlug}/vidauki/{UPPERCASE-letter}`, no fragment.
- Branch: `fix/chem-appendix-resolution-contexts` (already created; the design doc is committed on it).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `appendixResolution` object + Tier-1 contexts (per-module + 4 compiled) + Tier-1 contract tests

The four compiled contexts and the per-module context all route through `renderCnxmlToHtml`, which defaults `appendixIdMap`/`appendixModuleLetters` and hardcodes `bookSlug`. They currently carry `appendixModuleLetters` (piece 2) but not `appendixIdMap`. Replace the piecemeal fields with the shared spread.

**Files:**
- Modify: `tools/cnxml-render.js` (define `appendixResolution` ~3233; per-module ctx ~3435; end-of-chapter opts ~3540; summary opts ~3723; answer-key opts ~3773; exercises `renderContext` ~3828; export block ~4008)
- Test: `tools/__tests__/cnxml-render.test.js` (has the piece-2 `renderCompiledExercises` contract-test pattern to mirror)

**Interfaces:**
- Produces: module-scoped `const appendixResolution = { bookSlug, appendixIdMap, appendixModuleLetters }` inside `main()`.
- Produces: `renderEndOfChapterSection` added to the module's `export { … }` block (for its contract test).

- [ ] **Step 1: Write the failing Tier-1 tests (RED)**

In `tools/__tests__/cnxml-render.test.js`, first extend the import block that pulls render functions from `../cnxml-render.js` (the one starting at line 5 that already imports `renderCompiledExercises`) to also import `renderEndOfChapterSection`:

```js
  renderEndOfChapterSection,
```

Then append these two describe blocks (after the existing `appendix document= links on the compiled exercises page` block):

```js
describe('appendix target-id links on the compiled exercises page (#18)', () => {
  // Sibling of the piece-2 document= contract test: proves the exercises
  // renderContext threads appendixIdMap so an A1 target-id appendix link
  // resolves. RED before Task 1 (renderContext lacked appendixIdMap).
  const exercisesByType = {
    exercises: [
      {
        moduleId: 'm00001',
        sectionNumber: '5.1',
        sectionTitle: 'Æfingar',
        exercisesContent:
          '<section class="exercises" id="sec-ex"><title>Æfingar</title>' +
          '<exercise id="ex-1"><problem id="prob-1">' +
          '<para id="pa-1">Sjá <link target-id="apx-elem">Appendix A</link>.</para>' +
          '</problem></exercise></section>',
      },
    ],
  };
  function render(extraContext) {
    return renderCompiledExercises(5, exercisesByType, new Map(), {
      lang: 'is',
      chapter: 5,
      bookSlug: 'efnafraedi-2e',
      moduleSections: {},
      moduleId: '5-exercises',
      ...extraContext,
    });
  }
  it('resolves an A1 target-id appendix link to /vidauki/{letter} when appendixIdMap is present', () => {
    const html = render({
      appendixIdMap: new Map([['apx-elem', { letter: 'A', basename: 'appendices-1-x' }]]),
    });
    expect(html).toContain('<a href="/efnafraedi-2e/vidauki/A">Appendix A</a>');
    expect(html).not.toContain('<link target-id');
  });
});

describe('appendix links on an end-of-chapter section (#18 options-wrapper witness)', () => {
  // renderEndOfChapterSection renders section.content via
  // renderCnxmlToHtml(cnxmlDoc, { ...context.options, … }). It is the
  // representative options-wrapper Tier-1 path (summary/answer-key share the
  // identical `...appendixResolution` spread into their options object).
  function render(options) {
    return renderEndOfChapterSection(
      {
        titleIs: 'Æfingar',
        content:
          '<section class="exercises" id="sec-ex"><title>Æfingar</title>' +
          '<para id="pa-1">Sjá <link document="mAPX">viðauka G</link> og ' +
          '<link target-id="apx-elem">Appendix A</link>.</para></section>',
      },
      { renderCnxmlToHtml, options }
    );
  }
  it('resolves both document= and target-id appendix links when the appendix maps are in options', () => {
    const html = render({
      bookSlug: 'efnafraedi-2e',
      moduleId: '5-summary',
      moduleSections: {},
      appendixModuleLetters: new Map([['mAPX', 'G']]),
      appendixIdMap: new Map([['apx-elem', { letter: 'A', basename: 'appendices-1-x' }]]),
    });
    expect(html).toContain('<a href="/efnafraedi-2e/vidauki/G">viðauka G</a>');
    expect(html).toContain('<a href="/efnafraedi-2e/vidauki/A">Appendix A</a>');
    expect(html).not.toContain('<link');
  });
});
```

**Honest testing note — what these tests do and do NOT gate.** Both `renderCompiledExercises` and `renderEndOfChapterSection` spread the whole context/`options` they are handed straight into `renderCnxmlToHtml`. Because the tests pass the appendix maps **directly** into that context, they resolve regardless of the Step 5–8 edits to `main()`'s literals — they are **contract tests** for the render path (does this renderer thread its context to the resolver, and does the resolver handle document= *and* target-id appendix links?), NOT wiring gates for `main()`'s context literals. `main()` is CLI-only, so its literals are unreachable from unit tests — the exact limitation piece 2 documented. The genuine RED here is the missing `renderEndOfChapterSection` **export** (import error). The `main()`-literal wiring is verified three other ways: (a) **module render goldens stay byte-identical**, proving the per-module `...appendixResolution` conversion is behaviour-preserving; (b) the **existing** piece-2 integration wiring-gate in `pipeline-integration.test.js` (render ch05 → assert `5-exercises.html` carries a `/vidauki/` anchor) now *also* guards the exercises `...appendixResolution` spread — since `appendixModuleLetters` and `appendixIdMap` travel together in the shared object, dropping the spread makes that gate go RED; (c) inspection of the four remaining literals (summary/answer-key/glossary/key-equations — all dormant, no live content to gate).

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tools/__tests__/cnxml-render.test.js -t "appendix"`
Expected: FAIL — `renderEndOfChapterSection` is not exported yet, so the test file errors on the import. (This is the real RED; the assertions themselves are contract-level, per the note above.)

- [ ] **Step 3: Export `renderEndOfChapterSection`**

In `tools/cnxml-render.js`, in the `export { … }` block (~line 4008), add `renderEndOfChapterSection,` (next to `renderCompiledExercises,`):

```js
  renderEndOfChapterSection,
```

- [ ] **Step 4: Define the shared `appendixResolution` object**

In `tools/cnxml-render.js`, immediately after the appendix-id destructure (the line `: buildAppendixIdMap(BOOK_SLUG, args.track);`, ~3233), insert:

```js

    // The fields both appendix branches of resolveCrossModuleHref need (#18/#19).
    // Defined once and spread into every appendix-capable render context so the
    // set cannot drift across the many context literals main() builds.
    const appendixResolution = { bookSlug: BOOK_SLUG, appendixIdMap, appendixModuleLetters };
```

- [ ] **Step 5: Thread it into the per-module context (convert)**

Replace (per-module context, ~3434-3437):

```js
          chapterIdToModule,
          appendixIdMap,
          appendixModuleLetters,
          relocatedIds,
```

with:

```js
          chapterIdToModule,
          ...appendixResolution,
          relocatedIds,
```

- [ ] **Step 6: Thread it into the end-of-chapter section options (14-space)**

Replace (~3539-3540):

```js
              chapterIdToModule,
              appendixModuleLetters,
```

with:

```js
              chapterIdToModule,
              ...appendixResolution,
```

- [ ] **Step 7: Thread it into the summary + answer-key options (12-space — use replace_all)**

Both the compiled-summary and answer-key `options` objects have the identical 12-space line. Replace **all occurrences** of:

```js
            appendixModuleLetters,
```

with:

```js
            ...appendixResolution,
```

(Use the editor's replace-all; this matches exactly the two 12-space occurrences — summary ~3723 and answer-key ~3773. The 14-space and 10-space occurrences are handled in Steps 6 and 8.)

- [ ] **Step 8: Thread it into the exercises `renderContext` (10-space)**

Replace (~3827-3829):

```js
          chapterIdToModule,
          appendixModuleLetters,
          relocatedIds,
```

with:

```js
          chapterIdToModule,
          ...appendixResolution,
          relocatedIds,
```

- [ ] **Step 9: Run to verify GREEN**

Run: `npx vitest run tools/__tests__/cnxml-render.test.js`
Expected: PASS — the two new describe blocks green, AND every existing test (incl. piece-2's document= contract tests and all render goldens) still green with **no golden changes**.

- [ ] **Step 10: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render.test.js
git commit -m "feat(cnxml-render): shared appendixResolution object + Tier-1 contexts [#18]

Define appendixResolution = { bookSlug, appendixIdMap, appendixModuleLetters }
once in main() and spread it into the per-module + 4 compiled render contexts,
replacing the piecemeal appendix fields. Closes the appendixModuleLetters/
appendixIdMap asymmetry piece 2 left: A1 target-id appendix links now resolve
on compiled pages too. Export renderEndOfChapterSection for its contract test.
Dormant (0 live instances) → goldens byte-identical, no re-render.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Tier-2 contexts (glossary + key-equations) + Tier-2 contract tests

`renderCompiledGlossary` and `renderKeyEquations` render CNXML via `processInlineContent(context)` directly, bypassing `renderCnxmlToHtml`'s defaults — so the appendix fields must be on the context object. `glossaryContext` lacks all three; `renderKeyEquations` builds its own context (has `bookSlug`, lacks both maps) and takes no chapter-wide data, so it needs a new parameter.

**Files:**
- Modify: `tools/cnxml-render.js` (`glossaryContext` ~3567; `renderKeyEquations` signature ~2277 + internal ctx ~2279; call site ~3896; export block ~4008)
- Test: `tools/__tests__/cnxml-render.test.js`

**Interfaces:**
- Consumes: `appendixResolution` (Task 1).
- Produces: `renderKeyEquations(chapter, equations, equationTextDictionary, appendixResolution)` — new 4th param.
- Produces: `renderKeyEquations` added to the `export { … }` block.

- [ ] **Step 1: Write the failing Tier-2 tests (RED)**

Extend the render-function import block to also import `renderCompiledGlossary` (if not already imported) and `renderKeyEquations`:

```js
  renderCompiledGlossary,
  renderKeyEquations,
```

Append these describe blocks:

```js
describe('appendix links in the compiled glossary (#19)', () => {
  // renderCompiledGlossary renders def.meaningContent via
  // processInlineContent(context) directly — so the context object itself must
  // carry the appendix fields (glossaryContext gets them via ...appendixResolution).
  function render(context) {
    return renderCompiledGlossary(5, [{ term: 'hugtak', meaningContent: MEANING }], context);
  }
  const MEANING =
    'Sjá <link document="mAPX">viðauka G</link> og <link target-id="apx-elem">Appendix A</link>.';
  it('resolves document= and target-id appendix links when the context carries the appendix fields', () => {
    const html = render({
      bookSlug: 'efnafraedi-2e',
      appendixModuleLetters: new Map([['mAPX', 'G']]),
      appendixIdMap: new Map([['apx-elem', { letter: 'A', basename: 'appendices-1-x' }]]),
    });
    expect(html).toContain('<a href="/efnafraedi-2e/vidauki/G">viðauka G</a>');
    expect(html).toContain('<a href="/efnafraedi-2e/vidauki/A">Appendix A</a>');
    // Scoped like the piece-2 sibling test — a bare not.toContain('<link') is
    // fragile if a renderer ever wraps output in a <head> with a stylesheet link.
    expect(html).not.toContain('<link document');
    expect(html).not.toContain('<link target-id');
  });
});

describe('appendix links in key equations (#19)', () => {
  // renderKeyEquations builds its own context and renders non-MathML entry
  // content via processInlineContent(context). The new 4th param threads the
  // appendix fields in. RED before Task 2: the param does not exist.
  it('resolves an appendix link in a non-MathML key-equation entry via the appendixResolution param', () => {
    const equations = [{ mathml: 'Sjá <link document="mAPX">viðauka G</link>.' }];
    const html = renderKeyEquations(5, equations, {}, {
      bookSlug: 'efnafraedi-2e',
      appendixModuleLetters: new Map([['mAPX', 'G']]),
      appendixIdMap: new Map(),
    });
    expect(html).toContain('<a href="/efnafraedi-2e/vidauki/G">viðauka G</a>');
    expect(html).not.toContain('<link document');
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tools/__tests__/cnxml-render.test.js -t "(#19)"`
Expected: FAIL — `renderKeyEquations` is not exported, so the file errors on the import. Both Tier-2 tests are contract tests (they pass the appendix fields directly into the context/param); the genuine RED is the missing export + missing 4th param. The `main()`-literal wiring for `glossaryContext` and the key-equations call site is inspection-verified (dormant — no live content to gate), consistent with Task 1's note.

- [ ] **Step 3: Spread `appendixResolution` into `glossaryContext`**

Replace (~3566-3568):

```js
        const glossaryContext = {
          chapter: args.chapter,
          figures: {},
```

with:

```js
        const glossaryContext = {
          ...appendixResolution,
          chapter: args.chapter,
          figures: {},
```

- [ ] **Step 4: Add the `appendixResolution` param to `renderKeyEquations`**

Replace the signature (~2277):

```js
function renderKeyEquations(chapter, equations, equationTextDictionary) {
```

with:

```js
function renderKeyEquations(chapter, equations, equationTextDictionary, appendixResolution) {
```

Then spread it into the function's internal context. Replace (~2279-2281):

```js
  const context = {
    chapter,
    bookSlug: BOOK_SLUG,
```

with:

```js
  const context = {
    ...appendixResolution,
    chapter,
    bookSlug: BOOK_SLUG,
```

- [ ] **Step 5: Pass `appendixResolution` at the call site**

Replace (~3896-3900):

```js
        const keyEquationsHtml = renderKeyEquations(
          args.chapter,
          keyEquations,
          equationTextDictionary
        );
```

with:

```js
        const keyEquationsHtml = renderKeyEquations(
          args.chapter,
          keyEquations,
          equationTextDictionary,
          appendixResolution
        );
```

- [ ] **Step 6: Export `renderKeyEquations`**

In the `export { … }` block, add `renderKeyEquations,` (next to `renderCompiledGlossary,`):

```js
  renderKeyEquations,
```

- [ ] **Step 7: Run to verify GREEN**

Run: `npx vitest run tools/__tests__/cnxml-render.test.js`
Expected: PASS — the two new Tier-2 describe blocks green AND everything else still green, goldens unchanged.

- [ ] **Step 8: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render.test.js
git commit -m "feat(cnxml-render): thread appendixResolution into glossary + key-equations [#19]

renderCompiledGlossary and renderKeyEquations render via processInlineContent
directly, so the appendix fields must live on the context object. Spread
...appendixResolution into glossaryContext and add it as a renderKeyEquations
parameter. Extends appendix-link resolution to those two paths (dormant today).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Full-suite gate + roadmap #18/#19 delivered + PR

- [ ] **Step 1: Run the whole suite from repo root**

Run: `npm test`
Expected: PASS — full Vitest workspace green, **all render goldens unchanged** (behaviour-preserving).

- [ ] **Step 2: Confirm zero `books/` changes**

Run: `git status --porcelain books/` (expect empty) and `git diff --stat main..HEAD -- books/` (expect empty).

- [ ] **Step 3: Mark roadmap #18 + #19 delivered**

In `docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md`, update rows #18 and #19: both **DELIVERED 2026-07-09** on branch `fix/chem-appendix-resolution-contexts` — shared `appendixResolution` object spread into all appendix-capable contexts (per-module + 4 compiled + glossary + key-equations); dormant (0 live instances → no re-render, goldens byte-identical); contract tests per render mechanism. Keep the rows' original problem descriptions; append the delivery note. Commit:

```bash
git add docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md
git commit -m "docs(roadmap): #18 + #19 (appendix resolution across contexts) delivered

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Whole-branch review, then PR**

Use the project's whole-branch review flow (most-capable model); address findings; open the PR against `main`. The PR body must state: closes roadmap #18 + #19; efni-only, no vefur change; code + tests only (no `05-publication` re-render — dormant, 0 pages change, goldens byte-identical); one shared `appendixResolution` object eliminates the six-context drift.

## Success criteria (definition of done)

- `appendixResolution` is defined once in `main()` and is the sole source of the appendix fields for the per-module + 4 compiled + glossary + key-equations contexts.
- Contract tests prove the exercises (target-id), end-of-chapter, glossary, and key-equations render paths each resolve appendix links to `/{book}/vidauki/{letter}`.
- `npm test` green from repo root; render goldens byte-identical; zero `books/` changes; no vefur change.
- Roadmap #18 + #19 marked delivered.
