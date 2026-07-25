# P0-1 Depth-Aware Render Walk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the depth-blind flat-scan itemization in `renderChildrenInDocumentOrder` with a depth-aware direct-children DOM walk, unify `renderList` item rendering so nested blocks render in place, and delete the E6/E9 compensation machinery.

**Architecture:** Extend the proven `renderBlockChildrenInOrder` DOM seam (already used by note/example/exercise) to the section level via a dispatch map, and generalize `renderList`'s equation-placeholder branch into a single placeholder-swap path for all block types in items. String renderers stay; they consume serialized nodes. Spec: `docs/plans/2026-07-13-p01-depth-aware-render-walk-design.md`.

**Tech Stack:** Node 22 ES modules, `@xmldom/xmldom` 0.9 (via `tools/lib/cnxml-dom.js`), Vitest.

## Global Constraints

- Run all tests from the **repo root**: `npx vitest run <file>` per task, full `npm test` at the end. Local green is the authoritative gate (no branch protection).
- `books/*/01-source/` and `books/*/02-mt-output/` are READ-ONLY. This PR changes **no files under `books/`** at all.
- Renderer changes are inert for published HTML until the separate lead-gated re-render; do NOT run `cnxml-render.js` against real book output dirs except in temp copies.
- Branch: `fix/p01-depth-aware-render-walk`. Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Behavior invariants (spec §4.1): per-container hoist policies unchanged (note = all; example/exercise = `['list','equation','table']`, figures/media inline via renderPara, **unnumbered**); loud-seam contract kept (`context.undispatchedBlocks`); pure-para list items keep the `<br>`-join byte-identically.
- `tools/lib/cnxml-parser.js` (`extractElements`/`extractNestedElements`) is shared with extract/inject — do NOT change its semantics; all new behavior lives in `tools/cnxml-render.js`.

## File Structure

- Modify: `tools/cnxml-render.js` — all four code tasks land here (`renderList` ~1770–1890; `renderChildrenInDocumentOrder` 842–1015; `positionInContent` 836–840; context Sets 593–594; `renderFigure` 1068–1079; `renderTable` ~1662–1670; `renderExample` paraHandler 1434–1441; `renderExercise` paraHandler 1548–1560; CLI module loop ~3547–3620 + after-loop; `renderBlockChildrenInOrder` 1284).
- Create: `tools/__tests__/cnxml-render-item-blocks.test.js` (Task 1), `tools/__tests__/cnxml-render-depth-walk.test.js` (Task 2).
- Modify: `tools/__tests__/pipeline-integration.test.js` (Task 4: malformed-module isolation case).
- Regenerate: `tools/__tests__/fixtures/render-golden/**/*.html` (Task 5, reviewed diff).
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`, `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (Task 5 register/ledger updates).

**Element object contract used throughout** (from `tools/lib/cnxml-parser.js`): `extractElements(str, tag)` / `extractNestedElements(str, tag)` return `{ id, attributes, content, fullMatch }` — `content` is the inner CNXML string, `fullMatch` the whole element. `extractNestedElements` is same-tag-depth-correct (outermost matches only) and silently skips self-closing elements; `extractElements` is non-greedy (truncates at first close tag on same-tag nesting) but handles self-closing.

---

### Task 1: Unify renderList item rendering (blocks in place)

**Files:**
- Modify: `tools/cnxml-render.js:1770-1890` (`renderList`)
- Test: `tools/__tests__/cnxml-render-item-blocks.test.js` (create)

**Interfaces:**
- Consumes: existing `renderFigure`, `renderTable`, `renderMedia`, `renderEquation`, `processInlineContent`, `extractElements`, `extractNestedElements`, `escapeAttr`.
- Produces: `renderItemBody(content, context) → string` (module-private helper; Task 2 relies on `renderList` handling media/figure/table/equation in items so the section walk can stop hoisting them).

**Why first:** container-hoisted lists (e.g. a stepwise list inside an example) already reach `renderList` with intact items today; Task 2 routes *section-level* lists here too. renderList must own in-item blocks before the section walk stops hoisting them, or media loses its `.media-inline` CSS wrapper (spec §3, renderList-parity probe).

- [ ] **Step 1: Write the failing tests**

Create `tools/__tests__/cnxml-render-item-blocks.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e');

const MATH = '<m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mi>x</m:mi></m:math>';

function doc(inner) {
  return (
    '<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">' +
    '<title>T</title><content>' +
    inner +
    '</content></document>'
  );
}

function render(inner, extra = {}) {
  return renderCnxmlToHtml(doc(inner), {
    lang: 'is',
    chapter: 3,
    moduleId: 'mTEST',
    moduleSections: {},
    ...extra,
  });
}

// li body helper: grab everything between the first <li...> and its matching </li>
function liBody(html) {
  const m = html.match(/<li[^>]*>([\s\S]*?)<\/li>/);
  return m ? m[1] : '';
}

describe('renderItemBody — blocks render in place inside <li>', () => {
  it('media in a no-para item renders INSIDE the li with .media-inline wrapper', () => {
    // The dominant real shape (m68739 stepwise): text + <newline/> + <media>.
    // Pre-fix: processInlineContent emits a bare <img> (no wrapper) — CSS regression class.
    const html = render(
      '<example id="ex1"><list class="stepwise"><item>Teikna Lewis-mynd.<newline/>' +
        '<media id="mA" class="scaled-down" alt="skref"><image src="step1.svg" mime-type="image/svg+xml"/></media>' +
        '</item></list></example>'
    ).html;
    const body = liBody(html);
    expect(body).toContain('class="media-inline scaled-down"');
    expect(body).toContain('step1.svg');
  });

  it('figure in a no-para item renders INSIDE the li via renderFigure (no raw leak)', () => {
    // Organic shape (191 sites): figure-wrapped media as item child.
    const html = render(
      '<list id="L1"><item>Sameind:' +
        '<figure id="figX"><media id="mX" alt="x"><image src="molecule.jpg" mime-type="image/jpeg"/></media>' +
        '<caption>Skýring</caption></figure></item></list>'
    ).html;
    const body = liBody(html);
    expect(body).toContain('<figure');
    expect(body).toContain('molecule.jpg');
    expect(html).not.toContain('<media'); // no raw CNXML leak
    expect(html.split('molecule.jpg').length - 1).toBe(1); // exactly once
  });

  it('equation nested INSIDE an item para dispatches to renderEquation (m68710 shape)', () => {
    // Pre-fix: pure-para branch leaks the raw <equation> wrapper into the <br>-joined text.
    const html = render(
      '<example id="ex2"><list class="stepwise"><item>' +
        `<para id="ip1">Skrifaðu hálfhvörfin.<equation id="eqN" class="unnumbered">${MATH}</equation></para>` +
        '</item></list></example>'
    ).html;
    expect(html).toContain('class="equation unnumbered"');
    expect(html).not.toMatch(/<equation[^>]*id="eqN"/); // raw wrapper gone
  });

  it('table in an item renders via renderTable inside the li', () => {
    const html = render(
      '<list id="L2"><item>Sjá:' +
        '<table id="tbl1" summary="s"><tgroup cols="1"><tbody><row><entry>klefi</entry></row></tbody></tgroup></table>' +
        '</item></list>'
    ).html;
    const body = liBody(html);
    expect(body).toContain('<table');
    expect(body).toContain('klefi');
  });

  it('BYTE-PARITY: pure multi-para item keeps the <br> join with no ids', () => {
    const html = render(
      '<list id="L3"><item><para id="pa">Fyrri.</para><para id="pb">Seinni.</para></item></list>'
    ).html;
    expect(html).toContain('<li>Fyrri.<br>Seinni.</li>');
  });

  it('BYTE-PARITY: text + newline + equation item keeps equation at its position in the flow', () => {
    const html = render(
      `<list id="L4"><item>Fyrir: <newline/><equation id="eqB" class="unnumbered">${MATH}</equation> eftir.</item></list>`
    ).html;
    const body = liBody(html);
    expect(body.indexOf('Fyrir:')).toBeLessThan(body.indexOf('class="equation'));
    expect(body.indexOf('class="equation')).toBeLessThan(body.indexOf('eftir.'));
  });

  it('nested list still renders inside the li, after the item text', () => {
    const html = render(
      '<list id="L5"><item>Yfirlið:<list id="L5inner"><item>Undirliður</item></list></item></list>'
    ).html;
    const body = html.slice(html.indexOf('<li>Yfirlið:'));
    expect(body).toContain('id="L5inner"');
    expect(body.indexOf('Yfirlið:')).toBeLessThan(body.indexOf('Undirliður'));
  });

  it('unknown block type in an item hits the loud seam, not silence', () => {
    const res = render('<list id="L6"><item>Texti<quote id="q1">tilvitnun</quote></item></list>');
    expect(res.undispatchedBlocks.some((b) => b.tag === 'quote')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify the right ones fail**

Run: `npx vitest run tools/__tests__/cnxml-render-item-blocks.test.js`
Expected: FAIL on `media-in-no-para-item` (bare `<img>`, no `media-inline` in li), `figure-in-item` (raw `<media` leak), `equation-inside-para` (raw `<equation` present), `table-in-item` (raw leak), `unknown block loud seam` (quote not recorded). The two BYTE-PARITY tests and the nested-list test should PASS against current code (they pin behavior to preserve) — if a parity test fails pre-change, the assertion is wrong; fix the test, not the code.

- [ ] **Step 3: Implement `renderItemBody` and rewire `renderList`**

In `tools/cnxml-render.js`, replace the entire item loop of `renderList` (everything from `const items = extractNestedElements(list.content, 'item');` at line 1790 down to the closing `}` of the `for` loop at line 1886) with:

```js
  const items = extractNestedElements(list.content, 'item');
  for (const item of items) {
    const itemId = item.id ? ` id="${escapeAttr(item.id)}"` : '';
    lines.push(`  <li${itemId}>${renderItemBody(item.content, context)}</li>`);
  }
```

Then add the helper directly above `renderList`:

```js
/**
 * Render a list item's mixed content: inline text interleaved with block
 * children (nested list, figure, table, media, equation) either as direct
 * item children or nested inside an item <para> — the two depths the corpus
 * carries.
 *
 * Blocks are swapped for NUL-delimited placeholders IN PLACE (preserving
 * their position in the text flow — the mechanism proven by the former
 * equation-only branch), the remaining text renders through the existing
 * para/<br> and inline paths, then placeholders are substituted with each
 * block's rendered HTML. Extraction order (list → figure → table → media →
 * equation) keeps each pass blind to content an earlier pass already owns
 * (a figure-wrapped <media> stays the figure's; blocks inside a nested list
 * belong to its own renderList recursion).
 */
function renderItemBody(content, context) {
  let working = content;
  const placeholders = [];

  const swap = (elements, renderer) => {
    for (const el of elements) {
      if (!el.fullMatch) continue;
      const idx = working.indexOf(el.fullMatch);
      if (idx === -1) {
        // fullMatch no longer present (should not happen — swaps preserve all
        // other bytes). Record loudly rather than lose content silently.
        if (context.undispatchedBlocks) {
          context.undispatchedBlocks.push({
            tag: 'unswappable',
            id: el.id || null,
            location: 'renderList-item',
          });
        }
        continue;
      }
      const ph = `\u0000BLOCK_${placeholders.length}\u0000`;
      working = working.slice(0, idx) + ph + working.slice(idx + el.fullMatch.length);
      placeholders.push({ ph, html: renderer(el, context) });
    }
  };

  swap(extractNestedElements(working, 'list'), (el, ctx) => renderList(el, ctx));
  swap(extractNestedElements(working, 'figure'), renderFigure);
  swap(extractNestedElements(working, 'table'), renderTable);
  swap(extractNestedElements(working, 'media'), renderMedia);
  swap(extractElements(working, 'equation'), renderEquation);

  // Loud seam for block-shaped elements we do not dispatch in items (e.g. quote).
  // Inline elements and item metadata are expected here and stay in the text flow.
  if (context.undispatchedBlocks) {
    const ITEM_INLINE_OK = new Set([...LOUD_SEAM_IGNORE, 'para', 'space', 'image', 'span']);
    const leftoverTag = /<([a-z][\w-]*)[\s/>]/g;
    let m;
    while ((m = leftoverTag.exec(working)) !== null) {
      if (!ITEM_INLINE_OK.has(m[1])) {
        context.undispatchedBlocks.push({ tag: m[1], id: null, location: 'renderList-item' });
      }
    }
  }

  // Paras: render each at its position; '<br>' only between ADJACENT paras
  // (byte-parity with the former pure-para join); text/placeholders between or
  // around paras render inline at their natural position.
  const paras = extractElements(working, 'para');
  let rendered;
  if (paras.length > 0) {
    const parts = []; // strings (inline runs) and {para: html} objects
    let rest = working;
    for (const p of paras) {
      const idx = rest.indexOf(p.fullMatch);
      if (idx === -1) continue;
      const before = rest.slice(0, idx);
      if (before.trim()) parts.push(processInlineContent(before, context));
      parts.push({ para: processInlineContent(p.content, context) });
      rest = rest.slice(idx + p.fullMatch.length);
    }
    if (rest.trim()) parts.push(processInlineContent(rest, context));
    rendered = '';
    for (let i = 0; i < parts.length; i++) {
      const cur = parts[i];
      if (i > 0 && typeof cur === 'object' && typeof parts[i - 1] === 'object') {
        rendered += '<br>';
      }
      rendered += typeof cur === 'object' ? cur.para : cur;
    }
  } else {
    rendered = processInlineContent(working, context);
  }

  for (const { ph, html } of placeholders) {
    rendered = rendered.replace(ph, html);
  }
  return rendered;
}
```

Notes for the implementer:
- `LOUD_SEAM_IGNORE` is defined at `tools/cnxml-render.js:1231` and covers `title/label/caption/meta/newline/sub/sup/emphasis/term/link/math/footnote`. The extra `['space','image']` allowance covers CNXML inline `<space/>` and `<image>` already handled by `processInlineContent`.
- The placeholder mechanism (`\u0000…\u0000` survives `processInlineContent`) is proven by the former lines 1865–1879; this generalizes it.
- Delete the now-unused four-branch item code entirely (nested-list branch, DOM-walk branch, pure-para branch, equation-placeholder branch). `parseCnxmlFragment` import may become unused in this function — it is still used elsewhere in the file; do not remove the import.

- [ ] **Step 4: Run the new tests and the existing renderList pins**

Run: `npx vitest run tools/__tests__/cnxml-render-item-blocks.test.js tools/__tests__/cnxml-render-list-dom.test.js tools/__tests__/cnxml-render-nesting.test.js tools/__tests__/cnxml-render.test.js tools/__tests__/cnxml-render-golden.test.js`
Expected: item-blocks PASS; list-dom PASS (its 4 cases are shapes the new path must keep); nesting matrix PASS (32 cells, 0 skips). Goldens: PASS expected — item-block shapes in the 10 golden modules previously went through the DOM-walk/placeholder branches whose output the new path reproduces; **if a golden fails, inspect the diff**: whitespace-only or block-position-in-li differences are the accepted class (record them; they will be regenerated in Task 5) — content loss or duplication is a bug, stop and fix.

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render-item-blocks.test.js
git commit -m "feat(render): unified in-place block rendering inside list items (P0-1 task 1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Depth-aware section-level walk

**Files:**
- Modify: `tools/cnxml-render.js:842-1015` (`renderChildrenInDocumentOrder` body), `tools/cnxml-render.js:1284` (`renderBlockChildrenInOrder` self-closing fallback)
- Test: `tools/__tests__/cnxml-render-depth-walk.test.js` (create)

**Interfaces:**
- Consumes: `renderBlockChildrenInOrder(content, context, dispatch, options)` (`:1246`), `renderItemBody` behavior from Task 1 (media/figure now render in place when lists stop being media-stripped), all existing per-type renderers.
- Produces: `renderChildrenInDocumentOrder(content, context, {excludeSections, sectionLevel}) → string[]` — **same signature and return type** (array of HTML strings); `tools/__tests__/cnxml-render.documentOrder.test.js` imports it directly. Parse failures throw `Error` whose message contains `context.moduleId` (Task 4 catches this per module).

- [ ] **Step 1: Write the failing tests**

Create `tools/__tests__/cnxml-render-depth-walk.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e');

function doc(inner) {
  return (
    '<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">' +
    '<title>T</title><content>' +
    inner +
    '</content></document>'
  );
}

function render(inner, extra = {}) {
  return renderCnxmlToHtml(doc(inner), {
    lang: 'is',
    chapter: 3,
    moduleId: 'mWALK',
    moduleSections: {},
    ...extra,
  });
}

describe('depth-aware section walk', () => {
  it('ID-LESS figure inside an exercise renders exactly once (no registry to save it)', () => {
    // Pre-fix: the flat scan itemizes the nested figure top-level; with no id,
    // renderedFigureIds cannot suppress the duplicate → renders twice.
    const html = render(
      '<exercise id="ex1"><problem id="pr1"><para id="p1">Sp</para>' +
        '<figure><media alt="nafnlaus"><image src="anon_fig.jpg" mime-type="image/jpeg"/></media></figure>' +
        '</problem></exercise>'
    ).html;
    expect(html.split('anon_fig.jpg').length - 1).toBe(1);
  });

  it('ID-LESS table inside a note renders exactly once', () => {
    const html = render(
      '<note id="n1"><para id="p1">Ath</para>' +
        '<table summary="s"><tgroup cols="1"><tbody><row><entry>stak_klefi</entry></row></tbody></tgroup></table>' +
        '</note>'
    ).html;
    expect(html.split('stak_klefi').length - 1).toBe(1);
  });

  it('ID-LESS media-bearing list keeps its document position (E6 residual)', () => {
    // Pre-fix: media-strip mutates the list fullMatch; with no id the position
    // fallback collapses to 0 and the list hoists above the preceding para.
    const html = render(
      '<para id="p-before">Á undan.</para>' +
        '<list><item>Skref<media id="mL" alt="s"><image src="in_list.svg" mime-type="image/svg+xml"/></media></item></list>'
    ).html;
    expect(html.indexOf('Á undan.')).toBeLessThan(html.indexOf('in_list.svg'));
  });

  it('media inside a section-level list item renders INSIDE the li (E6 relocation fixed)', () => {
    const html = render(
      '<list id="Lsec"><item>Skref eitt<media id="mS" class="scaled-down" alt="s">' +
        '<image src="sec_step.svg" mime-type="image/svg+xml"/></media></item></list>'
    ).html;
    const li = html.match(/<li>[\s\S]*?<\/li>/)[0];
    expect(li).toContain('sec_step.svg');
    expect(li).toContain('media-inline');
  });

  it('unknown block element (quote) hits the loud seam and does not leak raw', () => {
    const res = render('<quote id="q1">tilvitnun_texti</quote><para id="p1">Eftir.</para>');
    expect(res.undispatchedBlocks.some((b) => b.tag === 'quote')).toBe(true);
    expect(res.html).not.toContain('<quote');
  });

  it('excluded section classes are still dropped at top level', () => {
    const html = render(
      '<para id="p1">Meginmál.</para>' +
        '<section id="s-ex" class="exercises"><title>Æfingar</title><para id="pe">Falið.</para></section>'
    ).html;
    expect(html).toContain('Meginmál.');
    expect(html).not.toContain('Falið.');
  });

  it('non-excluded nested subsections render recursively with deeper headings', () => {
    const html = render(
      '<section id="s1"><title>Ytri</title><para id="p1">A</para>' +
        '<section id="s2"><title>Innri</title><para id="p2">B</para></section></section>'
    ).html;
    expect(html).toContain('<h2>Ytri</h2>');
    expect(html).toContain('<h3>Innri</h3>');
    expect(html.indexOf('A')).toBeLessThan(html.indexOf('Innri'));
  });

  it('a block hoisted out of a top-level para renders standalone AFTER the para', () => {
    const html = render(
      '<para id="ph">Texti á undan <figure id="fh"><media id="mh" alt="h">' +
        '<image src="hoisted.jpg" mime-type="image/jpeg"/></media></figure> og eftir.</para>'
    ).html;
    expect(html.split('hoisted.jpg').length - 1).toBe(1);
    // the para's trailing text stays in the para; the figure renders after it
    expect(html.indexOf('og eftir.')).toBeLessThan(html.indexOf('hoisted.jpg'));
  });

  it('malformed module content throws an Error naming the module', () => {
    expect(() => render('<para id="p1">Óklárað <emphasis>brot</para>')).toThrow(/mWALK/);
  });

  it('serialized-node handoff preserves multi-class attributes regardless of attribute order', () => {
    // The walk hands renderers the SERIALIZED node (xmldom may normalize
    // attribute order/entities); pin that multi-class + id survive intact.
    const html = render(
      '<note class="chemist-portrait unnumbered" id="nAttr"><para id="pA">Efni.</para></note>'
    ).html;
    expect(html).toContain('id="nAttr"');
    expect(html).toContain('note-chemist-portrait unnumbered'); // class value intact through renderNote
    expect(html).toContain('Efni.');
  });
});
```

- [ ] **Step 2: Run tests to verify the right ones fail**

Run: `npx vitest run tools/__tests__/cnxml-render-depth-walk.test.js`
Expected: FAIL on id-less-figure (count 2), id-less-table (count 2), id-less-list-position, media-inside-li, quote-loud-seam, malformed-throw (currently renders garbage instead of throwing). The excluded-section, subsection-recursion, and para-hoist tests should PASS pre-change (they pin preserved behavior).

- [ ] **Step 3: Rewrite `renderChildrenInDocumentOrder`**

Replace the entire body of `renderChildrenInDocumentOrder` (lines 842–1015) with:

```js
function renderChildrenInDocumentOrder(content, context, { excludeSections, sectionLevel }) {
  // Sections to exclude from main content (they have their own pages)
  // Loaded from book config — varies by book (e.g., Biology uses multiple-choice, critical-thinking)
  let EXCLUDED_SECTION_CLASSES = BOOK_CONFIG
    ? [...BOOK_CONFIG.excludedSectionClasses]
    : ['summary', 'key-equations', 'exercises'];

  // If sectionExercises is 'both', keep section-exercises inline (don't exclude them)
  if (BOOK_CONFIG && BOOK_CONFIG.sectionExercises === 'both') {
    EXCLUDED_SECTION_CLASSES = EXCLUDED_SECTION_CLASSES.filter(
      (cls) => cls !== 'section-exercises'
    );
  }

  const sectionHandler = (section, ctx) => {
    const sectionClass = section.attributes.class || '';
    // Only exclude sections if excludeSections flag is true (default).
    // When rendering standalone sections, excludeSections is false.
    const shouldExclude =
      excludeSections && EXCLUDED_SECTION_CLASSES.some((cls) => sectionClass.includes(cls));
    if (shouldExclude) return '';
    return renderSection(section, ctx, sectionLevel);
  };

  // Direct-children DOM walk (Track C leaf-seam promoted to section level).
  // The corpus vocabulary of direct <content>/<section> children is closed
  // (11 block tags; title/label are consumed by renderSection; comments are
  // skipped by the walk); anything else lands in the loud seam. No hoistTags
  // option → default hoist-all, matching the old strip cascade where every
  // block type was pulled out of a top-level <para> and rendered after it.
  try {
    return renderBlockChildrenInOrder(content, context, {
      section: sectionHandler,
      figure: renderFigure,
      note: renderNote,
      example: renderExample,
      exercise: renderExercise,
      table: renderTable,
      media: renderMedia,
      list: renderList,
      equation: renderEquation,
      para: renderPara,
    });
  } catch (err) {
    // xmldom 0.9 throws ParseError on malformed XML. Fail loud with module
    // identity; the CLI loop converts this to a per-module skip + exit 1.
    throw new Error(
      `CNXML parse failed for module ${context.moduleId || '(unknown)'}: ${err.message}`
    );
  }
}
```

Also delete `positionInContent` (lines 836–840) **and its docstring** (lines 825–835) — after this rewrite it has zero callers (verify: `grep -n "positionInContent" tools/cnxml-render.js` must return nothing). Check `removeNestedElements` callers the same way (`grep -n "removeNestedElements(" tools/cnxml-render.js`): if the only caller was line 862 (now gone), delete the function (lines ~1999–2033); if other callers exist, leave it.

- [ ] **Step 4: Harden `renderBlockChildrenInOrder` against self-closing elements**

At line 1284, `extractNestedElements(serializeCnxmlFragment(node), name)[0]` silently drops a self-closing/empty element (the serializer emits `<tag/>` for empty elements, which `extractNestedElements` cannot match). Replace:

```js
    const obj = extractNestedElements(serializeCnxmlFragment(node), name)[0];
```

with:

```js
    // extractNestedElements cannot match a self-closing element (the serializer
    // emits <tag/> for empty nodes); extractElements handles that form. The
    // fallback only fires when the nested-aware scan found nothing, i.e. the
    // element is empty — so extractElements' same-tag truncation cannot bite.
    const serialized = serializeCnxmlFragment(node);
    const obj = extractNestedElements(serialized, name)[0] || extractElements(serialized, name)[0];
```

- [ ] **Step 5: Run the new tests plus every render suite**

Run: `npx vitest run tools/__tests__/cnxml-render-depth-walk.test.js tools/__tests__/cnxml-render.documentOrder.test.js tools/__tests__/cnxml-render.exerciseFigure.test.js tools/__tests__/cnxml-render-nesting.test.js tools/__tests__/cnxml-render-list-dom.test.js tools/__tests__/cnxml-render-item-blocks.test.js tools/__tests__/cnxml-render.test.js`
Expected: ALL PASS. `documentOrder` (id-bearing list position) and `exerciseFigure` (exactly-once) pin the END behavior and must survive the mechanism swap.

Then run the golden suite: `npx vitest run tools/__tests__/cnxml-render-golden.test.js`
Expected: FAILURES ARE EXPECTED HERE for modules with nested-block shapes (the spec's "broad golden impact"). Do NOT regenerate yet — that is Task 5, after all code tasks. For now inspect each failing module's diff (`npx vitest run … 2>&1 | head -200`) and confirm every difference is one of: (a) element moved INTO its container (in-place fix), (b) removed blank line (dead empty-string push), (c) whitespace/line-structure inside `<li>`, (d) m68710 equation-leak fix. Anything else (missing text, duplicated element, changed inline content) = regression; stop and fix before committing.

Also run: `npx vitest run tools/__tests__/cnxml-render-no-raw-cnxml.test.js tools/__tests__/cnxml-render-loud-seam.test.js tools/__tests__/cnxml-render-example-dom.test.js tools/__tests__/cnxml-render-exercise-dom.test.js tools/__tests__/cnxml-render-note-dom.test.js`
Expected: ALL PASS.

- [ ] **Step 6: Commit (goldens intentionally red at this point — say so)**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render-depth-walk.test.js
git commit -m "feat(render): depth-aware direct-children walk replaces flat-scan itemization (P0-1 task 2)

Golden fixtures intentionally red until the task-5 reviewed regeneration.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Delete the E6/E9 compensation machinery

**Files:**
- Modify: `tools/cnxml-render.js` — context Sets (593–594), `renderFigure` (1068–1079), `renderTable` (~1662–1670), `renderExample` paraHandler (1434–1441), `renderExercise` paraHandler (1548–1560)

**Interfaces:**
- Consumes: Task 2's walk (nested elements are no longer itemized top-level, so the suppression registries have no duplicates left to suppress).
- Produces: `renderFigure`/`renderTable` render unconditionally; `context` no longer carries `renderedFigureIds`/`renderedTableIds`.

- [ ] **Step 1: Prove the registries are dead before deleting**

Run: `grep -n "renderedFigureIds\|renderedTableIds" tools/ server/ -r`
Expected: hits ONLY in `tools/cnxml-render.js` (creation :593–594, renderFigure skip, renderTable skip, two paraHandler registrations, comments) and in `tools/__tests__/cnxml-render.exerciseFigure.test.js` (a hand-built context passing `renderedFigureIds: new Set()`). If a hit appears anywhere else (another tool, the server), STOP — that consumer is a bug to fix first; record it before proceeding.

- [ ] **Step 2: Delete**

1. Context creation — remove both lines:
```js
    renderedFigureIds: new Set(), // Track rendered figures to prevent duplicates
    renderedTableIds: new Set(), // Track rendered tables (example-child vs section pass)
```
2. `renderFigure` — remove the skip-and-register block (and trim its now-stale doc comment line "Skips rendering if the figure has already been rendered…"):
```js
  // Skip if this figure was already rendered (e.g., inside a note)
  if (id && context.renderedFigureIds && context.renderedFigureIds.has(id)) {
    return '';
  }

  // Mark this figure as rendered
  if (id && context.renderedFigureIds) {
    context.renderedFigureIds.add(id);
  }
```
3. `renderTable` — remove the equivalent `renderedTableIds` skip/register block (locate with `grep -n "renderedTableIds" tools/cnxml-render.js`).
4. `renderExample`'s paraHandler — remove:
```js
    // Register figures inside this para so section-level renderFigure skips them.
    if (ctx.renderedFigureIds) {
      const figPattern = /<figure[^>]*\sid="([^"]+)"/g;
      let figMatch;
      while ((figMatch = figPattern.exec(contentWithoutTitle)) !== null) {
        ctx.renderedFigureIds.add(figMatch[1]);
      }
    }
```
5. `renderExercise`'s paraHandler — the whole helper becomes `renderPara`; delete the `paraHandler` function (lines 1548–1560) and change the dispatch entry `para: paraHandler,` to `para: renderPara,` in `renderSectionContent`.

- [ ] **Step 3: Run the exactly-once suites — they are the proof the deletion is safe**

Run: `npx vitest run tools/__tests__/cnxml-render.exerciseFigure.test.js tools/__tests__/cnxml-render-nesting.test.js tools/__tests__/cnxml-render-depth-walk.test.js tools/__tests__/cnxml-render.test.js tools/__tests__/cnxml-render-example-dom.test.js tools/__tests__/cnxml-render-exercise-dom.test.js tools/__tests__/cnxml-render-note-dom.test.js tools/__tests__/cnxml-render-item-blocks.test.js`
Expected: ALL PASS with zero suppression machinery — double-itemization is structurally gone, not masked. (`exerciseFigure`'s second test still passes a `renderedFigureIds` Set in its hand-built context; it is now simply ignored — leave the test as-is, it pins the behavior not the mechanism.)

- [ ] **Step 4: Grep-verify nothing dangles**

Run: `grep -n "renderedFigureIds\|renderedTableIds\|positionInContent" tools/cnxml-render.js`
Expected: no hits (or only the exerciseFigure test file when grepping tests — acceptable).

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-render.js
git commit -m "refactor(render): delete E6/E9 compensation machinery — registries, positionInContent (P0-1 task 3)

Closes RV-4 structurally (no id= needles remain in position logic).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Per-module fail-loud in the CLI render loop

**Files:**
- Modify: `tools/cnxml-render.js` — the module loop inside `main()` (the `for (const moduleId of modules)` at ~line 3548, inside the `try` that ends with `rollbackWrittenFiles` at ~4065)
- Test: `tools/__tests__/pipeline-integration.test.js` (add one case)

**Interfaces:**
- Consumes: Task 2's throw (`CNXML parse failed for module <id>: …`).
- Produces: a malformed module SKIPS (its old published file untouched), the batch continues, the process exits 1. Failures outside the per-module body (compiled sections, key equations) keep the existing rollback path.

- [ ] **Step 1: Write the failing integration test**

`tools/__tests__/pipeline-integration.test.js` copies the whole `books/efnafraedi-2e` tree to a temp dir and shells out to the real CLI (see its chapter-1 render around line 157 for the invocation pattern — reuse its `execFileSync`/env conventions exactly). Add, after the existing chapter-1 render tests:

```js
  it('renders the rest of a chapter and exits 1 when one module is malformed', () => {
    // Corrupt one ch01 module in the TEMP copy (never the real book).
    const badModule = path.join(
      tempBookDir, '03-translated', 'mt-preview', 'ch01', 'm68686.cnxml'
    );
    const original = fs.readFileSync(badModule, 'utf-8');
    // Mismatched inline tag INSIDE content — </content> must stay intact so the
    // content-extraction regex still finds the body and the DOM parse is what trips.
    fs.writeFileSync(
      badModule,
      original.replace('</content>', '<para id="broken"><emphasis>brotið</para></content>')
    );

    let exitCode = 0;
    let stderr = '';
    try {
      execFileSync('node', [renderScript, '--book', 'efnafraedi-2e', '--chapter', '1'], {
        cwd: tempRepoDir,
        env: cliEnv,
        encoding: 'utf-8',
      });
    } catch (err) {
      exitCode = err.status;
      stderr = String(err.stderr || '');
    }

    expect(exitCode).toBe(1);
    expect(stderr).toContain('m68686');
    // The other ch01 modules still rendered (batch not aborted):
    const publishedDir = path.join(tempBookDir, '05-publication', 'mt-preview', 'chapters', '01');
    const pages = fs.readdirSync(publishedDir).filter((f) => f.endsWith('.html'));
    expect(pages.length).toBeGreaterThan(1);

    fs.writeFileSync(badModule, original); // restore for any later tests in this file
  });
```

Adapt the variable names (`tempBookDir`, `tempRepoDir`, `renderScript`, `cliEnv`) to whatever the file actually uses — read its existing chapter-1 case first and mirror it. Pick a real ch01 module id from the temp copy if `m68686` does not exist (`ls books/efnafraedi-2e/03-translated/mt-preview/ch01/`).

- [ ] **Step 2: Run it to verify it fails the right way**

Run: `npx vitest run tools/__tests__/pipeline-integration.test.js -t "malformed"`
Expected: FAIL — with current code the throw escapes the loop, `rollbackWrittenFiles` reverts every already-written ch01 page, and the "other modules still rendered" assertion fails (or exit message differs).

- [ ] **Step 3: Implement per-module isolation**

In `main()`, immediately before the `for (const moduleId of modules)` loop, add:

```js
    const failedModules = [];
```

Wrap the per-module body (from `resetMathJaxIds();` through the `writtenFiles.push(outputPath);` after `writeOutput`) in:

```js
      try {
        // …existing per-module body unchanged…
      } catch (moduleErr) {
        // Per-module fail-loud (spec §6): a malformed/unrenderable module is
        // skipped — its previously published file stays in place — the rest of
        // the chapter renders, and the run exits non-zero. A throw here must
        // not reach the chapter-wide catch, which would roll back GOOD pages.
        console.error(`  ERROR: ${moduleId} failed to render — skipped: ${moduleErr.message}`);
        failedModules.push(moduleId);
        continue;
      }
```

After the loop (still inside the outer `try`, before the compiled-sections/key-equations work), add:

```js
    if (failedModules.length > 0) {
      console.error(
        `Render incomplete: ${failedModules.length} module(s) failed and were skipped: ${failedModules.join(', ')}`
      );
      process.exitCode = 1;
    }
```

Use `process.exitCode = 1` (not `process.exit(1)`) so image copying and cleanup for the successful modules still run. The outer `catch (renderErr)` + `rollbackWrittenFiles` stays exactly as-is for non-module failures.

- [ ] **Step 4: Run the integration suite**

Run: `npx vitest run tools/__tests__/pipeline-integration.test.js`
Expected: ALL PASS, including the pre-existing chapter renders and the new malformed case.

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/pipeline-integration.test.js
git commit -m "feat(render): per-module fail-loud — malformed module skips, batch continues, exit 1 (P0-1 task 4)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Golden regeneration, corpus render-diff, register updates, full gate

**Files:**
- Regenerate: `tools/__tests__/fixtures/render-golden/**/*.html`
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (register rows), `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item 6 ledger)
- Scratch (NOT committed): corpus render-diff script in the session scratchpad

**Interfaces:**
- Consumes: all code tasks complete and committed.
- Produces: green goldens with a reviewed, classified diff; corpus-wide before/after evidence for the PR description; updated registers.

- [ ] **Step 1: Regenerate goldens**

Run: `UPDATE_GOLDEN=1 npx vitest run tools/__tests__/cnxml-render-golden.test.js`
Then: `git diff --stat tools/__tests__/fixtures/render-golden/`

- [ ] **Step 2: Classify every golden diff (E6-precedent triage)**

For each changed fixture, run both checks and record the verdict per module:

```bash
# id multiset must be IDENTICAL (nothing lost or duplicated):
for f in $(git diff --name-only tools/__tests__/fixtures/render-golden/); do
  echo "== $f";
  diff <(git show HEAD:"$f" | grep -o 'id="[^"]*"' | sort) \
       <(grep -o 'id="[^"]*"' "$f" | sort) && echo "id-multiset: IDENTICAL";
done

# sorted-line diff isolates pure reordering from content change:
for f in $(git diff --name-only tools/__tests__/fixtures/render-golden/); do
  echo "== $f";
  diff <(git show HEAD:"$f" | sed 's/^[[:space:]]*//' | sort) \
       <(sed 's/^[[:space:]]*//' "$f" | sort) | head -40;
done
```

Accepted diff classes (record which applies per module): (a) element moved inside its container (`<li>`/aside/div) — the in-place fix; (b) blank lines removed (dead `''` pushes gone); (c) `<li>` line-structure/whitespace; (d) m68710 (`ch04/m68710.html`): raw `<equation id=…>` wrappers replaced by `<div class="equation unnumbered">` and the equations now sit inside their `<li>`s — the spec §3 fix (note: the English residue `Write the two half-reactions` REMAINS — it is in the input bytes; extract-side register item P1-R1, not this PR). Any *removed text content* or *new duplicate* = regression: stop, fix the code, re-run from Step 1.

- [ ] **Step 3: Corpus-wide before/after render-diff (physics + organic evidence)**

Write `<scratchpad>/render-diff-harness.mjs` (scratchpad only — do not commit). It renders every committed `03-translated` module through BOTH revisions in one process and classifies the differences:

```js
// Usage: node render-diff-harness.mjs /path/to/main-worktree /path/to/branch-repo
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [repoA, repoB] = process.argv.slice(2);
const BOOKS = ['efnafraedi-2e', 'liffraedi-2e', 'edlisfraedi-2e', 'lifraen-efnafraedi', 'orverufraedi'];

async function loadRenderer(repo) {
  const mod = await import(pathToFileURL(path.join(repo, 'tools/cnxml-render.js')).href);
  return mod;
}

// MathJax ids/labels differ run-to-run; normalize before comparing.
function normalize(html) {
  return html
    .replace(/\bMJX-[\w-]+/g, 'MJX')
    .replace(/aria-labelledby="[^"]*"/g, 'aria-labelledby=""')
    .replace(/<mjx-assistive-mml[\s\S]*?<\/mjx-assistive-mml>/g, '[MML]');
}
const idMultiset = (h) => (normalize(h).match(/ id="[^"]+"/g) || []).sort().join('\n');
const textOnly = (h) =>
  normalize(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const counts = (h) =>
  ['<figure', '<img', '<table', '<li', 'class="equation'].map(
    (m) => `${m}:${normalize(h).split(m).length - 1}`
  ).join(' ');

const A = await loadRenderer(repoA);
const B = await loadRenderer(repoB);

for (const book of BOOKS) {
  A._loadBookConfigForTest(book);
  B._loadBookConfigForTest(book);
  const base = path.join(repoA, 'books', book, '03-translated', 'mt-preview');
  if (!fs.existsSync(base)) continue;
  const rows = { identical: 0, reorderedOnly: 0, textDiff: [], errors: [] };
  let compared = 0;
  for (const ch of fs.readdirSync(base).filter((d) => /^ch\d+$/.test(d))) {
    const chapter = Number(ch.slice(2));
    for (const f of fs.readdirSync(path.join(base, ch)).filter((f) => f.endsWith('.cnxml'))) {
      const relB = path.join(repoB, 'books', book, '03-translated', 'mt-preview', ch, f);
      if (!fs.existsSync(relB)) continue;
      const cnxml = fs.readFileSync(path.join(base, ch, f), 'utf-8');
      const moduleId = f.replace('.cnxml', '');
      const opts = { lang: 'is', chapter, moduleId, moduleSections: {} };
      let ha = null, hb = null, ea = null, eb = null;
      try { ha = A.renderCnxmlToHtml(cnxml, opts).html; } catch (e) { ea = e.message; }
      try { hb = B.renderCnxmlToHtml(cnxml, opts).html; } catch (e) { eb = e.message; }
      compared++;
      if (ea || eb) { rows.errors.push(`${moduleId} A:${ea || 'ok'} B:${eb || 'ok'}`); continue; }
      if (normalize(ha) === normalize(hb)) { rows.identical++; continue; }
      if (idMultiset(ha) === idMultiset(hb) && textOnly(ha) === textOnly(hb) && counts(ha) === counts(hb)) {
        rows.reorderedOnly++;
      } else {
        rows.textDiff.push(`${moduleId} [${counts(ha)}] -> [${counts(hb)}]`);
      }
    }
  }
  console.log(`\n== ${book}: compared=${compared} identical=${rows.identical} reordered-only=${rows.reorderedOnly}`);
  for (const t of rows.textDiff) console.log(`  TEXT-DIFF ${t}`);
  for (const e of rows.errors) console.log(`  ERROR ${e}`);
}
```

Notes: both repos' renderers run in one process — MathJax id drift is handled by `normalize()`, and each book's `_loadBookConfigForTest` is called on both modules before its renders. Expected `ERROR` row: `liffraedi-2e` m66443 must be `A:ok B:CNXML parse failed…` — that is the intended fail-loud (spec §6), record it as such. Every `TEXT-DIFF` module needs a one-line manual verdict: expected classes are the m68710 equation-leak fix (equation count rises, raw wrapper text leaves `textOnly`) and blocks moving into `<li>` (count deltas of `<li` should be zero; `<figure`/`<img` zero delta but position moves show as reordered-only, not text-diff). **Any unexplained text loss = stop and fix.**

Set up the comparison checkout and run:

```bash
git worktree add /tmp/claude-1000/p01-main-worktree origin/main
node <scratchpad>/render-diff-harness.mjs /tmp/claude-1000/p01-main-worktree <repo>
git worktree remove /tmp/claude-1000/p01-main-worktree
```

Expected shape of the result: efnafraedi-2e mostly identical/reordered-only (goldens already cover the exceptions); edlisfraedi-2e shows figure-in-exercise moves (some of its 252 sites are in the 9 committed 03-translated modules — most physics chapters are not yet translated, so state the actual coverage honestly). Paste the summary table into the PR description.

- [ ] **Step 4: Update registers and ledger**

In `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`:
- P0-1 rows (line ~905 prose + ~1025 table): mark ✅ FIXED with branch/PR ref, one-line mechanism (DOM walk at section level + renderList unification + machinery deleted), and note both residual classes closed (id-less hoisting; new-block-type now loud-seams instead of re-tripping).
- RV-4 row (~920/~1050): mark ✅ closed structurally by P0-1 (positionInContent deleted; no `id="X"` needles in ordering logic).
- C3-b row (~1032): note resolved for `renderChildrenInDocumentOrder` (the ~9 positioners deleted); remaining `indexOf` scans elsewhere unchanged.
- C3-a row: correct the stale claim (note/exercise/example dispatch maps DO carry `table` since F1b; verified — `KNOWN_ESCAPES` empty).
- P0-6 row: note presentation preserved (inline-unnumbered) as a deliberate P0-1 invariant.

In `docs/plans/2026-07-11-pre-semester-coding-campaign.md`, item 6: mark shipped with date/branch, register the new finds as **P1-R1..R5 verbatim from spec §8** (m68710 extract-side residue + re-MT; quote renderer at organic onboarding; inner-para ids in items; stale-register corrections; injected duplicate equations in physics 03-translated), plus the post-merge operational note: full re-render + `--update-baseline` + goldens for m68789/m68791 sequenced against the B4 (#274) data op.

- [ ] **Step 5: Full suite from repo root**

Run: `npm test`
Expected: entire suite green (~2460+ tests). If any non-render suite fails, investigate — extract/inject tests failing means shared-lib semantics changed, which Global Constraints forbid.

- [ ] **Step 6: Commit**

```bash
git add tools/__tests__/fixtures/render-golden/ docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md docs/plans/2026-07-11-pre-semester-coding-campaign.md
git commit -m "test(render): regenerate goldens for depth-aware walk (classified diff) + register P1-R1..R5 (P0-1 task 5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Final verification & PR

- [ ] `npm test` green from repo root (the authoritative gate).
- [ ] `git status --porcelain books/` is EMPTY (no content changes rode along).
- [ ] Corpus render-diff summary table + golden classification pasted into the PR body.
- [ ] Final whole-branch review before opening the PR (per campaign convention: multi-lens Workflow review + adversarial verify).
- [ ] PR title: `P0-1: depth-aware render walk — section-level DOM dispatch + in-place list blocks, E6/E9 machinery deleted`. Body ends with the standard generated-with footer.
