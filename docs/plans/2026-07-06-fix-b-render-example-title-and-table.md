# Fix (b): renderExample title-leak + escaped-table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two render-stage defects in `renderExample` that corrupt worked-examples in 15 efnafraedi-2e modules — example titles containing inline markup leaking as literal `<title>` text (and a wrong `<h4>` heading), and example-owned `<table>`s escaping the example `<aside>`.

**Architecture:** Both defects live in `tools/cnxml-render.js` `renderExample` (and one shared helper `renderTable`). Root cause 1: the `/<title>([^<]+)<\/title>/` regex (5 occurrences) cannot match a `<title>` that contains child elements. Root cause 2: `renderExample`'s block-dispatch map has no `table` handler, so example-child tables hit the "loud seam" and get re-rendered by the section-level pass after the aside closes. Fix both, then re-render + regen goldens + verify gates.

**Tech Stack:** Node 22, vanilla JS ES modules, Vitest. Render tests via `renderCnxmlToHtml`.

## Global Constraints

- Diagnosis of record: `docs/audit/2026-07-06-ws5-residual-example-corruption-diagnosis.md`.
- **Root cause is RENDER-ONLY.** Do NOT touch `01-source/` (read-only), `02-*`, or injection. No re-inject needed for this fix — only re-render.
- `npm test` **from the repo root** is the authoritative gate (no branch protection).
- Robustness > expedience: one real code path, fail loud. Consolidate the 5 duplicated title regexes into ONE helper rather than editing each in place.
- Affected modules (single head-`<title>` expected after fix): `5-3, 9-5, 12-1, 12-5, 13-2, 14-1, 14-2, 14-3, 14-4, 15-1, 16-2, 16-3, 16-4, 7-6, appendices-2`.
- Golden fixtures already cover 4 affected/adjacent modules (m68710, m68727, m68739, m68789) — the fix WILL change these goldens; regen and eyeball-verify the diff contains ONLY title/table corrections.
- Branch off current `chore/efnafraedi-ws5-reinject-rerender-v2` tip OR `main` per lead; one PR for all of fix (b).

---

### Task 1: Title regex handles inline markup (title-leak + wrong `<h4>` + mis-placed para-title)

**Files:**
- Modify: `tools/cnxml-render.js` — `renderExample` (lines ~1481–1552) and add a small module-level helper near the other regex helpers.
- Test: `tools/__tests__/cnxml-render-example-dom.test.js` (extend; uses existing `renderExampleContent` helper).

**Interfaces:**
- Produces: helper `matchLeadingTitle(content) → { title: string|null, rest: string }` where `title` is the raw inner CNXML of a leading `<title>` (may contain markup), `rest` is `content` with that leading `<title>…</title>` removed. Used by the example-title extraction loop, the `paraHandler`, and the standalone-title fallback.
- Consumes: existing `processInlineContent(cnxml, context)` (renders inline markup), `translateTitle(str)`.

- [ ] **Step 1: Write the failing test — markup title is not leaked and becomes the h4**

Add to `tools/__tests__/cnxml-render-example-dom.test.js`:

```javascript
describe('renderExample — title containing inline markup (WS5 residual fix b)', () => {
  it('does not leak a markup <title> as literal text; renders it as the example h4', () => {
    // Real m68793 shape: the example title lives in the FIRST para's <title> and
    // contains <emphasis>/<sub> markup. The old /<title>([^<]+)<\/title>/ regex
    // could not match it → title leaked as literal <title> AND the next para's
    // plain-text title ("Lausn") wrongly became the example <h4>.
    const html = renderExampleContent(
      '<example id="E">' +
        '<para id="p1"><title>Ákvörðun á <emphasis effect="italics">E</emphasis><sub>a</sub></title>Vandamálstexti.</para>' +
        '<para id="p2"><title>Lausn</title>Lausnartexti.</para>' +
      '</example>'
    );
    // 1. no literal <title> leaked into the body
    expect(html).not.toContain('<title>');
    // 2. the real title is the example heading, with its markup rendered
    expect(html).toMatch(/<h4>Ákvörðun á <em>E<\/em><sub>a<\/sub><\/h4>/);
    // 3. "Lausn" is a para-title in its own position, NOT the example h4
    expect(html).not.toContain('<h4>Lausn</h4>');
    expect(html).toContain('class="para-title"');
    expect(html.indexOf('Vandamálstexti')).toBeLessThan(html.indexOf('Lausn'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-render-example-dom.test.js -t "inline markup"`
Expected: FAIL — output contains a literal `<title>` and/or `<h4>Lausn</h4>`.

- [ ] **Step 3: Add the `matchLeadingTitle` helper**

Near the top-of-file regex helpers in `tools/cnxml-render.js`, add:

```javascript
// A CNXML <title> may contain inline markup (<emphasis>, <sub>, <sup>, <m:math>).
// `[^<]+` stops at the first child tag, so it silently fails on such titles —
// the WS5 residual example corruption. Match the leading <title>…</title>
// non-greedily so the inner markup is captured whole.
const LEADING_TITLE_RE = /^\s*<title>([\s\S]*?)<\/title>\s*/;
function matchLeadingTitle(content) {
  const m = content.match(LEADING_TITLE_RE);
  if (!m) return { title: null, rest: content };
  return { title: m[1], rest: content.replace(LEADING_TITLE_RE, '') };
}
```

- [ ] **Step 4: Use the helper in the example-title extraction loop**

Replace the extraction loop (lines ~1485–1500) so it uses `matchLeadingTitle`:

```javascript
  const allParas = extractElements(example.content, 'para');
  let exampleTitle = null;
  for (const para of allParas) {
    const { title } = matchLeadingTitle(para.content);
    if (title) { exampleTitle = title; break; }
  }
  // Fallback: first standalone <title> anywhere in the example content.
  if (!exampleTitle) {
    const standalone = example.content.match(/<title>([\s\S]*?)<\/title>/);
    if (standalone) exampleTitle = standalone[1];
  }
```

The `<h4>` render at line ~1505 already uses `processInlineContent(exampleTitle, context)`, which renders the captured markup correctly — no change there.

- [ ] **Step 5: Use the helper in `paraHandler` (strip the title; render markup para-titles correctly)**

Replace the `paraHandler` title logic (lines ~1517–1547) so it uses `matchLeadingTitle` and renders a non-example para-title through `processInlineContent` (not `escapeHtml`, so a marked-up para-title isn't double-escaped):

```javascript
  const paraHandler = (para, ctx) => {
    const { title, rest } = matchLeadingTitle(para.content);
    let paraTitle = null;
    let contentWithoutTitle = para.content;
    if (title) {
      if (!exampleTitleStripped && exampleTitle && title === exampleTitle) {
        contentWithoutTitle = rest;          // already shown as the <h4>; strip it
        exampleTitleStripped = true;
      } else {
        paraTitle = title;                   // e.g. "Lausn" / "Svar" — a section heading
        contentWithoutTitle = rest;
      }
    }
    if (ctx.renderedFigureIds) {
      const figPattern = /<figure[^>]*\sid="([^"]+)"/g;
      let figMatch;
      while ((figMatch = figPattern.exec(contentWithoutTitle)) !== null) {
        ctx.renderedFigureIds.add(figMatch[1]);
      }
    }
    const parts = [];
    if (paraTitle) {
      parts.push(
        `<p class="para-title"><strong>${processInlineContent(translateTitle(paraTitle), ctx)}</strong></p>`
      );
    }
    if (contentWithoutTitle.trim()) {
      parts.push(renderPara({ ...para, content: contentWithoutTitle }, ctx));
    }
    return parts.join('\n  ');
  };
```

- [ ] **Step 6: Run the new test + the whole example-dom suite to verify pass + no regression**

Run: `npx vitest run tools/__tests__/cnxml-render-example-dom.test.js`
Expected: PASS (new test + all existing plain-text-title tests still green).

- [ ] **Step 7: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render-example-dom.test.js
git commit -m "fix(render): match example <title> with inline markup [WS5 residual b1]

The /<title>([^<]+)<\/title>/ regex failed on titles containing <emphasis>/<sub>/<sup>,
leaking the real example title as literal text and hoisting the next plain-text
para-title (\"Lausn\") into the example <h4>. Consolidate to a matchLeadingTitle
helper using non-greedy [\\s\\S]*?. 15 modules affected.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `table` handler in `renderExample` + id-dedup (tables stay inside the example)

**Files:**
- Modify: `tools/cnxml-render.js` — `renderExample` dispatch map (line ~1565), `renderTable` (line ~1733), context init (line ~512).
- Test: `tools/__tests__/cnxml-render-example-dom.test.js` (extend).

**Interfaces:**
- Consumes: existing `renderTable(table, context)`.
- Produces: `context.renderedTableIds` (a `Set`) — populated when a table renders; the section-level `renderTable` call skips ids already in it (mirrors `context.renderedFigureIds`).

- [ ] **Step 1: Write the failing test — an example-child table renders once, inside the aside**

Add to `tools/__tests__/cnxml-render-example-dom.test.js`:

```javascript
describe('renderExample — direct-child table (WS5 residual fix b2)', () => {
  it('renders an example-child table INSIDE the aside, exactly once', () => {
    // renderExample had no `table` handler → the table escaped the aside and was
    // re-rendered by the section-level pass AFTER </aside> (m68793 tables 12.31/12.32).
    const html = renderExampleContent(
      '<example id="E"><para id="p"><title>Lausn</title>Sjá töflu:</para>' +
        '<table id="TBL" class="unnumbered"><tgroup cols="1">' +
        '<tbody><row><entry>GILDI</entry></row></tbody></tgroup></table>' +
      '</example>'
    );
    // exactly one render of the table
    expect(html.split('GILDI').length - 1).toBe(1);
    // it is inside the example aside
    const tblIdx = html.indexOf('GILDI');
    const asideClose = html.lastIndexOf('</aside>');
    expect(tblIdx).toBeGreaterThan(-1);
    expect(tblIdx).toBeLessThan(asideClose);
  });
});
```

(Confirm the exact CNXML `<table>` shape renderTable expects by checking `renderTable`/`renderTableCells` before finalizing the fixture; adjust `<tgroup>/<tbody>/<row>/<entry>` to match the parser if needed.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-render-example-dom.test.js -t "direct-child table"`
Expected: FAIL — `GILDI` appears 0 times inside the aside (table dropped from example) or twice (escaped + section-rendered), and/or after `</aside>`.

- [ ] **Step 3: Add `renderedTableIds` to context init**

At the context construction (line ~512, beside `renderedFigureIds`):

```javascript
    renderedFigureIds: new Set(), // Track rendered figures to prevent duplicates
    renderedTableIds: new Set(),  // Track rendered tables (example-child vs section pass)
```

- [ ] **Step 4: Guard `renderTable` with the dedup set (mirror `renderFigure`)**

At the top of `renderTable` (line ~1733), after `const id = table.id || null;`:

```javascript
  if (id && context.renderedTableIds && context.renderedTableIds.has(id)) {
    return ''; // already rendered in place (e.g. inside an example) — skip the section-pass copy
  }
  if (id && context.renderedTableIds) {
    context.renderedTableIds.add(id);
  }
```

- [ ] **Step 5: Register the `table` handler in `renderExample`'s dispatch map**

In the `renderBlockChildrenInOrder` call inside `renderExample` (line ~1565), add:

```javascript
      para: paraHandler,
      note: noteHandler,
      list: renderList,
      equation: renderEquation,
      figure: renderFigure,
      media: renderMedia,
      table: renderTable,
```

Because the example renders at its document position (before the section loop reaches the tables' later positions), the in-example `renderTable` registers the id first and the section-level `case 'table'` call then returns `''`.

- [ ] **Step 6: Run the new test + full example-dom suite**

Run: `npx vitest run tools/__tests__/cnxml-render-example-dom.test.js`
Expected: PASS (table once, inside aside; all prior tests green).

- [ ] **Step 7: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render-example-dom.test.js
git commit -m "fix(render): keep example-child <table> inside the example aside [WS5 residual b2]

renderExample had no table dispatcher → example-owned tables (m68793 12.31/12.32)
escaped the aside and were re-rendered by the section pass. Add a table handler +
context.renderedTableIds dedup (mirrors renderedFigureIds) so each table renders once,
in place.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Re-render, regen goldens, verify all gates + all 15 modules

**Files:**
- Modify (generated): `books/efnafraedi-2e/05-publication/**` (re-render output), `tools/__tests__/fixtures/render-golden/**` (regen).

**Interfaces:** none (delivery task).

- [ ] **Step 1: Full unit gate from repo root**

Run: `npm test`
Expected: PASS (~1905 tests). If any non-golden render test fails, STOP and investigate — the fix changed unintended output.

- [ ] **Step 2: Regenerate render goldens and eyeball the diff**

Run: `UPDATE_GOLDEN=1 npx vitest run tools/__tests__/cnxml-render-golden.test.js`
Then: `git diff --stat tools/__tests__/fixtures/render-golden/`
Expected: only affected/adjacent modules change (m68710, m68727, m68739, m68789). Inspect each diff hunk — every change must be either (a) a leaked `<title>` removed / correct `<h4>` gained, or (b) a table moved to inside its example aside. Any OTHER change = STOP and investigate.

- [ ] **Step 3: Re-render the whole book, both tracks**

Confirm the render CLI's track handling first (`node tools/cnxml-render.js --help` or read arg parsing); then re-render every chapter for the tracks WS5 rendered. Baseline command (verify track flag at execution):

```bash
for ch in $(seq 0 21) appendices; do node tools/cnxml-render.js --book efnafraedi-2e --chapter "$ch"; done
```

Expected: no render errors; publication HTML rewritten.

- [ ] **Step 4: Verify the reader-facing fix on all 15 modules**

Run:
```bash
for f in $(find books/efnafraedi-2e/05-publication -name '*.html'); do
  n=$(grep -c '<title>' "$f"); [ "$n" -gt 1 ] && echo "STILL LEAKING: $f ($n)"
done
```
Expected: **no output** (every file has exactly one head `<title>`).

Then spot-check 12-5 specifically:
```bash
F=books/efnafraedi-2e/05-publication/mt-preview/chapters/12/12-5-arekstrakenningin.html
grep -c '<h4>Lausn</h4>' "$F"          # expect 0 (Lausn is a para-title now, in position)
grep -n 'data-table-number="12.31"' "$F"  # expect line BEFORE the example's </aside>
```

- [ ] **Step 5: Fidelity + render-oracle gates (match WS5's verification)**

Run: `npm run fidelity:render`
Expected: exit 0 (no new genuine math/image drops vs baseline). Reconcile any diff against the WS5 baseline the same way WS5 did; a title/table structural change should not register as a math/image loss.

- [ ] **Step 6: Commit the re-render + goldens**

```bash
git add books/efnafraedi-2e/05-publication tools/__tests__/fixtures/render-golden
git commit -m "content(efnafraedi-2e): re-render — example title-leak + escaped-table fix (WS5 residual b)

15 modules: example titles with inline markup no longer leak as literal <title>;
example-owned tables render inside the example aside. Reader-facing delivery of fix (b).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Open the PR**

Summarize: root cause (two mechanisms), the 15 affected modules, gate evidence (npm test count, golden diff scope, 0 leaking titles, fidelity exit 0). Note that the lead does the vefur sync + prod deploy (content-only). Link the audit doc.

---

## Self-Review

- **Spec coverage:** mechanism 1 (title regex) → Task 1; mechanism 2 (missing table handler) → Task 2; delivery/gates → Task 3. All three covered.
- **Placeholder scan:** Step 3 re-render track flag and Step 1 table-fixture shape are flagged to confirm-at-execution against real code, not left as TODO — acceptable because they are verification-of-existing-signature, not undefined behavior.
- **Type consistency:** `matchLeadingTitle` returns `{title, rest}` and is used identically in Task 1 Steps 4–5; `renderedTableIds` is a `Set` created in Task 2 Step 3 and consumed in Steps 4–5.
