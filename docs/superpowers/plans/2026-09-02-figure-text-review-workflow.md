# Figure-Text Review Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an editor approve or correct the text inside machine-translated figures from inside the existing segment editor, and have a figure carry a publication state that behaves like the MT-preview / Edited distinction already applied to text.

**Architecture:** Workflow state (who reviewed, flags, notes) lives in `sessions.db`. Content (the approved Icelandic per block) lives in a **committed per-figure JSON sidecar** under `books/<slug>/figure-text/`, mirroring how `applyApprovedEdits()` writes segment approvals out to `03-faithful-translation/`. The sidecar is the only thing `tools/` reads, which keeps MIT tooling away from the AGPL server and lets the CLI work with no server running. Regeneration of the actual image is a manual CLI step; the editor never triggers a render.

**Tech Stack:** Node 22 (ESM in `tools/`, CommonJS in `server/`), better-sqlite3, Vitest, Express. The image composer is Python (pikepdf + pycairo + fontTools) and stays a **dev-only** tool — nothing in this plan adds a runtime to production.

**Spec:** [docs/superpowers/specs/2026-09-02-figure-text-review-workflow-design.md](../specs/2026-09-02-figure-text-review-workflow-design.md)

## Global Constraints

- **Module systems:** root `package.json` is `"type": "module"`; `server/package.json` is `"type": "commonjs"`. A module consumed by **both** trees must be `.cjs` — that is the only legitimate reason to use `.cjs` here.
- **Vitest cannot be `require`d.** Test files use `import` for vitest and `createRequire(import.meta.url)` for server modules. Copy the header from `server/__tests__/importConcepts.test.js`.
- **Never resolve paths against `process.cwd()`.** Use `import.meta.url` / `__dirname`. The server runs with `cwd=server/`.
- **A migration must never throw.** `migrationRunner` calls every `up()` on every server start and `failLoudOnMigrationErrors` exits 1 on a collected error — one bad row means the server never boots again. `up()` must be nothing but a `try/catch` boundary around a separate `migrate(db)` function. Worked example: `server/migrations/048-book-term-preference.js`.
- **`INSERT OR IGNORE` does not suppress FOREIGN KEY violations.** `PRAGMA foreign_keys` is ON in this build.
- **No new `tools/` → `server/` import.** Root `LICENSE` owns that enumeration; `tools/` is MIT and `server/` is AGPL-3.0.
- **Run `npm test` from the repo root.** The branch carries known-failing tests unrelated to this work; compare against the baseline before and after, do not assume a red file is yours.
- **Assert non-emptiness before asserting over a set.** A test that iterates an empty set passes for the wrong reason.
- **Nothing in this plan writes to `books/*/01-source/`** — READ-ONLY, licence-load-bearing.

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/lib/figure-text-sidecar.cjs` | **Create.** The sidecar format: path, read, atomic write, render hash, effective state. Dual-consumer, hence `.cjs`. |
| `tools/__tests__/figure-text-sidecar.test.js` | **Create.** Unit tests for the above. |
| `experiments/figure-text-translation/compose.py` | **Modify.** Accept `--sidecar`, wrap a single string per block. |
| `tools/cnxml-render.js` | **Modify** (~line 1085–1100). Emit `data-figure-review` on `<figure>`. |
| `tools/__tests__/figure-review-attribute.test.js` | **Create.** Both directions of the render contract. |
| `server/migrations/050-figure-review.js` | **Create.** Two tables, never-throw `up()`. |
| `server/__tests__/figureReviewMigration.test.js` | **Create.** Schema + FK behaviour. |
| `server/services/figureReviewService.js` | **Create.** State transitions, block edits, staleness, sidecar write. |
| `server/__tests__/figureReviewService.test.js` | **Create.** Service behaviour incl. the stale-on-edit rule. |
| `server/routes/segment-editor.js` | **Modify.** Three endpoints under the existing module scope. Thin — all shaping lives in the service. |
| `server/__tests__/figureReviewRoutes.test.js` | **Create.** Payload shape (imported from the service, not the router). |
| `server/public/js/segment-editor.js` | **Modify.** Render the figure card. |
| `tools/lib/figure-consistency.cjs` | **Create.** Caption/alt cross-check and decimal-separator check. Pure functions. |
| `tools/__tests__/figure-consistency.test.js` | **Create.** Unit tests. |

Tasks 1–3 deliver working software with **no database and no editor**: a developer can correct a figure's text in a JSON file, regenerate, and see the badge. That is a legitimate stopping point if priorities change.

---

### Task 1: The sidecar format

**Files:**
- Create: `tools/lib/figure-text-sidecar.cjs`
- Test: `tools/__tests__/figure-text-sidecar.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `sidecarPath(bookDir, basename) -> string`  (bookDir is `books/<slug>`)
  - `readSidecar(bookDir, basename) -> object|null`
  - `writeSidecar(bookDir, basename, data) -> void`
  - `computeRenderHash(blocks, composerVersion) -> string` (16 hex chars)
  - `effectiveState(sidecar, currentBlocks, composerVersion) -> 'mt-preview'|'approved'|'flagged'`
  - `SIDECAR_VERSION = 1`, `COMPOSER_VERSION = '1'`

Sidecar shape, written by the server and read by both the composer and the renderer:

```json
{
  "version": 1,
  "basename": "CNX_Chem_01_06_TempScales",
  "state": "approved",
  "renderHash": "3f2a1c9d4b6e8071",
  "composerVersion": "1",
  "blocks": {
    "Boiling|point|of water": "Suðumark vatns",
    "373.15 K": "373,15 K"
  }
}
```

Block values are **plain strings**, never arrays. The MT returns one string per block and the composer wraps it (Task 2). Storing pre-split lines is what let a wrap bug hide during the placeholder era.

- [ ] **Step 1: Write the failing test**

```js
// tools/__tests__/figure-text-sidecar.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const {
  sidecarPath, readSidecar, writeSidecar,
  computeRenderHash, effectiveState, SIDECAR_VERSION, COMPOSER_VERSION,
} = require('../lib/figure-text-sidecar.cjs');

let bookDir;
beforeEach(() => {
  bookDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'figtext-')), 'efnafraedi-2e');
  fs.mkdirSync(bookDir, { recursive: true });
});
afterEach(() => fs.rmSync(path.dirname(bookDir), { recursive: true, force: true }));

const BLOCKS = { 'Boiling|point|of water': 'Suðumark vatns', 'Celsius': 'Celsíus' };

describe('sidecarPath', () => {
  it('is per-figure under the book, not under 01-source', () => {
    const p = sidecarPath(bookDir, 'CNX_Chem_01_06_TempScales');
    expect(p).toContain(path.join('efnafraedi-2e', 'figure-text'));
    expect(p.endsWith('CNX_Chem_01_06_TempScales.is.json')).toBe(true);
    expect(p).not.toContain('01-source');
  });
});

describe('readSidecar', () => {
  it('returns null when the figure has none', () => {
    expect(readSidecar(bookDir, 'CNX_Nope')).toBeNull();
  });
  it('round-trips what writeSidecar wrote', () => {
    writeSidecar(bookDir, 'CNX_A', {
      version: SIDECAR_VERSION, basename: 'CNX_A', state: 'approved',
      renderHash: 'x', composerVersion: COMPOSER_VERSION, blocks: BLOCKS,
    });
    const got = readSidecar(bookDir, 'CNX_A');
    expect(got.blocks).toEqual(BLOCKS);
    expect(got.state).toBe('approved');
  });
  it('returns null rather than throwing on malformed JSON', () => {
    const p = sidecarPath(bookDir, 'CNX_Bad');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '{ not json');
    expect(readSidecar(bookDir, 'CNX_Bad')).toBeNull();
  });
});

describe('computeRenderHash', () => {
  it('is stable across key order', () => {
    const a = computeRenderHash({ x: '1', y: '2' }, '1');
    const b = computeRenderHash({ y: '2', x: '1' }, '1');
    expect(a).toBe(b);
  });
  it('changes when any block text changes', () => {
    const a = computeRenderHash(BLOCKS, '1');
    const b = computeRenderHash({ ...BLOCKS, Celsius: 'Selsíus' }, '1');
    expect(b).not.toBe(a);
  });
  it('changes when the composer version changes', () => {
    expect(computeRenderHash(BLOCKS, '2')).not.toBe(computeRenderHash(BLOCKS, '1'));
  });
});

describe('effectiveState', () => {
  it('is mt-preview when there is no sidecar at all', () => {
    expect(effectiveState(null, BLOCKS, '1')).toBe('mt-preview');
  });
  it('is approved when the hash still matches', () => {
    const s = { state: 'approved', renderHash: computeRenderHash(BLOCKS, '1') };
    expect(effectiveState(s, BLOCKS, '1')).toBe('approved');
  });
  it('DEGRADES to mt-preview when the blocks have changed since approval', () => {
    const s = { state: 'approved', renderHash: computeRenderHash(BLOCKS, '1') };
    const edited = { ...BLOCKS, Celsius: 'Selsíus' };
    expect(effectiveState(s, edited, '1')).toBe('mt-preview');
  });
  it('keeps a flag visible even when the hash matches', () => {
    const s = { state: 'flagged', renderHash: computeRenderHash(BLOCKS, '1') };
    expect(effectiveState(s, BLOCKS, '1')).toBe('flagged');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/figure-text-sidecar.test.js`
Expected: FAIL — `Cannot find module '../lib/figure-text-sidecar.cjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// tools/lib/figure-text-sidecar.cjs
/**
 * The figure-text sidecar: the COMMITTED record of a translated figure's
 * Icelandic text and its review state.
 *
 * ⚠️ .cjs on purpose. Both trees consume this: `tools/` is ESM and `server/` is
 * CommonJS. That dual-consumer requirement is the only legitimate reason to
 * reach for .cjs in this repo.
 *
 * ⚠️ This file is why `tools/cnxml-render.js` needs no database access. Review
 * state reaches the renderer through a committed file, so no MIT -> AGPL import
 * edge is created (root LICENSE, known gap E-2) and the CLI works on a fresh
 * clone with no server running.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SIDECAR_VERSION = 1;

/**
 * Bump when a composer change alters pixels for unchanged text. Doing so
 * invalidates every stored renderHash, which correctly sends every approved
 * figure back to mt-preview until re-reviewed.
 */
const COMPOSER_VERSION = '1';

/**
 * @param {string} bookDir  the BOOK directory, i.e. `books/<slug>` — NOT the books
 *   root. cnxml-render.js's BOOKS_DIR is already `books/<slug>`, so a (root, slug)
 *   signature made its only caller wrong by construction.
 */
function sidecarPath(bookDir, basename) {
  return path.join(bookDir, 'figure-text', `${basename}.is.json`);
}

function readSidecar(bookDir, basename) {
  try {
    const raw = fs.readFileSync(sidecarPath(bookDir, basename), 'utf-8');
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    return obj;
  } catch {
    // Absent or malformed. A missing sidecar is the normal case for an
    // untranslated figure; returning null rather than throwing keeps a render
    // of the whole chapter from dying on one bad file.
    return null;
  }
}

function writeSidecar(bookDir, basename, data) {
  const p = sidecarPath(bookDir, basename);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 1)}\n`, 'utf-8');
  fs.renameSync(tmp, p); // atomic: a crash mid-write must not leave a half file
}

function computeRenderHash(blocks, composerVersion) {
  const h = crypto.createHash('sha256');
  h.update(String(composerVersion));
  for (const k of Object.keys(blocks).sort()) {
    h.update('\0'); // separator that cannot appear in a block key
    h.update(k);
    h.update('\0');
    h.update(String(blocks[k]));
  }
  return h.digest('hex').slice(0, 16);
}

function effectiveState(sidecar, currentBlocks, composerVersion) {
  if (!sidecar || !sidecar.state) return 'mt-preview';
  if (sidecar.state === 'flagged') return 'flagged';
  if (sidecar.state !== 'approved') return 'mt-preview';
  const now = computeRenderHash(currentBlocks, composerVersion);
  return now === sidecar.renderHash ? 'approved' : 'mt-preview';
}

module.exports = {
  SIDECAR_VERSION, COMPOSER_VERSION,
  sidecarPath, readSidecar, writeSidecar, computeRenderHash, effectiveState,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/figure-text-sidecar.test.js`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add tools/lib/figure-text-sidecar.cjs tools/__tests__/figure-text-sidecar.test.js
git commit -m "feat(figure-text): sidecar format — committed content, derived staleness"
```

---

### Task 2: The composer accepts a sidecar's string block values

**Files:**
- Modify: `experiments/figure-text-translation/figtext.py`
- Modify: `experiments/figure-text-translation/compose.py`
- Test: `experiments/figure-text-translation/test_figtext_normalise.py`

**Interfaces:**
- Consumes: the sidecar shape from Task 1 — `blocks` maps a block key to ONE STRING.
- Produces: `figtext.normalise_block_value(value, arc) -> str | list[str]`

⚠️ **Why this is a pure function and not two inline lines in `compose.py`:** `compose.py`
loads `out/meta.json`, `out/runs.json` and `out/artwork.png` at import time. Those are
generated by earlier pipeline stages from a PDF that lives outside the repo, so a test that
shells out to `compose.py` cannot run in a clean checkout — it would fail for environmental
reasons indistinguishable from a code fault. `figtext.py` imports only `math` and `json`, so
a test against it needs no pikepdf, no cairo, no artifacts and no PDF.

- [ ] **Step 1: Write the failing test**

```python
# experiments/figure-text-translation/test_figtext_normalise.py
"""A sidecar stores ONE STRING per block. The composer must not iterate it per character."""
import sys
from figtext import normalise_block_value

fails = []
def check(label, got, want):
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {label}: {got!r}")
    if not ok:
        fails.append(label)

# A non-arc block: one string becomes a ONE-ELEMENT list of lines, never a list of chars.
check('str -> single line', normalise_block_value('Sudumark vatns', False), ['Sudumark vatns'])
check('str is not exploded', len(normalise_block_value('abc', False)), 1)

# Backward compatibility: the placeholder files stored pre-split lines.
check('list passes through', normalise_block_value(['a', 'b'], False), ['a', 'b'])

# An arc block is laid out per glyph, so it stays a string.
check('arc stays a string', normalise_block_value('Naest ...', True), 'Naest ...')

# CONTROL: the two branches must actually differ, or this test proves nothing.
check('arc and non-arc differ',
      normalise_block_value('x', True) != normalise_block_value('x', False), True)

print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED')
sys.exit(1 if fails else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd experiments/figure-text-translation && python3 test_figtext_normalise.py`
Expected: FAIL — `ImportError: cannot import name 'normalise_block_value'`

- [ ] **Step 3: Write minimal implementation**

Append to `experiments/figure-text-translation/figtext.py`:

```python
def normalise_block_value(value, arc):
    """A sidecar block value is ONE STRING; the composer wraps it itself.

    Accepts a list for backward compatibility with the placeholder translation
    files, but never requires one. Pre-split lines are exactly what let a wrap
    defect hide during the placeholder era: the composer was always handed line
    breaks somebody else had already decided, so the one thing the real MT does
    differently was the one thing never exercised.

    An ARC block is laid out glyph by glyph along a fitted circle, so it stays a
    single string; a non-arc block becomes a list of lines.
    """
    if arc:
        return value if isinstance(value, str) else ''.join(value)
    return [value] if isinstance(value, str) else list(value)
```

Then in `compose.py`, replace the existing `new = TR[key]` / `new = IS_BLOCK[key]` handling so
both branches route through it:

```python
        else:
            new = FT.normalise_block_value(TR[key], arc)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd experiments/figure-text-translation && python3 test_figtext_normalise.py`
Expected: `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add experiments/figure-text-translation/figtext.py \
        experiments/figure-text-translation/compose.py \
        experiments/figure-text-translation/test_figtext_normalise.py
git commit -m "feat(figure-text): composer accepts a sidecar's string block values"
```

---

### Task 3: The render contract

**Files:**
- Modify: `tools/cnxml-render.js` (the `<figure>` emit, ~line 1085–1100)
- Test: `tools/__tests__/figure-review-attribute.test.js`

**Interfaces:**
- Consumes: `readSidecar`, `effectiveState`, `COMPOSER_VERSION` from Task 1.
- Produces: `<figure data-figure-review="mt-preview|approved|flagged">` in published HTML.

- [ ] **Step 1: Write the failing test**

```js
// tools/__tests__/figure-review-attribute.test.js
import { describe, it, expect } from 'vitest';
import { figureReviewAttr } from '../cnxml-render.js';

// BOTH DIRECTIONS. A contract test that only checks the attribute APPEARS
// passes just as well against code that emits it unconditionally.
describe('figureReviewAttr', () => {
  it('emits nothing when the figure is approved (no badge for finished work)', () => {
    expect(figureReviewAttr('approved')).toBe('');
  });
  it('emits the attribute when the figure is still mt-preview', () => {
    expect(figureReviewAttr('mt-preview')).toBe(' data-figure-review="mt-preview"');
  });
  it('emits the attribute when the figure is flagged', () => {
    expect(figureReviewAttr('flagged')).toBe(' data-figure-review="flagged"');
  });
  it('emits nothing for an unknown state rather than inventing markup', () => {
    expect(figureReviewAttr('nonsense')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/figure-review-attribute.test.js`
Expected: FAIL — `figureReviewAttr is not a function`

- [ ] **Step 3: Write minimal implementation**

In `tools/cnxml-render.js`, near `normalizeImageSrc`:

```js
const EMITTED_REVIEW_STATES = new Set(['mt-preview', 'flagged']);

/**
 * Attribute marking a figure whose Icelandic text is not yet approved.
 *
 * Only the states a READER needs warning about are emitted. 'approved' emits
 * nothing: a badge on finished work is noise, and an absent attribute is the
 * correct default for the ~1,100 figures that have no sidecar at all.
 *
 * @param {string} state - from effectiveState()
 * @returns {string} '' or ' data-figure-review="..."'
 */
function figureReviewAttr(state) {
  return EMITTED_REVIEW_STATES.has(state) ? ` data-figure-review="${state}"` : '';
}
```

⚠️ **`tools/cnxml-render.js` has NO inline `export` keywords — it uses ONE
`export { … }` block near line 4242.** Add `figureReviewAttr,` to that block; do
not write `export function`, which would be the file's only inline export.

Then at the `<figure>` emit, derive the state from the sidecar and the figure's basename:

```js
  const figBasename = path.basename(src, path.extname(src));
  // BOOKS_DIR is already `books/<slug>` — there is no books-root variable in this
  // file, and inventing one was a defect in an earlier draft of this plan.
  const sidecar = readSidecar(BOOKS_DIR, figBasename);
  const reviewAttr = figureReviewAttr(
    effectiveState(sidecar, (sidecar && sidecar.blocks) || {}, COMPOSER_VERSION)
  );
```

and include `${reviewAttr}` in the opening `<figure` tag.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/figure-review-attribute.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/figure-review-attribute.test.js
git commit -m "feat(figure-text): render emits data-figure-review from the sidecar"
```

---

### Task 4: Migration 050

**Files:**
- Create: `server/migrations/050-figure-review.js`
- Test: `server/__tests__/figureReviewMigration.test.js`

**Interfaces:**
- Consumes: `registered_books(id)`.
- Produces: tables `figure_review`, `figure_block_edit`.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/figureReviewMigration.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');

let db;
beforeEach(() => { ({ db } = freshMigratedDb()); });
afterEach(() => db.close());

const bookId = () =>
  db.prepare(
    `INSERT INTO registered_books (slug, title_is, registered_by) VALUES (?,?,?) RETURNING id`
  ).get(`b-${Math.random()}`, 'T', 'tester').id;

describe('050 figure_review', () => {
  it('creates both tables', () => {
    const names = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('figure_review','figure_block_edit')`
    ).all().map((r) => r.name).sort();
    expect(names).toEqual(['figure_block_edit', 'figure_review']);
  });

  it('defaults a new figure to mt-preview', () => {
    const b = bookId();
    db.prepare(
      `INSERT INTO figure_review (book_id, chapter, module_id, basename) VALUES (?,?,?,?)`
    ).run(b, 1, 'm68683', 'CNX_A');
    expect(db.prepare(`SELECT state FROM figure_review WHERE basename='CNX_A'`).get().state)
      .toBe('mt-preview');
  });

  it('cascades both tables when a book is deleted', () => {
    const b = bookId();
    db.prepare(`INSERT INTO figure_review (book_id, chapter, module_id, basename) VALUES (?,?,?,?)`)
      .run(b, 1, 'm1', 'CNX_B');
    db.prepare(`INSERT INTO figure_block_edit (book_id, basename, block_key, is_text) VALUES (?,?,?,?)`)
      .run(b, 'CNX_B', 'Celsius', 'Celsíus');
    // non-vacuity: the rows must exist before we prove they go away
    expect(db.prepare(`SELECT COUNT(*) c FROM figure_review`).get().c).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) c FROM figure_block_edit`).get().c).toBe(1);
    db.prepare(`DELETE FROM registered_books WHERE id=?`).run(b);
    expect(db.prepare(`SELECT COUNT(*) c FROM figure_review`).get().c).toBe(0);
    expect(db.prepare(`SELECT COUNT(*) c FROM figure_block_edit`).get().c).toBe(0);
  });

  it('rejects a row for a book that does not exist', () => {
    expect(() =>
      db.prepare(`INSERT INTO figure_review (book_id, chapter, module_id, basename) VALUES (?,?,?,?)`)
        .run(999999, 1, 'm1', 'CNX_C')
    ).toThrow(/FOREIGN KEY/);
  });

  it('is idempotent — running up() twice does not throw', () => {
    const m = require('../migrations/050-figure-review.js');
    expect(() => { m.up(db); m.up(db); }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/figureReviewMigration.test.js`
Expected: FAIL — tables absent

- [ ] **Step 3: Write minimal implementation**

```js
// server/migrations/050-figure-review.js
/**
 * Migration 050: figure-text review state.
 *
 * WHY: a machine-translated FIGURE needs the same MT-preview -> Edited lifecycle
 * the text already has, but it cannot share the segment tables — figure text is
 * not in the CNXML at all; it lives inside a licensed PDF and is re-composed
 * into an image.
 *
 * ⚠️ WORKFLOW STATE ONLY. The editorial CONTENT lives in a committed sidecar at
 * books/<slug>/figure-text/<basename>.is.json, because sessions.db is gitignored
 * and covered only by the off-box backup. Same split as
 * applyApprovedEdits() -> 03-faithful-translation/.
 *
 * ⚠️ block_key is CONTENT-ADDRESSED ("Boiling|point|of water"), never positional.
 * Re-extraction renumbers positional auto-N ids, which would silently rebind an
 * editor's correction to a DIFFERENT label. Content addressing orphans the edit
 * instead, which is correct — changed English deserves a fresh look — and the
 * CLI names orphans rather than dropping them.
 */

/**
 * The whole migration. Separated from up() so that up() is nothing but the
 * never-throw boundary and no future edit can land outside it.
 */
function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS figure_review (
      book_id     INTEGER NOT NULL REFERENCES registered_books(id) ON DELETE CASCADE,
      chapter     INTEGER NOT NULL,
      module_id   TEXT    NOT NULL,
      basename    TEXT    NOT NULL,
      state       TEXT    NOT NULL DEFAULT 'mt-preview'
                  CHECK (state IN ('mt-preview','approved','flagged')),
      render_hash TEXT,
      flag_kind   TEXT CHECK (flag_kind IS NULL OR
                              flag_kind IN ('text','terminology','layout','other')),
      note        TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      PRIMARY KEY (book_id, basename)
    );
    CREATE INDEX IF NOT EXISTS idx_figure_review_module
      ON figure_review (book_id, chapter, module_id);

    CREATE TABLE IF NOT EXISTS figure_block_edit (
      book_id   INTEGER NOT NULL REFERENCES registered_books(id) ON DELETE CASCADE,
      basename  TEXT NOT NULL,
      block_key TEXT NOT NULL,
      is_text   TEXT NOT NULL,
      edited_by TEXT,
      edited_at TEXT,
      PRIMARY KEY (book_id, basename, block_key)
    );
  `);
}

module.exports = {
  // ⚠️ Shape verified against 049: `name` is the FULL filename stem and there is
  // no `version` field. Do not invent one.
  name: '050-figure-review',

  /** ⚠️ The never-throw boundary, and it is the whole of `up()` on purpose. */
  up(db) {
    try {
      migrate(db);
    } catch (err) {
      console.warn(
        `[050] MIGRATION COULD NOT COMPLETE — ${err.code || err.name}: ${err.message}. ` +
          'NOTHING WAS LOST: this migration only CREATEs tables, so a failure leaves the ' +
          'database exactly as it was and no figure review data can exist yet to lose. ' +
          'Figure review will be unavailable until this is fixed; every other feature is ' +
          'unaffected. It re-attempts on the next server start and keeps reporting until ' +
          'fixed. NOT THROWN ON PURPOSE: throwing here would stop this server booting.'
      );
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/figureReviewMigration.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add server/migrations/050-figure-review.js server/__tests__/figureReviewMigration.test.js
git commit -m "feat(figure-text): migration 050 — figure review workflow state"
```

---

### Task 5: figureReviewService

**Files:**
- Create: `server/services/figureReviewService.js`
- Test: `server/__tests__/figureReviewService.test.js`

**Interfaces:**
- Consumes: tables from Task 4; `computeRenderHash`, `effectiveState`, `COMPOSER_VERSION`, `writeSidecar` from Task 1.
- Produces:
  - `getFigure(db, bookId, basename) -> {state, renderHash, flagKind, note, blocks}|null`
  - `saveBlockEdit(db, {bookId, basename, blockKey, isText, editedBy}) -> void`
  - `setState(db, {bookId, basename, state, flagKind, note, reviewedBy, blocks}) -> void`
  - `applyApprovedFigureEdits(db, {bookDir, bookId, basename, mtBlocks}) -> {written, path}`

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/figureReviewService.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const svc = require('../services/figureReviewService');
const { readSidecar, effectiveState, COMPOSER_VERSION } =
  require('../../tools/lib/figure-text-sidecar.cjs');

let db, bookId, bookDir;
const MT = { Celsius: 'Selsíus', 'Boiling|point|of water': 'Suðumark vatns' };

beforeEach(() => {
  ({ db } = freshMigratedDb());
  bookId = db.prepare(
    `INSERT INTO registered_books (slug, title_is, registered_by) VALUES (?,?,?) RETURNING id`
  ).get('efnafraedi-2e', 'Efnafræði', 't').id;
  db.prepare(`INSERT INTO figure_review (book_id, chapter, module_id, basename) VALUES (?,?,?,?)`)
    .run(bookId, 1, 'm68683', 'CNX_T');
  bookDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'figsvc-')), 'efnafraedi-2e');
  fs.mkdirSync(bookDir, { recursive: true });
});
afterEach(() => { db.close(); fs.rmSync(path.dirname(bookDir), { recursive: true, force: true }); });

describe('saveBlockEdit', () => {
  it('overlays the editor text on the MT text', () => {
    svc.saveBlockEdit(db, { bookId, basename: 'CNX_T', blockKey: 'Celsius',
                            isText: 'Celsíus', editedBy: 'ed' });
    const f = svc.getFigure(db, bookId, 'CNX_T', MT);
    expect(f.blocks.Celsius).toBe('Celsíus');
    expect(f.blocks['Boiling|point|of water']).toBe('Suðumark vatns'); // untouched MT survives
  });
});

describe('approval and staleness', () => {
  it('an approved figure reports approved', () => {
    svc.setState(db, { bookId, basename: 'CNX_T', state: 'approved',
                       reviewedBy: 'ed', blocks: MT });
    expect(svc.getFigure(db, bookId, 'CNX_T', MT).effectiveState).toBe('approved');
  });

  it('EDITING AFTER APPROVAL sends the figure back to mt-preview', () => {
    svc.setState(db, { bookId, basename: 'CNX_T', state: 'approved',
                       reviewedBy: 'ed', blocks: MT });
    expect(svc.getFigure(db, bookId, 'CNX_T', MT).effectiveState).toBe('approved'); // control
    svc.saveBlockEdit(db, { bookId, basename: 'CNX_T', blockKey: 'Celsius',
                            isText: 'Celsíus', editedBy: 'ed' });
    expect(svc.getFigure(db, bookId, 'CNX_T', MT).effectiveState).toBe('mt-preview');
  });

  it('re-approving after the edit restores approved', () => {
    svc.saveBlockEdit(db, { bookId, basename: 'CNX_T', blockKey: 'Celsius',
                            isText: 'Celsíus', editedBy: 'ed' });
    const blocks = svc.getFigure(db, bookId, 'CNX_T', MT).blocks;
    svc.setState(db, { bookId, basename: 'CNX_T', state: 'approved',
                       reviewedBy: 'ed', blocks });
    expect(svc.getFigure(db, bookId, 'CNX_T', MT).effectiveState).toBe('approved');
  });
});

describe('applyApprovedFigureEdits', () => {
  it('writes a committed sidecar the renderer can read', () => {
    svc.saveBlockEdit(db, { bookId, basename: 'CNX_T', blockKey: 'Celsius',
                            isText: 'Celsíus', editedBy: 'ed' });
    const blocks = svc.getFigure(db, bookId, 'CNX_T', MT).blocks;
    svc.setState(db, { bookId, basename: 'CNX_T', state: 'approved',
                       reviewedBy: 'ed', blocks });
    const { written } = svc.applyApprovedFigureEdits(db, {
      bookDir, bookId, basename: 'CNX_T', mtBlocks: MT,
    });
    expect(written).toBe(true);
    const side = readSidecar(bookDir, 'CNX_T');
    expect(side.blocks.Celsius).toBe('Celsíus');
    expect(effectiveState(side, side.blocks, COMPOSER_VERSION)).toBe('approved');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/figureReviewService.test.js`
Expected: FAIL — `Cannot find module '../services/figureReviewService'`

- [ ] **Step 3: Write minimal implementation**

```js
// server/services/figureReviewService.js
/**
 * Figure-text review: workflow state in the DB, content in a committed sidecar.
 *
 * ⚠️ Staleness is DERIVED, never stored. An approved figure whose blocks have
 * since changed reports mt-preview automatically — there is no second row to
 * keep in sync and nothing to remember to clear.
 */
const path = require('path');
const {
  computeRenderHash, effectiveState, writeSidecar, sidecarPath,
  SIDECAR_VERSION, COMPOSER_VERSION,
} = require(path.join(__dirname, '..', '..', 'tools', 'lib', 'figure-text-sidecar.cjs'));

/** MT text overlaid with any editor corrections. Editor wins. */
function resolveBlocks(db, bookId, basename, mtBlocks) {
  const blocks = { ...mtBlocks };
  const rows = db.prepare(
    `SELECT block_key, is_text FROM figure_block_edit WHERE book_id=? AND basename=?`
  ).all(bookId, basename);
  for (const r of rows) blocks[r.block_key] = r.is_text;
  return blocks;
}

function getFigure(db, bookId, basename, mtBlocks = {}) {
  const row = db.prepare(
    `SELECT state, render_hash, flag_kind, note, reviewed_by, reviewed_at
       FROM figure_review WHERE book_id=? AND basename=?`
  ).get(bookId, basename);
  if (!row) return null;
  const blocks = resolveBlocks(db, bookId, basename, mtBlocks);
  return {
    state: row.state,
    renderHash: row.render_hash,
    flagKind: row.flag_kind,
    note: row.note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    blocks,
    effectiveState: effectiveState(
      { state: row.state, renderHash: row.render_hash }, blocks, COMPOSER_VERSION
    ),
  };
}

function saveBlockEdit(db, { bookId, basename, blockKey, isText, editedBy }) {
  db.prepare(
    `INSERT INTO figure_block_edit (book_id, basename, block_key, is_text, edited_by, edited_at)
     VALUES (?,?,?,?,?,datetime('now'))
     ON CONFLICT(book_id, basename, block_key)
     DO UPDATE SET is_text=excluded.is_text, edited_by=excluded.edited_by,
                   edited_at=excluded.edited_at`
  ).run(bookId, basename, blockKey, isText, editedBy || null);
}

function setState(db, { bookId, basename, state, flagKind, note, reviewedBy, blocks }) {
  const hash = state === 'approved' ? computeRenderHash(blocks || {}, COMPOSER_VERSION) : null;
  db.prepare(
    `UPDATE figure_review
        SET state=?, render_hash=?, flag_kind=?, note=?, reviewed_by=?, reviewed_at=datetime('now')
      WHERE book_id=? AND basename=?`
  ).run(state, hash, flagKind || null, note || null, reviewedBy || null, bookId, basename);
}

/**
 * Write the committed sidecar. Mirrors applyApprovedEdits() -> 03-faithful-translation:
 * the DB holds workflow, the repo holds content.
 */
function applyApprovedFigureEdits(db, { bookDir, bookId, basename, mtBlocks }) {
  const fig = getFigure(db, bookId, basename, mtBlocks);
  if (!fig) return { written: false, path: null };
  const data = {
    version: SIDECAR_VERSION,
    basename,
    state: fig.state,
    renderHash: computeRenderHash(fig.blocks, COMPOSER_VERSION),
    composerVersion: COMPOSER_VERSION,
    blocks: fig.blocks,
  };
  writeSidecar(bookDir, basename, data);
  return { written: true, path: sidecarPath(bookDir, basename) };
}

module.exports = { getFigure, saveBlockEdit, setState, applyApprovedFigureEdits };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/figureReviewService.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add server/services/figureReviewService.js server/__tests__/figureReviewService.test.js
git commit -m "feat(figure-text): review service — derived staleness, committed sidecar"
```

---

### Task 6: Consistency checks

**Files:**
- Create: `tools/lib/figure-consistency.cjs`
- Test: `tools/__tests__/figure-consistency.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `decimalSeparatorWarnings(blocks) -> [{blockKey, current, suggested}]`
  - `captionDivergence(blocks, referenceText) -> [{blockKey, figureText, note}]`

Both are **advisory**. They inform the reviewer; nothing blocks.

- [ ] **Step 1: Write the failing test**

```js
// tools/__tests__/figure-consistency.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { decimalSeparatorWarnings, captionDivergence } =
  require('../lib/figure-consistency.cjs');

describe('decimalSeparatorWarnings', () => {
  it('flags a decimal point and suggests the Icelandic comma', () => {
    const w = decimalSeparatorWarnings({ k: '373.15 K' });
    expect(w).toHaveLength(1);
    expect(w[0].suggested).toBe('373,15 K');
  });
  it('does NOT flag a thousands group — the separators invert and a blind swap is wrong', () => {
    expect(decimalSeparatorWarnings({ k: '1,000 g' })).toEqual([]);
  });
  it('does not flag an integer', () => {
    expect(decimalSeparatorWarnings({ k: '212 °F' })).toEqual([]);
  });
  it('does not flag prose containing a full stop', () => {
    expect(decimalSeparatorWarnings({ k: 'Suðumark vatns.' })).toEqual([]);
  });
});

describe('captionDivergence', () => {
  const caption = 'Fahrenheit-, Celsíus- og kelvinhitakvarðarnir eru bornir saman.';
  it('flags a figure word whose near-variant appears in the caption', () => {
    const d = captionDivergence({ c: 'Selsíus' }, caption);
    expect(d).toHaveLength(1);
    expect(d[0].note).toContain('Celsíus');
  });
  it('is silent when the figure agrees with the caption', () => {
    expect(captionDivergence({ c: 'Celsíus' }, caption)).toEqual([]);
  });
  it('is silent — not wrong — when there is no reference text at all', () => {
    expect(captionDivergence({ c: 'Selsíus' }, '')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/figure-consistency.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```js
// tools/lib/figure-consistency.cjs
/**
 * Advisory checks shown beside a figure in the editor. Neither blocks anything.
 */

// A number with ONE decimal group: digits, a single '.', 1-3 digits, end of token.
// Deliberately narrow. Icelandic INVERTS both separators, so 1,000 (one thousand)
// becomes 1.000 — a blind '.' -> ',' swap silently changes numbers in a chemistry
// textbook, which is the worst available failure.
const DECIMAL = /^(\d+)\.(\d+)$/;

function decimalSeparatorWarnings(blocks) {
  const out = [];
  for (const [blockKey, text] of Object.entries(blocks)) {
    if (typeof text !== 'string') continue;
    const tokens = text.split(/\s+/);
    const fixed = tokens.map((t) => {
      const m = t.match(DECIMAL);
      return m ? `${m[1]},${m[2]}` : t;
    });
    const suggested = fixed.join(' ');
    if (suggested !== text) out.push({ blockKey, current: text, suggested });
  }
  return out;
}

/** Words differing only in their first letter, e.g. Selsíus vs Celsíus. */
function nearVariant(a, b) {
  return a.length === b.length && a.length > 3 && a.slice(1) === b.slice(1) && a[0] !== b[0];
}

function captionDivergence(blocks, referenceText) {
  if (!referenceText) return []; // no reference => silent, NEVER a false all-clear
  const refWords = referenceText.split(/[^\p{L}]+/u).filter((w) => w.length > 3);
  const out = [];
  for (const [blockKey, text] of Object.entries(blocks)) {
    if (typeof text !== 'string') continue;
    for (const w of text.split(/[^\p{L}]+/u).filter((x) => x.length > 3)) {
      const hit = refWords.find((r) => nearVariant(w, r));
      if (hit) {
        out.push({ blockKey, figureText: w,
                   note: `the module's caption/alt uses "${hit}"` });
      }
    }
  }
  return out;
}

module.exports = { decimalSeparatorWarnings, captionDivergence };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/figure-consistency.test.js`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add tools/lib/figure-consistency.cjs tools/__tests__/figure-consistency.test.js
git commit -m "feat(figure-text): advisory caption and decimal-separator checks"
```

---

### Task 7: Editor API endpoints

**Files:**
- Modify: `server/routes/segment-editor.js`
- Test: `server/__tests__/figureReviewRoutes.test.js`

**Interfaces:**
- Consumes: `figureReviewService` (Task 5), `figure-consistency` (Task 6).
- Produces `buildFigurePayload(basename, fig, referenceText) -> object` (exported from
  `figureReviewService`), and three endpoints under the existing module scope:
  - `GET  /:book/:chapter/:moduleId/figures` → `{figures:[{basename, effectiveState, blocks, warnings}]}`
  - `POST /:book/:chapter/:moduleId/figures/:basename/block` → `{ok:true}`
  - `POST /:book/:chapter/:moduleId/figures/:basename/state` → `{ok:true, effectiveState}`

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/figureReviewRoutes.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { buildFigurePayload } = require('../services/figureReviewService');

// The route wiring is exercised by E2E; this pins the PAYLOAD SHAPE the client
// depends on, which is where a silent contract break would land.
//
// ⚠️ Imported from the SERVICE, not the router. `server/routes/segment-editor.js`
// ends in `module.exports = router`, so exporting a helper from there would hang a
// property off an Express router and force this unit test to load the router's
// auth middleware and database wiring just to check an object shape.
describe('buildFigurePayload', () => {
  const fig = { effectiveState: 'mt-preview', blocks: { k: '373.15 K' }, note: null };
  it('exposes effectiveState, not the stored state', () => {
    const p = buildFigurePayload('CNX_T', { ...fig, state: 'approved' }, '');
    expect(p.effectiveState).toBe('mt-preview');
    expect(p.state).toBeUndefined();
  });
  it('carries advisory warnings alongside the blocks', () => {
    const p = buildFigurePayload('CNX_T', fig, '');
    expect(p.warnings.decimal).toHaveLength(1);
    expect(p.warnings.decimal[0].suggested).toBe('373,15 K');
  });
  it('returns an empty warning set rather than omitting the key', () => {
    const p = buildFigurePayload('CNX_T', { ...fig, blocks: { k: 'Suðumark' } }, '');
    expect(p.warnings).toEqual({ decimal: [], caption: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/figureReviewRoutes.test.js`
Expected: FAIL — `buildFigurePayload is not a function`

- [ ] **Step 3: Write minimal implementation**

Add to `server/services/figureReviewService.js` (NOT the router — see the test's note):

```js
const { decimalSeparatorWarnings, captionDivergence } =
  require(path.join(__dirname, '..', '..', 'tools', 'lib', 'figure-consistency.cjs'));

/**
 * Shape the client depends on. Exposes effectiveState ONLY — a client that could
 * see the stored `state` would show "approved" on a figure whose text has since
 * changed.
 */
function buildFigurePayload(basename, fig, referenceText) {
  return {
    basename,
    effectiveState: fig.effectiveState,
    blocks: fig.blocks,
    note: fig.note || null,
    warnings: {
      decimal: decimalSeparatorWarnings(fig.blocks),
      caption: captionDivergence(fig.blocks, referenceText || ''),
    },
  };
}
```

and add `buildFigurePayload` to the service's existing `module.exports`.

Then in `server/routes/segment-editor.js`, add the three routes — each behind the
same auth middleware the neighbouring module routes already use — calling
`figureReview.getFigure`, `figureReview.saveBlockEdit`, and
`figureReview.setState` + `figureReview.applyApprovedFigureEdits` respectively,
and returning `buildFigurePayload(...)`. The router stays thin; it shapes nothing
itself.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/figureReviewRoutes.test.js`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add server/routes/segment-editor.js server/__tests__/figureReviewRoutes.test.js
git commit -m "feat(figure-text): editor endpoints for figure review"
```

---

### Task 8: The editor figure card

**Files:**
- Modify: `server/public/js/segment-editor.js`
- Test: `server/e2e/figure-review.spec.js`

**Interfaces:**
- Consumes: the three endpoints from Task 7.
- Produces: a figure card in document order among the module's segments.

- [ ] **Step 1: Write the failing test**

```js
// server/e2e/figure-review.spec.js
import { test, expect } from '@playwright/test';

// Targets books/__e2e-fixture__, whose 03-faithful-translation is gitignored.
test('a figure card shows its state and lets the editor correct a block', async ({ page }) => {
  await page.goto('/editor/__e2e-fixture__/1/m00001');
  const card = page.locator('[data-figure-card]').first();
  await expect(card).toBeVisible();
  await expect(card.locator('[data-figure-state]')).toHaveText('MT-PREVIEW');

  await card.locator('[data-block-input]').first().fill('Celsíus');
  await card.locator('[data-block-save]').first().click();
  await expect(card.locator('[data-figure-state]')).toHaveText('MT-PREVIEW');

  await card.locator('[data-figure-approve]').click();
  await expect(card.locator('[data-figure-state]')).toHaveText('APPROVED');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx playwright test e2e/figure-review.spec.js`
Expected: FAIL — no `[data-figure-card]` element

- [ ] **Step 3: Write minimal implementation**

In `server/public/js/segment-editor.js`, after the segment list renders, fetch
`/figures` for the module and insert one card per figure:

```js
function renderFigureCard(fig) {
  const el = document.createElement('section');
  el.setAttribute('data-figure-card', fig.basename);
  el.innerHTML = `
    <header>
      <span>${fig.basename}</span>
      <span data-figure-state>${fig.effectiveState.toUpperCase()}</span>
    </header>
    <img src="/content/${BOOK}/chapters/${CH}/images/media/${fig.basename}_IS.svg" alt="">
    <ul data-figure-blocks></ul>
    <button data-figure-approve>Samþykkja</button>
    <button data-figure-flag>Merkja villu</button>`;
  const list = el.querySelector('[data-figure-blocks]');
  for (const [key, text] of Object.entries(fig.blocks)) {
    const li = document.createElement('li');
    li.innerHTML = `<code>${key}</code>
      <input data-block-input data-block-key="${key}" value="${text}">
      <button data-block-save>Vista</button>`;
    for (const w of fig.warnings.decimal.filter((w) => w.blockKey === key)) {
      li.insertAdjacentHTML('beforeend', `<em>⚠ ${w.suggested}</em>`);
    }
    for (const w of fig.warnings.caption.filter((w) => w.blockKey === key)) {
      li.insertAdjacentHTML('beforeend', `<em>⚠ ${w.note}</em>`);
    }
    list.appendChild(li);
  }
  return el;
}
```

Saving a block POSTs to `/block` then re-fetches `/figures` so the state badge
reflects the derived staleness rather than a local guess.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx playwright test e2e/figure-review.spec.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/public/js/segment-editor.js server/e2e/figure-review.spec.js
git commit -m "feat(figure-text): figure review card in the segment editor"
```

---

## Self-Review

**Spec coverage.** §2 publication model → Tasks 1, 3 (state is a label, both tracks publish). §4 data model → Task 4. §5 editor surface → Tasks 7, 8. §6 committed sidecar and the MIT/AGPL boundary → Tasks 1, 3, 5. §7 consistency checks → Task 6. §8 render contract → Task 3. §9 testing → every task's test step, including the both-directions render test and non-vacuity assertions.

**One spec item deliberately has no task:** §9's "orphan reporting" (change a block's English, assert the CLI *names* the orphaned edit). There is no CLI in this plan — regeneration is run by hand from `experiments/`. Orphan reporting belongs with the CLI wrapper, which is not built here. **Logged as a follow-up rather than silently dropped.**

**Placeholder scan:** no TBD/TODO; every code step carries real code; Task 7's route bodies are described rather than shown, which is the one place a reader must follow the existing neighbouring routes — called out explicitly rather than left implicit.

**Type consistency:** `effectiveState` is the derived string everywhere (Tasks 1, 3, 5, 7, 8); the stored column is `state` and is never exposed to the client. `blocks` is `{blockKey: string}` in every task — the string-not-array decision from Task 1 holds through Tasks 2, 5, 6, 7, 8. `COMPOSER_VERSION` is the single invalidation lever, used in Tasks 1, 3, 5.
