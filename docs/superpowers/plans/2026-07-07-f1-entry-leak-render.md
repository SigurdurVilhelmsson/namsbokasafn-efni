# F1 — `<entry>`-leak render fix + re-include m68710/m68733 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the shared `extractElements` self-closing-with-attributes parse bug (greedy→lazy), then re-include the two excluded tables (m68710, m68733) so their leading-empty-cell tables render correctly, delivering byte-perfect pages for ch04 4-2, ch06 6-3, and a latent render-fix for ch12 m68791.

**Architecture:** One-character regex fix (`[^>]*` → `[^>]*?`) in `tools/lib/cnxml-parser.js` `extractElements`, guarded by unit-test regression locks across paired-element callers. Then a bounded content re-entry for the two modules (re-extract → equivalence preflight → re-inject → re-render), with a whole-book re-render diff as the acceptance gate. Both modules are confirmed segment-safe (0 FAIL equivalence); re-MT stays in B4.

**Tech Stack:** Node 22 ES modules, Vitest, the custom CNXML pipeline (`cnxml-extract.js`, `cnxml-inject.js`, `cnxml-render.js`), `verify-reextract-equivalence.js`.

**Design doc:** `docs/superpowers/specs/2026-07-07-f1-entry-leak-render-design.md` (lead-approved 2026-07-07).

## Global Constraints

- **Book:** `efnafraedi-2e`. Both target modules are **mt-preview** track (only ch01/ch03 are faithful).
- **Never touch `01-source/`** — extraction reads it, never writes it. No re-download from OpenStax.
- **No re-MT** in F1. m68710's `{{term}}`/double-record entanglement stays in B4. If any equivalence check returns non-zero FAIL, **STOP and report** (do not proceed to inject).
- **Zero URL renames** in `books/efnafraedi-2e/05-publication/` — hard gate (protects #6's engineered reproduction of ch06's live URLs).
- **Authoritative test gate:** `npm test` **run from the repo root** must be green (no branch protection; local gate is authoritative).
- **Branch:** `fix/chem-f1-entry-leak-render` (already created; design doc committed at `9a9a356d`).
- **Commit trailer:** end every commit message with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **lint-staged footgun:** never leave a tracked data file dirty across commits (the pre-commit hook stashes unstaged tracked changes). Commit each task's generated files within that task.
- **Pipeline GOTCHA:** `cnxml-inject.js` SKIPS incomplete modules (missing/residue segments) *before* writeOutput → the on-disk file keeps stale bytes. m68710/m68733 are **not** in the 15-incomplete list, so they should inject normally; if inject reports a skip, verify with `--allow-incomplete` and report.

---

### Task 1: Fix `extractElements` greedy→lazy + unit-test regression locks

**Files:**
- Modify: `tools/lib/cnxml-parser.js` (the `pattern` regex inside `extractElements`, ~line 190)
- Test: `tools/__tests__/cnxml-parser.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `extractElements(content, tagName)` unchanged signature; now correctly parses self-closing-with-attributes elements (returns one element per tag, empty `content` for self-closing).

**Context:** The current regex `<${safeTag}([^>]*)(?:\/>|>([\s\S]*?)<\/${safeTag}>)` uses a greedy `[^>]*` that eats the `/` of a self-closing `<entry align="left"/>`, defeating the `\/>` branch and swallowing the next element's opening tag as content. Making the capture lazy fixes it while leaving paired-element parsing byte-identical (verified). `extractElements` is shared (31 call sites: `para`/`equation`/`row`/`entry`/`note`/`media`/`list`/`figure`), hence the regression locks.

- [ ] **Step 1: Write the failing tests**

Add to `tools/__tests__/cnxml-parser.test.js` (import `extractElements` is already present at the top of that file; if not, add `import { extractElements } from '../lib/cnxml-parser.js';`):

```javascript
describe('extractElements — self-closing with attributes (F1 regression)', () => {
  it('parses a leading self-closing empty entry as its own cell (3 cells, no leak)', () => {
    const row = '<entry align="left"/>\n<entry align="left">Reactants</entry>\n<entry align="left">Products</entry>';
    const cells = extractElements(row, 'entry');
    expect(cells.map((c) => c.content.trim())).toEqual(['', 'Reactants', 'Products']);
    expect(cells[0].attributes.align).toBe('left');
    // No raw opening tag leaked into cell content:
    expect(cells.some((c) => c.content.includes('<entry'))).toBe(false);
  });

  it('parses a bare self-closing entry followed by a paired entry', () => {
    const cells = extractElements('<entry/><entry>X</entry>', 'entry');
    expect(cells.length).toBe(2);
    expect(cells[1].content).toBe('X');
  });

  it('leaves paired entries with attributes byte-identical (no regression)', () => {
    const cells = extractElements('<entry align="left">A</entry><entry namest="c1" nameend="c2">B</entry>', 'entry');
    expect(cells.length).toBe(2);
    expect(cells[0].content).toBe('A');
    expect(cells[1].attributes.namest).toBe('c1');
    expect(cells[1].attributes.nameend).toBe('c2');
  });

  it('parses two consecutive empty self-closing entries as two cells', () => {
    const cells = extractElements('<entry align="left"/><entry align="left"/>', 'entry');
    expect(cells.length).toBe(2);
    expect(cells.every((c) => c.content === '')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tools/__tests__/cnxml-parser.test.js -t "self-closing with attributes"`
Expected: FAIL — the leading-empty case returns 2 cells with `<entry` leaked into `cells[0].content` (the greedy bug); the bare self-closing case returns 1.

- [ ] **Step 3: Apply the lazy-regex fix**

In `tools/lib/cnxml-parser.js`, inside `extractElements`, change the greedy attribute capture to lazy:

```javascript
  // Match self-closing or paired elements. The attribute capture is LAZY
  // (`[^>]*?`) so a self-closing `<tag .../>` reaches the `\/>` branch before
  // the trailing `/` is consumed — a greedy `[^>]*` eats the `/`, defeats the
  // self-closing branch, and swallows the next element's opening tag as content
  // (F1: leading-empty table cells, tools/__tests__/cnxml-parser.test.js).
  const pattern = new RegExp(`<${safeTag}([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${safeTag}>)`, 'g');
```

(Only `[^>]*` → `[^>]*?` changes; keep the rest of the function identical.)

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `npx vitest run tools/__tests__/cnxml-parser.test.js -t "self-closing with attributes"`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full parser suite to verify no regression**

Run: `npx vitest run tools/__tests__/cnxml-parser.test.js`
Expected: PASS (all pre-existing tests still green — paired parsing is unchanged).

- [ ] **Step 6: Sanity-check render is still inert book-wide**

The only live translated file with a self-closing entry is m68791 (not in the golden set), and m68710's *committed* output has no empty cell yet, so the render-golden suite must still pass with the parser fix but no re-inject:

Run: `npx vitest run tools/__tests__/cnxml-render-golden.test.js`
Expected: PASS (7 goldens unchanged — confirms the parser fix does not alter any golden module's render before re-inject).

- [ ] **Step 7: Commit**

```bash
git add tools/lib/cnxml-parser.js tools/__tests__/cnxml-parser.test.js
git commit -m "fix(cnxml-parser): lazy attr capture so self-closing <tag .../> parses [#2]

Greedy [^>]* ate the trailing / of a self-closing element, defeating the
\\/> branch and swallowing the next element's opening tag as content
(F1 <entry>-leak on leading-empty table cells). Behaviour-preserving for
paired elements; adds regression locks across the pattern.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Re-extract m68710 + m68733 with equivalence preflight gate

**Files:**
- Modify (regenerated): `books/efnafraedi-2e/02-for-mt/ch06/m68733-segments.en.md`,
  `books/efnafraedi-2e/02-structure/ch04/m68710-structure.json`,
  `books/efnafraedi-2e/02-structure/ch04/m68710-manifest.json`,
  `books/efnafraedi-2e/02-structure/ch06/m68733-structure.json`,
  `books/efnafraedi-2e/02-structure/ch06/m68733-manifest.json`
- Tool (read-only): `tools/verify-reextract-equivalence.js`

**Interfaces:**
- Consumes: the Task 1 lazy parser (extraction now runs on the fixed parser).
- Produces: re-extracted structure with the leading empty cell captured as `{segmentId: null, attributes: {align: "left"}}` in the first table row; segment-id set + EN text unchanged (equivalence 0 FAIL).

**Context:** The extract side already pre-expands self-closing entries (`cnxml-extract.js:1135`), so re-extract captured the empty cell correctly even before Task 1 — Task 1's parser fix is expected to leave these two modules' extraction segment-equivalent. This task re-runs the equivalence gate *after* the parser fix to confirm empirically.

- [ ] **Step 1: Re-extract both modules**

```bash
node tools/cnxml-extract.js --book efnafraedi-2e --input books/efnafraedi-2e/01-source/ch04/m68710.cnxml
node tools/cnxml-extract.js --book efnafraedi-2e --input books/efnafraedi-2e/01-source/ch06/m68733.cnxml
```
Expected: `m68710: 435 segments, 197 equations extracted` and `m68733: 263 segments, 49 equations extracted`.

- [ ] **Step 2: Run the equivalence preflight gate (HARD)**

```bash
printf 'ch04 m68710\nch06 m68733\n' > /tmp/f1-modules.txt
node tools/verify-reextract-equivalence.js /tmp/f1-modules.txt
```
Expected: `2 modules; 0 FAIL; 0 waived-known-exception`.
**If FAIL > 0: STOP.** Revert (`git checkout -- books/efnafraedi-2e/02-for-mt books/efnafraedi-2e/02-structure`) and report — a non-zero FAIL means the re-extract changed segment boundaries and the module belongs in B4, not F1.

- [ ] **Step 3: Confirm the empty cell is captured**

```bash
node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync("books/efnafraedi-2e/02-structure/ch04/m68710-structure.json","utf8"));function f(o,a=[]){if(Array.isArray(o))o.forEach(x=>f(x,a));else if(o&&typeof o=="object"){if(o.id==="fs-idp8525760")a.push(o);for(const k in o)f(o[k],a);}return a;}const t=f(d)[0];const r0=t.rows[0].cells;console.log("first row cells:",r0.length,"first cell segmentId:",r0[0].segmentId);'
```
Expected: `first row cells: 3 first cell segmentId: null`.

- [ ] **Step 4: Confirm segment-text byte-safety**

```bash
git diff --stat books/efnafraedi-2e/02-for-mt/ch04/m68710-segments.en.md
```
Expected: **no output** (m68710's EN segments byte-unchanged — only structure/manifest regenerated). m68733's `segments.en.md` is expected to change (marker-format migration; IDs stable — already covered by the 0-FAIL gate).

- [ ] **Step 5: Commit**

```bash
git add books/efnafraedi-2e/02-for-mt books/efnafraedi-2e/02-structure
git commit -m "chore(f1): re-extract m68710/m68733 — capture leading-empty table cell [#2]

Re-extract on the fixed parser; structure now records the leading empty
<entry/> as {segmentId:null}. Equivalence gate 0 FAIL (segment-safe,
re-MT-free); m68733 segments.en.md change is marker-format only.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Re-inject m68710 + m68733, verify tables, regenerate/add table goldens

**Files:**
- Modify (regenerated): `books/efnafraedi-2e/03-translated/mt-preview/ch04/m68710.cnxml`,
  `books/efnafraedi-2e/03-translated/mt-preview/ch06/m68733.cnxml`
- Modify: `tools/__tests__/cnxml-render-golden.test.js` (add m68733 to `GOLDEN_MODULES`)
- Create: `tools/__tests__/fixtures/render-golden/ch06/m68733.html`
- Modify (regenerated): `tools/__tests__/fixtures/render-golden/ch04/m68710.html`

**Interfaces:**
- Consumes: Task 2's re-extracted structure.
- Produces: translated CNXML whose first table row has 3 `<entry>` cells (leading one self-closing/empty); byte-exact render goldens locking both fixed tables.

**Context:** m68710 is already in `GOLDEN_MODULES` (`ch04/m68710`), so its golden must be regenerated to the fixed output (otherwise the golden test fails). m68733 is added as new ch06 coverage (second leading-empty table + exercises #6 numbering).

- [ ] **Step 1: Re-inject both modules (mt-preview track)**

```bash
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 4 --module m68710
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 6 --module m68733
```
Expected: each writes `03-translated/mt-preview/ch{04,06}/m{68710,68733}.cnxml`. If either reports a skip (incomplete), STOP and report (do not silently `--allow-incomplete`).

- [ ] **Step 2: Verify the injected first table row has 3 cells incl. a self-closing empty entry**

```bash
node -e 'const s=require("fs").readFileSync("books/efnafraedi-2e/03-translated/mt-preview/ch04/m68710.cnxml","utf8");const t=s.slice(s.indexOf("fs-idp8525760"));const row=t.slice(t.indexOf("<row"),t.indexOf("</row>"));const n=(row.match(/<entry/g)||[]).length;console.log("first-row <entry count:",n);console.log("has self-closing empty entry:",/<entry[^>]*\/>/.test(row));'
```
Expected: `first-row <entry count: 3` and `has self-closing empty entry: true`.

- [ ] **Step 3: Verify the rendered table does NOT leak raw `<entry` (the F1 symptom)**

```bash
node tools/cnxml-render.js --book efnafraedi-2e --chapter 4 --module m68710 --track mt-preview
grep -c "&lt;entry\|<entry " books/efnafraedi-2e/05-publication/mt-preview/chapters/04/4-2-*.html
```
Expected: `0` (no leaked entry markup). Then eyeball that the table's first row is `<td></td><th|td>...Reactants...</...><...>...Products...` — an empty leading cell, not a leaked tag.

- [ ] **Step 4: Add m68733 to the golden set**

In `tools/__tests__/cnxml-render-golden.test.js`, add to `GOLDEN_MODULES` (keep chapter order):

```javascript
  { chapter: 'ch06', moduleId: 'm68733' },
```

- [ ] **Step 5: Regenerate the goldens and review the fixture diffs**

```bash
UPDATE_GOLDEN=1 npx vitest run tools/__tests__/cnxml-render-golden.test.js
git diff -- tools/__tests__/fixtures/render-golden/ch04/m68710.html | head -60
```
Expected: `ch04/m68710.html` diff shows the first table row gaining an empty leading `<td>`/`<th>` and the leaked `<entry` text disappearing; `ch06/m68733.html` created. Confirm no unrelated churn.

- [ ] **Step 6: Run the golden suite to verify green**

Run: `npx vitest run tools/__tests__/cnxml-render-golden.test.js`
Expected: PASS (8 goldens now, both fixed tables locked byte-exact).

- [ ] **Step 7: Commit**

```bash
git add books/efnafraedi-2e/03-translated/mt-preview/ch04/m68710.cnxml \
        books/efnafraedi-2e/03-translated/mt-preview/ch06/m68733.cnxml \
        tools/__tests__/cnxml-render-golden.test.js \
        tools/__tests__/fixtures/render-golden/ch04/m68710.html \
        tools/__tests__/fixtures/render-golden/ch06/m68733.html
git commit -m "fix(f1): re-inject m68710/m68733 tables; lock via render goldens [#2]

Injected first table rows now carry the leading empty <entry/>; render no
longer leaks raw <entry> markup. Regenerated the m68710 golden and added a
m68733 golden to lock both leading-empty-cell tables byte-exact.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Whole-book re-render diff (acceptance gate) + commit changed pages

**Files:**
- Modify (regenerated, only changed pages get staged): `books/efnafraedi-2e/05-publication/**`

**Interfaces:**
- Consumes: Task 1 parser fix + Task 3 re-injected modules.
- Produces: corrected published HTML for the affected pages; a characterization of every changed file.

**Context:** The parser fix changes render output only where a live translated file contains a self-closing `<entry.../>`. Book-wide that is exactly one file today — m68791 (ch12, a B4 module) — plus the two modules re-injected in Task 3. So the expected changed set is: `ch04/4-2` (m68710), `ch06/6-3` (m68733), `ch12/*` (m68791 latent fix). ch06 is re-rendered under the #6 collection-order authority; per #6 it must reproduce the live URLs (no rename).

- [ ] **Step 1: Re-render the whole book (both published tracks)**

```bash
for ch in $(seq 0 21) appendices; do node tools/cnxml-render.js --book efnafraedi-2e --chapter "$ch" --track mt-preview; done
node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --track faithful
node tools/cnxml-render.js --book efnafraedi-2e --chapter 3 --track faithful
```
Expected: renders complete without error. (ch00 renders via `--chapter 0`; if the falsy-`0` guard bug bites, note it and render with `--input` for ch00 modules — that guard is roadmap #8, out of scope to fix here.)

- [ ] **Step 2: Inspect the publication diff (HARD acceptance gate)**

```bash
git status --short books/efnafraedi-2e/05-publication/
git diff --stat books/efnafraedi-2e/05-publication/
```
Expected changed files ONLY:
- `.../mt-preview/chapters/04/4-2-*.html` (m68710 — intended)
- `.../mt-preview/chapters/06/6-3-*.html` (m68733 — intended)
- `.../mt-preview/chapters/12/*` (m68791 — characterized latent render fix)
- possibly the chapter-level `page-data`/toc JSON embedded in those same pages.

**STOP conditions (report, do not commit):**
- Any file appears as a **rename** (old path deleted + new path added) → URL churn; violates the zero-rename gate.
- Any **other** module's page changes and is not explainable as a self-closing-`<entry>` render fix → potential regression.

- [ ] **Step 3: Confirm no leaked `<entry` in any changed page**

```bash
for f in $(git diff --name-only books/efnafraedi-2e/05-publication/); do grep -l "&lt;entry\|<entry " "$f" 2>/dev/null; done
```
Expected: **no output** (no page leaks raw entry markup).

- [ ] **Step 4: Confirm m68791 is a clean latent fix**

```bash
git diff books/efnafraedi-2e/05-publication/mt-preview/chapters/12/ | grep -iE "entry" | head
```
Expected: the diff removes leaked `<entry`/`&lt;entry` text and/or corrects a table row; it must not change prose, numbering, or IDs. If the m68791 diff is anything other than a table-cell render fix, exclude it (`git checkout -- <path>`) and note it for B4.

- [ ] **Step 5: Commit the corrected pages**

```bash
git add books/efnafraedi-2e/05-publication/
git commit -m "render(f1): re-render corrected tables (m68710/m68733) + m68791 leak fix [#2]

Whole-book re-render; only 3 pages change. m68710 (4-2) and m68733 (6-3)
now render leading-empty table cells correctly; m68791 (12) picks up the
same render-only leak fix as a characterized latent fix (B4 supersedes).
Zero URL renames (ch06 reproduces live URLs under #6).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Full suite green + docs (roadmap / register / memory)

**Files:**
- Modify: `docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md` (mark #2 DELIVERED)
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (register row for F1)
- Modify: `<claude-memory>/memory/MEMORY.md` and `chemistry-clean-slate.md` (RESUME POINT → next = tech-debt sweep / Pass-1)

**Interfaces:**
- Consumes: all prior tasks.
- Produces: green full suite; updated status docs.

- [ ] **Step 1: Run the full test suite from the repo root (authoritative gate)**

Run: `npm test`
Expected: all Vitest suites green (parser regression + 8 render goldens included).

- [ ] **Step 2: Confirm the working tree is clean apart from docs**

Run: `git status --short`
Expected: only the docs files below will be modified in Step 3; no stray pipeline artifacts.

- [ ] **Step 3: Update the roadmap, register, and memory**

- Roadmap `#2` row → ✅ DELIVERED (branch `fix/chem-f1-entry-leak-render`): lazy `extractElements` fix + re-extract/re-inject/re-render m68710+m68733; m68791 latent render fix; goldens for both tables; whole-book diff = 3 pages, zero renames.
- Register: add an F1-delivery row mirroring the roadmap; note the redundant-but-kept extract-side pre-expansion (`cnxml-extract.js:1135`) and the pre-existing no-tag-boundary limitation of `extractElements` as out-of-scope tech-debt.
- Memory `chemistry-clean-slate.md` RESUME POINT + `MEMORY.md` ACTIVE THREAD line → F1 DELIVERED; NEXT = Tier-3 tech-debt sweep (#8–#13) then Pass-1 (#3) then B4 (#4).

- [ ] **Step 4: Commit the docs**

```bash
git add docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md
git commit -m "docs(register): F1 DELIVERED — <entry>-leak render fix + m68710/m68733 [#2]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
(Memory files live outside the repo — update them with the Write tool, not via git.)

- [ ] **Step 5: Request code review**

Use `superpowers:requesting-code-review` (whole-branch opus review) before opening the PR. Given the shared-parser change, the reviewer should specifically confirm: (a) paired-element parsing is unaffected across all `extractElements` callers, (b) the whole-book diff is exactly the 3 characterized pages with zero renames, (c) re-MT correctly stayed out of scope.

---

## Self-Review

**Spec coverage:**
- Part A (parser lazy fix + regression locks) → Task 1. ✅
- Part B (re-extract → equivalence preflight → re-inject → re-render) → Tasks 2, 3, 4. ✅
- Verification: unit tests (T1), whole-book re-render diff (T4), zero URL renames (T4 Step 2), table render-golden (T3), full suite green (T5). ✅
- Scope boundaries: no re-MT (T2 STOP-on-FAIL gate), extract-side workaround kept (noted in T2 context + T5 register), not the table-cell translation gate, not #13 section-golden. ✅
- Risks: shared-parser regression (T1 Step 5 + T4 gate), latent fixes characterized (T4 Steps 2–4). ✅

**Placeholder scan:** none — every step has exact commands, code, and expected output.

**Type consistency:** `extractElements(content, tagName)` signature and its `{attributes, content}` element shape are used consistently across tasks; `GOLDEN_MODULES` entry shape `{chapter, moduleId}` matches the existing fixture list; equivalence gate output string `"N modules; 0 FAIL; ..."` matches the tool.

**Note on m68791:** it is one of the 6 B4 re-MT modules. F1 gives it a **render-only** leak fix (from its current committed 03-translated, no re-inject) — this does not touch its segments and is fully superseded when B4 re-extracts/re-MTs it. Kept in scope because it is a genuine fix to a currently-leaking published page and is a single, characterized diff.
