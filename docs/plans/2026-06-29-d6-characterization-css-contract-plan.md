# D6 — Per-book Characterization + Parametrized CSS-Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every book a render-characterization spec and run the CSS-contract over every book's `05-publication`, so a render change or class-mismatch that breaks a non-chemistry book is caught.

**Architecture:** A small enabling change makes `renderCnxmlToHtml` honor a per-call `options.bookConfig` (unblocks per-book label assertions; fixes a latent server-preview bug). A new `render-characterization.test.js` has one `describe` per book over inline CNXML. `css-contract.test.js` is parametrized over `books/*/05-publication` with a `VEFUR_CONTRACT=1` hard-fail; running it against the real (checked-out) vefur CSS surfaces cross-book class gaps, resolved vefur-side or via allowlist.

**Tech Stack:** Node 22 ESM, Vitest, `glob`. Cross-repo: `../namsbokasafn-vefur` (checked out).

**Design spec:** [docs/plans/2026-06-29-d6-characterization-css-contract-design.md](2026-06-29-d6-characterization-css-contract-design.md)

## Global Constraints

- Characterization assertions are **structural/label-based, not byte-golden**.
- `renderCnxmlToHtml` change must be a **no-op for the CLI path** (only acts when `options.bookConfig` is passed).
- Plain `npm test` (no `VEFUR_CONTRACT`, vefur may be absent) must stay green.
- **Cross-repo:** before editing anything under `../namsbokasafn-vefur/`, read its `CLAUDE.md` + memory index (`~/.claude/projects/-home-siggi-dev-repos-namsbokasafn-vefur/memory/MEMORY.md`); record vefur learnings in vefur's memory. vefur edits are a separate commit in that repo.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Verified facts

`renderCnxmlToHtml(cnxml, options)` (`cnxml-render.js:413`) never reads `options.bookConfig`; note labels come from module-global `NOTE_TYPE_LABELS` (`:77`, default `{}`) set only in CLI `main()` (`:3232`). `renderService.js:99` already passes `bookConfig` (currently ignored). Book note labels: biology `evolution`→`Þróun`, `visual-connection`→`Sjónræn tenging`, `career`→`Starfsferill`; chemistry `chemistry everyday-life`→`Efnafræði í daglegu lífi`; microbiology `microbiology clinical-focus`→`Klínísk sjónarmið`. organic + physics have **empty** `noteTypeLabels` (title-based notes). css-contract `it.skipIf(!vefurExists || !pubExists)` at `:102`/`:162`, `PUBLICATION_DIR` hardcoded `:20`. All 5 books have `05-publication`.

## File structure

- **Modify** `tools/cnxml-render.js` — `renderCnxmlToHtml` honors `options.bookConfig`.
- **Modify** `tools/__tests__/cnxml-render.test.js` — test the bookConfig threading.
- **Create** `tools/__tests__/render-characterization.test.js` — per-book `describe` + `renderFor` helper.
- **Modify** `tools/__tests__/css-contract.test.js` — parametrize over books + `VEFUR_CONTRACT` hard-fail.
- **(maybe) Modify** `../namsbokasafn-vefur/static/styles/content.css` — selectors for surfaced classes (separate vefur commit).

---

### Task 1: `renderCnxmlToHtml` honors `options.bookConfig`

**Files:**
- Modify: `tools/cnxml-render.js:413-417`
- Test: `tools/__tests__/cnxml-render.test.js`

**Interfaces:**
- Produces: `renderCnxmlToHtml(cnxml, { bookConfig, ... })` — when `options.bookConfig` is provided, its `noteTypeLabels` drive note-label resolution for that call. No-op when absent (CLI path unchanged).

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/cnxml-render.test.js` (inside the existing top-level describe or as a new one):

```js
describe('renderCnxmlToHtml honors options.bookConfig (D6)', () => {
  const noteCnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>T</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00001</md:content-id><md:title>T</md:title></metadata>
<content><note id="n1" class="evolution"><para id="p1">Texti.</para></note></content>
</document>`;

  it('resolves a per-book note label from options.bookConfig', () => {
    const { html } = renderCnxmlToHtml(noteCnxml, {
      moduleId: 'm00001',
      chapter: 1,
      lang: 'is',
      bookConfig: { noteTypeLabels: { evolution: 'Þróun' } },
    });
    expect(html).toContain('Þróun');
  });
});
```

- [ ] **Step 2: Run — fails (label not resolved; bookConfig ignored)**

Run: `npx vitest run tools/__tests__/cnxml-render.test.js -t "honors options.bookConfig"`
Expected: FAIL — html does not contain `Þróun` (renders the English fallback `Evolution`).

- [ ] **Step 3: Implement the threading**

In `tools/cnxml-render.js`, in `renderCnxmlToHtml` right after `const moduleId = options.moduleId;` (`:417`):

```js
  // D6: honor a per-call book config so inline AND server renders resolve
  // per-book note labels instead of the module-global default. No-op for the
  // CLI path, which sets these globals in main() and passes no options.bookConfig.
  if (options.bookConfig) {
    BOOK_CONFIG = options.bookConfig;
    NOTE_TYPE_LABELS = options.bookConfig.noteTypeLabels || {};
  }
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tools/__tests__/cnxml-render.test.js -t "honors options.bookConfig"`
Expected: PASS.

- [ ] **Step 5: Run the full render suite (no regression to CLI-path tests)**

Run: `npx vitest run tools/__tests__/cnxml-render.test.js`
Expected: PASS (existing tests unaffected — they pass no `bookConfig`, so the global default behavior is unchanged).

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render.test.js
git commit -m "fix(render): honor options.bookConfig for note labels (D6 enabler + server-preview fix)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Per-book render-characterization specs (5 books)

**Files:**
- Create: `tools/__tests__/render-characterization.test.js`

**Interfaces:**
- Consumes: `renderCnxmlToHtml` (with `bookConfig` from Task 1); `getBookRenderConfig` from `tools/lib/book-rendering-config.js`.

- [ ] **Step 1: Write the spec (all 5 books)**

Create `tools/__tests__/render-characterization.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml } from '../cnxml-render.js';
import { getBookRenderConfig } from '../lib/book-rendering-config.js';

// Render inline module CNXML with a book's real config.
function renderFor(slug, contentCnxml) {
  const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Próf</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00001</md:content-id><md:title>Próf</md:title></metadata>
<content>${contentCnxml}</content>
</document>`;
  return renderCnxmlToHtml(cnxml, {
    moduleId: 'm00001',
    chapter: 1,
    lang: 'is',
    bookConfig: getBookRenderConfig(slug),
  }).html;
}

describe('render characterization: efnafraedi-2e (chemistry)', () => {
  it('renders a chemistry note with its Icelandic label', () => {
    const html = renderFor('efnafraedi-2e', '<note id="n" class="chemistry everyday-life"><para id="p">x</para></note>');
    expect(html).toContain('Efnafræði í daglegu lífi');
  });
  it('renders an <example> box', () => {
    const html = renderFor('efnafraedi-2e', '<example id="ex"><para id="p">Dæmi.</para></example>');
    expect(html.toLowerCase()).toContain('example');
  });
});

describe('render characterization: liffraedi-2e (biology)', () => {
  it('renders biology note classes with Icelandic labels', () => {
    const html = renderFor(
      'liffraedi-2e',
      '<note id="a" class="evolution"><para id="p1">x</para></note>' +
        '<note id="b" class="visual-connection"><para id="p2">y</para></note>' +
        '<note id="c" class="career"><para id="p3">z</para></note>'
    );
    expect(html).toContain('Þróun');
    expect(html).toContain('Sjónræn tenging');
    expect(html).toContain('Starfsferill');
  });
  it('renders an inline <exercise> (biology uses inline exercises)', () => {
    const html = renderFor(
      'liffraedi-2e',
      '<exercise id="e"><problem id="pr"><para id="p">Spurning?</para></problem>' +
        '<solution id="so"><para id="ps">Svar.</para></solution></exercise>'
    );
    expect(html.toLowerCase()).toContain('exercise');
  });
  it('renders a biology-shaped module (notes + exercise, no <example>) cleanly', () => {
    const html = renderFor(
      'liffraedi-2e',
      '<para id="p">Inngangur.</para><note id="n" class="evolution"><para id="pn">x</para></note>'
    );
    expect(html).toContain('Inngangur.');
    expect(html).toContain('Þróun');
  });
});

describe('render characterization: orverufraedi (microbiology)', () => {
  it('renders a microbiology note class with its Icelandic label', () => {
    const html = renderFor(
      'orverufraedi',
      '<note id="n" class="microbiology clinical-focus"><para id="p">x</para></note>'
    );
    expect(html).toContain('Klínísk sjónarmið');
  });
});

describe('render characterization: lifraen-efnafraedi (organic)', () => {
  it('renders a title-based note (organic has no class-based note labels)', () => {
    const html = renderFor(
      'lifraen-efnafraedi',
      '<note id="n"><title>Athugið</title><para id="p">Texti.</para></note>'
    );
    expect(html).toContain('Athugið');
  });
});

describe('render characterization: edlisfraedi-2e (physics)', () => {
  it('renders a SHARED note label (link-to-learning) for a config without book-specific notes', () => {
    const html = renderFor(
      'edlisfraedi-2e',
      '<note id="n" class="link-to-learning"><para id="p">x</para></note>'
    );
    expect(html).toContain('Tengill til náms');
  });
});
```

- [ ] **Step 2: Run the characterization specs**

Run: `npx vitest run tools/__tests__/render-characterization.test.js`
Expected: PASS for all 5 books. If a label/structure assertion is off, render the snippet with `node -e` using the same options and inspect the actual HTML before adjusting — the labels are verified from each `book-config.json`, so a miss means the construct/markup differs (adjust the assertion to the real structure, not the label string).

- [ ] **Step 3: Commit**

```bash
git add tools/__tests__/render-characterization.test.js
git commit -m "test(render): per-book characterization specs for all 5 books (D6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Parametrize the CSS-contract over all books + `VEFUR_CONTRACT` hard-fail

**Files:**
- Modify: `tools/__tests__/css-contract.test.js`

**Interfaces:**
- Produces: the two contract checks run once per book that has `05-publication`; a guard test fails when `VEFUR_CONTRACT=1` and the vefur CSS is absent.

- [ ] **Step 1: Replace the hardcoded publication dir with per-book discovery**

In `tools/__tests__/css-contract.test.js`, replace the `PUBLICATION_DIR` constant (`:20`) with a discovery of all books that have a publication dir:

```js
const BOOKS_DIR = path.resolve(__dirname, '../../books');
const PUBLICATION_DIRS = fs
  .readdirSync(BOOKS_DIR)
  .map((b) => ({ book: b, dir: path.join(BOOKS_DIR, b, '05-publication') }))
  .filter((e) => fs.existsSync(e.dir));
```

- [ ] **Step 2: Add the `VEFUR_CONTRACT` hard-fail guard**

Inside the top-level `describe('CSS contract: …')`, after `const vefurExists = fs.existsSync(VEFUR_CSS_PATH);`, add:

```js
  const requireVefur = process.env.VEFUR_CONTRACT === '1';
  if (requireVefur) {
    it('VEFUR_CONTRACT=1 requires the vefur content.css to be present', () => {
      expect(vefurExists, `VEFUR_CONTRACT=1 but vefur CSS not found at ${VEFUR_CSS_PATH}`).toBe(true);
    });
  }
```

- [ ] **Step 3: Parametrize the two contract checks over books**

Replace each of the two `it.skipIf(!vefurExists || !pubExists)(...)` blocks (`:102`, `:162`) with a per-book loop. For the first (class↔CSS match):

```js
  for (const { book, dir } of PUBLICATION_DIRS) {
    it.skipIf(!vefurExists)(`[${book}] rendered HTML classes have matching CSS rules`, () => {
      const cssContent = fs.readFileSync(VEFUR_CSS_PATH, 'utf-8');
      const cssClasses = extractCssClasses(cssContent);
      const htmlFiles = glob.sync('**/*.html', { cwd: dir });
      expect(htmlFiles.length).toBeGreaterThan(0);
      // ... (unchanged body, with PUBLICATION_DIR → dir) ...
    });
  }
```

Do the same for the dead-selector check (`:162`), looping over `PUBLICATION_DIRS` and using `dir`. The dead-selector check is cross-book (a selector dead for one book may be used by another), so accumulate `allHtmlClasses` across **all** `PUBLICATION_DIRS` in a single test rather than per-book — keep that one as a single test iterating all dirs.

(Replace every `PUBLICATION_DIR` reference inside the moved bodies with the loop's `dir`; replace the `pubExists` guard with the per-book `dir` existence which is guaranteed by the filter.)

- [ ] **Step 4: Run — skip path stays green (no vefur flag)**

Run: `npx vitest run tools/__tests__/css-contract.test.js`
Expected: PASS — when vefur CSS is absent the per-book contract tests skip; when present they run for all 5 books (failures here are real and handled in Task 4). The CSS-parse test behaves as before.

- [ ] **Step 5: Verify the hard-fail guard fires**

Run: `VEFUR_CONTRACT=1 npx vitest run tools/__tests__/css-contract.test.js -t "requires the vefur"`
Expected: if vefur CSS is present → PASS; to prove the guard, temporarily point `VEFUR_CSS_PATH` resolution at a non-existent path is overkill — instead trust the assertion. (The guard's logic is a one-line `expect(vefurExists).toBe(true)`.)

- [ ] **Step 6: Commit**

```bash
git add tools/__tests__/css-contract.test.js
git commit -m "test(css): parametrize contract over all books + VEFUR_CONTRACT hard-fail (D6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Run the real contract (vefur present) + resolve surfaced cross-book gaps

**Files:**
- Modify (per finding): `tools/__tests__/css-contract.test.js` (allowlist) and/or `../namsbokasafn-vefur/static/styles/content.css` (selectors).

**Interfaces:** none new — this is a discovery-and-resolve task.

- [ ] **Step 1: Run the full contract against the real vefur CSS**

Run: `VEFUR_CONTRACT=1 npx vitest run tools/__tests__/css-contract.test.js 2>&1 | tail -40`
Expected: the per-book class↔CSS tests run for all 5 books. Record every failing class per book — this is the work-list (e.g. `summary`, `summary-section`, `periodic-table-link` are flagged in the plan's [VEFUR] note).

- [ ] **Step 2: Triage each surfaced class**

For each failing class, decide:
- **Genuinely unstyled / structural-only** (no visual rule needed) → add to the `STRUCTURAL_CLASSES` allowlist in `css-contract.test.js`, with a one-line comment why.
- **Should be styled but vefur lacks the rule** → add a selector to `../namsbokasafn-vefur/static/styles/content.css`. **Before editing vefur**, read `../namsbokasafn-vefur/CLAUDE.md` and its memory index; make the change a separate commit in the vefur repo and note the learning in vefur's memory.

- [ ] **Step 3: Apply the decisions**

Apply allowlist entries (efni repo) and/or vefur CSS selectors (vefur repo) per Step 2. If there are no failures (all books' classes already covered), record that and skip — no change needed.

- [ ] **Step 4: Re-run until green**

Run: `VEFUR_CONTRACT=1 npx vitest run tools/__tests__/css-contract.test.js`
Expected: PASS for all 5 books.

- [ ] **Step 5: Confirm the default path is still green**

Run: `npm test`
Expected: PASS (without the flag; contract skips if vefur absent, runs if present).

- [ ] **Step 6: Commit (efni side)**

```bash
git add tools/__tests__/css-contract.test.js
git commit -m "test(css): allowlist genuinely-unstyled cross-book classes (D6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
(Commit any vefur CSS change separately in the vefur repo. If no classes were surfaced, skip this commit.)

---

## Self-review

**Spec coverage:** per-book characterization (5 books) → Task 2 (enabled by Task 1); parametrized contract over `books/*/05-publication` → Task 3; `VEFUR_CONTRACT=1` hard-fail → Task 3; real-contract cross-book gap resolution → Task 4. The design's label assertions require render to honor `bookConfig` → Task 1 (a discovered enabling change + latent server-preview fix). ✅
**Out of scope held:** no re-rendering (contract reads committed `05-publication`); no byte-golden snapshots; vefur edits limited to adding missing selectors, behind the cross-repo protocol. ✅
**Placeholder scan:** Task 4 is discovery-and-resolve with a complete *procedure* + decision rule (not a placeholder); every code step elsewhere shows complete code with expected output. The Task 3 body-move instruction names the exact substitution (`PUBLICATION_DIR` → `dir`) rather than restating the unchanged bodies. ✅
**Type consistency:** `renderCnxmlToHtml(cnxml, {bookConfig})` (Task 1) consumed by `renderFor` (Task 2); `getBookRenderConfig(slug)` returns the config whose `noteTypeLabels` drive labels (Task 1/2); `PUBLICATION_DIRS` `{book, dir}` shape (Task 3) used consistently in both contract loops + Task 4. ✅
