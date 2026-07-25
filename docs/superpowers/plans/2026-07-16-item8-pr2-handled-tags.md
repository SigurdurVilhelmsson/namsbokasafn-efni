# Item 8 PR2 — D2 Shared Handled-Tags Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One source of truth for the pipeline's inline/block tag classification — a new `tools/lib/handled-tags.js` exporting the canonical `HANDLED_INLINE`/`HANDLED_BLOCK` sets, adopted by the pre-intake probe and the renderer, with purpose-specific subsets (`BLOCK_TAGS`, `LOUD_SEAM_IGNORE`, `ITEM_INLINE_OK`) either derived from the canonical sets or drift-guarded by test — all provably behavior-preserving.

**Architecture:** Extract the two canonical Set literals from `tools/lib/preintake-checks.js` into a new leaf module `tools/lib/handled-tags.js` (no imports → no cycle risk); `preintake-checks.js` re-exports them so its public surface is unchanged. The renderer's `LOUD_SEAM_IGNORE` becomes a documented derivation from `HANDLED_INLINE`; `ITEM_INLINE_OK` (already derived from `LOUD_SEAM_IGNORE`) is hoisted to module scope; both are exported for the drift-guard test. `cnxml-dom.js`'s `BLOCK_TAGS` is a genuinely different concept (traversal boundary) — it stays a literal but gains a documented relationship plus a `⊆ HANDLED_BLOCK` test assertion. A frozen-membership test proves every set's before/after membership is byte-identical, and an in-memory corpus render-hash sweep (main vs branch) proves 0 output changes.

**Tech Stack:** Node 22 ESM, Vitest, existing `renderCnxmlToHtml` in-memory render path.

**Spec:** `docs/superpowers/specs/2026-07-16-item8-boundary-checks-design.md` § D2.

## Global Constraints

- `npm test` from the **repo root** is the authoritative gate (no branch protection; local green is the only proof).
- Behavior-preserving refactor: **set membership before/after must be identical for every consumer** (spec §D2 verification). Any membership change — even one that "looks like a fix" (e.g. adding `space` to `LOUD_SEAM_IGNORE`) — is out of scope.
- No `books/` file changes. No re-extraction, re-MT, re-render delivery. No new dependencies.
- Vanilla JS ES modules; comments state constraints the code can't show, matching surrounding density.
- Do **not** force-merge purpose-specific subsets (`BLOCK_TAGS`, `ITEM_INLINE_OK`) into the canonical sets — they answer narrower questions (spec §D2 "Do not force-merge").
- Node 22: run `nvm use` before any `npm install` (never needed here — no deps change).
- Branch: `refactor/item8-d2-handled-tags` off `main`. Commit prefix convention: `refactor(item8/D2):` / `test(item8/D2):` / `docs(item8/D2):`.

## Scope note (finding from plan research, locked in)

The spec says "the extractor and renderer import the shared sets where they currently hardcode an equivalent list." Research finding: **the extractor (`cnxml-extract.js`) hardcodes no equivalent list** — its inline handling is per-tag regex conversions, not a classification Set. The only literal lists in the pipeline are:

| File | Set | Disposition |
|------|-----|-------------|
| `tools/lib/preintake-checks.js:10,28` | `HANDLED_INLINE`, `HANDLED_BLOCK` | canonical → move to `handled-tags.js`, re-export |
| `tools/cnxml-render.js:1084` | `LOUD_SEAM_IGNORE` | derive from `HANDLED_INLINE` (minus `space`, plus container metadata) |
| `tools/cnxml-render.js:1642` | `ITEM_INLINE_OK` | already derived from `LOUD_SEAM_IGNORE`; hoist to module scope, export |
| `tools/lib/cnxml-dom.js:21` | `BLOCK_TAGS` | different concept (traversal boundary); keep literal, document + `⊆ HANDLED_BLOCK` test |

So "extractor adoption" is satisfied vacuously and the probe's check 5 (unknown-inline detection) remains the extractor's drift detector. `FLATTENING_CONTAINERS` in `extraction-coverage.js` and MathML-internal sets in `math-label-inventory.js` answer unrelated questions — untouched.

**Membership facts the tests will freeze (verified against current source):**
- `HANDLED_INLINE` (9): emphasis, sub, sup, link, term, footnote, newline, space, math.
- `HANDLED_BLOCK` (28): para, figure, subfigure, media, image, list, item, table, tgroup, colspec, thead, tbody, row, entry, equation, note, example, exercise, problem, solution, commentary, section, title, caption, label, definition, meaning, glossary.
- `LOUD_SEAM_IGNORE` (12): title, label, caption, meta, newline, sub, sup, emphasis, term, link, math, footnote. Equals `HANDLED_INLINE − {space} ∪ {title, label, caption, meta}`. **`space` is genuinely absent today** — the derivation must preserve that.
- `ITEM_INLINE_OK` (16): `LOUD_SEAM_IGNORE ∪ {para, space, image, span}`.
- `BLOCK_TAGS` (7): list, equation, figure, table, note, media, para — all present in `HANDLED_BLOCK` (subset holds today).

---

### Task 0: Branch setup

**Files:** none (git only)

- [ ] **Step 1: Create the branch**

```bash
cd <repo>
git fetch origin
git checkout main && git pull --rebase
git checkout -b refactor/item8-d2-handled-tags
```

Expected: clean checkout, branch created from up-to-date `main`.

---

### Task 1: Canonical lib `handled-tags.js` + frozen-membership test

**Files:**
- Create: `tools/lib/handled-tags.js`
- Create: `tools/__tests__/handled-tags-shared.test.js` (first describe block; later tasks append)

**Interfaces:**
- Produces: `export const HANDLED_INLINE: Set<string>` and `export const HANDLED_BLOCK: Set<string>` from `tools/lib/handled-tags.js`. Tasks 2–4 import exactly these names.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/handled-tags-shared.test.js`:

```js
/**
 * handled-tags-shared.test.js — D2: one source of truth for inline/block tag
 * classification (item 8 PR2).
 *
 * Freezes the membership of the canonical HANDLED_INLINE / HANDLED_BLOCK sets
 * to the exact pre-refactor literals from preintake-checks.js, and (later
 * blocks) asserts each consumer's set is the same object, a documented
 * derivation, or a proven subset — so the probe, renderer, and DOM lib cannot
 * silently disagree on a tag's classification.
 */

import { describe, it, expect } from 'vitest';
import { HANDLED_INLINE, HANDLED_BLOCK } from '../lib/handled-tags.js';

const sorted = (s) => [...s].sort();

// Exact pre-refactor literals (tools/lib/preintake-checks.js @ a7e0c746).
const INLINE_LITERAL = [
  'emphasis',
  'sub',
  'sup',
  'link',
  'term',
  'footnote',
  'newline',
  'space',
  'math',
];
const BLOCK_LITERAL = [
  'para',
  'figure',
  'subfigure',
  'media',
  'image',
  'list',
  'item',
  'table',
  'tgroup',
  'colspec',
  'thead',
  'tbody',
  'row',
  'entry',
  'equation',
  'note',
  'example',
  'exercise',
  'problem',
  'solution',
  'commentary',
  'section',
  'title',
  'caption',
  'label',
  'definition',
  'meaning',
  'glossary',
];

describe('handled-tags — canonical sets match the pre-refactor literals', () => {
  it('HANDLED_INLINE membership is frozen (9 tags)', () => {
    expect(sorted(HANDLED_INLINE)).toEqual([...INLINE_LITERAL].sort());
  });

  it('HANDLED_BLOCK membership is frozen (28 tags)', () => {
    expect(sorted(HANDLED_BLOCK)).toEqual([...BLOCK_LITERAL].sort());
  });

  it('a tag is never both inline and block', () => {
    for (const t of HANDLED_INLINE) {
      expect(HANDLED_BLOCK.has(t), `'${t}' classified both inline and block`).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/handled-tags-shared.test.js`
Expected: FAIL — `Cannot find module '../lib/handled-tags.js'` (or equivalent resolve error).

- [ ] **Step 3: Create `tools/lib/handled-tags.js`**

Move the two literals verbatim from `preintake-checks.js` (do NOT edit `preintake-checks.js` yet — that's Task 2; the sets coexist for one commit):

```js
/**
 * handled-tags.js — canonical inline/block tag classification for the
 * CNXML pipeline (item 8 / D2).
 *
 * One source of truth: the pre-intake probe (preintake-checks.js) re-exports
 * these sets, and the renderer derives its seam sets from HANDLED_INLINE, so
 * the stages cannot silently disagree on whether a tag is inline or block —
 * the drift class behind past extract/render divergence.
 *
 * Purpose-specific subsets stay where they live (cnxml-dom BLOCK_TAGS =
 * "blocks preserved during para content replacement"; cnxml-render
 * ITEM_INLINE_OK = "tags allowed inline in a list item") — they answer
 * narrower questions and are drift-guarded against these sets by
 * tools/__tests__/handled-tags-shared.test.js.
 *
 * Leaf module by design: no imports, so any pipeline file can import it
 * without cycle risk.
 */

/** Inline tags the extractor converts to markers (everything else gets stripped). */
export const HANDLED_INLINE = new Set([
  'emphasis',
  'sub',
  'sup',
  'link',
  'term',
  'footnote',
  'newline',
  'space',
  'math', // <m:math> localName is 'math'
]);

/**
 * Block/structural tags the pipeline builds — these legitimately nest inside a
 * <para> in OpenStax CNXML (figures-in-para etc.) and are NOT stripped. The
 * probe's check 5 flags only elements that are neither handled-inline nor
 * handled-block, so a genuinely-unknown tag (e.g. <span>, <quote>) still
 * surfaces.
 */
export const HANDLED_BLOCK = new Set([
  'para',
  'figure',
  'subfigure',
  'media',
  'image',
  'list',
  'item',
  'table',
  'tgroup',
  'colspec',
  'thead',
  'tbody',
  'row',
  'entry',
  'equation',
  'note',
  'example',
  'exercise',
  'problem',
  'solution',
  'commentary',
  'section',
  'title',
  'caption',
  'label',
  'definition',
  'meaning',
  'glossary',
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/handled-tags-shared.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/handled-tags.js tools/__tests__/handled-tags-shared.test.js
git commit -m "feat(item8/D2): canonical handled-tags lib with frozen-membership test

New leaf module tools/lib/handled-tags.js holds the canonical
HANDLED_INLINE/HANDLED_BLOCK sets (moved verbatim from preintake-checks.js,
which still carries its own copy until the next commit). Test freezes
membership to the pre-refactor literals so consumer adoption in following
commits is provably behavior-preserving."
```

---

### Task 2: Probe adoption — `preintake-checks.js` re-exports the shared sets

**Files:**
- Modify: `tools/lib/preintake-checks.js:1-57` (header imports + delete the two literals)
- Modify: `tools/__tests__/handled-tags-shared.test.js` (append identity block)

**Interfaces:**
- Consumes: `HANDLED_INLINE`, `HANDLED_BLOCK` from `tools/lib/handled-tags.js` (Task 1).
- Produces: `preintake-checks.js` continues to export `HANDLED_INLINE`, `HANDLED_BLOCK` (now the same objects as the lib's) — its public surface is unchanged for `preintake-probe.js` and existing tests.

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/handled-tags-shared.test.js`:

```js
import {
  HANDLED_INLINE as PROBE_INLINE,
  HANDLED_BLOCK as PROBE_BLOCK,
} from '../lib/preintake-checks.js';

describe('preintake-checks re-exports the canonical sets', () => {
  it('HANDLED_INLINE is the same Set object (not a drifting copy)', () => {
    expect(PROBE_INLINE).toBe(HANDLED_INLINE);
  });

  it('HANDLED_BLOCK is the same Set object (not a drifting copy)', () => {
    expect(PROBE_BLOCK).toBe(HANDLED_BLOCK);
  });
});
```

(Place the `import` with the other imports at the top of the file; the `describe` after the existing one.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/handled-tags-shared.test.js`
Expected: FAIL on `toBe` — preintake-checks still defines its own Set literals (equal membership, different objects).

- [ ] **Step 3: Replace the literals with a re-export**

In `tools/lib/preintake-checks.js`, replace lines 6–57 (the two imports stay, the two Set literals and their doc comments go) so the file starts:

```js
import { DOMParser } from '@xmldom/xmldom';
import { SHARED_NOTE_LABELS } from './book-rendering-config.js';
import { HANDLED_INLINE, HANDLED_BLOCK } from './handled-tags.js';

// Canonical inline/block classification lives in handled-tags.js (item 8/D2:
// shared with the renderer so stages cannot drift). Re-exported to keep this
// module's public surface stable for existing consumers.
export { HANDLED_INLINE, HANDLED_BLOCK };
```

Everything from `/** Text containers whose direct element children are examined by check 5. */` (the `TEXT_CONTAINERS` export, line 59–60) onward is unchanged. `TEXT_CONTAINERS` stays here — it is probe-specific (which containers check 5 walks), not a tag classification.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tools/__tests__/handled-tags-shared.test.js tools/__tests__/preintake-checks.test.js`
Expected: PASS — the new identity assertions AND the probe's whole existing suite (proves the public surface didn't move).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/preintake-checks.js tools/__tests__/handled-tags-shared.test.js
git commit -m "refactor(item8/D2): preintake-checks re-exports canonical handled-tags sets

Same-object re-export (toBe-asserted), public surface unchanged; the probe's
existing suite passes untouched."
```

---

### Task 3: Renderer adoption — derive `LOUD_SEAM_IGNORE`, hoist + export `ITEM_INLINE_OK`

**Files:**
- Modify: `tools/cnxml-render.js:28` (add import), `:1079-1097` (derive `LOUD_SEAM_IGNORE`, add module-level `ITEM_INLINE_OK`), `:1642` (drop the function-local `ITEM_INLINE_OK`), `:3954-3976` (export both sets)
- Modify: `tools/__tests__/handled-tags-shared.test.js` (append renderer block)

**Interfaces:**
- Consumes: `HANDLED_INLINE` from `tools/lib/handled-tags.js`.
- Produces: `export { LOUD_SEAM_IGNORE, ITEM_INLINE_OK }` from `tools/cnxml-render.js` — Set<string> constants used only by the drift-guard test (runtime callers are internal).

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/handled-tags-shared.test.js`:

```js
import { LOUD_SEAM_IGNORE, ITEM_INLINE_OK } from '../cnxml-render.js';

describe('renderer seam sets derive from the canonical classification', () => {
  // Exact pre-refactor literal (tools/cnxml-render.js:1084 @ a7e0c746).
  const LOUD_SEAM_LITERAL = [
    'title',
    'label',
    'caption',
    'meta',
    'newline',
    'sub',
    'sup',
    'emphasis',
    'term',
    'link',
    'math',
    'footnote',
  ];

  it('LOUD_SEAM_IGNORE membership is frozen (12 tags)', () => {
    expect(sorted(LOUD_SEAM_IGNORE)).toEqual([...LOUD_SEAM_LITERAL].sort());
  });

  it('LOUD_SEAM_IGNORE = HANDLED_INLINE − {space} ∪ container metadata', () => {
    const derived = new Set(
      [...HANDLED_INLINE].filter((t) => t !== 'space').concat(['title', 'label', 'caption', 'meta'])
    );
    expect(sorted(LOUD_SEAM_IGNORE)).toEqual(sorted(derived));
  });

  it('ITEM_INLINE_OK = LOUD_SEAM_IGNORE ∪ {para, space, image, span} (frozen)', () => {
    const derived = new Set([...LOUD_SEAM_IGNORE, 'para', 'space', 'image', 'span']);
    expect(sorted(ITEM_INLINE_OK)).toEqual(sorted(derived));
    expect(ITEM_INLINE_OK.size).toBe(16);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/handled-tags-shared.test.js`
Expected: FAIL — `LOUD_SEAM_IGNORE`/`ITEM_INLINE_OK` are not exported from `cnxml-render.js` (undefined imports).

- [ ] **Step 3: Modify the renderer**

3a. Add the import after line 28 (`mathjax-render.js` import):

```js
import { HANDLED_INLINE } from './lib/handled-tags.js';
```

3b. Replace the `LOUD_SEAM_IGNORE` literal (current lines 1079–1097, comment included) with:

```js
// Tags that legitimately appear as element children inside a container but are
// handled outside the block seam (container metadata) or are inline content that
// flows within text — NOT silently-dropped block content. Excluded from the
// loud-seam record so the diagnostic carries signal (a real undispatched block
// like <equation>/<table>/<figure>) not noise.
//
// Derived from the canonical HANDLED_INLINE (tools/lib/handled-tags.js) so the
// probe and renderer cannot silently disagree on what counts as inline (D2).
// Deliberate deltas, membership frozen by handled-tags-shared.test.js:
//   − 'space': a bare <space/> at the block seam has always been recorded;
//     kept out to preserve behavior exactly.
//   + title/label/caption/meta: container metadata handled by each container's
//     own renderer, not the block dispatch.
const LOUD_SEAM_IGNORE = new Set(
  [...HANDLED_INLINE].filter((t) => t !== 'space').concat(['title', 'label', 'caption', 'meta'])
);

// Tags allowed to remain inline inside a <list><item> body after renderItemBody
// extracts its block children — a narrower question than HANDLED_INLINE, hence
// a deliberate superset of LOUD_SEAM_IGNORE, not a canonical classification.
const ITEM_INLINE_OK = new Set([...LOUD_SEAM_IGNORE, 'para', 'space', 'image', 'span']);
```

3c. In `renderItemBody` (current line 1642), delete the function-local line:

```js
    const ITEM_INLINE_OK = new Set([...LOUD_SEAM_IGNORE, 'para', 'space', 'image', 'span']);
```

(The following `while` loop now reads the module-level constant; no other edit in the function.)

3d. Add both names to the export block at the end of the file (current line 3954), after `_loadBookConfigForTest,`:

```js
  LOUD_SEAM_IGNORE,
  ITEM_INLINE_OK,
```

- [ ] **Step 4: Run tests to verify pass — new assertions AND the renderer's existing suites**

Run: `npx vitest run tools/__tests__/handled-tags-shared.test.js tools/__tests__/cnxml-render-loud-seam.test.js tools/__tests__/cnxml-render-item-blocks.test.js`
Expected: PASS — frozen membership holds and the loud-seam + item-body behavior tests (the two consumers of these sets) are unchanged.

- [ ] **Step 5: Run the full tools test project (broader blast-radius check for the renderer edit)**

Run: `npx vitest run tools/`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/handled-tags-shared.test.js
git commit -m "refactor(item8/D2): renderer seam sets derive from canonical HANDLED_INLINE

LOUD_SEAM_IGNORE = HANDLED_INLINE − {space} + container metadata (deltas
documented in place); ITEM_INLINE_OK hoisted to module scope (constant set,
was rebuilt per renderItemBody call). Both exported for the drift-guard test,
membership frozen to the pre-refactor literals — behavior-preserving."
```

---

### Task 4: `cnxml-dom.js` `BLOCK_TAGS` — document relationship + subset drift-guard

**Files:**
- Modify: `tools/lib/cnxml-dom.js:15-21` (comment only)
- Modify: `tools/__tests__/handled-tags-shared.test.js` (append subset block)

**Interfaces:**
- Consumes: `BLOCK_TAGS` (already exported from `cnxml-dom.js`), `HANDLED_BLOCK` from Task 1.
- Produces: nothing new — comment + test only. `BLOCK_TAGS` stays a literal (spec: do not force-merge purpose-specific subsets).

- [ ] **Step 1: Write the drift-guard test**

Append to `tools/__tests__/handled-tags-shared.test.js`:

```js
import { BLOCK_TAGS } from '../lib/cnxml-dom.js';

describe('cnxml-dom BLOCK_TAGS is a purpose-specific subset of HANDLED_BLOCK', () => {
  it('every traversal block tag is a canonically handled block tag', () => {
    for (const t of BLOCK_TAGS) {
      expect(HANDLED_BLOCK.has(t), `BLOCK_TAGS has '${t}' but HANDLED_BLOCK does not`).toBe(true);
    }
  });

  it('membership is frozen (7 tags — the para-replacement traversal boundary)', () => {
    expect(sorted(BLOCK_TAGS)).toEqual(
      ['equation', 'figure', 'list', 'media', 'note', 'para', 'table'].sort()
    );
  });
});
```

Note: this is a **characterization/drift-guard** test — it passes immediately (the subset relation already holds). Its value is failing loudly the day someone adds a tag to `BLOCK_TAGS` without classifying it canonically, or removes it from `HANDLED_BLOCK`. Run it red-first is not possible; instead verify it fails when sabotaged (Step 3).

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/handled-tags-shared.test.js`
Expected: PASS.

- [ ] **Step 3: Sabotage-check the guard (proves the test can fail)**

Temporarily add `'quote'` to `BLOCK_TAGS` in `tools/lib/cnxml-dom.js`, run the test file, confirm the subset assertion FAILS with the `'quote'` message; then revert the sabotage:

```bash
npx vitest run tools/__tests__/handled-tags-shared.test.js   # expect FAIL while sabotaged
git checkout -- tools/lib/cnxml-dom.js                        # revert sabotage
```

- [ ] **Step 4: Document the relationship in `cnxml-dom.js`**

Replace the comment block above `BLOCK_TAGS` (current lines 15–20) with:

```js
// Block-level CNXML elements that are preserved during para content replacement.
// Everything else (text nodes, emphasis, sub, sup, term, link, newline, space,
// m:math, footnote, etc.) is considered inline and gets replaced.
// Note: 'para' is included because CNXML allows nested paras — the extraction
// flattens them into sibling structure entries, so inner paras must be preserved
// as block children to be processed individually.
//
// D2: this is a deliberate, purpose-specific SUBSET of the canonical
// HANDLED_BLOCK (tools/lib/handled-tags.js) — it answers "which element
// children survive replaceParaContent", not "which tags does the pipeline
// handle". handled-tags-shared.test.js asserts BLOCK_TAGS ⊆ HANDLED_BLOCK so
// the two cannot silently disagree; grow it only with canonically-block tags.
```

- [ ] **Step 5: Run tests to verify still green**

Run: `npx vitest run tools/__tests__/handled-tags-shared.test.js tools/__tests__/cnxml-dom.test.js`
(If `cnxml-dom.test.js` doesn't exist under that exact name, run `npx vitest run tools/ -t cnxml-dom` or simply `npx vitest run tools/`.)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/lib/cnxml-dom.js tools/__tests__/handled-tags-shared.test.js
git commit -m "docs(item8/D2): BLOCK_TAGS documented as purpose-specific subset + drift guard

Subset relation (BLOCK_TAGS ⊆ HANDLED_BLOCK) test-enforced; literal kept —
traversal boundary is a narrower concept than pipeline-handled (spec: no
force-merge). Guard sabotage-verified red before landing."
```

---

### Task 5: Corpus render-equivalence proof (main vs branch, in-memory hash sweep)

**Files:**
- Create (scratchpad, NOT committed): `<scratchpad>/render-corpus-hash.mjs`
- No repo files change in this task; its deliverable is recorded evidence in the Task 6 PR body.

**Interfaces:**
- Consumes: `renderCnxmlToHtml`, `_loadBookConfigForTest` from `tools/cnxml-render.js`; `resetMathJaxIds` from `tools/lib/mathjax-render.js` (both trees).

**Why:** spec §D2 requires corpus render equivalence with 0 changes. The only runtime-adjacent edits are set constructions whose membership is test-frozen, so HTML must be byte-identical; this task proves it over every frozen chemistry module instead of asserting it. (Extract-side equivalence is proven by diff inspection in Step 4 — no extractor file is touched at all.)

- [ ] **Step 1: Write the harness**

Create `render-corpus-hash.mjs` in the session scratchpad directory:

```js
// render-corpus-hash.mjs <repoTree> <outFile>
// In-memory render-hash sweep: renders every 03-translated CNXML module of
// efnafraedi-2e via the tree's own renderCnxmlToHtml and writes
// "relpath sha256(html)" lines. Run against two trees; diff the outputs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [repo, outFile] = process.argv.slice(2).map((p) => path.resolve(p));
const { renderCnxmlToHtml, _loadBookConfigForTest } = await import(
  path.join(repo, 'tools/cnxml-render.js')
);
const { resetMathJaxIds } = await import(path.join(repo, 'tools/lib/mathjax-render.js'));

_loadBookConfigForTest('efnafraedi-2e');

const base = path.join(repo, 'books/efnafraedi-2e/03-translated');
const files = [];
for (const track of fs.readdirSync(base)) {
  const trackDir = path.join(base, track);
  if (!fs.statSync(trackDir).isDirectory()) continue;
  for (const ch of fs.readdirSync(trackDir)) {
    const chDir = path.join(trackDir, ch);
    if (!fs.statSync(chDir).isDirectory()) continue;
    for (const f of fs.readdirSync(chDir)) {
      if (f.endsWith('.cnxml')) files.push(path.join(trackDir, ch, f));
    }
  }
}
files.sort();

const lines = [];
for (const file of files) {
  const rel = path.relative(base, file);
  const chMatch = rel.match(/ch(\d+)/);
  resetMathJaxIds(); // MathJax ids are a per-process counter; reset for run-determinism
  let digest;
  try {
    const result = renderCnxmlToHtml(fs.readFileSync(file, 'utf8'), {
      lang: 'is',
      chapter: chMatch ? Number(chMatch[1]) : undefined,
      moduleId: path.basename(file, '.cnxml'),
      moduleSections: {},
    });
    digest = crypto.createHash('sha256').update(result.html || '').digest('hex');
  } catch (err) {
    digest = `ERROR:${String(err.message).slice(0, 120)}`; // identical error in both trees = still equivalent
  }
  lines.push(`${rel} ${digest}`);
}
fs.writeFileSync(outFile, lines.join('\n') + '\n');
console.log(`${files.length} modules hashed -> ${outFile}`);
```

- [ ] **Step 2: Run against the branch tree**

```bash
SCRATCH=<scratchpad directory from the session>
node "$SCRATCH/render-corpus-hash.mjs" <repo> "$SCRATCH/hashes-branch.txt"
```

Expected: `N modules hashed` (N ≈ 150+, every mt-preview/faithful module present on disk).

- [ ] **Step 3: Run against a pristine `main` worktree, then diff**

```bash
git -C <repo> worktree add "$SCRATCH/main-tree" main
node "$SCRATCH/render-corpus-hash.mjs" "$SCRATCH/main-tree" "$SCRATCH/hashes-main.txt"
diff "$SCRATCH/hashes-main.txt" "$SCRATCH/hashes-branch.txt" && echo "CORPUS EQUIVALENT"
git -C <repo> worktree remove "$SCRATCH/main-tree"
```

Expected: `diff` prints nothing; `CORPUS EQUIVALENT` echoes; worktree removed. **If any line differs, STOP** — the refactor changed rendering; find the membership/behavior leak before proceeding (do not rationalize a diff away).

- [ ] **Step 4: Extract-side equivalence by diff inspection**

```bash
git diff main --stat -- tools/cnxml-extract.js tools/lib/extraction-coverage.js tools/lib/seg-markers.cjs
git diff main -- tools/lib/cnxml-dom.js
```

Expected: first command prints nothing (files untouched); second shows a comment-only diff (no code lines). Record both facts for the PR body.

- [ ] **Step 5: Record the evidence**

No commit (nothing changed). Save the diff-run output + module count into the PR-body draft used in Task 6, e.g.:

> Corpus proof: in-memory render-hash sweep over all `books/efnafraedi-2e/03-translated` modules (N files), main vs branch: **0 diffs**. Extractor/injector untouched (`git diff main` empty for extract/coverage/seg-markers; cnxml-dom comment-only).

---

### Task 6: Full suite, register update, PR

**Files:**
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item 8 register: PR2/D2 shipped)

- [ ] **Step 1: Full authoritative gate**

Run from the **repo root**: `npm test`
Expected: entire Vitest suite green (~2659+ tests). If anything is red, fix before proceeding — no red merges.

- [ ] **Step 2: Update the campaign register**

In `docs/plans/2026-07-11-pre-semester-coding-campaign.md`, find item 8's register/status block and mark D2 (PR2) implemented: shared `tools/lib/handled-tags.js`; probe re-export; renderer derivation (`LOUD_SEAM_IGNORE`/`ITEM_INLINE_OK`); `BLOCK_TAGS` subset guard; corpus render-hash 0 diffs. Follow the exact register format used by items already marked shipped (match surrounding style; append, don't rewrite history lines).

- [ ] **Step 3: Commit the register update**

```bash
git add docs/plans/2026-07-11-pre-semester-coding-campaign.md
git commit -m "docs(item8/D2): mark D2 shared handled-tags refactor implemented in campaign register"
```

- [ ] **Step 4: Push and open the PR**

Use the superpowers:finishing-a-development-branch skill. PR title: `refactor(item8/D2): shared handled-tags classification (probe + renderer + dom drift guards)`. Body: spec link, the four-row disposition table from this plan's scope note, the Task 5 corpus evidence, and the note that the extractor holds no equivalent literal (adoption vacuous; probe check 5 remains its drift detector). Remember the push gotcha: `git fetch origin` before pushing if a `gh pr merge --delete-branch` happened earlier in the session.

- [ ] **Step 5: After merge — memory/register hygiene**

Update project memory (campaign resume pointer → next item: Phase-2 items 9 (D3 os-embed) / 10 (renderer bio-watch) / 11 (vefur embed CSS)).

---

## Self-review (performed at plan-writing time)

- **Spec coverage:** shared lib ✓ (Task 1); probe re-export keeping public surface ✓ (Task 2); renderer adoption where a literal existed ✓ (Task 3); no force-merge of `BLOCK_TAGS`/`ITEM_INLINE_OK`, documented relationships, cheap derivation where possible (`ITEM_INLINE_OK` stays derived; `BLOCK_TAGS` guarded not derived — hand-picked traversal subset is not cheaply derivable) ✓ (Tasks 3–4); focused set-equality tests ✓ (Tasks 1–4); corpus equivalence 0 diffs ✓ (Task 5); full suite ✓ (Task 6). Extractor adoption: vacuous — no literal exists; documented in scope note. Spec's suggested test filename `handled-tags-shared.test.js` used verbatim.
- **Placeholder scan:** every code step carries complete code; every command carries expected output. No TBDs.
- **Type consistency:** export names `HANDLED_INLINE`/`HANDLED_BLOCK` (Tasks 1–2), `LOUD_SEAM_IGNORE`/`ITEM_INLINE_OK` (Task 3), `BLOCK_TAGS` (existing) used identically across tasks. `sorted()` helper defined once in the test file (Task 1) and reused by later appended blocks — later blocks are appended to the SAME file, so the helper is in scope.
- **Behavior risks checked:** `space` exclusion from `LOUD_SEAM_IGNORE` preserved by derivation + frozen literal test; `ITEM_INLINE_OK` hoist is safe (constant set, no mutation anywhere — verified by reading both usage sites); `handled-tags.js` is import-free (no cycle: `cnxml-render.js` ← `handled-tags.js` and `preintake-checks.js` ← `handled-tags.js` are strictly acyclic); MathJax id counter reset per module for hash determinism.
