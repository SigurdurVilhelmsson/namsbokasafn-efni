# Fix Duplicate Figures in Examples/Exercises

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicate images when a `<figure>` is nested inside a `<para>` inside an `<example>` (or `<exercise>`/`<note>`). Currently the same image renders up to 3 times.

**Architecture:** The fix keeps figures inside their container elements (examples/exercises) instead of stripping them and re-emitting them at the section level. This mirrors the existing pattern in `buildNoteDom`, which already keeps figures in-place and marks them via `ctx.figuresHandledInNotes` so `buildFigure` skips the standalone copy. We extend this same mechanism to `buildExampleDom` and `buildExerciseDom`.

**Tech Stack:** Node.js, `@xmldom/xmldom` (already a dependency), Vitest

---

## Background

### The duplication chain

1. **Extraction** (`cnxml-extract.js`): For `<para id="para-00012">` containing `<figure><media><image/></media></figure>`, the extractor creates `[[MEDIA:1]]` from the `<media>`, AND places fig-00007 as a top-level structure entry. Same content, two tracks.

2. **Injection** (`buildExampleDom` in `cnxml-inject.js`):
   - `replaceParaContent()` inserts the expanded `[[MEDIA:1]]` as a `<media>` element into the para DOM
   - `removeElementsByTag(exampleEl, ['figure', 'table'])` removes the original `<figure>` (but the expanded `<media>` survives)
   - Section-level `buildFigure()` outputs fig-00007 as a standalone `<figure>` after `</example>`

3. **Rendering** (`cnxml-render.js`): Renders the bare `<media>` both as inline `<img>` and as `<div class="media-inline">`, plus the standalone `<figure>` = 3 copies.

### Scope

| Book | Examples | Exercises | Notes |
|------|----------|-----------|-------|
| lifraen-efnafraedi | **10** | 0 | 0 |
| efnafraedi-2e | 0 | 1 | 0 |
| edlisfraedi-2e | 0 | 37 | 1 |
| liffraedi-2e | 0 | 0 | 70 |

Notes are already handled correctly by `buildNoteDom` (it keeps figures in-place). Examples and exercises are not.

### Existing pattern to follow

`buildNoteDom` (`cnxml-inject.js:2602`) already solves this for notes:
1. Does NOT strip figures — `removeElementsByTag(noteEl, ['table', 'example', 'exercise'])` explicitly omits `figure`
2. Translates figure captions in-place via `ctx.figureCaptions`
3. Marks handled IDs: `ctx.figuresHandledInNotes.add(figId)`
4. `buildFigure()` checks `ctx.figuresHandledInNotes` and returns `null` for handled figures

We replicate this for examples and exercises.

### Key files

| File | Role |
|------|------|
| `tools/cnxml-inject.js:1655` | `buildElement()` — dispatcher, passes `ctx` to builders |
| `tools/cnxml-inject.js:2194` | `buildExampleDom()` — the function to fix |
| `tools/cnxml-inject.js:2411` | `buildExerciseDom()` — same fix needed |
| `tools/cnxml-inject.js:1751` | `buildFigure()` — already has skip-if-handled logic |
| `tools/cnxml-inject.js:1504-1514` | `ctx` object creation — needs new Set |
| `tools/lib/cnxml-dom.js:125` | `replaceParaContent()` — preserves block children |
| `tools/__tests__/cnxml-inject.test.js:697` | Existing DOM builder tests |

---

## Task 1: Write failing test for buildExampleDom figure-in-para

**Files:**
- Modify: `tools/__tests__/cnxml-inject.test.js` (append after line 774)

- [ ] **Step 1: Write the failing test**

Add this test after the existing `buildExampleDom nested list in para` describe block (line 774):

```javascript
describe('buildExampleDom figure inside para', () => {
  // Regression test for lifraen-efnafraedi m00038 where a <para> contains a
  // <figure> as its only content. The extraction creates [[MEDIA:1]] in the
  // para segment AND a top-level figure structure entry. Without the fix,
  // the injection produces a bare <media> inside the para (from [[MEDIA:1]]
  // expansion) AND a standalone <figure> after </example> — 2 copies.
  //
  // The fix: keep the figure inside the example DOM, skip para text injection
  // for media-only paras, and mark the figure ID so buildFigure skips it.

  it('should keep figure inside example when para content is only [[MEDIA:N]]', () => {
    const element = {
      type: 'example',
      id: 'exam-00001',
      title: { segmentId: 'mod:example-title:exam-00001-title', text: 'Strategy' },
      content: [
        {
          type: 'para',
          id: 'para-00010',
          segmentId: 'mod:para:para-00010',
        },
        {
          type: 'para',
          id: 'para-00012',
          segmentId: 'mod:para:para-00012',
          title: { segmentId: 'mod:para-title:para-00012-title', text: 'Solution' },
        },
      ],
    };

    const segments = new Map([
      ['mod:example-title:exam-00001-title', 'Dæmi'],
      ['mod:para:para-00010', 'Horfðu meðfram C1–C2 tenginu.'],
      // The para segment is ONLY the media placeholder
      ['mod:para:para-00012', '[[MEDIA:1]]'],
      ['mod:para-title:para-00012-title', 'Lausn'],
    ]);

    const inlineMedia = [
      {
        placeholder: '[[MEDIA:1]]',
        alt: 'Two Newman projections.',
        src: '../../media/OChem_03_07_007.jpg',
        mimeType: 'image/jpeg',
      },
    ];

    const getSeg = (id) => {
      const raw = segments.get(id) ?? '';
      // Simulate reverseInlineMarkup expanding [[MEDIA:1]]
      return raw;
    };

    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<example id="exam-00001">
<title>Newman Projections</title>
<para id="para-00010">Sight along the C1–C2 bond.</para>
<para id="para-00012"><title><span class="cyan-text">Solution</span></title>
<figure class="unnumbered scaled-down" id="fig-00007">
<media alt="Two Newman projections.">
<image mime-type="image/jpeg" src="../../media/OChem_03_07_007.jpg"/>
</media>
</figure></para>
</example>
</content>
</document>`;

    const ctx = {
      figureCaptions: {},
      figuresHandledInNotes: new Set(),
      figuresHandledInContainers: new Set(),
      inlineMedia,
      inlineTables: [],
      imageMapping: new Map(),
    };

    const result = buildExampleDom(element, getSeg, {}, originalCnxml, ctx);

    // The figure MUST remain inside the example
    expect(result).toContain('<figure');
    expect(result).toContain('fig-00007');
    expect(result).toContain('OChem_03_07_007.jpg');

    // There must be exactly ONE image reference, not duplicated
    const imageCount = (result.match(/OChem_03_07_007\.jpg/g) || []).length;
    expect(imageCount).toBe(1);

    // The figure ID must be marked as handled so buildFigure skips it
    expect(ctx.figuresHandledInContainers.has('fig-00007')).toBe(true);

    // No bare <media> outside a <figure> (the expanded [[MEDIA:1]] must not appear)
    const mediaOutsideFigure = result.replace(/<figure[\s\S]*?<\/figure>/g, '');
    expect(mediaOutsideFigure).not.toContain('<media');
  });

  it('should NOT affect paras that have real text content alongside media', () => {
    // A para with both text AND [[MEDIA:N]] should still inject normally
    const element = {
      type: 'example',
      id: 'exam-text-media',
      title: { segmentId: 'mod:example-title:exam-text-media-title', text: 'Example' },
      content: [
        {
          type: 'para',
          id: 'para-mixed',
          segmentId: 'mod:para:para-mixed',
        },
      ],
    };

    const segments = new Map([
      ['mod:example-title:exam-text-media-title', 'Dæmi'],
      ['mod:para:para-mixed', 'Hér er mynd: [[MEDIA:1]] og meiri texti.'],
    ]);

    const inlineMedia = [
      {
        placeholder: '[[MEDIA:1]]',
        alt: 'A diagram.',
        src: '../../media/diagram.jpg',
        mimeType: 'image/jpeg',
      },
    ];

    const getSeg = (id) => segments.get(id) ?? '';

    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<example id="exam-text-media">
<title>Example</title>
<para id="para-mixed">Here is an image: <media alt="A diagram."><image mime-type="image/jpeg" src="../../media/diagram.jpg"/></media> and more text.</para>
</example>
</content>
</document>`;

    const ctx = {
      figureCaptions: {},
      figuresHandledInNotes: new Set(),
      figuresHandledInContainers: new Set(),
      inlineMedia,
      inlineTables: [],
      imageMapping: new Map(),
    };

    const result = buildExampleDom(element, getSeg, {}, originalCnxml, ctx);

    // Normal para text injection should still work
    expect(result).toContain('Hér er mynd');
    // No figures were kept (there were none in the source)
    expect(ctx.figuresHandledInContainers.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js --reporter=verbose 2>&1 | grep -E "figure inside para|FAIL|PASS" | head -10`

Expected: FAIL — `buildExampleDom` does not accept `ctx` parameter and does not keep figures.

- [ ] **Step 3: Commit**

```bash
git add tools/__tests__/cnxml-inject.test.js
git commit -m "test: add failing tests for figure-in-para inside examples"
```

---

## Task 2: Add `figuresHandledInContainers` to ctx and pass ctx to builders

**Files:**
- Modify: `tools/cnxml-inject.js:1504-1514` (ctx creation)
- Modify: `tools/cnxml-inject.js:1655-1668` (buildElement dispatcher)
- Modify: `tools/cnxml-inject.js:1751-1755` (buildFigure skip check)

- [ ] **Step 1: Add `figuresHandledInContainers` Set to ctx initialization**

At `tools/cnxml-inject.js:1507`, after `const figuresHandledInNotes = new Set();`:

```javascript
  const figuresHandledInContainers = new Set();
```

And in the `ctx` object (line 1508-1514), add it:

```javascript
  const ctx = {
    figureCaptions,
    figuresHandledInNotes,
    figuresHandledInContainers,
    inlineMedia: structure.inlineMedia || [],
    inlineTables: structure.inlineTables || [],
    imageMapping: options.imageMapping || new Map(),
  };
```

- [ ] **Step 2: Pass `ctx` to `buildExampleDom` and `buildExerciseDom` in the dispatcher**

At `tools/cnxml-inject.js:1666-1668`, change:

```javascript
    case 'example':
      return buildExampleDom(element, getSeg, equations, originalCnxml);
    case 'exercise':
      return buildExerciseDom(element, getSeg, equations, originalCnxml);
```

To:

```javascript
    case 'example':
      return buildExampleDom(element, getSeg, equations, originalCnxml, ctx);
    case 'exercise':
      return buildExerciseDom(element, getSeg, equations, originalCnxml, ctx);
```

- [ ] **Step 3: Add skip check in `buildFigure`**

At `tools/cnxml-inject.js:1751-1755`, after the existing `figuresHandledInNotes` check, add:

```javascript
function buildFigure(element, getSeg, originalCnxml, ctx) {
  // Skip figures that were already translated in-place inside a note
  if (ctx && ctx.figuresHandledInNotes && ctx.figuresHandledInNotes.has(element.id)) {
    return null;
  }
  // Skip figures kept inside examples/exercises (same pattern as notes)
  if (ctx && ctx.figuresHandledInContainers && ctx.figuresHandledInContainers.has(element.id)) {
    return null;
  }
```

- [ ] **Step 4: Run existing tests to verify nothing breaks**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js --reporter=verbose 2>&1 | tail -5`

Expected: All existing tests PASS (the new tests from Task 1 still fail — that's expected, we haven't implemented the fix yet).

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-inject.js
git commit -m "refactor(inject): add figuresHandledInContainers to ctx, pass ctx to example/exercise builders"
```

---

## Task 3: Fix `buildExampleDom` to keep figures inside paras

**Files:**
- Modify: `tools/cnxml-inject.js:2194-2294` (`buildExampleDom`)

The fix has three parts:
1. Accept `ctx` parameter
2. Before `removeElementsByTag`, find figures inside paras where the segment is media-only, and mark them as kept
3. Exclude kept figures from removal
4. Skip para text injection for media-only paras (the figure already has the content)

- [ ] **Step 1: Update function signature to accept `ctx`**

At `tools/cnxml-inject.js:2194`, change:

```javascript
function buildExampleDom(element, getSeg, equations, originalCnxml) {
```

To:

```javascript
function buildExampleDom(element, getSeg, equations, originalCnxml, ctx) {
```

- [ ] **Step 2: Add figure-in-para detection before the content loop**

After line 2218 (`const replacedParaIds = new Set();`), add:

```javascript
  // Detect paras whose only content is a [[MEDIA:N]] placeholder corresponding
  // to a figure already in the DOM. For these paras, we keep the figure in place
  // and skip text injection (to avoid duplicating the image).
  const keptFigureIds = new Set();
  const mediaOnlyParaIds = new Set();

  for (const child of element.content || []) {
    if (child.type !== 'para' || !child.id || !child.segmentId) continue;
    const rawSeg = getSeg(child.segmentId) || '';
    // Check if segment is ONLY a [[MEDIA:N]] placeholder (with optional whitespace)
    if (!/^\s*\[\[MEDIA:\d+\]\]\s*$/.test(rawSeg)) continue;

    // Check if the para's DOM node contains a <figure>
    const paraEl = doc.getElementById(child.id);
    if (!paraEl) continue;
    const figures = paraEl.getElementsByTagName('figure');
    if (figures.length === 0) continue;

    // Mark this para as media-only and keep its figures
    mediaOnlyParaIds.add(child.id);
    for (let i = 0; i < figures.length; i++) {
      const figId = figures[i].getAttribute('id');
      if (figId) keptFigureIds.add(figId);
    }
  }
```

- [ ] **Step 3: Skip para text injection for media-only paras**

In the content loop (around line 2222), modify the para handling to skip text injection for media-only paras but still inject the title:

```javascript
    if (child.type === 'para' && child.id) {
      const paraEl = doc.getElementById(child.id);
      if (!paraEl) {
        isFirstPara = false;
        continue;
      }

      // For media-only paras (figure is the only content), skip text injection
      // but still inject the translated title. The figure stays in the DOM.
      if (mediaOnlyParaIds.has(child.id)) {
        let titleText = '';
        if (isFirstPara && element.title?.segmentId) {
          titleText = getSeg(element.title.segmentId) || '';
        } else if (child.title?.segmentId) {
          titleText = getSeg(child.title.segmentId) || child.title.text || '';
        }
        if (titleText) {
          const titleCnxml = `<title>${titleText}</title>`;
          replaceParaContentDom(doc, paraEl, '', titleCnxml);
        }
        replacedParaIds.add(child.id);
        isFirstPara = false;
        continue;
      }

      // ... existing para handling continues unchanged ...
```

- [ ] **Step 4: Replace `removeElementsByTag` with selective removal**

Replace line 2281:

```javascript
  removeElementsByTag(exampleEl, ['figure', 'table']);
```

With:

```javascript
  // Remove tables unconditionally; remove figures UNLESS they were kept inside paras
  removeElementsByTag(exampleEl, ['table']);
  const allFigures = Array.from(exampleEl.getElementsByTagName('figure'));
  for (const fig of allFigures) {
    const figId = fig.getAttribute('id');
    if (!keptFigureIds.has(figId)) {
      fig.parentNode.removeChild(fig);
    }
  }
```

- [ ] **Step 5: Mark kept figures in ctx**

After the selective removal, before serialization (before line 2284 `let result = serializeCnxmlFragment`):

```javascript
  // Mark kept figures so buildFigure skips the standalone copy
  if (ctx && ctx.figuresHandledInContainers) {
    for (const figId of keptFigureIds) {
      ctx.figuresHandledInContainers.add(figId);
    }
  }
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js --reporter=verbose 2>&1 | grep -E "figure inside para|nested list|FAIL|PASS|Tests" | head -15`

Expected: The new "figure inside para" tests PASS. The existing "nested list" test still PASSES.

- [ ] **Step 7: Commit**

```bash
git add tools/cnxml-inject.js
git commit -m "fix(inject): keep figures inside example paras instead of stripping and duplicating"
```

---

## Task 4: Apply same fix to `buildExerciseDom`

**Files:**
- Modify: `tools/cnxml-inject.js:2411-2481` (`buildExerciseDom`)
- Modify: `tools/__tests__/cnxml-inject.test.js` (add exercise test)

- [ ] **Step 1: Write failing test for buildExerciseDom**

```javascript
describe('buildExerciseDom figure inside para', () => {
  it('should keep figure inside exercise when para content is only [[MEDIA:N]]', () => {
    const element = {
      type: 'exercise',
      id: 'exer-fig',
      problem: {
        content: [
          {
            type: 'para',
            id: 'para-prob',
            segmentId: 'mod:para:para-prob',
          },
        ],
      },
      solution: {
        content: [
          {
            type: 'para',
            id: 'para-sol',
            segmentId: 'mod:para:para-sol',
          },
        ],
      },
    };

    const segments = new Map([
      ['mod:para:para-prob', 'Teiknaðu myndina.'],
      ['mod:para:para-sol', '[[MEDIA:1]]'],
    ]);

    const inlineMedia = [
      {
        placeholder: '[[MEDIA:1]]',
        alt: 'A solution diagram.',
        src: '../../media/solution.jpg',
        mimeType: 'image/jpeg',
      },
    ];

    const getSeg = (id) => segments.get(id) ?? '';

    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<exercise id="exer-fig">
<problem id="prob-fig"><para id="para-prob">Draw the diagram.</para></problem>
<solution id="sol-fig"><para id="para-sol">
<figure class="unnumbered" id="fig-sol">
<media alt="A solution diagram."><image mime-type="image/jpeg" src="../../media/solution.jpg"/></media>
</figure></para></solution>
</exercise>
</content>
</document>`;

    const ctx = {
      figureCaptions: {},
      figuresHandledInNotes: new Set(),
      figuresHandledInContainers: new Set(),
      inlineMedia,
      inlineTables: [],
      imageMapping: new Map(),
    };

    const result = buildExerciseDom(element, getSeg, {}, originalCnxml, ctx);

    // Figure must be inside the exercise
    expect(result).toContain('fig-sol');
    expect(result).toContain('solution.jpg');

    // Only one copy
    const imageCount = (result.match(/solution\.jpg/g) || []).length;
    expect(imageCount).toBe(1);

    // Marked as handled
    expect(ctx.figuresHandledInContainers.has('fig-sol')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js --reporter=verbose 2>&1 | grep -E "exercise.*figure|FAIL" | head -5`

Expected: FAIL

- [ ] **Step 3: Apply the fix to `buildExerciseDom`**

Same pattern as Task 3 — update `buildExerciseDom` signature to accept `ctx`, add media-only para detection inside `processContent`, and selectively remove figures. The key changes:

1. Change function signature from `function buildExerciseDom(element, getSeg, equations, originalCnxml)` to `function buildExerciseDom(element, getSeg, equations, originalCnxml, ctx)`

2. Add `keptFigureIds` Set before `processContent`

3. Inside `processContent`, add the same media-only para detection: check if `rawSeg` matches `^\s*\[\[MEDIA:\d+\]\]\s*$`, find figures in the para DOM, add to `keptFigureIds` and skip text injection

4. Replace `removeElementsByTag(exerciseEl, ['figure', 'table'])` with selective removal (same as Task 3, Step 4)

5. Mark kept figures in `ctx.figuresHandledInContainers`

- [ ] **Step 4: Run tests**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js --reporter=verbose 2>&1 | tail -5`

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject.test.js
git commit -m "fix(inject): keep figures inside exercise paras, same pattern as examples"
```

---

## Task 5: Verify efnafraedi-2e fidelity is unchanged

This is the critical safety check. The fix must not change the output for any existing book.

**Files:** None modified — this is a verification task.

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: All ~1067 tests pass, 0 failures.

- [ ] **Step 2: Re-inject an efnafraedi-2e chapter and check fidelity**

Pick chapter 1 (it has examples and exercises):

```bash
node tools/cnxml-inject.js efnafraedi-2e 1 --track mt-preview --verbose 2>&1 | tail -20
```

Expected: No new discrepancies. Module count should match existing results.

- [ ] **Step 3: Run fidelity check for the full book**

```bash
node tools/cnxml-extract.js efnafraedi-2e all --check-only 2>&1 | tail -5
```

Expected: 119/148 PERFECT (unchanged from baseline).

- [ ] **Step 4: Commit (snapshot of verification)**

No code changes — just note the verification passed. If the inject produced different output files, restore them:

```bash
git checkout -- books/efnafraedi-2e/03-translated/
```

---

## Task 6: Re-inject and re-render organic chemistry ch03

**Files:**
- Modified by pipeline: `books/lifraen-efnafraedi/03-translated/mt-preview/ch03/*.cnxml`
- Modified by pipeline: `books/lifraen-efnafraedi/05-publication/mt-preview/chapters/03/*.html`

- [ ] **Step 1: Re-inject chapter 3**

```bash
node tools/cnxml-inject.js lifraen-efnafraedi 3 --track mt-preview --verbose
```

Expected: No errors. The translated CNXML for m00033, m00035, m00038 should now have figures INSIDE the examples, not after them.

- [ ] **Step 2: Verify the translated CNXML for m00038**

Check that fig-00007 is inside the example, not after it:

```bash
grep -n "fig-00007\|</example>" books/lifraen-efnafraedi/03-translated/mt-preview/ch03/m00038.cnxml
```

Expected: `fig-00007` line number should be BEFORE `</example>` line number.

- [ ] **Step 3: Re-render chapter 3**

```bash
node tools/cnxml-render.js lifraen-efnafraedi 3 --track mt-preview --verbose
```

- [ ] **Step 4: Verify no duplicate images in HTML**

```bash
# Count image occurrences in the affected files
for f in 3-2-alkanar-og-hverfur-alkana.html 3-4-nafngiftir-alkana.html 3-7-afbrigdi-annarra-alkana.html; do
  count=$(grep -c 'OChem_03_' "books/lifraen-efnafraedi/05-publication/mt-preview/chapters/03/$f" 2>/dev/null)
  echo "$f: $count image references"
done
```

Expected: Each image should appear exactly once (or twice if legitimately used in different contexts — but not 3 times for the same location).

- [ ] **Step 5: Commit the fixed output**

```bash
git add books/lifraen-efnafraedi/03-translated/mt-preview/ch03/
git add books/lifraen-efnafraedi/05-publication/mt-preview/chapters/03/
git commit -m "fix(content): re-inject and re-render organic chemistry ch03 — no duplicate figures"
```
