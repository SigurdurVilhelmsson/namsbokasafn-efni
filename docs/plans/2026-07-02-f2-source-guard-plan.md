# F2: Guard `01-source/` Against Silent Overwrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it impossible for the server to overwrite the irrevocable CC BY `01-source/` CNXML and make any other silent swap fail `npm test`.

**Architecture:** Two complementary defenses. (1) A refuse-overwrite guard inside the single shared `organizeSourceFiles()` path — the server never passes the force flag; the CLI exposes it only as an explicitly-named flag under human double-consent. (2) A committed per-CNXML `sha256` manifest per book, with a Vitest test that recomputes and fails on any drift or missing manifest.

**Tech Stack:** Node 22 (ESM tools + CJS server), `crypto` (sha256), Vitest. Shared logic in a `.cjs` module consumable by both module systems (precedent: `tools/lib/seg-markers.cjs`).

**Design doc:** `docs/plans/2026-07-02-f2-source-guard-design.md`
**Motivating audit:** `docs/audit/2026-07-02-fable5-fidelity-provenance-review.md` (finding 2).

## Global Constraints

- **No `01-source/` bytes may change.** F2 only *reads* CNXML to hash it. (A guard + hashing overwrite nothing → the CLAUDE.md triple-consent rule is not triggered.)
- **Path resolution:** resolve resources against `import.meta.url` / `__dirname` (files), never `process.cwd()`. New CLI tools run from the repo root.
- **Escape hatches can't reach prod:** the `--allow-overwrite-source` force path must never be reachable from the server; a test proves it. (`feedback-robustness-over-expedience`.)
- **Test gate:** local `npm test` from the **repo root** is authoritative (no branch protection). One PR off `main` for F2.
- **Shared module is CommonJS** (`tools/lib/source-manifest.cjs`, `module.exports = {...}`) so ESM tools `import` it and the CJS server `require`s it — exactly like `seg-markers.cjs`.
- **Manifest algorithm = `sha256` of raw CNXML bytes**, full 64-char hex. (The existing `02-structure` `sourceHash` is the first 16 chars of the same value — deliberately cross-checkable.)
- **Manifest scope = `*.cnxml` only**, recursively under `01-source/`. Keys are posix paths relative to `01-source/`, sorted.

---

### Task 1: Shared source-manifest library (`tools/lib/source-manifest.cjs`)

Pure compute + verify + a recursive CNXML lister. No timestamps in the pure functions (deterministic → testable); the generate CLI (Task 4) stamps `generatedAt`.

**Files:**
- Create: `tools/lib/source-manifest.cjs`
- Test: `tools/__tests__/source-manifest.test.js`

**Interfaces:**
- Consumes: nothing (leaf module; `fs`, `path`, `crypto` only).
- Produces:
  - `listCnxmlFiles(dir) → string[]` — absolute paths of every `*.cnxml` under `dir`, recursive; `[]` if `dir` absent.
  - `computeFiles(sourceDir) → { [posixRelPath]: sha256hex }` — sorted-key map.
  - `computeSourceManifest(sourceDir, { book }) → { version:1, book, algorithm:'sha256', files }`.
  - `verifySourceManifest(sourceDir) → { ok:boolean, manifestMissing:boolean, changed:string[], missing:string[], added:string[] }` — reads `sourceDir/.source-manifest.json`, recomputes, diffs. `manifestMissing:true` (and `ok:false`) when the file is absent.

- [ ] **Step 1: Write the failing tests**

```js
// tools/__tests__/source-manifest.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { listCnxmlFiles, computeFiles, computeSourceManifest, verifySourceManifest } = require(
  '../lib/source-manifest.cjs'
);

const TMP = join(import.meta.dirname, '..', '..', '.tmp', 'test-source-manifest');
const sourceDir = join(TMP, '01-source');

function seed() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(sourceDir, 'ch01'), { recursive: true });
  mkdirSync(join(sourceDir, 'media'), { recursive: true });
  writeFileSync(join(sourceDir, 'ch00', ''), '', { flag: 'w' }); // ensure ch00 dir via mkdir below
}

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(sourceDir, 'ch01'), { recursive: true });
  mkdirSync(join(sourceDir, 'appendices'), { recursive: true });
  mkdirSync(join(sourceDir, 'media'), { recursive: true });
  writeFileSync(join(sourceDir, 'ch01', 'm001.cnxml'), '<document id="m001"/>');
  writeFileSync(join(sourceDir, 'appendices', 'm999.cnxml'), '<document id="m999"/>');
  writeFileSync(join(sourceDir, 'media', 'fig1.png'), 'not-cnxml');
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('listCnxmlFiles', () => {
  it('finds only .cnxml files recursively', () => {
    const found = listCnxmlFiles(sourceDir).map((p) => p.replace(sourceDir, '')).sort();
    expect(found).toEqual([
      '/appendices/m999.cnxml',
      '/ch01/m001.cnxml',
    ]);
  });

  it('returns [] for a nonexistent dir', () => {
    expect(listCnxmlFiles(join(TMP, 'nope'))).toEqual([]);
  });
});

describe('computeFiles', () => {
  it('keys by posix path relative to sourceDir, sorted', () => {
    const files = computeFiles(sourceDir);
    expect(Object.keys(files)).toEqual(['appendices/m999.cnxml', 'ch01/m001.cnxml']);
    // sha256 of '<document id="m001"/>'
    expect(files['ch01/m001.cnxml']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('excludes non-cnxml files', () => {
    const files = computeFiles(sourceDir);
    expect(Object.keys(files).some((k) => k.includes('media'))).toBe(false);
  });
});

describe('computeSourceManifest', () => {
  it('produces a stable shape with no timestamp', () => {
    const m = computeSourceManifest(sourceDir, { book: 'testbook' });
    expect(m.version).toBe(1);
    expect(m.book).toBe('testbook');
    expect(m.algorithm).toBe('sha256');
    expect(m).not.toHaveProperty('generatedAt');
    expect(Object.keys(m.files)).toHaveLength(2);
  });
});

describe('verifySourceManifest', () => {
  function writeManifest(extra = {}) {
    const m = computeSourceManifest(sourceDir, { book: 'testbook' });
    writeFileSync(
      join(sourceDir, '.source-manifest.json'),
      JSON.stringify({ ...m, ...extra }, null, 2)
    );
  }

  it('ok:true on a clean tree', () => {
    writeManifest();
    expect(verifySourceManifest(sourceDir)).toMatchObject({
      ok: true,
      manifestMissing: false,
      changed: [],
      missing: [],
      added: [],
    });
  });

  it('manifestMissing:true, ok:false when the file is absent', () => {
    const r = verifySourceManifest(sourceDir);
    expect(r.ok).toBe(false);
    expect(r.manifestMissing).toBe(true);
  });

  it('reports a changed byte', () => {
    writeManifest();
    writeFileSync(join(sourceDir, 'ch01', 'm001.cnxml'), '<document id="m001">TAMPERED</document>');
    const r = verifySourceManifest(sourceDir);
    expect(r.ok).toBe(false);
    expect(r.changed).toEqual(['ch01/m001.cnxml']);
  });

  it('reports a deleted file', () => {
    writeManifest();
    rmSync(join(sourceDir, 'appendices', 'm999.cnxml'));
    const r = verifySourceManifest(sourceDir);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['appendices/m999.cnxml']);
  });

  it('reports an added file', () => {
    writeManifest();
    writeFileSync(join(sourceDir, 'ch01', 'm002.cnxml'), '<document id="m002"/>');
    const r = verifySourceManifest(sourceDir);
    expect(r.ok).toBe(false);
    expect(r.added).toEqual(['ch01/m002.cnxml']);
  });
});
```

> Note: delete the stray `seed()`/`ch00` lines above if the linter flags them — the `beforeEach` is the live fixture. (They are inert; keep the plan honest by removing before commit.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tools/__tests__/source-manifest.test.js`
Expected: FAIL — `Cannot find module '../lib/source-manifest.cjs'`.

- [ ] **Step 3: Write the library**

```js
// tools/lib/source-manifest.cjs
'use strict';

/**
 * Source-manifest helpers for the F2 01-source provenance guard.
 *
 * Committed manifest: books/<book>/01-source/.source-manifest.json — a per-CNXML
 * sha256 baseline that makes any silent swap of the irrevocable CC BY copies
 * detectable (fails `npm test`). Algorithm matches cnxml-extract.js's `sourceHash`
 * (sha256 of raw bytes); the extract manifest stores the first 16 chars.
 *
 * CommonJS so both the ESM tools (import) and the CJS server (require) can use it,
 * like tools/lib/seg-markers.cjs.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MANIFEST_NAME = '.source-manifest.json';

/** Absolute paths of every *.cnxml under `dir`, recursive. [] if dir is absent. */
function listCnxmlFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listCnxmlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.cnxml')) {
      out.push(full);
    }
  }
  return out;
}

/** { posixRelPath -> sha256hex } for every CNXML under sourceDir, sorted keys. */
function computeFiles(sourceDir) {
  const files = {};
  for (const abs of listCnxmlFiles(sourceDir).sort()) {
    const rel = path.relative(sourceDir, abs).split(path.sep).join('/');
    files[rel] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  }
  return files;
}

/** Deterministic manifest object (no timestamp — the generate CLI stamps that). */
function computeSourceManifest(sourceDir, { book }) {
  return {
    version: 1,
    book,
    algorithm: 'sha256',
    files: computeFiles(sourceDir),
  };
}

/** Compare the committed manifest to the current tree. */
function verifySourceManifest(sourceDir) {
  const manifestPath = path.join(sourceDir, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, manifestMissing: true, changed: [], missing: [], added: [] };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const expected = manifest.files || {};
  const actual = computeFiles(sourceDir);

  const changed = [];
  const missing = [];
  const added = [];
  for (const rel of Object.keys(expected)) {
    if (!(rel in actual)) missing.push(rel);
    else if (actual[rel] !== expected[rel]) changed.push(rel);
  }
  for (const rel of Object.keys(actual)) {
    if (!(rel in expected)) added.push(rel);
  }

  const ok = changed.length === 0 && missing.length === 0 && added.length === 0;
  return { ok, manifestMissing: false, changed: changed.sort(), missing: missing.sort(), added: added.sort() };
}

module.exports = {
  MANIFEST_NAME,
  listCnxmlFiles,
  computeFiles,
  computeSourceManifest,
  verifySourceManifest,
};
```

- [ ] **Step 4: Remove the inert `seed()`/`ch00` scaffolding lines from the test**, then run tests to verify they pass

Run: `npx vitest run tools/__tests__/source-manifest.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/source-manifest.cjs tools/__tests__/source-manifest.test.js
git commit -m "feat(F2): source-manifest lib (list/compute/verify CNXML sha256)"
```

---

### Task 2: Refuse-overwrite guard in `organizeSourceFiles` + CLI force flag

**Files:**
- Modify: `tools/download-source.js` (`organizeSourceFiles` ~176, `parseArgs` ~56, `main` ~402)
- Test: `tools/__tests__/source-downloader.test.js` (extend existing `organizeSourceFiles` describe)

**Interfaces:**
- Consumes: `listCnxmlFiles` from `./lib/source-manifest.cjs` (Task 1).
- Produces: `organizeSourceFiles({ extractedDir, sourceDir, structure, verbose, allowOverwrite })` — throws on a populated target unless `allowOverwrite === true`. CLI flag `--allow-overwrite-source` → `args.allowOverwrite`.

- [ ] **Step 1: Write the failing tests** (append inside the existing `describe('organizeSourceFiles', …)` in `tools/__tests__/source-downloader.test.js`)

```js
  it('refuses to overwrite a populated 01-source/ by default', () => {
    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    organizeSourceFiles({ extractedDir, sourceDir, structure, verbose: false }); // populate once

    expect(() =>
      organizeSourceFiles({ extractedDir, sourceDir, structure, verbose: false })
    ).toThrow(/Refusing to overwrite populated 01-source/);
  });

  it('allows overwrite when allowOverwrite:true', () => {
    const structure = parseCollectionXml(SAMPLE_COLLECTION_XML);
    organizeSourceFiles({ extractedDir, sourceDir, structure, verbose: false });

    const result = organizeSourceFiles({
      extractedDir,
      sourceDir,
      structure,
      verbose: false,
      allowOverwrite: true,
    });
    expect(result.moduleCount).toBe(9);
  });
```

Add the import at the top of the test file (it already imports from `download-source.js`; no new import needed).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tools/__tests__/source-downloader.test.js`
Expected: FAIL — the first re-`organizeSourceFiles` currently *succeeds* (no throw).

- [ ] **Step 3: Add the import and the guard**

In `tools/download-source.js`, add near the top imports (after line 21):

```js
import { listCnxmlFiles } from './lib/source-manifest.cjs';
```

Change the signature (line ~176) and add the guard as the first statements of the function body:

```js
export function organizeSourceFiles({
  extractedDir,
  sourceDir,
  structure,
  verbose,
  allowOverwrite = false,
}) {
  // F2 provenance guard: never silently overwrite the irrevocable CC BY copies.
  const existingCnxml = listCnxmlFiles(sourceDir);
  if (existingCnxml.length > 0 && !allowOverwrite) {
    const book = path.basename(path.dirname(sourceDir));
    throw new Error(
      `Refusing to overwrite populated 01-source/ for '${book}' (${existingCnxml.length} CNXML ` +
        `files present). These are the irrevocable CC BY provenance copies. To intentionally ` +
        `replace them, follow the CLAUDE.md double-consent rule, delete 01-source/ by hand, then ` +
        `re-run with --allow-overwrite-source.`
    );
  }

  const modulesDir = path.join(extractedDir, 'modules');
  // …rest unchanged…
```

- [ ] **Step 4: Thread the CLI flag** — in `parseArgs` (the `switch`, ~line 59) add a case, and in `main` (~line 402) pass it through:

```js
      case '--allow-overwrite-source':
        args.allowOverwrite = true;
        break;
```

```js
    // main(), where organizeSourceFiles is called (~line 402):
    const result = organizeSourceFiles({
      extractedDir,
      sourceDir,
      structure,
      verbose,
      allowOverwrite: args.allowOverwrite === true,
    });
```

Also update the usage string (~line 79) to document the flag:

```js
      'Usage: node download-source.js --repo OWNER/REPO --collection FILE --book SLUG [--branch main] [--verbose] [--allow-overwrite-source]'
```

- [ ] **Step 5: Run the full downloader suite to verify pass + no regressions**

Run: `npx vitest run tools/__tests__/source-downloader.test.js`
Expected: PASS — new guard tests green, all 10 pre-existing tests still green (they target an empty `sourceDir`, so the guard never fires).

- [ ] **Step 6: Commit**

```bash
git add tools/download-source.js tools/__tests__/source-downloader.test.js
git commit -m "feat(F2): refuse-overwrite guard in organizeSourceFiles + --allow-overwrite-source"
```

---

### Task 3: Server can never overwrite — endpoint 409 + argv guard test

**Files:**
- Modify: `server/services/pipelineService.js` (add `isSourcePopulated`, export it ~888)
- Modify: `server/routes/admin.js` (fetch-source route ~338)
- Test: `server/__tests__/fetchSourceGuard.test.js` (create)

**Interfaces:**
- Consumes: `listCnxmlFiles` from `tools/lib/source-manifest.cjs`; `runFetchSource` (existing).
- Produces: `pipeline.isSourcePopulated(book) → boolean`. Endpoint returns **409 `{ error: 'Source already present', … }`** when populated.

- [ ] **Step 1: Write the failing tests**

```js
// server/__tests__/fetchSourceGuard.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('F2 server source guard', () => {
  it('isSourcePopulated is true for a book with CNXML, false otherwise', () => {
    const pipeline = require('../services/pipelineService');
    // efnafraedi-2e has a populated 01-source/ in the repo
    expect(pipeline.isSourcePopulated('efnafraedi-2e')).toBe(true);
    expect(pipeline.isSourcePopulated('__nonexistent_book__')).toBe(false);
  });

  it('runFetchSource never passes the --allow-overwrite-source escape hatch to the CLI', () => {
    // Read the source of runFetchSource and assert the flag string appears nowhere in the argv it builds.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'services', 'pipelineService.js'),
      'utf8'
    );
    // The only mention allowed is nowhere — the server must not know this flag.
    expect(src.includes('--allow-overwrite-source')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/fetchSourceGuard.test.js`
Expected: FAIL — `pipeline.isSourcePopulated is not a function`. (The argv test already passes — that's fine; it's a standing guard.)

- [ ] **Step 3: Add `isSourcePopulated` to `pipelineService.js`**

Add the require near the other tool-lib requires (top of file; `seg-markers.cjs` is required in `segmentParser.js`, so mirror the relative path from `server/services/`):

```js
const { listCnxmlFiles } = require('../../tools/lib/source-manifest.cjs');
```

Add the function (near `checkBookDownstreamWork`, ~line 598):

```js
/**
 * F2 provenance guard: does this book already have CNXML under 01-source/?
 * Used to refuse a server-triggered re-fetch over the irrevocable CC BY copies.
 *
 * @param {string} book - Book slug
 * @returns {boolean}
 */
function isSourcePopulated(book) {
  return listCnxmlFiles(path.join(BOOKS_DIR, book, '01-source')).length > 0;
}
```

Add to `module.exports` (~line 888):

```js
  isSourcePopulated,
```

- [ ] **Step 4: Add the endpoint pre-check** in `server/routes/admin.js`, immediately **before** the existing `if (!book.repoUrl)` block (~line 332), so a populated source is refused regardless of `confirmed`:

```js
    // F2: never overwrite the irrevocable CC BY 01-source/ copies from the server.
    // A deliberate re-fetch is a human CLI act (see CLAUDE.md double-consent) — delete
    // 01-source/ by hand first, then re-run download-source.js --allow-overwrite-source.
    if (pipeline.isSourcePopulated(slug)) {
      return res.status(409).json({
        error: 'Source already present',
        message:
          `Book '${slug}' already has CNXML in 01-source/. The server will not overwrite the ` +
          `irrevocable CC BY provenance copies. To intentionally replace them, follow the ` +
          `CLAUDE.md double-consent rule and re-fetch from the CLI.`,
      });
    }
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run server/__tests__/fetchSourceGuard.test.js`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add server/services/pipelineService.js server/routes/admin.js server/__tests__/fetchSourceGuard.test.js
git commit -m "feat(F2): server refuses fetch-source over populated 01-source/ (409) + argv guard"
```

---

### Task 4: `generate-source-manifest.js` and `verify-source-manifest.js` CLIs

**Files:**
- Create: `tools/generate-source-manifest.js`
- Create: `tools/verify-source-manifest.js`
- Test: `tools/__tests__/source-manifest-cli.test.js`

**Interfaces:**
- Consumes: `computeSourceManifest`, `verifySourceManifest`, `MANIFEST_NAME` from `./lib/source-manifest.cjs`.
- Produces: two CLI tools. `generate` writes `books/<book>/01-source/.source-manifest.json` (adds `generatedAt` + `note`). `verify` exits nonzero + loud report on any drift/missing.

- [ ] **Step 1: Write the failing test** (exercises the pure helpers the CLIs wrap, plus that the written file round-trips)

```js
// tools/__tests__/source-manifest-cli.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { verifySourceManifest, MANIFEST_NAME } = require('../lib/source-manifest.cjs');
const { writeManifestFor } = require('../generate-source-manifest.js');

const TMP = join(import.meta.dirname, '..', '..', '.tmp', 'test-manifest-cli');
const sourceDir = join(TMP, '01-source');

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(sourceDir, 'ch01'), { recursive: true });
  writeFileSync(join(sourceDir, 'ch01', 'm001.cnxml'), '<document id="m001"/>');
});
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe('writeManifestFor', () => {
  it('writes a manifest that verifies clean and carries generatedAt + note', () => {
    writeManifestFor(sourceDir, 'testbook');
    expect(existsSync(join(sourceDir, MANIFEST_NAME))).toBe(true);

    const written = JSON.parse(readFileSync(join(sourceDir, MANIFEST_NAME), 'utf8'));
    expect(written.book).toBe('testbook');
    expect(written.algorithm).toBe('sha256');
    expect(typeof written.generatedAt).toBe('string');
    expect(written.note).toMatch(/CC BY/);

    expect(verifySourceManifest(sourceDir).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/source-manifest-cli.test.js`
Expected: FAIL — `Cannot find module '../generate-source-manifest.js'`.

- [ ] **Step 3: Write `tools/generate-source-manifest.js`**

```js
#!/usr/bin/env node
/**
 * generate-source-manifest.js — write books/<book>/01-source/.source-manifest.json,
 * the committed sha256 baseline that makes a silent 01-source swap detectable (F2).
 *
 * DELIBERATELY separate from download-source.js: generating this manifest is an
 * intentional provenance act. Never auto-run it on fetch, or a swap-then-refetch
 * would mint a manifest matching the swapped bytes and defeat the guard.
 *
 * Usage:
 *   node tools/generate-source-manifest.js --book efnafraedi-2e
 *   node tools/generate-source-manifest.js --all
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { computeSourceManifest, MANIFEST_NAME } = require('./lib/source-manifest.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const BOOKS_DIR = path.join(PROJECT_ROOT, 'books');

const NOTE =
  'Tamper-evidence baseline for the CC BY 01-source CNXML. Regenerating this to match an ' +
  'upstream swap destroys the provenance basis — see CLAUDE.md source-overwrite rule.';

/** Compute + write the manifest for one book's 01-source dir. Returns the file count. */
export function writeManifestFor(sourceDir, book) {
  const manifest = computeSourceManifest(sourceDir, { book });
  const out = {
    version: manifest.version,
    book: manifest.book,
    algorithm: manifest.algorithm,
    generatedAt: new Date().toISOString(),
    note: NOTE,
    files: manifest.files,
  };
  fs.writeFileSync(path.join(sourceDir, MANIFEST_NAME), JSON.stringify(out, null, 2) + '\n', 'utf8');
  return Object.keys(manifest.files).length;
}

/** Book slugs that have a populated 01-source/ (contains at least one .cnxml, any depth). */
function populatedBooks() {
  if (!fs.existsSync(BOOKS_DIR)) return [];
  return fs.readdirSync(BOOKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((slug) => {
      const src = path.join(BOOKS_DIR, slug, '01-source');
      const { listCnxmlFiles } = require('./lib/source-manifest.cjs');
      return listCnxmlFiles(src).length > 0;
    });
}

function main() {
  const argv = process.argv.slice(2);
  const all = argv.includes('--all');
  const bookIdx = argv.indexOf('--book');
  const book = bookIdx !== -1 ? argv[bookIdx + 1] : null;

  if (!all && !book) {
    console.error('Usage: node tools/generate-source-manifest.js (--book SLUG | --all)');
    process.exit(1);
  }

  const books = all ? populatedBooks() : [book];
  for (const slug of books) {
    const sourceDir = path.join(BOOKS_DIR, slug, '01-source');
    const count = writeManifestFor(sourceDir, slug);
    console.log(`Wrote ${MANIFEST_NAME} for ${slug} (${count} CNXML files)`);
  }
}

if (process.argv[1] === __filename) main();
```

- [ ] **Step 4: Write `tools/verify-source-manifest.js`**

```js
#!/usr/bin/env node
/**
 * verify-source-manifest.js — recompute 01-source CNXML sha256 and compare to the
 * committed .source-manifest.json. Exit nonzero + loud report on any drift or a
 * missing manifest (F2). This is the human-facing companion to the Vitest gate.
 *
 * Usage:
 *   node tools/verify-source-manifest.js --book efnafraedi-2e
 *   node tools/verify-source-manifest.js --all
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { verifySourceManifest, listCnxmlFiles } = require('./lib/source-manifest.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const BOOKS_DIR = path.join(PROJECT_ROOT, 'books');

function populatedBooks() {
  if (!fs.existsSync(BOOKS_DIR)) return [];
  return fs.readdirSync(BOOKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((slug) => listCnxmlFiles(path.join(BOOKS_DIR, slug, '01-source')).length > 0);
}

function main() {
  const argv = process.argv.slice(2);
  const all = argv.includes('--all');
  const bookIdx = argv.indexOf('--book');
  const book = bookIdx !== -1 ? argv[bookIdx + 1] : null;

  if (!all && !book) {
    console.error('Usage: node tools/verify-source-manifest.js (--book SLUG | --all)');
    process.exit(1);
  }

  const books = all ? populatedBooks() : [book];
  let failed = false;
  for (const slug of books) {
    const sourceDir = path.join(BOOKS_DIR, slug, '01-source');
    const r = verifySourceManifest(sourceDir);
    if (r.ok) {
      console.log(`OK   ${slug}`);
      continue;
    }
    failed = true;
    if (r.manifestMissing) {
      console.error(`FAIL ${slug}: no .source-manifest.json (run generate-source-manifest.js)`);
    } else {
      console.error(`FAIL ${slug}: 01-source drift vs committed manifest`);
      for (const f of r.changed) console.error(`  changed: ${f}`);
      for (const f of r.missing) console.error(`  missing: ${f}`);
      for (const f of r.added) console.error(`  added:   ${f}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === __filename) main();
```

- [ ] **Step 5: Run test to verify pass**

Run: `npx vitest run tools/__tests__/source-manifest-cli.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/generate-source-manifest.js tools/verify-source-manifest.js tools/__tests__/source-manifest-cli.test.js
git commit -m "feat(F2): generate/verify-source-manifest CLIs"
```

---

### Task 5: Baseline manifests for all populated books + the real-tree Vitest gate

**Files:**
- Create (generated + committed): `books/<book>/01-source/.source-manifest.json` for every populated book
- Test: `tools/__tests__/source-manifest-baseline.test.js`

**Interfaces:**
- Consumes: `verifySourceManifest`, `listCnxmlFiles` from `./lib/source-manifest.cjs`.
- Produces: the committed baseline + a test that fails `npm test` on any future drift or a populated book missing its manifest.

- [ ] **Step 1: Write the failing gate test**

```js
// tools/__tests__/source-manifest-baseline.test.js
import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { verifySourceManifest, listCnxmlFiles } = require('../lib/source-manifest.cjs');

const BOOKS_DIR = join(import.meta.dirname, '..', '..', 'books');

function populatedBooks() {
  if (!existsSync(BOOKS_DIR)) return [];
  return readdirSync(BOOKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((slug) => listCnxmlFiles(join(BOOKS_DIR, slug, '01-source')).length > 0);
}

describe('F2 source-manifest baseline (real tree)', () => {
  const books = populatedBooks();

  it('there is at least one populated book to guard', () => {
    expect(books.length).toBeGreaterThan(0);
  });

  it.each(books)('%s 01-source matches its committed manifest', (slug) => {
    const r = verifySourceManifest(join(BOOKS_DIR, slug, '01-source'));
    // Surface the drift detail in the failure message.
    expect(
      r,
      `drift in ${slug}: ${JSON.stringify({ changed: r.changed, missing: r.missing, added: r.added, manifestMissing: r.manifestMissing })}`
    ).toMatchObject({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/source-manifest-baseline.test.js`
Expected: FAIL — every populated book reports `manifestMissing: true` (no baselines committed yet).

- [ ] **Step 3: Generate the baselines**

Run: `node tools/generate-source-manifest.js --all`
Expected stdout: one `Wrote .source-manifest.json for <slug> (<n> CNXML files)` line per populated book (efnafraedi-2e, liffraedi-2e, orverufraedi, edlisfraedi-2e, lifraen-efnafraedi).

- [ ] **Step 4: Sanity-check + run the gate to verify pass**

Run: `node tools/verify-source-manifest.js --all` → expect all `OK`.
Run: `npx vitest run tools/__tests__/source-manifest-baseline.test.js`
Expected: PASS for every book.

- [ ] **Step 5: Confirm no `01-source/` CNXML bytes changed** (only new manifest files added)

Run: `git status --porcelain books/*/01-source/`
Expected: only `.source-manifest.json` files appear as **new (`??`)** — **zero** modified (`M`) CNXML. If any CNXML shows as modified, STOP — F2 must not alter source bytes.

- [ ] **Step 6: Full suite + validate from repo root**

Run: `npm test` then `npm run validate`
Expected: all green; `validate` 24/24.

- [ ] **Step 7: Commit**

```bash
git add books/*/01-source/.source-manifest.json tools/__tests__/source-manifest-baseline.test.js
git commit -m "feat(F2): commit 01-source sha256 baselines + real-tree npm-test gate"
```

---

## Self-Review

**Spec coverage:**
- Defense 1 (refuse-overwrite in `organizeSourceFiles` + CLI flag + server-never-passes-it) → Tasks 2 & 3. ✓
- Endpoint 409 on populated source → Task 3. ✓
- Defense 2 (committed sha256 manifest, generate + verify tools, Vitest gate, all-book baseline) → Tasks 1, 4, 5. ✓
- Same algorithm as `02-structure` sourceHash (sha256) → Task 1 (documented, full-length hex). ✓
- CNXML-only scope, posix sorted keys → Task 1. ✓
- Manifest generation never auto-run on fetch → Task 4 (docstring + kept separate). ✓
- No `01-source/` bytes changed → Task 5 Step 5 explicit check. ✓
- Fail-loud on missing manifest → Task 1 (`manifestMissing`), Task 4 verify exit 1, Task 5 gate. ✓

**Placeholder scan:** One intentional callout in Task 1 Step 1 (the inert `seed()` scaffolding) is explicitly removed in Task 1 Step 4 — not a latent placeholder. No TBD/TODO/"handle errors" left.

**Type consistency:** `verifySourceManifest → { ok, manifestMissing, changed, missing, added }` used identically in Tasks 1, 4, 5. `listCnxmlFiles` (abs paths) used in Tasks 1, 2, 3, 4, 5. `computeSourceManifest(sourceDir, { book })` (no timestamp) consistent between Task 1 and Task 4 (`writeManifestFor` adds `generatedAt`/`note`). `isSourcePopulated(book)` matches between Task 3 impl and its test. ✓

## Post-plan follow-ups (not F2)

- After F2 merges, rebase/merge the Fable-5 audit + re-prioritization doc (`b2bf475e`) is already carried on this branch → lands with F2.
- Next in the clean-slate critical path: **F1** (extract section-order fix + order check), then **F4/F5/F6** marker-residue, then **F3** benign re-triage — all gate the WS5 re-render.
