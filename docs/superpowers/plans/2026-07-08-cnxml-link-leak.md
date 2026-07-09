# Fix `<link document="D">text</link>` render leak + raw-CNXML-leak guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `processInlineContent` from leaking raw CNXML `<link document="D">text</link>` markup into published HTML, and add a general raw-CNXML-leak detector that would also have caught the earlier `<entry>`/`<row>` leak.

**Architecture:** One additive renderer arm fixes the leak (renders text, no appendix resolution — that's deferred piece 2). A shared `findRawCnxmlLeaks(html)` helper backs both a fast unit-test regression guard (in the `npm test` gate, proving the fix on a fresh render) and a CLI scan in the standalone fidelity checker (which will report the 25 pre-existing leaks until the lead re-renders).

**Tech Stack:** Node.js 22 (ESM), Vitest.

## Global Constraints

- **Run `npm test` from the repo ROOT** — the authoritative gate (no branch protection).
- **Zero `books/` changes** in this PR — no `05-publication/` re-render (the lead's owed full re-render + sync delivers the fix to readers), never touch `books/*/01-source/`.
- **Piece 1 only** — render the paired-document-only `<link>` as processed text; do NOT resolve appendix `document=` links to `/vidauki/{letter}` (piece 2 is a deferred lead call; log it, don't build it).
- The leak guard's pattern list must be **attribute-scoped for `<link`** (`<link document=` / `<link target-id=`), never bare `<link` — published `<head>` legitimately carries `<link rel="stylesheet">`.
- Branch: `fix/chem-cnxml-link-leak` (already created off `main`).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Add the missing renderer arm (kill the leak)

`processInlineContent` (`tools/lib/cnxml-elements.js`) has arms for self-closing×3, paired-both-attrs (arm 4), and paired-target-only (arm 5), but **none for paired document-only** `<link document="D">text</link>` — so that shape leaks raw. Add the arm between arm 4 and arm 5, mirroring arm 4's `href:null`→processed-text handling.

**Files:**
- Modify: `tools/lib/cnxml-elements.js` (insert after arm 4's block, ends ~line 766; before arm 5 comment ~line 768)
- Test: `tools/__tests__/cnxml-link-resolution.test.js` (existing; has `makeContext`, imports `processInlineContent`)

**Interfaces:**
- Consumes: `resolveCrossModuleHref(documentId, targetId, context)`, `processInlineContent`, `escapeHtml`, `escapeAttr` (all already in `cnxml-elements.js`).

- [ ] **Step 1: Write the failing test**

Add to `tools/__tests__/cnxml-link-resolution.test.js`:

```js
describe('paired document-only <link> (no target-id) does not leak raw CNXML', () => {
  it('renders the text and emits no raw <link> tag', () => {
    const cnxml = 'Gögn úr <link document="m68865">viðauka G</link> sýna.';
    const out = processInlineContent(cnxml, makeContext());
    expect(out).not.toContain('<link');
    expect(out).toContain('viðauka G');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-link-resolution.test.js -t "does not leak raw CNXML"`
Expected: FAIL — output still contains the raw `<link document="m68865">…</link>` (no arm matches it yet).

- [ ] **Step 3: Add the arm**

In `tools/lib/cnxml-elements.js`, immediately after arm 4's `);` (the both-attrs `result = result.replace(… )` block ending ~line 766) and before the `// 5.` comment, insert:

```js
  // 4b. <link document="D">text</link>  (closing tag, document only — no target-id)
  // Without this arm the shape falls through all others and leaks raw CNXML markup
  // into the HTML. Renders as text when the document does not resolve (appendix
  // links are text-only for now — resolving them to /vidauki/{letter} is deferred).
  result = result.replace(
    /<link\s+document="([^"]*)"\s*>([\s\S]*?)<\/link>/g,
    (match, doc, inner) => {
      const { href } = resolveCrossModuleHref(doc, null, context);
      const text = inner.trim();
      const label =
        text ||
        context.moduleSections?.[doc]?.titleIs ||
        context.crossModuleSections?.[doc]?.titleIs ||
        doc;
      if (href === null) {
        return text ? processInlineContent(text, context) : escapeHtml(label);
      }
      return `<a href="${escapeAttr(href)}">${text ? processInlineContent(text, context) : escapeHtml(label)}</a>`;
    }
  );
```

The strict `\s*>` (not `[^>]*>`) matches exactly the leaking `<link document="X">text</link>` shape and cannot swallow a both-attrs link (arm 4 ran first; a both-attrs link has `target-id` before `>`, so `\s*>` fails on it).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-link-resolution.test.js`
Expected: PASS — the new test green AND every existing link-resolution test still green (arm ordering unchanged for other shapes).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/cnxml-elements.js tools/__tests__/cnxml-link-resolution.test.js
git commit -m "fix(cnxml-render): render paired document-only <link>, don't leak raw CNXML [#10]

processInlineContent had no arm for <link document=D>text</link>, so it leaked
raw CNXML <link> markup into published HTML (67 links / 19 modules / 25 pages).
Add the arm mirroring arm 4's null-handling: renders text (appendix links stay
text-only; resolving them to /vidauki/letter is deferred piece 2).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `findRawCnxmlLeaks` helper + wire into `checkChapter`

A shared, attribute-scoped detector for CNXML elements that must never survive render, backing both the unit guard (Task 3) and the CLI shipped-output scan.

**Files:**
- Modify: `tools/cnxml-render-fidelity-check.js` (add exported `findRawCnxmlLeaks`; call it in `checkChapter` ~after the control-char scan, line ~205)
- Test: `tools/__tests__/cnxml-render-fidelity-check.test.js` (existing; imports from `../cnxml-render-fidelity-check.js`)

**Interfaces:**
- Produces: `findRawCnxmlLeaks(html: string) → Array<{ pattern: string, count: number, sample: string }>` — one entry per curated pattern that matched (empty = clean).
- `checkChapter` pushes a `{ type: 'raw-cnxml-leak', where: 'produced-html', leaks }` finding when `findRawCnxmlLeaks(htmlAll)` is non-empty.

- [ ] **Step 1: Write the failing tests**

Add to `tools/__tests__/cnxml-render-fidelity-check.test.js` (extend the import to include `findRawCnxmlLeaks`):

```js
import { findRawCnxmlLeaks } from '../cnxml-render-fidelity-check.js';

describe('findRawCnxmlLeaks', () => {
  it('flags a leaked <link document=...>', () => {
    const leaks = findRawCnxmlLeaks('<p>x <link document="m68865">viðauka G</link> y</p>');
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks.some((l) => l.pattern.includes('link'))).toBe(true);
  });
  it('flags leaked <term>, <emphasis>, <entry>, <row>', () => {
    for (const s of ['<term>x</term>', '<emphasis>x</emphasis>', '<entry>x</entry>', '<row>x</row>']) {
      expect(findRawCnxmlLeaks(s).length).toBeGreaterThan(0);
    }
  });
  it('does NOT flag a legit head stylesheet <link rel=...>', () => {
    expect(findRawCnxmlLeaks('<link rel="stylesheet" href="/styles/content.css">')).toEqual([]);
  });
  it('returns [] for clean HTML', () => {
    expect(findRawCnxmlLeaks('<p>Hrein <a href="#x">tengill</a> og <em>áhersla</em>.</p>')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tools/__tests__/cnxml-render-fidelity-check.test.js -t "findRawCnxmlLeaks"`
Expected: FAIL — `findRawCnxmlLeaks is not a function`.

- [ ] **Step 3: Add the helper and wire it into `checkChapter`**

In `tools/cnxml-render-fidelity-check.js`, add near the top-level helpers (e.g. after `CONTROL_CHAR_REGEX`):

```js
// CNXML elements that must NEVER survive render into published HTML. Attribute-
// scoped for <link> (a head <link rel="stylesheet"> is legitimate); the rest are
// tag names with no valid-HTML counterpart. Extend as new CNXML-only tags surface;
// never add an HTML-valid name (title, table, list, head-link).
const RAW_CNXML_LEAK_PATTERNS = [
  ['link', /<link\s+(?:document|target-id)=/g],
  ['term', /<term[\s>]/g],
  ['emphasis', /<emphasis[\s>]/g],
  ['entry', /<entry[\s/>]/g],
  ['row', /<row[\s/>]/g],
  ['colspec', /<colspec[\s/>]/g],
  ['foreign', /<foreign[\s>]/g],
  ['footnote', /<footnote[\s>]/g],
  ['newline', /<newline\s*\/?>/g],
];

/**
 * Scan produced HTML for raw CNXML element markup that should never survive
 * render. Baseline-free. Returns one entry per matched pattern (empty = clean).
 * @param {string} html
 * @returns {Array<{pattern:string,count:number,sample:string}>}
 */
export function findRawCnxmlLeaks(html) {
  const leaks = [];
  for (const [name, re] of RAW_CNXML_LEAK_PATTERNS) {
    const m = html.match(re);
    if (m) leaks.push({ pattern: name, count: m.length, sample: m[0] });
  }
  return leaks;
}
```

Then in `checkChapter`, right after the control-char scan block (the `for (const [label, text] of …)` loop that ends ~line 205), add:

```js
  // 1b. raw-CNXML-leak scan (baseline-free): CNXML markup that must never survive
  // render (e.g. <link document=...>, <entry>, <emphasis>). Would have caught both
  // this <link> leak and the earlier <entry>/<row> arc.
  const leaks = findRawCnxmlLeaks(htmlAll);
  if (leaks.length) {
    findings.push({ type: 'raw-cnxml-leak', where: 'produced-html', leaks });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tools/__tests__/cnxml-render-fidelity-check.test.js`
Expected: PASS — the four `findRawCnxmlLeaks` tests green AND the existing `checkChapter` tests still green (controlled fixtures contain no curated CNXML pattern). Also run `npx vitest run tools/__tests__/cnxml-render-media-dom.test.js` (also imports `checkChapter`) — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-render-fidelity-check.js tools/__tests__/cnxml-render-fidelity-check.test.js
git commit -m "feat(fidelity): general raw-CNXML-leak scan (findRawCnxmlLeaks) [#10]

Attribute-scoped detector for CNXML markup that must never reach published HTML
(<link document=...>, <entry>, <emphasis>, ...); would have caught both this
<link> leak and the earlier <entry>/<row> arc. Wired into checkChapter. The CLI
(npm run fidelity:render, not in npm test) will report the 25 pre-existing
leaking pages until the lead's re-render clears them.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: End-to-end fresh-render guard

Prove the fix on real content without committing re-rendered pages: render a formerly-leaking module fresh and assert zero raw-CNXML leak.

**Files:**
- Create: `tools/__tests__/cnxml-render-no-raw-cnxml.test.js`

**Interfaces:**
- Consumes: `renderTranslatedModule` (`./helpers/render-normalize.js`), `findRawCnxmlLeaks` (`../cnxml-render-fidelity-check.js`).

- [ ] **Step 1: Write the test (fails before Task 1's fix; passes after)**

Create `tools/__tests__/cnxml-render-no-raw-cnxml.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { renderTranslatedModule } from './helpers/render-normalize.js';
import { findRawCnxmlLeaks } from '../cnxml-render-fidelity-check.js';

// m68727 (ch05) carried 6 leaking <link document="m68865">…</link> refs before
// the arm-4b fix. A fresh render must now contain zero raw CNXML markup.
describe('fresh render of a formerly-leaking module has no raw CNXML', () => {
  it('m68727 renders leak-free', () => {
    const html = renderTranslatedModule({ chapter: 'ch05', moduleId: 'm68727' });
    expect(findRawCnxmlLeaks(html)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it passes (with Task 1 applied)**

Run: `npx vitest run tools/__tests__/cnxml-render-no-raw-cnxml.test.js`
Expected: PASS. (Optional sanity, uncommitted: temporarily comment out the arm-4b block in `cnxml-elements.js` and re-run — confirm this test FAILS with a `link` leak, proving it guards the real behavior — then restore the arm. Do not commit the experiment.)

- [ ] **Step 3: Commit**

```bash
git add tools/__tests__/cnxml-render-no-raw-cnxml.test.js
git commit -m "test(render): guard a real module renders free of raw CNXML markup [#10]

End-to-end guard: m68727 (6 formerly-leaking <link document=...> refs) now
renders with zero findRawCnxmlLeaks. Proves the arm-4b fix on real content
without committing a re-render.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Full-suite gate + log piece 2 + PR

- [ ] **Step 1: Run the whole suite from repo root**

Run: `npm test`
Expected: PASS — full Vitest workspace green.

- [ ] **Step 2: Confirm zero `books/` changes**

Run: `git status --porcelain books/` (expect empty) and `git diff --stat main..HEAD -- books/` (expect empty).

- [ ] **Step 3: Log piece 2 (deferred appendix resolution) for the lead**

Confirm the roadmap #10 row (already reframed in the design commit) records: piece 2 = resolve appendix `document=` links to `/{book}/vidauki/{letter}` is a lead call (reopens the A1 YAGNI deferral; the A1 premise "0 appendix cross-page links" was incomplete — 67 exist; depends on verifying the vefur `/vidauki/{letter}` route prerenders prose appendices B/G). Also note: the CLI `npm run fidelity:render` will report the 25 pre-existing leaking pages until the lead's re-render. If any of these are not already in the roadmap register, add them. (Documentation-only; no code.)

- [ ] **Step 4: Whole-branch review, then PR**

Use the project's whole-branch review flow; address findings; open the PR against `main`.

## Success criteria (definition of done)

- `processInlineContent` renders `<link document="D">text</link>` as text (or `<a>` when resolvable), never raw markup; its unit test proves it.
- `findRawCnxmlLeaks` exists, is attribute-scoped (no head-stylesheet false positive), is covered by tests, and is wired into `checkChapter`.
- A real formerly-leaking module (m68727) renders leak-free (asserted end-to-end).
- `npm test` green from repo root; **zero `05-publication/` changes** in this PR.
- Piece 2 + the "25 pages clear on the lead's re-render" note are logged, not built.
