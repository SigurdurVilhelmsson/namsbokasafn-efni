# Item 21 · PR-A — TM multi-format export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the human-verified TMX translation memory `--format tmx|csv|json` on the CLI and a user-facing `GET /api/tm/export` download, closing audit finding #5 (TM export · PARTIAL) for the TM half of campaign item 21.

**Architecture:** Extract `generate-tm.js`'s pairing + serialization into a new CommonJS boundary lib `tools/lib/tm-export.cjs` (the only module system that both the ESM CLI and the CommonJS server can share — ESM can `import` CJS, CJS cannot `require` ESM). `generate-tm.js` becomes a thin ESM CLI over the lib and **re-exports every name its existing tests import**, so the refactor is behavior-preserving. Two new serializers (CSV, JSON) join `buildTmx` behind a `serializeTm(tus, format, opts)` dispatcher. A new CommonJS route `server/routes/tm.js` regenerates on demand via the lib and streams the chosen format; a download control on `books.html` hits it.

**Tech Stack:** Node 22 ESM (`tools/`) + CommonJS (`server/`), Vitest, Express 5. No new dependencies.

## Global Constraints

- **Auto-regen contract (load-bearing):** `server/services/tmService.js` spawns `node tools/generate-tm.js --book <book>` with **no `--format` and no `--out`** and expects TMX at `books/<book>/tm/<book>-<date>.tmx`. `--format` MUST default to `tmx`; the default out-path MUST stay `.tmx` when format is tmx. (Spec §3.)
- **`TOOL_VERSION` stays `'1.0'`** (the TMX `creationtoolversion`). The only TMX byte change is an **additive** `<prop type="licence">` in the header (below) — not a version/format change. Real exports always carry a licence; direct `buildTmx` calls without `opts.licence` emit the old self-closed header unchanged (so the existing `buildTmx` tests stay green).
- **Licence stamping (lead decision 2026-07-20, parity with the item-20 corpus export):** every TM export carries the per-book licence from `tools/lib/book-licences.cjs` `getBookLicence(book)` → `{licence, obtained}` (fail-loud on unknown slug). Placement: TMX `<prop type="licence">` in `<header>`; CSV trailing `licence` column (row-stamped); JSON manifest `licence` + `obtained`. **The lookup lives in the callers** (`runExport`, the route) — the serializers stay pure and take `opts.licence`/`opts.obtained`. NOT item 17's containment guard/footer (still out of scope).
- **Formats = exactly `['tmx','csv','json']`** (spec §2.5). No TSV.
- **Boundary-lib module style:** `tools/lib/tm-export.cjs` is CommonJS, ending in a single `module.exports = { … }` object literal (identifier shorthand) so `cjs-module-lexer` exposes every name for ESM named-import — mirror `tools/lib/seg-markers.cjs`.
- **Tests use fixtures only** (`_setTestBooksDir` + temp dirs), never live `books/` data. `VALID_BOOKS = ["efnafraedi-2e","liffraedi-2e","orverufraedi","lifraen-efnafraedi","edlisfraedi-2e"]`; `MAX_CHAPTERS = 99`.
- **Run the full suite from the repo root** (`npm test`) — authoritative gate; no branch protection.
- Spec: `docs/superpowers/specs/2026-07-20-item21-tm-and-added-terms-export-design.md`.

---

### Task 1: Extract pairing + serialization into `tools/lib/tm-export.cjs` (behavior-preserving)

Pure refactor — **no behavior change, no new formats yet**. The proof of correctness is that the existing `tools/__tests__/generate-tm.test.js` (which imports 12 names from `generate-tm.js`) stays green unchanged.

**Files:**
- Create: `tools/lib/tm-export.cjs`
- Modify: `tools/generate-tm.js` (becomes a thin ESM CLI over the lib; re-exports the moved names)
- Test: `tools/__tests__/generate-tm.test.js` (unchanged — it is the regression pin)

**Interfaces:**
- Produces (CommonJS exports from `tm-export.cjs`, consumed by later tasks + the CLI):
  - `parseSegments(content) → Map<string,string>`
  - `decodeEntities(text) → string`
  - `stripMarkers(text) → string`
  - `cleanSegmentText(raw) → string`
  - `xmlEscape(s) → string`
  - `tmxDate(date) → string`
  - `buildTmx(tus, opts={date,srclang}) → string`
  - `chapterLabel(dirName) → string`
  - `pairModule(enContent, isContent, meta) → {tus, stats}`
  - `listFaithfulChapterDirs(book, chapterFilter) → string[]`
  - `generateTm(book, opts={chapter}) → {tus, modules, totals}`
  - `TOOL_NAME='generate-tm.js'`, `TOOL_VERSION='1.0'`
  - `_setTestBooksDir(dir)` (mutates the lib's module-level `BOOKS_DIR`)

- [ ] **Step 1: Create `tools/lib/tm-export.cjs`** by moving the pure logic out of `generate-tm.js` verbatim, converted to CommonJS. Copy the bodies of `parseSegments`, `decodeEntities` (+ its `NAMED_ENTITIES`), `stripMarkers`, `cleanSegmentText`, `xmlEscape`, `tmxDate`, `buildTmx`, `chapterLabel`, `pairModule`, `listFaithfulChapterDirs`, `generateTm`, and the `BOOKS_DIR` handling from `generate-tm.js` (currently lines ~30–364). Head + tail of the new file:

```js
// tools/lib/tm-export.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { parseSegmentsMap } = require('./seg-markers.cjs');

const TOOL_NAME = 'generate-tm.js';
const TOOL_VERSION = '1.0';

// Books root: intrinsic (__dirname), never process.cwd() — server runs cwd=server/.
// tools/lib/../../books == repo-root/books.
let BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

function _setTestBooksDir(dir) {
  BOOKS_DIR = dir;
}

function parseSegments(content) {
  return parseSegmentsMap(content);
}

// … (decodeEntities, stripMarkers, cleanSegmentText, xmlEscape, tmxDate,
//     buildTmx, chapterLabel, pairModule, listFaithfulChapterDirs, generateTm —
//     bodies copied verbatim from generate-tm.js) …

module.exports = {
  parseSegments,
  decodeEntities,
  stripMarkers,
  cleanSegmentText,
  xmlEscape,
  tmxDate,
  buildTmx,
  chapterLabel,
  pairModule,
  listFaithfulChapterDirs,
  generateTm,
  TOOL_NAME,
  TOOL_VERSION,
  _setTestBooksDir,
};
```

Note while copying: `generateTm` and `listFaithfulChapterDirs` read the module-level `BOOKS_DIR`; keep those references so `_setTestBooksDir` continues to steer them. `buildTmx` uses `TOOL_NAME`/`TOOL_VERSION`; both now live in this lib.

- [ ] **Step 2: Rewrite `tools/generate-tm.js` to import from the lib and re-export.** Replace the moved function definitions with a single named import + a re-export, keeping only the CLI (`OUT_OPTION`, `DRY_RUN_OPTION`, `defaultOutPath`, `printHelp`, `main`, the `import.meta.url` guard). Top of file:

```js
#!/usr/bin/env node
/**
 * generate-tm.js — thin ESM CLI over tools/lib/tm-export.cjs.
 * Pairing + serialization live in the boundary lib so the server route
 * (CommonJS) can share one code path. See docs/superpowers/specs/2026-07-20-item21-*.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, requireBook } from './lib/parseArgs.js';
import {
  parseSegments,
  decodeEntities,
  stripMarkers,
  cleanSegmentText,
  xmlEscape,
  tmxDate,
  buildTmx,
  chapterLabel,
  pairModule,
  listFaithfulChapterDirs,
  generateTm,
  TOOL_NAME,
  _setTestBooksDir,
} from './lib/tm-export.cjs';
```

(`printHelp` uses `TOOL_NAME`; `TOOL_VERSION` is used only inside the lib now, so the CLI does not import it — importing it unused would trip `no-unused-vars`.) And at the bottom, replace the old `export { … }` block (which re-declared the moved functions) with a re-export of the imported names, preserving the exact export list the tests rely on:

```js
export {
  parseSegments,
  decodeEntities,
  stripMarkers,
  cleanSegmentText,
  xmlEscape,
  tmxDate,
  buildTmx,
  chapterLabel,
  pairModule,
  listFaithfulChapterDirs,
  generateTm,
  _setTestBooksDir,
};
```

Keep `main()` exactly as it is for now (it still calls `generateTm` + `buildTmx`, both now imported). Delete the CLI's own `TOOL_NAME`/`TOOL_VERSION` `const` declarations (`TOOL_NAME` is now imported for `printHelp`; `TOOL_VERSION` is unused in the CLI). **Keep a CLI-local `BOOKS_DIR`** — `main()`'s book-exists check and `defaultOutPath` still reference it at this task:

```js
const BOOKS_DIR = path.join(fileURLToPath(new URL('..', import.meta.url)), 'books');
```

(This CLI copy is *not* the lib's — it is only for the CLI's default write location. Task 3 removes it once `defaultOutPath` moves to the lib and `runExport` takes over writing.) `defaultOutPath`, `printHelp`, `OUT_OPTION`, `DRY_RUN_OPTION`, `main`, and the `if (process.argv[1] === fileURLToPath(import.meta.url)) main();` guard stay. Note the CLI's `_setTestBooksDir` is now the lib's (re-exported) and steers `generateTm`/`listFaithfulChapterDirs` (lib funcs) — not this CLI `BOOKS_DIR`, which no test exercises at this task (the existing tests never call `main`/`defaultOutPath`).

- [ ] **Step 3: Run the existing suite to verify the refactor is behavior-preserving**

Run: `npm test -- tools/__tests__/generate-tm.test.js`
Expected: PASS — all `parseSegments`/`stripMarkers`/`buildTmx`/`generateTm`/`_setTestBooksDir` describes green, unchanged. (Proves the move + re-export are transparent; `_setTestBooksDir` still steers `generateTm`.)

- [ ] **Step 4: Smoke-test the CLI end-to-end against a temp fixture** (no live data)

Run:
```bash
mkdir -p /tmp/tmx-smoke/books/efnafraedi-2e/02-for-mt/ch03 /tmp/tmx-smoke/books/efnafraedi-2e/03-faithful-translation/ch03
printf '<!-- SEG:m1:para:p1 -->\nWater is H[[sub:2]]O.\n' > /tmp/tmx-smoke/books/efnafraedi-2e/02-for-mt/ch03/m1-segments.en.md
printf '<!-- SEG:m1:para:p1 -->\nVatn er H[[sub:2]]O.\n' > /tmp/tmx-smoke/books/efnafraedi-2e/03-faithful-translation/ch03/m1-segments.is.md
node -e "const t=require('./tools/lib/tm-export.cjs'); t._setTestBooksDir('/tmp/tmx-smoke/books'); const {tus,totals}=t.generateTm('efnafraedi-2e',{}); console.log('pairs=',totals.pairs); console.log(t.buildTmx(tus,{date:new Date('2026-01-01T00:00:00Z')}).slice(0,120));"
```
Expected: `pairs= 1` and a `<?xml … <tmx version="1.4">` head containing the TU. Then `rm -rf /tmp/tmx-smoke`.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/tm-export.cjs tools/generate-tm.js
git commit -m "refactor(tm): extract pairing+serialization to tools/lib/tm-export.cjs boundary lib

Behavior-preserving. generate-tm.js becomes a thin ESM CLI that re-exports
the moved names; existing generate-tm.test.js green unchanged. Enables the
CommonJS server route to share one code path (spec item 21 PR-A)."
```

---

### Task 2: Add CSV + JSON serializers + `serializeTm` dispatcher + `FORMATS`

**Files:**
- Modify: `tools/lib/tm-export.cjs`
- Test: `tools/__tests__/tm-export.test.js` (new)

**Interfaces:**
- Consumes: `buildTmx`, `TOOL_NAME`, `TOOL_VERSION` (Task 1).
- Produces:
  - `FORMATS = ['tmx','csv','json']`
  - `serializeCsv(tus, opts={licence}) → string` (header `book,chapter,module,segment_id,en,is,licence` + one row per TU, RFC-4180 escaping, trailing `\n`; `licence` from `opts.licence`, same for every row)
  - `serializeJson(tus, opts={date,book,licence,obtained}) → string` (pretty JSON doc with `licence`/`obtained` in the manifest + trailing `\n`)
  - `serializeTm(tus, format='tmx', opts={}) → string` (dispatch; passes `opts` through unchanged — including `licence`/`obtained`; throws on unknown format)
  - `buildTmx(tus, opts={date,srclang,licence})` gains an additive `<prop type="licence">` in `<header>` when `opts.licence` is set (Task 1 moved it verbatim; this task adds the prop).

- [ ] **Step 1: Write the failing test** — `tools/__tests__/tm-export.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  serializeCsv,
  serializeJson,
  serializeTm,
  buildTmx,
  FORMATS,
} = require('../lib/tm-export.cjs');

const TUS = [
  { book: 'efnafraedi-2e', chapter: '3', module: 'm1', segmentId: 'm1:para:p1', en: 'Water is H2O.', is: 'Vatn er H2O.' },
  { book: 'efnafraedi-2e', chapter: '3', module: 'm1', segmentId: 'm1:para:p2', en: 'Acids, bases "and" salts', is: 'Sýrur' },
];
const LIC = 'CC BY 4.0';

describe('FORMATS', () => {
  it('is exactly tmx, csv, json', () => {
    expect(FORMATS).toEqual(['tmx', 'csv', 'json']);
  });
});

describe('serializeCsv', () => {
  it('emits a header (with licence column) and one row per TU', () => {
    const csv = serializeCsv(TUS, { licence: LIC });
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe('book,chapter,module,segment_id,en,is,licence');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('efnafraedi-2e,3,m1,m1:para:p1,Water is H2O.,Vatn er H2O.,CC BY 4.0');
  });

  it('quotes fields containing commas or quotes (RFC 4180)', () => {
    const csv = serializeCsv(TUS, { licence: LIC });
    // en of p2 has a comma AND embedded quotes -> quoted, inner " doubled
    expect(csv).toContain('"Acids, bases ""and"" salts"');
  });

  it('ends with a trailing newline', () => {
    expect(serializeCsv(TUS, { licence: LIC }).endsWith('\n')).toBe(true);
  });
});

describe('serializeJson', () => {
  it('emits a doc with stats + units + licence and a fixed date when provided', () => {
    const json = serializeJson(TUS, { date: new Date('2026-01-02T03:04:05Z'), book: 'efnafraedi-2e', licence: LIC, obtained: '2026-01-19' });
    const doc = JSON.parse(json);
    expect(doc.generated).toBe('2026-01-02T03:04:05.000Z');
    expect(doc.tool).toBe('generate-tm.js');
    expect(doc.version).toBe('1.0');
    expect(doc.book).toBe('efnafraedi-2e');
    expect(doc.licence).toBe('CC BY 4.0');
    expect(doc.obtained).toBe('2026-01-19');
    expect(doc.stats.units).toBe(2);
    expect(doc.units[0]).toEqual({ book: 'efnafraedi-2e', chapter: '3', module: 'm1', segmentId: 'm1:para:p1', en: 'Water is H2O.', is: 'Vatn er H2O.' });
  });
});

describe('buildTmx licence prop', () => {
  it('emits a licence header prop when opts.licence is set', () => {
    expect(buildTmx(TUS, { date: new Date('2026-01-02Z'), licence: LIC })).toContain('<prop type="licence">CC BY 4.0</prop>');
  });
  it('omits the licence prop (self-closed header) when no licence given', () => {
    expect(buildTmx(TUS, { date: new Date('2026-01-02Z') })).not.toContain('type="licence"');
  });
});

describe('serializeTm dispatch', () => {
  it('tmx dispatches to buildTmx, passing licence through', () => {
    const d = new Date('2026-01-02T03:04:05Z');
    expect(serializeTm(TUS, 'tmx', { date: d, licence: LIC })).toBe(buildTmx(TUS, { date: d, licence: LIC }));
  });
  it('csv dispatches to serializeCsv, passing licence through', () => {
    expect(serializeTm(TUS, 'csv', { licence: LIC })).toBe(serializeCsv(TUS, { licence: LIC }));
  });
  it('json dispatches to serializeJson, passing licence through', () => {
    const d = new Date('2026-01-02T03:04:05Z');
    const o = { date: d, book: 'efnafraedi-2e', licence: LIC, obtained: '2026-01-19' };
    expect(serializeTm(TUS, 'json', o)).toBe(serializeJson(TUS, o));
  });
  it('defaults to tmx when no format given', () => {
    const d = new Date('2026-01-02T03:04:05Z');
    expect(serializeTm(TUS, undefined, { date: d, licence: LIC })).toBe(buildTmx(TUS, { date: d, licence: LIC }));
  });
  it('throws on an unknown format', () => {
    expect(() => serializeTm(TUS, 'xml')).toThrow(/Unknown TM format/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tools/__tests__/tm-export.test.js`
Expected: FAIL — `serializeCsv`/`serializeJson`/`serializeTm`/`FORMATS` are undefined.

- [ ] **Step 3a: Add the licence header prop to `buildTmx`** (in `tools/lib/tm-export.cjs` — the function Task 1 moved verbatim). Replace the self-closed `<header … />` construction with a conditional open/child/close so the prop appears only when `opts.licence` is set (self-closed form otherwise → existing `buildTmx` tests unchanged):

```js
  const licenceProp = opts.licence
    ? `\n    <prop type="licence">${xmlEscape(opts.licence)}</prop>\n  `
    : '';
  const headerOpen =
    `  <header creationtool="${TOOL_NAME}" creationtoolversion="${TOOL_VERSION}" ` +
    `segtype="paragraph" o-tmf="namsbokasafn" adminlang="en" srclang="${srclang}" ` +
    `datatype="plaintext" creationdate="${date}"`;
  const header = licenceProp ? `${headerOpen}>${licenceProp}</header>` : `${headerOpen}/>`;
```

- [ ] **Step 3b: Add the serializers + dispatcher** before the `module.exports` block:

```js
const FORMATS = ['tmx', 'csv', 'json'];

/**
 * RFC-4180 CSV field escape: quote fields with comma/quote/CR/LF; double inner quotes.
 * @param {*} value
 * @returns {string}
 */
function csvEscapeField(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Serialize TUs as CSV: header + one row per TU. Every row carries the same
 * per-export licence (opts.licence), row-stamped like the corpus TSV.
 * @param {Array<{book,chapter,module,segmentId,en,is}>} tus
 * @param {{licence?:string}} [opts]
 * @returns {string}
 */
function serializeCsv(tus, opts = {}) {
  const licence = opts.licence || '';
  const rows = ['book,chapter,module,segment_id,en,is,licence'];
  for (const tu of tus) {
    rows.push(
      [tu.book, tu.chapter, tu.module, tu.segmentId, tu.en, tu.is, licence]
        .map(csvEscapeField)
        .join(',')
    );
  }
  return rows.join('\n') + '\n';
}

/**
 * Serialize TUs as a pretty JSON document with per-book licence in the manifest.
 * @param {Array} tus
 * @param {{date?:Date, book?:string, licence?:string, obtained?:string}} [opts]
 * @returns {string}
 */
function serializeJson(tus, opts = {}) {
  const doc = {
    generated: (opts.date || new Date()).toISOString(),
    tool: TOOL_NAME,
    version: TOOL_VERSION,
    book: opts.book || (tus[0] && tus[0].book) || null,
    licence: opts.licence || null,
    obtained: opts.obtained || null,
    stats: { units: tus.length },
    units: tus.map((tu) => ({
      book: tu.book,
      chapter: tu.chapter,
      module: tu.module,
      segmentId: tu.segmentId,
      en: tu.en,
      is: tu.is,
    })),
  };
  return JSON.stringify(doc, null, 2) + '\n';
}

/**
 * Dispatch serialization by format. Passes opts (incl. licence/obtained) through
 * unchanged. Throws on unknown format. Licence LOOKUP is the caller's job.
 * @param {Array} tus
 * @param {'tmx'|'csv'|'json'} [format]
 * @param {{date?:Date, book?:string, srclang?:string, licence?:string, obtained?:string}} [opts]
 * @returns {string}
 */
function serializeTm(tus, format = 'tmx', opts = {}) {
  switch (format) {
    case 'tmx':
      return buildTmx(tus, opts);
    case 'csv':
      return serializeCsv(tus, opts);
    case 'json':
      return serializeJson(tus, opts);
    default:
      throw new Error(`Unknown TM format: ${format} (valid: ${FORMATS.join(', ')})`);
  }
}
```

Then add `FORMATS, serializeCsv, serializeJson, serializeTm` to the `module.exports` object literal.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tools/__tests__/tm-export.test.js`
Expected: PASS (all describes green).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/tm-export.cjs tools/__tests__/tm-export.test.js
git commit -m "feat(tm): CSV + JSON serializers + licence stamping behind serializeTm

FORMATS=['tmx','csv','json']. buildTmx gains an additive <prop type=licence>
header prop (self-closed form unchanged without it); CSV a row-stamped licence
column; JSON a manifest licence/obtained. serializeJson takes an explicit
opts.date for deterministic output. Licence lookup is the caller's job."
```

---

### Task 3: Wire `--format` into the CLI (default tmx) + per-format default out-path

**Files:**
- Modify: `tools/generate-tm.js` (`FORMAT_OPTION`, `defaultOutPath`, `main`, `printHelp`)
- Modify: `CLAUDE.md` (Commands table row for `generate-tm.js`)
- Test: `tools/__tests__/generate-tm.test.js` (add a `--format` describe block)

**Interfaces:**
- Consumes: `serializeTm`, `FORMATS` (Task 2); `parseArgs`, `BOOK_OPTION`, `CHAPTER_OPTION` (existing).
- Produces:
  - `defaultOutPath(book, format) → string` — **added to `tools/lib/tm-export.cjs`** so it shares the lib's `BOOKS_DIR` (one source of truth; `_setTestBooksDir` steers it and `generateTm` alike). Re-exported from `generate-tm.js` for the pin test.
  - `FORMAT_OPTION` — exported from `generate-tm.js` (CLI-only).
  - `runExport({book, chapter, format, out, dryRun}) → {outPath, bytes, tus, totals}` — **the testable core of `main()`** (extracted so the load-bearing "no `--format` → TMX at `.tmx`" wiring is driven end-to-end, not just via isolated unit pins; `tmService.test.js` mocks the runner and cannot catch a mis-wired `main()`). Exported from `generate-tm.js`.

- [ ] **Step 1: Write the failing test** — append to `tools/__tests__/generate-tm.test.js` (adds `os`/`fs`/`path` are already imported at the top of that file):

```js
import { FORMAT_OPTION, defaultOutPath, runExport } from '../generate-tm.js';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION } from '../lib/parseArgs.js';

describe('CLI --format (auto-regen contract)', () => {
  it('defaults to tmx when --format is absent (protects tmService spawn)', () => {
    const args = parseArgs(['--book', 'efnafraedi-2e'], [BOOK_OPTION, CHAPTER_OPTION, FORMAT_OPTION]);
    expect(args.format).toBe('tmx');
  });

  it('parses an explicit --format', () => {
    const args = parseArgs(['--book', 'b', '--format', 'csv'], [BOOK_OPTION, CHAPTER_OPTION, FORMAT_OPTION]);
    expect(args.format).toBe('csv');
  });

  it('default out-path keeps the .tmx extension for tmx', () => {
    expect(defaultOutPath('efnafraedi-2e', 'tmx').endsWith('.tmx')).toBe(true);
  });

  it('default out-path swaps the extension per format', () => {
    expect(defaultOutPath('b', 'csv').endsWith('.csv')).toBe(true);
    expect(defaultOutPath('b', 'json').endsWith('.json')).toBe(true);
  });

  it('default out-path lives under books/<book>/tm/', () => {
    expect(defaultOutPath('b', 'tmx').includes(`${'b'}/tm/`)).toBe(true);
  });
});

// End-to-end wiring of main()'s core: the load-bearing "no --format → TMX at
// .tmx" contract, driven through the real generate → serialize → write path
// (tmService.test.js mocks the runner and can't catch a mis-wired main()).
describe('runExport (main() core, fixture-backed)', () => {
  let tmpRoot;
  function writeFixture() {
    const mk = (...p) => {
      const full = path.join(tmpRoot, ...p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      return full;
    };
    fs.writeFileSync(mk('books', 'efnafraedi-2e', '02-for-mt', 'ch03', 'm1-segments.en.md'), '<!-- SEG:m1:para:p1 -->\nWater.');
    fs.writeFileSync(mk('books', 'efnafraedi-2e', '03-faithful-translation', 'ch03', 'm1-segments.is.md'), '<!-- SEG:m1:para:p1 -->\nVatn.');
  }
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'run-export-'));
    _setTestBooksDir(path.join(tmpRoot, 'books'));
  });
  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    _setTestBooksDir(path.join(process.cwd(), 'books'));
  });

  it('with no format writes TMX at a .tmx path (the tmService contract)', () => {
    writeFixture();
    const r = runExport({ book: 'efnafraedi-2e' });
    expect(r.outPath.endsWith('.tmx')).toBe(true);
    expect(fs.readFileSync(r.outPath, 'utf-8')).toContain('<tmx version="1.4">');
    expect(r.tus).toHaveLength(1);
  });

  it('honors an explicit format + out path', () => {
    writeFixture();
    const out = path.join(tmpRoot, 'x.csv');
    const r = runExport({ book: 'efnafraedi-2e', format: 'csv', out });
    expect(r.outPath).toBe(out);
    const lines = fs.readFileSync(out, 'utf-8').split('\n');
    expect(lines[0]).toBe('book,chapter,module,segment_id,en,is,licence');
    expect(lines[1].endsWith(',CC BY 4.0')).toBe(true); // efnafraedi-2e licence stamped
  });

  it('dry-run computes the path + bytes without writing', () => {
    writeFixture();
    const r = runExport({ book: 'efnafraedi-2e', dryRun: true });
    expect(r.bytes).toBeGreaterThan(0);
    expect(fs.existsSync(r.outPath)).toBe(false);
  });
});
```

(`_setTestBooksDir`, `fs`, `os`, `path` are already imported at the top of `generate-tm.test.js`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tools/__tests__/generate-tm.test.js -t "CLI --format"`
Expected: FAIL — `FORMAT_OPTION` / `defaultOutPath` arity not exported/changed.

- [ ] **Step 3a: Move `defaultOutPath` into `tools/lib/tm-export.cjs`** (so it shares the lib's `BOOKS_DIR`). Add near the serializers, and add `defaultOutPath` to the lib's `module.exports`:

```js
const EXT = { tmx: 'tmx', csv: 'csv', json: 'json' };

/**
 * Default output path for a book's TM in the given format:
 * books/<book>/tm/<book>-<YYYY-MM-DD>.<ext>. Uses the lib's BOOKS_DIR so a
 * test override via _setTestBooksDir steers it and generateTm together.
 * @param {string} book
 * @param {'tmx'|'csv'|'json'} [format]
 * @returns {string}
 */
function defaultOutPath(book, format = 'tmx') {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(BOOKS_DIR, book, 'tm', `${book}-${date}.${EXT[format]}`);
}
```

- [ ] **Step 3b: Implement the CLI changes in `tools/generate-tm.js`.** Delete the *old* `defaultOutPath` (the pre-Task-1 TMX-only version, if it still lingers) and instead import `defaultOutPath` from the lib (add it to the existing named import from `./lib/tm-export.cjs`). Add the option definition near `OUT_OPTION`:

```js
const FORMAT_OPTION = {
  name: 'format',
  flags: ['--format'],
  type: 'string',
  default: 'tmx',
};
```

Import `FORMATS`, `serializeTm`, and `defaultOutPath` at the top (add to the existing named import from `./lib/tm-export.cjs`), and add a licence import: `import { getBookLicence } from './lib/book-licences.cjs';`.

**Extract the CLI core into a testable `runExport`** so the auto-regen wiring is driven end-to-end (inline-exported). The caller owns the licence lookup (fail-loud, mirrors the corpus export):

```js
/**
 * Pair → validate format → look up licence → serialize → write (unless dryRun).
 * The testable core of main(). Writes only when there are TUs — an empty TM is
 * never written (preserves the prior 0-pairs → no-file behavior). Throws (fail
 * loud) if the book has no licence recorded.
 * @param {{book:string, chapter?:number|string|null, format?:string, out?:string, dryRun?:boolean}} o
 * @returns {{outPath:string, bytes:number, tus:Array, totals:object, modules:Array, wrote:boolean}}
 */
export function runExport({ book, chapter = null, format = 'tmx', out = null, dryRun = false }) {
  if (!FORMATS.includes(format)) {
    throw new Error(`invalid --format '${format}' (valid: ${FORMATS.join(', ')})`);
  }
  const { tus, modules, totals } = generateTm(book, { chapter });
  const { licence, obtained } = getBookLicence(book); // fail-loud on unknown slug
  const outPath = out || defaultOutPath(book, format);
  const output = serializeTm(tus, format, { date: new Date(), book, licence, obtained });
  const wrote = tus.length > 0 && !dryRun;
  if (wrote) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output, 'utf-8');
  }
  return { outPath, bytes: output.length, tus, totals, modules, wrote };
}
```

**Slim `main()` to parse → runExport → report.** After `requireBook(args)`:
- **Remove** the CLI-local `BOOKS_DIR` const and the `bookDir` / `fs.existsSync(bookDir)` book-exists check (this deletes the CLI's last `BOOKS_DIR` use; a missing book now yields 0 pairs → the existing "No translation units produced" error + exit 1 — an acceptable, clearer message).
- Add `FORMAT_OPTION` to the `parseArgs([...])` list.
- Replace the generate/serialize/write tail with:

```js
  const format = args.format;
  if (!FORMATS.includes(format)) {
    console.error(`Error: invalid --format '${format}' (valid: ${FORMATS.join(', ')})`);
    process.exit(1);
  }

  const { tus, modules, totals, outPath, bytes } = runExport({
    book,
    chapter: args.chapter,
    format,
    out: args.out,
    dryRun: args.dryRun,
  });

  // Keep the existing --verbose per-module loop + the totals summary block,
  // now reading `modules`/`totals` from runExport's return (delete the separate
  // `const { tus, modules, totals } = generateTm(...)` call — runExport ran it).

  if (totals.pairs === 0) {
    console.error(
      '\nNo translation units produced. Is there reviewed content in 03-faithful-translation/?'
    );
    process.exit(1);
  }

  if (args.dryRun) {
    console.log(`\nDRY RUN — would write ${tus.length} TUs as ${format} (${bytes} bytes) to:\n  ${outPath}`);
    return;
  }
  console.log(`\nWrote ${tus.length} TUs as ${format} to:\n  ${outPath}`);
```

Add `FORMAT_OPTION, defaultOutPath` to the bottom `export { … }` block (`runExport` is already exported inline via `export function`; do not list it again).

Update `printHelp()` — add under Options:

```
  --format <fmt>     Output format: tmx (default) | csv | json
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tools/__tests__/generate-tm.test.js`
Expected: PASS (existing describes + the new `CLI --format` block).

- [ ] **Step 5: Verify the CLI honors `--format` against a temp fixture**

Run:
```bash
mkdir -p /tmp/tmf/books/efnafraedi-2e/02-for-mt/ch03 /tmp/tmf/books/efnafraedi-2e/03-faithful-translation/ch03
printf '<!-- SEG:m1:para:p1 -->\nWater.\n' > /tmp/tmf/books/efnafraedi-2e/02-for-mt/ch03/m1-segments.en.md
printf '<!-- SEG:m1:para:p1 -->\nVatn.\n' > /tmp/tmf/books/efnafraedi-2e/03-faithful-translation/ch03/m1-segments.is.md
node -e "const t=require('./tools/lib/tm-export.cjs'); const {getBookLicence}=require('./tools/lib/book-licences.cjs'); t._setTestBooksDir('/tmp/tmf/books'); const {tus}=t.generateTm('efnafraedi-2e',{}); const {licence,obtained}=getBookLicence('efnafraedi-2e'); console.log('CSV:\n'+t.serializeTm(tus,'csv',{licence})); console.log('JSON licence:', JSON.parse(t.serializeTm(tus,'json',{date:new Date('2026-01-01Z'),book:'efnafraedi-2e',licence,obtained})).licence);"
rm -rf /tmp/tmf
```
Expected: a CSV header+row and `JSON units: 1`.

- [ ] **Step 6: Update `CLAUDE.md` Commands table.** Change the `generate-tm.js` row to note the flag:

```
| `node tools/generate-tm.js --book <book> [--chapter N] [--format tmx\|csv\|json]` | Generate TM (TMX default; CSV/JSON) from paired EN/faithful segments |
```

- [ ] **Step 7: Commit**

```bash
git add tools/lib/tm-export.cjs tools/generate-tm.js tools/__tests__/generate-tm.test.js CLAUDE.md
git commit -m "feat(tm): generate-tm.js --format tmx|csv|json (tmx default)

Default format tmx + default .tmx out-path preserve the tmService auto-regen
contract (behaviorally pinned). CLAUDE.md command row updated."
```

---

### Task 4: `GET /api/tm/export` route + mount

**Files:**
- Create: `server/routes/tm.js`
- Modify: `server/index.js` (require + mount at `/api/tm`)
- Test: `server/__tests__/tmRoute.test.js` (new)

**Interfaces:**
- Consumes: `generateTm`, `serializeTm`, `FORMATS`, `_setTestBooksDir` (lib); `requireAuth`; `VALID_BOOKS` (`../config`); `MAX_CHAPTERS` (`../constants`).
- Produces: an Express router mounted at `/api/tm`, exposing `GET /export`.

- [ ] **Step 1: Write the failing test** — `server/__tests__/tmRoute.test.js` (handler-extraction harness, the house idiom from `terminologyReviewRoutes.test.js`):

```js
/**
 * Item 21 PR-A — GET /api/tm/export route contract.
 * Harness: handler + middleware extracted from router.stack, invoked with
 * fake req/res (terminologyReviewRoutes.test.js idiom). Fixture content via
 * _setTestBooksDir; book slug is a real VALID_BOOKS entry so the guard passes,
 * but all files live in a temp dir — never live books/.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

process.env.SESSIONS_DB_PATH = path.join(tmpdir(), `tm-route-${process.pid}.db`);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const require = createRequire(import.meta.url);
const tmExport = require('../../tools/lib/tm-export.cjs');
const router = require('../routes/tm');

const BOOK = 'efnafraedi-2e'; // a real VALID_BOOKS slug; content is fixture-only
let work;

function layer(method, routePath) {
  return router.stack.find((l) => l.route && l.route.path === routePath && l.route.methods[method]);
}
function handler(method, routePath) {
  const l = layer(method, routePath);
  return l.route.stack[l.route.stack.length - 1].handle;
}
function invoke(h, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      status(c) { this.statusCode = c; return this; },
      setHeader(k, v) { this.headers[k] = v; },
      json(body) { resolve({ status: this.statusCode, headers: this.headers, body }); },
      send(body) { resolve({ status: this.statusCode, headers: this.headers, body }); },
    };
    Promise.resolve(h(req, res));
  });
}

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), 'tm-route-books-'));
  const en = path.join(work, 'books', BOOK, '02-for-mt', 'ch03');
  const is = path.join(work, 'books', BOOK, '03-faithful-translation', 'ch03');
  mkdirSync(en, { recursive: true });
  mkdirSync(is, { recursive: true });
  writeFileSync(path.join(en, 'm1-segments.en.md'), '<!-- SEG:m1:para:p1 -->\nWater is H[[sub:2]]O.\n');
  writeFileSync(path.join(is, 'm1-segments.is.md'), '<!-- SEG:m1:para:p1 -->\nVatn er H[[sub:2]]O.\n');
  tmExport._setTestBooksDir(path.join(work, 'books'));
});

afterAll(() => {
  tmExport._setTestBooksDir(path.join(process.cwd(), 'books'));
  rmSync(work, { recursive: true, force: true });
});

describe('GET /api/tm/export', () => {
  it('wires requireAuth as the first middleware (gate fires)', async () => {
    const l = layer('get', '/export');
    expect(l.route.stack.length).toBeGreaterThanOrEqual(2); // requireAuth + handler
    const gate = l.route.stack[0].handle;
    const out = await invoke(gate, { headers: {}, cookies: {}, query: {} });
    expect(out.status).toBe(401);
  });

  it('defaults to tmx and sets attachment headers', async () => {
    const out = await invoke(handler('get', '/export'), { query: { book: BOOK }, user: { id: 'u1' } });
    expect(out.status).toBe(200);
    expect(out.headers['Content-Type']).toMatch(/xml/);
    expect(out.headers['Content-Disposition']).toContain(`${BOOK}-tm.tmx`);
    expect(out.body).toContain('<tmx version="1.4">');
    expect(out.body).toContain('<prop type="licence">CC BY 4.0</prop>'); // efnafraedi-2e licence stamped
  });

  it('serves csv when asked', async () => {
    const out = await invoke(handler('get', '/export'), { query: { book: BOOK, format: 'csv' }, user: { id: 'u1' } });
    expect(out.status).toBe(200);
    expect(out.headers['Content-Type']).toMatch(/csv/);
    expect(out.body.split('\n')[0]).toBe('book,chapter,module,segment_id,en,is,licence');
  });

  it('400s an unknown book', async () => {
    const out = await invoke(handler('get', '/export'), { query: { book: 'not-a-book' }, user: { id: 'u1' } });
    expect(out.status).toBe(400);
  });

  it('400s an unknown format', async () => {
    const out = await invoke(handler('get', '/export'), { query: { book: BOOK, format: 'xml' }, user: { id: 'u1' } });
    expect(out.status).toBe(400);
  });

  it('400s a bad chapter', async () => {
    const out = await invoke(handler('get', '/export'), { query: { book: BOOK, chapter: '999' }, user: { id: 'u1' } });
    expect(out.status).toBe(400);
  });

  it('404s a book with no faithful content', async () => {
    const out = await invoke(handler('get', '/export'), { query: { book: 'liffraedi-2e' }, user: { id: 'u1' } });
    expect(out.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- server/__tests__/tmRoute.test.js`
Expected: FAIL — `Cannot find module '../routes/tm'`.

- [ ] **Step 3: Create `server/routes/tm.js`:**

```js
/**
 * TM export route (item 21 PR-A). Regenerates the human-verified translation
 * memory on demand via the shared boundary lib and streams tmx|csv|json.
 * requireAuth only — reading a derived asset (mirrors glossary /export).
 */
const express = require('express');
const router = express.Router();

const log = require('../lib/logger');
const { requireAuth } = require('../middleware/requireAuth');
const { VALID_BOOKS } = require('../config');
const { MAX_CHAPTERS } = require('../constants');
const { generateTm, serializeTm, FORMATS } = require('../../tools/lib/tm-export.cjs');
const { getBookLicence } = require('../../tools/lib/book-licences.cjs');

const CONTENT_TYPE = {
  tmx: 'application/xml; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
};

router.get('/export', requireAuth, (req, res) => {
  const book = req.query.book;
  const format = req.query.format || 'tmx';
  const chapterRaw = req.query.chapter;

  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: 'Invalid book', message: `Unknown book: ${book}` });
  }
  if (!FORMATS.includes(format)) {
    return res
      .status(400)
      .json({ error: 'Invalid format', message: `format must be one of: ${FORMATS.join(', ')}` });
  }

  let chapter = null;
  if (chapterRaw !== undefined && chapterRaw !== '') {
    const n = Number(chapterRaw);
    if (!/^\d+$/.test(String(chapterRaw)) || !Number.isInteger(n) || n < 1 || n > MAX_CHAPTERS) {
      return res.status(400).json({ error: 'Invalid chapter', message: 'Chapter must be 1–99' });
    }
    chapter = n;
  }

  try {
    const { tus } = generateTm(book, { chapter });
    if (!tus.length) {
      return res.status(404).json({
        error: 'No translation memory',
        message: `No reviewed (faithful) content for ${book}${chapter ? ` chapter ${chapter}` : ''}.`,
      });
    }
    const { licence, obtained } = getBookLicence(book); // fail-loud; VALID_BOOKS all have rows
    const body = serializeTm(tus, format, { date: new Date(), book, licence, obtained });
    const fname = `${book}${chapter ? `-K${chapter}` : ''}-tm.${format}`;
    res.setHeader('Content-Type', CONTENT_TYPE[format]);
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    return res.send(body);
  } catch (err) {
    log.error({ err, book }, 'TM export failed');
    return res.status(500).json({ error: 'TM export failed', message: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 4: Mount it in `server/index.js`.** Add the require alongside the others (near line 70):

```js
const tmRoutes = require('./routes/tm');
```

and the mount alongside the others (near line 241, after the `books` mount):

```js
app.use('/api/tm', tmRoutes);
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- server/__tests__/tmRoute.test.js`
Expected: PASS (all 7 cases: auth gate 401, tmx default, csv, 3×400, 404).

- [ ] **Step 6: Commit**

```bash
git add server/routes/tm.js server/index.js server/__tests__/tmRoute.test.js
git commit -m "feat(tm): GET /api/tm/export route (tmx|csv|json, requireAuth)

Regenerates on demand via tools/lib/tm-export.cjs; stamps per-book licence
(getBookLicence, fail-loud). VALID_BOOKS + chapter guards mirror the book
/download route; 404 on a book with no faithful TM."
```

---

### Task 5: TM download control on `books.html`

**Files:**
- Modify: `server/views/books.html` (a "Sækja þýðingaminni" control + `downloadTm` function)

**Interfaces:**
- Consumes: `GET /api/tm/export` (Task 4); the page's existing `selectedBook` / `selectedChapter` state and the `downloadPublishedHtml` pattern.

- [ ] **Step 1: Add the `downloadTm` function** next to `downloadPublishedHtml` (~line 2237):

```js
      function downloadTm(book, format) {
        if (!book) return;
        var url = '/api/tm/export?book=' + encodeURIComponent(book) + '&format=' + encodeURIComponent(format);
        window.location.href = url;
      }
```

- [ ] **Step 2: Add the control** beside the existing per-book download button (`downloadBookMarkdown`, ~line 929). Mirror its markup:

```html
              <div class="tm-download" style="display:inline-block; margin-left:0.5rem;">
                <label for="tm-format" class="visually-hidden">Snið þýðingaminnis</label>
                <select id="tm-format" class="btn btn-sm">
                  <option value="tmx">TMX</option>
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
                <button class="btn btn-sm btn-secondary"
                        onclick="downloadTm(selectedBook, document.getElementById('tm-format').value)"
                        title="Sækja þýðingaminni bókarinnar (TMX/CSV/JSON)">
                  Sækja þýðingaminni
                </button>
              </div>
```

(Keep it whole-book: no `chapter` param, so the export covers the book including appendices — matching how `downloadBookMarkdown` behaves for the book.)

- [ ] **Step 3: Syntax-check the added client function** (campaign lesson: `node --check` hand-edited client JS). Extract and check just the function body:

```bash
node --check <(printf 'function downloadTm(book, format){ if(!book) return; var url="/api/tm/export?book="+encodeURIComponent(book)+"&format="+encodeURIComponent(format); window.location.href=url; }')
```
Expected: no output (exit 0 = syntactically valid). The endpoint it calls is proven by Task 4's route tests; the button itself is verified in the manual QA step (Task 6).

- [ ] **Step 4: Commit**

```bash
git add server/views/books.html
git commit -m "feat(tm): TM download control (TMX/CSV/JSON) on books.html

Whole-book export via GET /api/tm/export, mirroring downloadPublishedHtml."
```

---

### Task 6: Full-suite gate + manual smoke + register

**Files:**
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item 21 register note, only if a finding surfaced)

- [ ] **Step 1: Run the full suite from the repo root**

Run: `npm test`
Expected: PASS — the pre-branch count + the new `tm-export`, `generate-tm` `--format`, and `tmRoute` cases; **no reds**. Record the new total.

- [ ] **Step 2: Manual smoke of the route** (optional if a server is running locally): start the dev server, log in, and hit `/api/tm/export?book=efnafraedi-2e&format=csv` — confirm a CSV download with the header row. (efnafraedi-2e is the one book with real faithful content; the others 404, which is correct.)

- [ ] **Step 3: Register any out-of-scope finds** discovered during implementation to the campaign doc's item-21 register (per standing feedback), and note the PR-A completion line when opening the PR. If none surfaced, skip.

- [ ] **Step 4: Final commit (if Step 3 wrote anything)**

```bash
git add docs/plans/2026-07-11-pre-semester-coding-campaign.md
git commit -m "docs(campaign): item 21 PR-A register notes"
```

---

## Self-Review

**1. Spec coverage** (spec §PR-A):
- A1 components — `tm-export.cjs` (Task 1), serializers (Task 2), CLI (Task 3), route (Task 4), `books.html` UI (Task 5). ✓
- A2 formats tmx/csv/json — Task 2 (`FORMATS`) + Task 2/3 serializers. ✓
- A3 CLI `--format` default tmx + per-format out-path — Task 3. ✓
- A4 route (requireAuth, VALID_BOOKS/chapter guards, regenerate-on-demand, Content-Disposition, 404 empty, 500 log) — Task 4. ✓
- A5 testing (TMX byte-identical via dispatch pin; CSV escaping; JSON shape; **auto-regen default-tmx wiring pinned end-to-end through `runExport`**, not just isolated units; route dispatch/auth/400/404) — Tasks 2–4. ✓
- Global constraint TOOL_VERSION unchanged — honored (Task 2 asserts version '1.0'; TMX gains only the additive licence prop). ✓
- Licence stamping (lead 2026-07-20) — buildTmx prop + CSV column + JSON manifest (Task 2), caller lookup via `getBookLicence` in `runExport` (Task 3) + route (Task 4), all fail-loud + test-asserted. ✓

**2. Placeholder scan:** every code step shows full code; every run step gives the command + expected result. No TBD/TODO. ✓

**3. Type consistency:** `serializeTm(tus, format, opts)`, `serializeCsv(tus)`, `serializeJson(tus, opts)`, `generateTm(book, {chapter})`, `defaultOutPath(book, format)`, `FORMATS`, `_setTestBooksDir` — names/arity identical across the lib (Task 1/2), CLI (Task 3), and route (Task 4). The re-export list in Task 1 matches the 12 names `generate-tm.test.js` imports; Task 3 adds `FORMAT_OPTION`/`defaultOutPath` to the export block before its test imports them. ✓

**Note carried to PR-B (not this plan):** the Árnastofnun added-terms half is a separate plan/PR off updated `main` after this merges.
