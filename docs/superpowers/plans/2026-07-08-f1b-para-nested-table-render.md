# F1b — para-nested `<table>` render leak fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop container renderers (`renderExample`, `renderExercise`, `renderNote`) from leaking raw `<row>`/`<entry>`/`<colspec>` markup when a `<table>` is nested inside a `<para>`, by routing para-nested tables through `renderTable` (dispatch + hoist) — a render-only fix that clears the live leak on 6 modules without touching segments.

**Architecture:** In each of the three container renderers, `renderBlockChildrenInOrder` hoists only `list`/`equation` out of a `<para>`; a para-nested `<table>` falls to `renderPara`→`processInlineContent`, which dumps table tags as raw text. The fix makes `<table>` both dispatchable (`table: renderTable`) and hoistable (`'table'` in `hoistTags`) at all three sites, so a table renders via `renderTable` whether it is a direct child or para-nested. `renderTable` already dedupes via `context.renderedTableIds`.

**Tech Stack:** Node 22 ES modules, Vitest, the custom `cnxml-render.js` renderer.

**Design doc:** `docs/superpowers/specs/2026-07-08-f1b-para-nested-table-render-design.md` (lead-approved 2026-07-08).

## Global Constraints

- **Book:** `efnafraedi-2e`. Affected modules (all mt-preview): `m68764` (ch10), `m68770` (ch10), `m68789` (ch12), `m68791` (ch12), `m68793` (ch12), `m68829` (ch18). These are the 6 B4 re-MT modules, but this fix is **render-only** — no re-extract, no re-inject, no segment change.
- **Acceptance:** after the fix, **zero** raw `<entry`/`<row`/`<colspec` substrings in ANY `books/efnafraedi-2e/05-publication/**` page; **zero URL renames**; `translation-errors.json` left unstaged.
- **Authoritative gate:** `npm test` from the repo root must be green.
- **Branch:** `fix/chem-f1b-para-nested-table-render` (created; design committed at `1e4d5d54`).
- **Commit trailer:** end every commit message with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **lint-staged footgun:** commit each task's generated files within that task; never leave a tracked data file dirty across commits.
- Do NOT change `renderTable`/`renderTableCells`/`renderBlockChildrenInOrder` themselves — the fix is only in the three container renderers' dispatch/hoist config.

---

### Task 1: Route para-nested tables through renderTable in all three container renderers (+ unit tests + goldens)

**Files:**
- Modify: `tools/cnxml-render.js` — `renderNote` (~L1247–1255), `renderExample` hoist option (~L1400), `renderExercise`→`renderSectionContent` (~L1467–1479)
- Modify (tests): `tools/__tests__/cnxml-render-example-dom.test.js`, `tools/__tests__/cnxml-render-exercise-dom.test.js`, `tools/__tests__/cnxml-render-note-dom.test.js`
- Modify: `tools/__tests__/cnxml-render-golden.test.js` (add `ch12/m68791` to `GOLDEN_MODULES`)
- Modify (regen): `tools/__tests__/fixtures/render-golden/ch12/m68789.html`
- Create: `tools/__tests__/fixtures/render-golden/ch12/m68791.html`

**Interfaces:**
- Consumes: existing `renderTable`, `renderBlockChildrenInOrder`.
- Produces: para-nested tables in example/exercise/note render as proper `<table>` HTML.

**Context:** The three DOM test files already exercise these renderers' hoisting via `renderCnxmlToHtml` + `render{Example,Exercise,Note}Content(inner)` helpers (mirror the existing "equation inside a para" tests). `renderNote` passes no `hoistTags`, so it defaults to `Object.keys(dispatch)` — adding `table: renderTable` to its dispatch auto-hoists tables; the other two pass an explicit `hoistTags` list that must gain `'table'`.

- [ ] **Step 1: Write the three failing tests**

In `tools/__tests__/cnxml-render-example-dom.test.js`, add:

```javascript
describe('renderExample — table inside a para (F1b leak fix)', () => {
  it('renders a para-nested <table> as a real table, not raw <entry>/<row> text', () => {
    const html = renderExampleContent(
      '<example id="E"><para id="p"><title>Lausn</title>Gögnin:<newline/>' +
        '<table id="T" summary="s" class="unnumbered"><tgroup cols="2">' +
        '<colspec colnum="1" colname="c1"/><colspec colnum="2" colname="c2"/>' +
        '<tbody><row><entry>Tími</entry><entry>[<emphasis effect="italics">A</emphasis>]</entry></row>' +
        '<row><entry>4,0</entry><entry>0,220</entry></row></tbody>' +
        '</tgroup></table></para></example>'
    );
    expect(html).toContain('<table id="T"');
    expect(html).toContain('<td');
    expect(html).toContain('0,220');
    expect(html).toContain('<em>A</em>'); // inline cell markup preserved
    expect(html).not.toMatch(/<entry\b/); // no raw entry leak
    expect(html).not.toMatch(/<row\b/);
    expect(html).not.toMatch(/<colspec\b/);
  });
});
```

In `tools/__tests__/cnxml-render-exercise-dom.test.js`, add:

```javascript
describe('renderExercise — table inside a solution para (F1b leak fix)', () => {
  it('renders a para-nested <table> in a solution as a real table, not raw <entry>/<row>', () => {
    const html = renderExerciseContent(
      '<exercise id="E"><problem id="P"><para id="a">Reiknaðu.</para></problem>' +
        '<solution id="S"><para id="b"><title>Lausn</title>Niðurstöður:<newline/>' +
        '<table id="T" summary="s" class="unnumbered"><tgroup cols="2">' +
        '<colspec colnum="1" colname="c1"/><colspec colnum="2" colname="c2"/>' +
        '<tbody><row><entry>x</entry><entry>y</entry></row>' +
        '<row><entry>1</entry><entry>2</entry></row></tbody>' +
        '</tgroup></table></para></solution></exercise>'
    );
    expect(html).toContain('<table id="T"');
    expect(html).toContain('<td');
    expect(html).not.toMatch(/<entry\b/);
    expect(html).not.toMatch(/<row\b/);
    expect(html).not.toMatch(/<colspec\b/);
  });
});
```

In `tools/__tests__/cnxml-render-note-dom.test.js`, add:

```javascript
describe('renderNote — table inside a para (F1b leak fix)', () => {
  it('renders a para-nested <table> in a note as a real table, not raw <entry>/<row>', () => {
    const html = renderNoteContent(
      '<note id="N"><para id="a">Sjá töfluna:<newline/>' +
        '<table id="T" summary="s" class="unnumbered"><tgroup cols="2">' +
        '<colspec colnum="1" colname="c1"/><colspec colnum="2" colname="c2"/>' +
        '<tbody><row><entry>p</entry><entry>q</entry></row></tbody>' +
        '</tgroup></table></para></note>'
    );
    expect(html).toContain('<table id="T"');
    expect(html).toContain('<td');
    expect(html).not.toMatch(/<entry\b/);
    expect(html).not.toMatch(/<row\b/);
    expect(html).not.toMatch(/<colspec\b/);
  });
});
```

- [ ] **Step 2: Run the three tests to verify they fail**

Run: `npx vitest run tools/__tests__/cnxml-render-example-dom.test.js tools/__tests__/cnxml-render-exercise-dom.test.js tools/__tests__/cnxml-render-note-dom.test.js -t "F1b leak fix"`
Expected: FAIL — each asserts no raw `<entry`/`<row`, but the current renderers dump the table raw (the `not.toMatch(/<entry\b/)` assertions fail).

- [ ] **Step 3: Fix `renderNote` — add the table dispatcher (auto-hoists via default hoistTags)**

In `tools/cnxml-render.js` `renderNote`, add `table: renderTable` to the dispatch object:

```javascript
  const blocks = renderBlockChildrenInOrder(contentWithoutTitle, context, {
    para: renderPara,
    figure: renderFigure,
    list: renderList,
    media: renderMedia,
    // A direct-child <equation> in a note (between paras) was silently dropped
    // before this dispatcher existed (m68849 lost 2 reaction equations).
    equation: renderEquation,
    // A <table> in a note — direct child or nested in a <para> — must render via
    // renderTable, not leak raw <row>/<entry> through renderPara. renderNote
    // passes no hoistTags, so it defaults to Object.keys(dispatch): adding table
    // here both dispatches it and hoists it out of a para (F1b).
    table: renderTable,
  });
```

- [ ] **Step 4: Fix `renderExample` — hoist tables out of paras**

In `tools/cnxml-render.js` `renderExample`, change the hoist option (dispatch already has `table: renderTable`):

```javascript
    { hoistTags: ['list', 'equation', 'table'] }
```

- [ ] **Step 5: Fix `renderExercise` (`renderSectionContent`) — add dispatcher + hoist**

In `tools/cnxml-render.js` `renderSectionContent`, add `table: renderTable` to the dispatch and `'table'` to `hoistTags`:

```javascript
    const blocks = renderBlockChildrenInOrder(
      sectionContent,
      context,
      {
        para: renderPara,
        media: renderMedia,
        figure: renderFigure,
        list: renderList,
        equation: renderEquation,
        // A <table> in a problem/solution — direct child or nested in a <para> —
        // renders via renderTable instead of leaking raw <row>/<entry> through
        // renderPara (F1b). Hoisted below so a para-nested table is detached.
        table: renderTable,
      },
      { hoistTags: ['list', 'equation', 'table'] }
    );
```

- [ ] **Step 6: Run the three tests to verify they pass**

Run: `npx vitest run tools/__tests__/cnxml-render-example-dom.test.js tools/__tests__/cnxml-render-exercise-dom.test.js tools/__tests__/cnxml-render-note-dom.test.js`
Expected: PASS (all cases, including the new F1b ones and the pre-existing equation/figure ones).

- [ ] **Step 7: Add m68791 to the golden set**

In `tools/__tests__/cnxml-render-golden.test.js`, add to `GOLDEN_MODULES` in chapter order (m68789 is already there for ch12; add m68791 after it):

```javascript
  { chapter: 'ch12', moduleId: 'm68791' },
```

- [ ] **Step 8: Regenerate the goldens and review the diffs**

```bash
UPDATE_GOLDEN=1 npx vitest run tools/__tests__/cnxml-render-golden.test.js
git diff -- tools/__tests__/fixtures/render-golden/ch12/m68789.html | head -60
```
Expected: `ch12/m68789.html` diff shows its para-nested table changing from raw `<entry>`/`<row>` text to a proper `<table>`/`<tr>`/`<td>` structure; `ch12/m68791.html` created with proper tables (no raw `<entry`/`<row`). Confirm no unrelated churn.

- [ ] **Step 9: Run the golden suite to verify green**

Run: `npx vitest run tools/__tests__/cnxml-render-golden.test.js`
Expected: PASS (m68789 + new m68791 locked).

- [ ] **Step 10: Commit**

```bash
git add tools/cnxml-render.js \
        tools/__tests__/cnxml-render-example-dom.test.js \
        tools/__tests__/cnxml-render-exercise-dom.test.js \
        tools/__tests__/cnxml-render-note-dom.test.js \
        tools/__tests__/cnxml-render-golden.test.js \
        tools/__tests__/fixtures/render-golden/ch12/m68789.html \
        tools/__tests__/fixtures/render-golden/ch12/m68791.html
git commit -m "fix(cnxml-render): route para-nested tables through renderTable [#2b]

renderExample/renderExercise/renderNote hoisted only list/equation out of
a <para>, so a para-nested <table> fell to renderPara->processInlineContent
which dumped <row>/<entry> as raw text (the live m68791 <entry>-leak). Add
table dispatch + hoist at all three container renderers. Render-only.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Whole-book re-render diff (acceptance gate) + commit changed pages

**Files:**
- Modify (regenerated, only changed pages staged): `books/efnafraedi-2e/05-publication/**`

**Interfaces:**
- Consumes: Task 1's render fix.
- Produces: corrected published HTML with zero raw table markup.

**Context:** The fix changes render output for the 6 affected modules' pages (content pages for m68764/m68770/m68789/m68791/m68793/m68829 and the ch10/ch12/ch18 exercises pages). No other module has a para-nested table, so no other page should change (beyond the timestamp-only `faithful/rollups-complete`, which must NOT be committed).

- [ ] **Step 1: Re-render the whole book (both published tracks)**

```bash
for ch in $(seq 0 21) appendices; do node tools/cnxml-render.js --book efnafraedi-2e --chapter "$ch" --track mt-preview; done
node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --track faithful
node tools/cnxml-render.js --book efnafraedi-2e --chapter 3 --track faithful
```
Expected: completes without error.

- [ ] **Step 2: HARD acceptance gate — zero raw table markup book-wide**

```bash
grep -rlE "<entry\b|<row\b|<colspec\b" books/efnafraedi-2e/05-publication/ | grep -v "\.svg"
```
Expected: **no output** (no published page leaks raw table markup anywhere). If any file lists, STOP and investigate — the fix missed a path.

- [ ] **Step 3: Inspect the publication diff (rename + scope gate)**

```bash
git status --short books/efnafraedi-2e/05-publication/ | sort
git diff --stat -M books/efnafraedi-2e/05-publication/
git checkout -- books/efnafraedi-2e/05-publication/faithful/rollups-complete 2>/dev/null || true
```
Expected changed files: content/exercises pages for the 6 modules — ch10 (m68764/m68770), ch12 (m68789/m68791/m68793 → 12-4 + 12-exercises + those modules' section pages), ch18 (m68829). **Zero renames** (all `M`, no `R`/`D`+`A`). Revert the timestamp-only `faithful/rollups-complete`. If any page outside the 6 modules changes, STOP and characterize.

- [ ] **Step 4: Commit the corrected pages**

```bash
git add books/efnafraedi-2e/05-publication/
git commit -m "render(f1b): re-render — para-nested tables now render, no raw <entry> leak [#2b]

Whole-book re-render; changed pages = the 6 modules with para-nested tables
(ch10 m68764/m68770, ch12 m68789/m68791/m68793, ch18 m68829). Zero raw
<entry>/<row>/<colspec> in any published page; zero URL renames.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Full suite + docs + request review

**Files:**
- Modify: `docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md` (#2b → delivered)
- Modify: memory (`MEMORY.md`, `chemistry-clean-slate.md`) via Write tool

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: green suite; updated status docs.

- [ ] **Step 1: Run the full suite from the repo root**

Run: `npm test`
Expected: all green (new F1b unit tests + regenerated/added goldens included).

- [ ] **Step 2: Confirm working tree clean apart from docs**

Run: `git status --short`
Expected: clean (only the docs edits in Step 3 remain).

- [ ] **Step 3: Update roadmap + memory**

- Roadmap `#2b` row → ✅ DELIVERED (branch `fix/chem-f1b-para-nested-table-render`): para-nested tables render via `renderTable` at all three container renderers; 6 modules' pages fixed; zero raw markup book-wide; goldens m68789+m68791. Note roadmap **#2 is now fully resolved** (2a + 2b).
- Memory RESUME POINT + ACTIVE THREAD → F1b delivered; the entry-leak class is closed; next = #6-era tech-debt / Pass-1 / B4.

- [ ] **Step 4: Commit the docs**

```bash
git add docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md
git commit -m "docs(register): F1b DELIVERED — para-nested table leak fixed; #2 resolved [#2b]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
(Memory files live outside the repo — update with the Write tool, not git.)

- [ ] **Step 5: Request whole-branch code review**

Use `superpowers:requesting-code-review`. The reviewer should confirm: (a) the three dispatch/hoist edits are consistent and correct; (b) no double-render (renderedTableIds dedup holds); (c) the whole-book diff is exactly the 6 modules' pages with zero raw markup and zero renames; (d) no reordering regression (tables render in their correct position within the solution/example).

---

## Self-Review

**Spec coverage:**
- Uniform fix across renderExample/renderExercise/renderNote → Task 1 Steps 3–5. ✅
- TDD unit test per container → Task 1 Steps 1–2, 6. ✅
- Goldens (regen m68789 + add m68791) → Task 1 Steps 7–9. ✅
- Whole-book re-render diff, zero raw markup, zero renames → Task 2. ✅
- Full suite + docs + review → Task 3. ✅
- Non-goals (render-only/no re-MT; not section-level; not in-cell) → respected (only render config changes; re-render from committed 03-translated). ✅

**Placeholder scan:** none — every step has exact code/commands/expected output.

**Type consistency:** `table: renderTable` matches the existing dispatch entry shape; `hoistTags` string arrays match existing usage; `render{Example,Exercise,Note}Content(inner)` helper names match the existing test files; `GOLDEN_MODULES` entry shape `{ chapter, moduleId }` matches.

**Note:** renderNote needs only the dispatch entry (hoistTags defaults to `Object.keys(dispatch)`); renderExample/renderExercise need the explicit `'table'` hoist added. This asymmetry is intentional and documented in each step.
