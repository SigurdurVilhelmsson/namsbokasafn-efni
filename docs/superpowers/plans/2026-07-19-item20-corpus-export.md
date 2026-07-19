# Aligned Research-Corpus Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `tools/export-corpus.js` — a pure-file CLI that emits a per-book aligned {EN, MT, faithful, localized} segment corpus as JSONL + TSV + manifest, per the approved spec `docs/superpowers/specs/2026-07-19-item20-research-corpus-export-design.md`.

**Architecture:** Standalone ESM CLI on the generate-tm template. EN-driven discovery over `02-for-mt/`, seg-id join via the shared `seg-markers.cjs`, raw+clean text per tier, deterministic output. One refactor: the three MT-normalization functions move verbatim from `server/services/segmentParser.js` to a new `tools/lib/mt-normalize.cjs` (server re-exports by reference — the seg-markers unification pattern) so the corpus tool can compute the `postEdited` flag with the editor's exact semantics.

**Tech Stack:** Node 22 ESM (tools/), CommonJS `.cjs` for dual-consumed libs, Vitest.

## Global Constraints

- Branch: `feat/item20-corpus-export`, cut from local main (spec commit `6dcfdb9a` is already on main).
- `npm test` **from repo root** is the authoritative gate (no branch protection). vitest 4 ignores `--project server` — use full runs or path-scoped `npx vitest run <path>`.
- `tools/generate-tm.js`, `server/services/tmService.js`, `server/services/concordanceService.js`: **byte-untouched**. TM output must not change.
- `server/services/segmentParser.js`: behavior byte-identical; the only change is relocation + re-export of `normalizeWraps`/`unescapeMtMarkers`/`normalizeTermMarkers` (consumers: `server/scripts/backfill-content-versions.js`, `server/__tests__/segmentParser.test.js`, `server/__tests__/segmentEditBackstop.test.js` — all keep working via the re-export).
- The corpus tool only **reads** `books/` (all four tier dirs); `01-source/` and `02-mt-output/` are READ-ONLY by repo rule and this tool never writes them.
- Resolve `books/` via `import.meta.url`, never `process.cwd()` (#213 rule).
- Output dir `books/{book}/corpus/` is **gitignored** (Task 6 adds the entry).
- Icelandic literals in tests are literal UTF-8 (no `\uXXXX` escapes); pins must match file bytes.
- Row field order and TSV column order are frozen by the spec: `id, book, chapter, module, type, elementId, licence, en, mt, faithful, localized, postEdited` (JSONL) and `id, book, chapter, module, type, licence, en_clean, mt_clean, faithful_clean, localized_clean, postEdited` (TSV).

---

### Task 1: Extract MT normalization chain to `tools/lib/mt-normalize.cjs`

**Files:**
- Create: `tools/lib/mt-normalize.cjs`
- Modify: `server/services/segmentParser.js` (delete local defs at :35-98, add require, keep exports)
- Test: `server/__tests__/segmentParser.test.js` (add reference-identity pin)

**Interfaces:**
- Consumes: nothing new.
- Produces: `require('./lib/mt-normalize.cjs')` → `{ normalizeWraps(text), unescapeMtMarkers(text), normalizeTermMarkers(enContent, isContent) }` — exact same function objects re-exported by `segmentParser.js`. Task 3 imports these from the new lib.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git checkout -b feat/item20-corpus-export
```

- [ ] **Step 2: Write the failing reference-identity test**

In `server/__tests__/segmentParser.test.js`, add next to the existing chapterDir pin (`:308-312`, `it('is reference-identical to lib/chapterLabel.chapterDir …`). Add the require at the top of the file alongside the existing requires:

```js
const mtNormalize = require('../../tools/lib/mt-normalize.cjs');
```

and the test (inside the same describe block as the chapterDir pin):

```js
it('re-exports mt-normalize functions reference-identical (protects backfill-content-versions.js)', () => {
  expect(segmentParser.normalizeWraps).toBe(mtNormalize.normalizeWraps);
  expect(segmentParser.unescapeMtMarkers).toBe(mtNormalize.unescapeMtMarkers);
  expect(segmentParser.normalizeTermMarkers).toBe(mtNormalize.normalizeTermMarkers);
});
```

(Use the file's actual local names — it requires segmentParser as `segmentParser` per the `:310-311` pin; mirror that.)

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run server/__tests__/segmentParser.test.js`
Expected: FAIL — `Cannot find module '../../tools/lib/mt-normalize.cjs'`

- [ ] **Step 4: Create `tools/lib/mt-normalize.cjs`**

Move the three functions **verbatim** (bodies AND JSDoc) from `server/services/segmentParser.js:35-98`:

```js
/**
 * mt-normalize.cjs — the MT-draft normalization chain, shared between the
 * editorial server (segmentParser re-exports these by reference) and the
 * corpus exporter (tools/export-corpus.js), which must reproduce the
 * editor-visible view of a segment to compute an honest postEdited flag.
 *
 * Moved verbatim from server/services/segmentParser.js (campaign item 20).
 * CommonJS so both the ESM tools (named import) and the CommonJS server
 * (sync require) can consume it — the seg-markers.cjs pattern.
 */

/**
 * Normalize hard line-wraps to spaces. Single newlines inside a segment are
 * wrapping artifacts from extraction; double newlines are kept as
 * intentional paragraph breaks (double newlines).
 *
 * @param {string} text - Raw segment content
 * @returns {string} Content with hard wraps normalized
 */
function normalizeWraps(text) {
  return text.replace(/(?<!\n)\n(?!\n)/g, ' ');
}

/**
 * Unescape MT-introduced backslash escapes in segment content.
 * The malstadur.is MT service escapes markdown-like brackets:
 *   \[\[MATH:4\]\] → [[MATH:4]]
 *   \_\_term\_\_   → __term__
 *   \*bold\*       → *bold*
 *
 * The injection pipeline (cnxml-inject.js:452-457) already handles this
 * for published HTML, but the segment editor shows raw file content.
 * Unescaping here ensures editors see clean markers.
 *
 * @param {string} text - Raw segment content
 * @returns {string} Content with MT escapes removed
 */
function unescapeMtMarkers(text) {
  if (!text) return text;
  return text
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .replace(/\\\*/g, '*')
    .replace(/\\_/g, '_');
}

/**
 * Normalize term markers in IS content based on EN source.
 * MT engines (e.g. malstadur.is) convert __term__ to **term**.
 * This detects excess ** in IS (compared to EN) and converts them back to __.
 *
 * @param {string} enContent - EN source segment content
 * @param {string} isContent - IS translation segment content
 * @returns {string} IS content with term markers normalized
 */
// B4 note: bracket-era EN segments ([[term:text|id]]) contain no __term__
// markers, so enTermCount is 0 and this repair is a deliberate no-op for them.
function normalizeTermMarkers(enContent, isContent) {
  if (!enContent || !isContent) return isContent;

  const enTermCount = (enContent.match(/__(.+?)__/g) || []).length;
  if (enTermCount === 0) return isContent;

  const enBoldCount = (enContent.match(/\*\*(.+?)\*\*/g) || []).length;
  const isTermCount = (isContent.match(/__(.+?)__/g) || []).length;
  const isBoldCount = (isContent.match(/\*\*(.+?)\*\*/g) || []).length;

  const missingTerms = enTermCount - isTermCount;
  if (missingTerms <= 0) return isContent;

  const excessBold = isBoldCount - enBoldCount;
  if (excessBold <= 0) return isContent;

  const termsToConvert = Math.min(missingTerms, excessBold);
  let converted = 0;
  return isContent.replace(/\*\*(.+?)\*\*/g, (match, text) => {
    if (converted < termsToConvert) {
      converted++;
      return `__${text}__`;
    }
    return match;
  });
}

module.exports = { normalizeWraps, unescapeMtMarkers, normalizeTermMarkers };
```

- [ ] **Step 5: Delegate in `server/services/segmentParser.js`**

Add the require next to the existing seg-markers require (`:18`):

```js
const {
  normalizeWraps,
  unescapeMtMarkers,
  normalizeTermMarkers,
} = require('../../tools/lib/mt-normalize.cjs');
```

Delete the three function definitions **and their JSDoc blocks** (the region from the `normalizeWraps` JSDoc down through the closing brace of `normalizeTermMarkers`, currently `:24-98` — everything between the `SEG_MARKER_REGEX` const and the `parseSegments` JSDoc). Replace with a single pointer comment:

```js
// normalizeWraps / unescapeMtMarkers / normalizeTermMarkers moved verbatim to
// tools/lib/mt-normalize.cjs (item 20) — required above, re-exported below by
// reference so backfill-content-versions.js and tests keep working unchanged.
```

`module.exports` (`:514-517`) keeps the three names — they now point at the required references, which is exactly what the new pin asserts. **No other line changes.**

- [ ] **Step 6: Run the affected suites**

Run: `npx vitest run server/__tests__/segmentParser.test.js server/__tests__/segmentParserExercises.test.js server/__tests__/segmentEditBackstop.test.js`
Expected: PASS (all, including the new pin)

- [ ] **Step 7: Commit**

```bash
git add tools/lib/mt-normalize.cjs server/services/segmentParser.js server/__tests__/segmentParser.test.js
git commit -m "refactor(item20): extract MT normalization chain to tools/lib/mt-normalize.cjs

Verbatim relocation; segmentParser re-exports by reference (pinned toBe,
seg-markers/chapterDir precedent). Needed so the corpus exporter can compute
postEdited with the editor's exact view semantics."
```

---

### Task 2: Licence map `tools/lib/book-licences.cjs`

**Files:**
- Create: `tools/lib/book-licences.cjs`
- Test: `tools/__tests__/book-licences.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `getBookLicence(slug)` → `{ licence: string, obtained: string }`, **throws** `Error` (message names the file) on unknown slug; `BOOK_LICENCES` map. Task 4's `buildCorpus` and Task 6's `main` consume `getBookLicence`.

- [ ] **Step 1: Write the failing tests**

Create `tools/__tests__/book-licences.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { getBookLicence, BOOK_LICENCES } from '../lib/book-licences.cjs';

describe('getBookLicence', () => {
  it('returns CC BY 4.0 with obtained date for efnafraedi-2e', () => {
    expect(getBookLicence('efnafraedi-2e')).toEqual({
      licence: 'CC BY 4.0',
      obtained: '2026-01-19',
    });
  });

  it('returns CC BY-NC-SA 4.0 for the two NC books', () => {
    expect(getBookLicence('edlisfraedi-2e').licence).toBe('CC BY-NC-SA 4.0');
    expect(getBookLicence('lifraen-efnafraedi').licence).toBe('CC BY-NC-SA 4.0');
  });

  it('throws on an unknown slug, naming the map file (deliberate licence-first onboarding)', () => {
    expect(() => getBookLicence('stjornufraedi')).toThrow(/book-licences\.cjs/);
    expect(() => getBookLicence('testbook')).toThrow(/book-licences\.cjs/);
  });

  it('covers exactly the five active pipeline books', () => {
    expect(Object.keys(BOOK_LICENCES).sort()).toEqual([
      'edlisfraedi-2e',
      'efnafraedi-2e',
      'liffraedi-2e',
      'lifraen-efnafraedi',
      'orverufraedi',
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/book-licences.test.js`
Expected: FAIL — `Cannot find module '../lib/book-licences.cjs'`

- [ ] **Step 3: Implement the map**

Create `tools/lib/book-licences.cjs` (dates transcribed from the provenance doc §1 determination table — do not invent values):

```js
/**
 * book-licences.cjs — per-book licence for export tools.
 *
 * Transcribed from docs/provenance/openstax-cnxml-licence-provenance.md §1
 * (the authoritative record; Physics resolved CC BY-NC-SA by user decision
 * 2026-06-24). Campaign item 17 will move licence metadata into book-config;
 * until then this file is the single swap point.
 *
 * getBookLicence THROWS on an unknown slug: a new book enters the export
 * corpus deliberately, licence-first — add its row here after checking the
 * provenance doc.
 */

const BOOK_LICENCES = {
  'efnafraedi-2e': { licence: 'CC BY 4.0', obtained: '2026-01-19' },
  'liffraedi-2e': { licence: 'CC BY 4.0', obtained: '2026-03-11' },
  orverufraedi: { licence: 'CC BY 4.0', obtained: '2026-03-09' },
  'edlisfraedi-2e': { licence: 'CC BY-NC-SA 4.0', obtained: '2026-03-23' },
  'lifraen-efnafraedi': { licence: 'CC BY-NC-SA 4.0', obtained: '2026-03-23' },
};

/**
 * @param {string} slug
 * @returns {{licence: string, obtained: string}}
 */
function getBookLicence(slug) {
  const entry = BOOK_LICENCES[slug];
  if (!entry) {
    throw new Error(
      `No licence recorded for book "${slug}" — add it to tools/lib/book-licences.cjs ` +
        'after checking docs/provenance/openstax-cnxml-licence-provenance.md'
    );
  }
  return entry;
}

module.exports = { BOOK_LICENCES, getBookLicence };
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tools/__tests__/book-licences.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/lib/book-licences.cjs tools/__tests__/book-licences.test.js
git commit -m "feat(item20): per-book licence map, fail-loud on unknown slugs"
```

---

### Task 3: Corpus text + row helpers (start `tools/export-corpus.js`)

**Files:**
- Create: `tools/export-corpus.js` (helpers only; CLI arrives in Task 6)
- Test: `tools/__tests__/export-corpus.test.js`

**Interfaces:**
- Consumes: `cleanSegmentText` from `../export-corpus.js`'s import of `./generate-tm.js` (side-effect-free import — generate-tm's `main()` is argv-guarded); `normalizeWraps`/`unescapeMtMarkers`/`normalizeTermMarkers` from `./lib/mt-normalize.cjs` (Task 1).
- Produces (all `export`ed): `corpusCleanText(raw) → string`; `splitSegId(id) → {moduleId, segmentType, elementId}` (missing parts → `null`); `computePostEdited(enRaw, mtRaw, faithfulRaw) → boolean|null`; `buildRow({id, book, chapter, module, licence, en, mt, faithful, localized}) → row` where each tier is `{raw, clean}|null` and row key order is the frozen spec order. Tasks 4–5 consume `buildRow`; tests consume all four.

- [ ] **Step 1: Write the failing tests**

Create `tools/__tests__/export-corpus.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  corpusCleanText,
  splitSegId,
  computePostEdited,
  buildRow,
} from '../export-corpus.js';

describe('corpusCleanText', () => {
  it('strips TM markers and decodes lb/rb escapes to literal brackets', () => {
    expect(corpusCleanText('pH [[lb:]]H[[sub:3]]O[[sup:+]][[rb:]]')).toBe('pH [H3O+]');
  });

  it('keeps MATH and MEDIA placeholders verbatim', () => {
    expect(corpusCleanText('See [[MATH:2]] and [[MEDIA:1]]')).toBe('See [[MATH:2]] and [[MEDIA:1]]');
  });

  it('decodes lb/rb LAST so restored brackets never form new markers', () => {
    // Literal source text "[[i:x]]" arrives bracket-escaped; the restored
    // brackets must NOT be re-parsed and stripped as an [[i:]] marker.
    expect(corpusCleanText('[[lb:]][[lb:]]i:x]]')).toBe('[[i:x]]');
  });

  it('leaves single-char legacy markers alone (TM ambiguity rationale)', () => {
    expect(corpusCleanText('H~2~O og *Macro* og __efnafræði__')).toBe(
      'H~2~O og *Macro* og __efnafræði__'
    );
  });
});

describe('splitSegId', () => {
  it('splits a 3-part id', () => {
    expect(splitSegId('m68664:para:fs-idm183676832')).toEqual({
      moduleId: 'm68664',
      segmentType: 'para',
      elementId: 'fs-idm183676832',
    });
  });

  it('tolerates short ids with nulls', () => {
    expect(splitSegId('chapter-title')).toEqual({
      moduleId: 'chapter-title',
      segmentType: null,
      elementId: null,
    });
  });
});

describe('computePostEdited', () => {
  it('is false when faithful equals the normalized MT view (untouched segment)', () => {
    // MT carries a hard wrap + malstadur backslash escapes; the faithful file
    // holds the editor-visible normalization of the same text — no human edit.
    const en = 'Water is a [[i:solid]].';
    const mt = 'Vatn er\n\\[\\[MATH:1\\]\\] fast efni.';
    const faithful = 'Vatn er [[MATH:1]] fast efni.';
    expect(computePostEdited(en, mt, faithful)).toBe(false);
  });

  it('applies the EN-aware term-marker repair before comparing', () => {
    // EN has __term__; MT came back with ** (malstadur artifact). The editor
    // view converts ** back to __ — faithful saved from that view must NOT
    // read as a human edit.
    const en = 'A __mole__ is a unit.';
    const mt = 'Eitt **mól** er eining.';
    const faithful = 'Eitt __mól__ er eining.';
    expect(computePostEdited(en, mt, faithful)).toBe(false);
  });

  it('is true for a real edit', () => {
    expect(computePostEdited('Water.', 'Vatn.', 'Vatnið.')).toBe(true);
  });

  it('is null when either IS tier is missing', () => {
    expect(computePostEdited('Water.', null, 'Vatn.')).toBeNull();
    expect(computePostEdited('Water.', 'Vatn.', null)).toBeNull();
  });
});

describe('buildRow', () => {
  it('emits the frozen field order, raw+clean tiers, and null for absent tiers', () => {
    const row = buildRow({
      id: 'm1:para:p1',
      book: 'efnafraedi-2e',
      chapter: '1',
      module: 'm1',
      licence: 'CC BY 4.0',
      en: 'Water is [[i:wet]].',
      mt: 'Vatn er [[i:blautt]].',
      faithful: null,
      localized: null,
    });
    expect(Object.keys(row)).toEqual([
      'id', 'book', 'chapter', 'module', 'type', 'elementId', 'licence',
      'en', 'mt', 'faithful', 'localized', 'postEdited',
    ]);
    expect(row.type).toBe('para');
    expect(row.elementId).toBe('p1');
    expect(row.en).toEqual({ raw: 'Water is [[i:wet]].', clean: 'Water is wet.' });
    expect(row.mt.clean).toBe('Vatn er blautt.');
    expect(row.faithful).toBeNull();
    expect(row.localized).toBeNull();
    expect(row.postEdited).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/export-corpus.test.js`
Expected: FAIL — `Cannot find module '../export-corpus.js'`

- [ ] **Step 3: Implement the helpers**

Create `tools/export-corpus.js`:

```js
#!/usr/bin/env node

/**
 * export-corpus.js — aligned research-corpus export (campaign item 20).
 *
 * Emits, per segment, the four pipeline tiers {EN, MT, faithful, localized}
 * joined on the frozen SEG id, as JSONL (canonical, raw+clean per tier) +
 * TSV (clean text) + a stats/licence manifest. EN-driven: every extracted
 * segment becomes a row; absent tiers are null. The postEdited flag
 * reproduces the segment editor's exact view semantics (mt-normalize chain)
 * so normalization artifacts never masquerade as human edits.
 *
 * Spec: docs/superpowers/specs/2026-07-19-item20-research-corpus-export-design.md
 *
 * Usage:
 *   node tools/export-corpus.js --book efnafraedi-2e
 *   node tools/export-corpus.js --book efnafraedi-2e --chapter 3 --dry-run -v
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, requireBook } from './lib/parseArgs.js';
import { parseSegmentsMap, parseSegmentRecords } from './lib/seg-markers.cjs';
import {
  normalizeWraps,
  unescapeMtMarkers,
  normalizeTermMarkers,
} from './lib/mt-normalize.cjs';
import { getBookLicence } from './lib/book-licences.cjs';
import { cleanSegmentText, chapterLabel } from './generate-tm.js';

const TOOL_NAME = 'export-corpus.js';
const TOOL_VERSION = '1.0';

let BOOKS_DIR = path.join(fileURLToPath(new URL('..', import.meta.url)), 'books');

// ─── Text & row helpers ───────────────────────────────────────────────

/**
 * Corpus clean text: the TM's cleanSegmentText plus corpus-only additions.
 * [[lb:]]/[[rb:]] (item-9 literal-bracket escapes) decode LAST so restored
 * brackets can never be re-parsed as markers; [[MATH:N]]/[[MEDIA:n]] pass
 * through verbatim (positional placeholders, resolvable via 02-structure).
 *
 * @param {string} raw
 * @returns {string}
 */
function corpusCleanText(raw) {
  return cleanSegmentText(raw).replace(/\[\[lb:\]\]/g, '[').replace(/\[\[rb:\]\]/g, ']');
}

/**
 * Split a seg-id into its parts; tolerates short ids (missing parts → null).
 * @param {string} id
 * @returns {{moduleId: string|null, segmentType: string|null, elementId: string|null}}
 */
function splitSegId(id) {
  const [moduleId, segmentType, ...rest] = id.split(':');
  return {
    moduleId: moduleId || null,
    segmentType: segmentType || null,
    elementId: rest.length ? rest.join(':') : null,
  };
}

/**
 * The editor-visible view of an IS tier, per loadModuleForEditing
 * (server/services/segmentParser.js:164-239): normalizeWraps on parse →
 * unescapeMtMarkers → normalizeTermMarkers against the wrap-normalized EN.
 * postEdited answers "would the editor's diff view show a change" —
 * a byte-comparison against raw MT would mislabel every normalization
 * artifact as a human edit.
 *
 * @param {string} enRaw
 * @param {string|null} mtRaw
 * @param {string|null} faithfulRaw
 * @returns {boolean|null} null unless both IS tiers are present
 */
function computePostEdited(enRaw, mtRaw, faithfulRaw) {
  if (mtRaw == null || faithfulRaw == null) return null;
  const enView = normalizeWraps(enRaw ?? '');
  const view = (t) => normalizeTermMarkers(enView, unescapeMtMarkers(normalizeWraps(t)));
  return view(faithfulRaw).trim() !== view(mtRaw).trim();
}

/**
 * Build one corpus row. Key insertion order is the frozen spec order —
 * JSON.stringify preserves it, so JSONL output diffs deterministically.
 *
 * @param {{id: string, book: string, chapter: string, module: string,
 *          licence: string, en: string, mt: string|null,
 *          faithful: string|null, localized: string|null}} p
 * @returns {object}
 */
function buildRow(p) {
  const { segmentType, elementId } = splitSegId(p.id);
  const tier = (raw) => (raw == null ? null : { raw, clean: corpusCleanText(raw) });
  return {
    id: p.id,
    book: p.book,
    chapter: p.chapter,
    module: p.module,
    type: segmentType,
    elementId,
    licence: p.licence,
    en: tier(p.en),
    mt: tier(p.mt),
    faithful: tier(p.faithful),
    localized: tier(p.localized),
    postEdited: computePostEdited(p.en, p.mt, p.faithful),
  };
}

export { corpusCleanText, splitSegId, computePostEdited, buildRow };

/** @internal Test-only: override the books directory root. */
export function _setTestBooksDir(dir) {
  BOOKS_DIR = dir;
}
```

(`parseArgs`/`BOOK_OPTION`/`CHAPTER_OPTION`/`requireBook`, `parseSegmentsMap`/`parseSegmentRecords`, `getBookLicence`, `BOOKS_DIR`, `TOOL_NAME`/`TOOL_VERSION` are unused until Tasks 4–6 — that's fine; eslint may flag unused imports, in which case add them in the task that uses them instead: keep only `mt-normalize`, `generate-tm` imports plus `fs`/`path`/`fileURLToPath` now, and add the rest in Tasks 4/6. The pre-commit hook strips nothing from committed source, but eslint must pass.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tools/__tests__/export-corpus.test.js`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/export-corpus.js tools/__tests__/export-corpus.test.js
git commit -m "feat(item20): corpus text/row helpers — corpusCleanText, splitSegId, postEdited, buildRow"
```

---

### Task 4: Discovery + `buildCorpus`

**Files:**
- Modify: `tools/export-corpus.js` (add discovery section between the helpers and the export block)
- Test: `tools/__tests__/export-corpus.test.js` (add fixture-backed describe)

**Interfaces:**
- Consumes: Task 3 `buildRow`; Task 2 `getBookLicence`; `parseSegmentsMap`/`parseSegmentRecords`; `chapterLabel` (generate-tm).
- Produces (exported): `listEnChapterDirs(book, chapterFilter) → string[]` (ch dirs numeric-ascending, `appendices` last); `buildCorpus(book, {chapter}) → { rows, stats, skipped }` with `stats = { modulesListed, filesSkipped, rows, tiers: {mt, faithful, localized}, postEditedTrue, postEditedFalse, orphanIs, duplicateIds, emptyClean }` and `skipped` = array of book-relative path strings. Tier counts are **per-row** (segments with that tier present). Tasks 5–6 consume `buildCorpus`'s return shape.

- [ ] **Step 1: Write the failing fixture tests**

Append to `tools/__tests__/export-corpus.test.js` (add `beforeEach`/`afterEach`/`fs`/`path`/`os` imports at the top of the file):

```js
import { beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { listEnChapterDirs, buildCorpus, _setTestBooksDir } from '../export-corpus.js';
```

```js
// ─── buildCorpus over a book fixture ─────────────────────────────────
// The fixture book MUST use a real licence-map slug (efnafraedi-2e):
// buildCorpus calls getBookLicence, which throws for unknown slugs.

describe('buildCorpus over a book fixture', () => {
  let tmpRoot;
  const BOOK = 'efnafraedi-2e';

  function mk(...p) {
    const full = path.join(tmpRoot, ...p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    return full;
  }

  function writeFixtureBook() {
    // m1: all-tier module — t untouched, p1 untouched-but-normalized, p2 edited
    fs.writeFileSync(
      mk('books', BOOK, '02-for-mt', 'ch01', 'm1-segments.en.md'),
      '<!-- SEG:m1:title:t -->\nIntroduction\n\n' +
        '<!-- SEG:m1:para:p1 -->\nWater is a [[i:solid]].\n\n' +
        '<!-- SEG:m1:para:p2 -->\nSolid.'
    );
    // MT: p1 carries escapes+wrap; p2 duplicated (benign, first-wins);
    // px is an IS orphan (no EN counterpart)
    fs.writeFileSync(
      mk('books', BOOK, '02-mt-output', 'ch01', 'm1-segments.is.md'),
      '<!-- SEG:m1:title:t -->\nInngangur\n\n' +
        '<!-- SEG:m1:para:p1 -->\nVatn er\n\\[\\[MATH:1\\]\\] fast efni.\n\n' +
        '<!-- SEG:m1:para:p2 -->\nFast.\n\n' +
        '<!-- SEG:m1:para:p2 -->\nFast.\n\n' +
        '<!-- SEG:m1:para:px -->\nMunaðarlaus.'
    );
    fs.writeFileSync(
      mk('books', BOOK, '03-faithful-translation', 'ch01', 'm1-segments.is.md'),
      '<!-- SEG:m1:title:t -->\nInngangur\n\n' +
        '<!-- SEG:m1:para:p1 -->\nVatn er [[MATH:1]] fast efni.\n\n' +
        '<!-- SEG:m1:para:p2 -->\nFast efni.'
    );
    fs.writeFileSync(
      mk('books', BOOK, '04-localized-content', 'ch01', 'm1-segments.is.md'),
      '<!-- SEG:m1:title:t -->\nInngangur\n\n' +
        '<!-- SEG:m1:para:p1 -->\nVatn er [[MATH:1]] fast efni.\n\n' +
        '<!-- SEG:m1:para:p2 -->\nFast efni (staðfært).'
    );
    // m2: EN+MT only (no faithful/localized)
    fs.writeFileSync(
      mk('books', BOOK, '02-for-mt', 'ch01', 'm2-segments.en.md'),
      '<!-- SEG:m2:para:p1 -->\nAtoms.'
    );
    fs.writeFileSync(
      mk('books', BOOK, '02-mt-output', 'ch01', 'm2-segments.is.md'),
      '<!-- SEG:m2:para:p1 -->\nFrumeindir.'
    );
    // m3: EN only (no MT) — tier must be null, not an error
    fs.writeFileSync(
      mk('books', BOOK, '02-for-mt', 'ch01', 'm3-segments.en.md'),
      '<!-- SEG:m3:para:p1 -->\nIons.'
    );
    // skip-report triggers in ch01
    fs.writeFileSync(mk('books', BOOK, '02-for-mt', 'ch01', 'm1-segments.en.md.backup.20260701'), 'x');
    fs.writeFileSync(mk('books', BOOK, '02-for-mt', 'ch01', 'm1-segments-links.json'), '{}');
    // ch02: exercise sidecar with lb/rb + MEDIA markers
    fs.writeFileSync(
      mk('books', BOOK, '02-for-mt', 'ch02', 'exercises-segments.en.md'),
      '<!-- SEG:02-01-X:stimulus:b0 -->\n[[lb:]]Choice A[[rb:]] [[MEDIA:1]]'
    );
    fs.writeFileSync(
      mk('books', BOOK, '02-mt-output', 'ch02', 'exercises-segments.is.md'),
      '<!-- SEG:02-01-X:stimulus:b0 -->\n[[lb:]]Valkostur A[[rb:]] [[MEDIA:1]]'
    );
    // appendices module
    fs.writeFileSync(
      mk('books', BOOK, '02-for-mt', 'appendices', 'm9-segments.en.md'),
      '<!-- SEG:m9:para:p1 -->\nAppendix.'
    );
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'export-corpus-'));
    _setTestBooksDir(path.join(tmpRoot, 'books'));
    writeFixtureBook();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    _setTestBooksDir(path.join(process.cwd(), 'books'));
  });

  it('lists EN chapter dirs numeric-ascending with appendices last, and filters', () => {
    expect(listEnChapterDirs(BOOK, null)).toEqual(['ch01', 'ch02', 'appendices']);
    expect(listEnChapterDirs(BOOK, 1)).toEqual(['ch01']);
    expect(listEnChapterDirs(BOOK, 'appendices')).toEqual(['appendices']);
    expect(listEnChapterDirs(BOOK, 7)).toEqual([]);
  });

  it('builds rows for every EN segment with correct tier presence', () => {
    const { rows, stats } = buildCorpus(BOOK, {});
    // 3 (m1) + 1 (m2) + 1 (m3) + 1 (exercises) + 1 (m9) = 7 rows
    expect(rows).toHaveLength(7);
    expect(stats.rows).toBe(7);
    expect(stats.modulesListed).toBe(5);
    expect(stats.tiers).toEqual({ mt: 5, faithful: 3, localized: 3 });

    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('m3:para:p1').mt).toBeNull();
    expect(byId.get('m2:para:p1').faithful).toBeNull();
    expect(byId.get('m9:para:p1').chapter).toBe('appendices');
    expect(byId.get('m1:title:t').chapter).toBe('1');
    expect(byId.get('m1:title:t').licence).toBe('CC BY 4.0');
  });

  it('computes postEdited per the editor view: normalization is not an edit', () => {
    const byId = new Map(buildCorpus(BOOK, {}).rows.map((r) => [r.id, r]));
    expect(byId.get('m1:title:t').postEdited).toBe(false);
    expect(byId.get('m1:para:p1').postEdited).toBe(false); // escapes+wrap only
    expect(byId.get('m1:para:p2').postEdited).toBe(true); // real edit
    expect(byId.get('m2:para:p1').postEdited).toBeNull(); // no faithful
    expect(byId.get('m3:para:p1').postEdited).toBeNull(); // no MT
  });

  it('decodes exercise lb/rb in clean text and keeps MEDIA verbatim', () => {
    const byId = new Map(buildCorpus(BOOK, {}).rows.map((r) => [r.id, r]));
    const ex = byId.get('02-01-X:stimulus:b0');
    expect(ex.module).toBe('exercises');
    expect(ex.en.clean).toBe('[Choice A] [[MEDIA:1]]');
    expect(ex.mt.clean).toBe('[Valkostur A] [[MEDIA:1]]');
  });

  it('counts duplicates, orphans, and skipped files without dropping data silently', () => {
    const { stats, skipped } = buildCorpus(BOOK, {});
    expect(stats.duplicateIds).toBe(1); // m1 MT p2 twice
    expect(stats.orphanIs).toBe(1); // m1 MT px
    expect(stats.filesSkipped).toBe(2);
    expect(skipped).toContain(path.join('ch01', 'm1-segments.en.md.backup.20260701'));
    expect(skipped).toContain(path.join('ch01', 'm1-segments-links.json'));
  });

  it('respects the chapter filter', () => {
    const { rows, stats } = buildCorpus(BOOK, { chapter: 2 });
    expect(rows).toHaveLength(1);
    expect(stats.modulesListed).toBe(1);
  });

  it('throws loudly for a book with no recorded licence', () => {
    fs.writeFileSync(
      mk('books', 'stjornufraedi', '02-for-mt', 'ch01', 'm1-segments.en.md'),
      '<!-- SEG:m1:para:p1 -->\nStars.'
    );
    expect(() => buildCorpus('stjornufraedi', {})).toThrow(/book-licences\.cjs/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/export-corpus.test.js`
Expected: FAIL — `listEnChapterDirs`/`buildCorpus` not exported

- [ ] **Step 3: Implement discovery + buildCorpus**

Add to `tools/export-corpus.js` (below the row helpers, above the export block; extend the export block with the new names and add the now-needed imports from Step 3 of Task 3 if they were deferred):

```js
// ─── Discovery & corpus assembly ─────────────────────────────────────

/** Accepted EN segment-file basenames; everything else is skip-reported. */
const EN_FILE_RE = /^(m\d+|exercises|chapter-metadata)-segments\.en\.md$/;

const TIER_DIRS = {
  mt: '02-mt-output',
  faithful: '03-faithful-translation',
  localized: '04-localized-content',
};

/**
 * List EN chapter dirs: ch\d+ numeric-ascending (zero-padded names sort
 * lexicographically = numerically), then 'appendices' last (spec §4 —
 * deliberately differs from the TM's lexicographic order).
 *
 * @param {string} book
 * @param {number|string|null} chapterFilter
 * @returns {string[]}
 */
function listEnChapterDirs(book, chapterFilter) {
  const enRoot = path.join(BOOKS_DIR, book, '02-for-mt');
  if (!fs.existsSync(enRoot)) return [];
  const names = fs
    .readdirSync(enRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  let dirs = names.filter((n) => /^ch\d+$/.test(n)).sort();
  if (names.includes('appendices')) dirs.push('appendices');
  if (chapterFilter !== null && chapterFilter !== undefined) {
    const want =
      chapterFilter === 'appendices' ? 'appendices' : `ch${String(chapterFilter).padStart(2, '0')}`;
    dirs = dirs.filter((d) => d === want);
  }
  return dirs;
}

/**
 * parseSegmentsMap (first-wins, join-consistent with the TM) plus duplicate
 * counting via the all-occurrence records.
 */
function parseAndCount(content, stats) {
  const records = parseSegmentRecords(content);
  const map = parseSegmentsMap(content);
  stats.duplicateIds += records.length - map.size;
  return map;
}

/**
 * Assemble the corpus for a book (optionally one chapter).
 *
 * @param {string} book
 * @param {{chapter?: number|string|null}} [opts]
 * @returns {{rows: Array<object>, stats: object, skipped: string[]}}
 */
function buildCorpus(book, opts = {}) {
  const { licence } = getBookLicence(book); // throws loudly on unknown slug
  const dirs = listEnChapterDirs(book, opts.chapter ?? null);

  const rows = [];
  const skipped = [];
  const stats = {
    modulesListed: 0,
    filesSkipped: 0,
    rows: 0,
    tiers: { mt: 0, faithful: 0, localized: 0 },
    postEditedTrue: 0,
    postEditedFalse: 0,
    orphanIs: 0,
    duplicateIds: 0,
    emptyClean: 0,
  };

  for (const dir of dirs) {
    const chapter = chapterLabel(dir);
    const enDir = path.join(BOOKS_DIR, book, '02-for-mt', dir);

    const enFiles = [];
    for (const entry of fs.readdirSync(enDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (EN_FILE_RE.test(entry.name)) enFiles.push(entry.name);
      else {
        skipped.push(path.join(dir, entry.name));
        stats.filesSkipped++;
      }
    }
    enFiles.sort();

    for (const file of enFiles) {
      const moduleName = file.replace('-segments.en.md', '');
      const enMap = parseAndCount(fs.readFileSync(path.join(enDir, file), 'utf-8'), stats);
      if (enMap.size === 0) {
        skipped.push(`${path.join(dir, file)} (no SEG markers)`);
        stats.filesSkipped++;
        continue;
      }

      const tierMaps = {};
      for (const [tierName, tierDir] of Object.entries(TIER_DIRS)) {
        const p = path.join(BOOKS_DIR, book, tierDir, dir, `${moduleName}-segments.is.md`);
        tierMaps[tierName] = fs.existsSync(p)
          ? parseAndCount(fs.readFileSync(p, 'utf-8'), stats)
          : null;
      }

      for (const [segId, enRaw] of enMap) {
        const row = buildRow({
          id: segId,
          book,
          chapter,
          module: moduleName,
          licence,
          en: enRaw,
          mt: tierMaps.mt ? (tierMaps.mt.get(segId) ?? null) : null,
          faithful: tierMaps.faithful ? (tierMaps.faithful.get(segId) ?? null) : null,
          localized: tierMaps.localized ? (tierMaps.localized.get(segId) ?? null) : null,
        });
        for (const tierName of ['mt', 'faithful', 'localized']) {
          if (row[tierName]) stats.tiers[tierName]++;
        }
        for (const tierName of ['en', 'mt', 'faithful', 'localized']) {
          if (row[tierName] && row[tierName].raw && row[tierName].clean === '') stats.emptyClean++;
        }
        if (row.postEdited === true) stats.postEditedTrue++;
        if (row.postEdited === false) stats.postEditedFalse++;
        rows.push(row);
        stats.rows++;
      }

      // IS-side seg-ids with no EN counterpart: warned + counted, never silent
      for (const tierMap of Object.values(tierMaps)) {
        if (!tierMap) continue;
        for (const segId of tierMap.keys()) {
          if (!enMap.has(segId)) {
            stats.orphanIs++;
            console.warn(`  warn: orphan IS seg-id (no EN counterpart): ${moduleName} ${segId}`);
          }
        }
      }
      stats.modulesListed++;
    }
  }

  return { rows, stats, skipped };
}
```

Extend the export statement: `export { corpusCleanText, splitSegId, computePostEdited, buildRow, listEnChapterDirs, buildCorpus };`

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tools/__tests__/export-corpus.test.js`
Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/export-corpus.js tools/__tests__/export-corpus.test.js
git commit -m "feat(item20): EN-driven discovery + buildCorpus with tier joins and loud stats"
```

---

### Task 5: Serializers — JSONL, TSV, manifest

**Files:**
- Modify: `tools/export-corpus.js` (serializer section)
- Test: `tools/__tests__/export-corpus.test.js` (serializer describe)

**Interfaces:**
- Consumes: row objects from Task 4.
- Produces (exported): `toJsonl(rows) → string` (one JSON object per line, trailing newline); `toTsv(rows) → string` (header + rows, frozen column order, tabs/newlines in fields → space); `buildManifest({book, licence, obtained, stats, skipped, generated}) → object` (spec §9 shape + `licenceObtained`); `TSV_COLUMNS`. Task 6 consumes all three.

- [ ] **Step 1: Write the failing tests**

Append to `tools/__tests__/export-corpus.test.js` (extend the import from `../export-corpus.js` with `toJsonl, toTsv, buildManifest, TSV_COLUMNS`):

```js
describe('serializers', () => {
  const row = buildRow({
    id: 'm1:para:p1',
    book: 'efnafraedi-2e',
    chapter: '1',
    module: 'm1',
    licence: 'CC BY 4.0',
    en: 'A\tB\nC.',
    mt: 'Vatn.',
    faithful: 'Vatnið.',
    localized: null,
  });

  it('toJsonl emits one parseable object per line in frozen key order', () => {
    const jsonl = toJsonl([row, row]);
    const lines = jsonl.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    const parsed = JSON.parse(lines[0]);
    expect(Object.keys(parsed)).toEqual([
      'id', 'book', 'chapter', 'module', 'type', 'elementId', 'licence',
      'en', 'mt', 'faithful', 'localized', 'postEdited',
    ]);
    expect(jsonl.endsWith('\n')).toBe(true);
  });

  it('toTsv emits the frozen header and sanitizes tabs/newlines in fields', () => {
    const tsv = toTsv([row]);
    const lines = tsv.trimEnd().split('\n');
    expect(lines[0]).toBe(TSV_COLUMNS.join('\t'));
    const fields = lines[1].split('\t');
    expect(fields).toHaveLength(TSV_COLUMNS.length);
    // en clean had a tab; the raw text's tab/newline must not split columns
    expect(fields[TSV_COLUMNS.indexOf('en_clean')]).toBe('A B C.');
    expect(fields[TSV_COLUMNS.indexOf('localized_clean')]).toBe('');
    expect(fields[TSV_COLUMNS.indexOf('postEdited')]).toBe('true');
  });

  it('buildManifest carries licence, stats, skipped, and the spec notes', () => {
    const manifest = buildManifest({
      book: 'efnafraedi-2e',
      licence: 'CC BY 4.0',
      obtained: '2026-01-19',
      stats: { rows: 1 },
      skipped: ['ch01/x.bak'],
      generated: '2026-07-19T12:00:00.000Z',
    });
    expect(manifest.tool).toBe('export-corpus.js');
    expect(manifest.licence).toBe('CC BY 4.0');
    expect(manifest.licenceObtained).toBe('2026-01-19');
    expect(manifest.provenance).toBe('docs/provenance/openstax-cnxml-licence-provenance.md');
    expect(manifest.skipped).toEqual(['ch01/x.bak']);
    expect(manifest.notes.some((n) => n.includes('dialect drift'))).toBe(true);
  });
});
```

Note on the `en_clean` expectation: `cleanSegmentText` flattens `\n` to a space and collapses `[ \t]{2,}` runs but leaves a single interior tab — the TSV sanitizer must convert it. `'A\tB\nC.'` → clean `'A\tB C.'` → TSV field `'A B C.'`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/export-corpus.test.js`
Expected: FAIL — `toJsonl` not exported

- [ ] **Step 3: Implement the serializers**

Add to `tools/export-corpus.js`:

```js
// ─── Serialization ────────────────────────────────────────────────────

const TSV_COLUMNS = [
  'id', 'book', 'chapter', 'module', 'type', 'licence',
  'en_clean', 'mt_clean', 'faithful_clean', 'localized_clean', 'postEdited',
];

/** @param {Array<object>} rows */
function toJsonl(rows) {
  return rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

function tsvField(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\t\n\r]/g, ' ');
}

/** @param {Array<object>} rows */
function toTsv(rows) {
  const lines = [TSV_COLUMNS.join('\t')];
  for (const r of rows) {
    lines.push(
      [
        r.id, r.book, r.chapter, r.module, r.type, r.licence,
        r.en ? r.en.clean : '',
        r.mt ? r.mt.clean : '',
        r.faithful ? r.faithful.clean : '',
        r.localized ? r.localized.clean : '',
        r.postEdited === null ? '' : String(r.postEdited),
      ]
        .map(tsvField)
        .join('\t')
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * @param {{book: string, licence: string, obtained: string, stats: object,
 *          skipped: string[], generated: string}} p
 */
function buildManifest(p) {
  return {
    generated: p.generated,
    tool: TOOL_NAME,
    toolVersion: TOOL_VERSION,
    book: p.book,
    licence: p.licence,
    licenceObtained: p.obtained,
    provenance: 'docs/provenance/openstax-cnxml-licence-provenance.md',
    stats: p.stats,
    skipped: p.skipped,
    notes: [
      'single-char legacy markers (*…*, ~…~, ^…^, __…__) retained in clean text (TM ambiguity rationale)',
      '[[MATH:N]]/[[MEDIA:n]] placeholders retained; resolve via 02-structure sidecars',
      'EN tier is the current extraction; for modules MT’d before a re-extraction the exact bytes sent to MT may differ (dialect drift, e.g. m68664)',
    ],
  };
}
```

Extend the export statement with `toJsonl, toTsv, buildManifest, TSV_COLUMNS`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tools/__tests__/export-corpus.test.js`
Expected: PASS (21 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/export-corpus.js tools/__tests__/export-corpus.test.js
git commit -m "feat(item20): JSONL/TSV/manifest serializers with frozen orders"
```

---

### Task 6: CLI main, gitignore, real-book smoke run

**Files:**
- Modify: `tools/export-corpus.js` (CLI section + argv guard)
- Modify: `.gitignore` (add `books/*/corpus/` in the `books/*` block near :114)
- Test: `tools/__tests__/export-corpus.test.js` (writeOutputs describe)

**Interfaces:**
- Consumes: everything above.
- Produces (exported): `writeOutputs(rows, manifest, outDir, book) → {jsonlPath, tsvPath, manifestPath}`. CLI behavior: `--book` required; unknown-licence and zero-rows → exit 1; `--dry-run` writes nothing; default outDir `books/{book}/corpus/`.

- [ ] **Step 1: Write the failing writeOutputs test**

Append (inside the existing fixture describe so `tmpRoot`/fixture are available, after the existing `it`s):

```js
  it('writeOutputs writes jsonl, tsv, and manifest to the out dir', () => {
    const { rows, stats, skipped } = buildCorpus(BOOK, {});
    const manifest = buildManifest({
      book: BOOK,
      licence: 'CC BY 4.0',
      obtained: '2026-01-19',
      stats,
      skipped,
      generated: '2026-07-19T12:00:00.000Z',
    });
    const outDir = path.join(tmpRoot, 'out');
    const paths = writeOutputs(rows, manifest, outDir, BOOK);
    expect(fs.readFileSync(paths.jsonlPath, 'utf-8').trimEnd().split('\n')).toHaveLength(7);
    expect(fs.readFileSync(paths.tsvPath, 'utf-8').startsWith('id\tbook\t')).toBe(true);
    const written = JSON.parse(fs.readFileSync(paths.manifestPath, 'utf-8'));
    expect(written.stats.rows).toBe(7);
  });
```

(Add `writeOutputs` and `buildManifest` to the test file's import list if not already present.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/export-corpus.test.js`
Expected: FAIL — `writeOutputs` not exported

- [ ] **Step 3: Implement writeOutputs + CLI**

Add to `tools/export-corpus.js` (CLI section at the bottom, before the export block; mirror generate-tm's structure):

```js
// ─── CLI ──────────────────────────────────────────────────────────────

const OUT_OPTION = { name: 'out', flags: ['--out', '-o'], type: 'string', default: null };
const DRY_RUN_OPTION = {
  name: 'dryRun',
  flags: ['--dry-run', '-n'],
  type: 'boolean',
  default: false,
};

/**
 * Write the three corpus artifacts. Stable filenames — regeneration
 * overwrites (spec §3; no date-stamp accumulation).
 */
function writeOutputs(rows, manifest, outDir, book) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonlPath = path.join(outDir, `${book}.corpus.jsonl`);
  const tsvPath = path.join(outDir, `${book}.corpus.tsv`);
  const manifestPath = path.join(outDir, `${book}.corpus-manifest.json`);
  fs.writeFileSync(jsonlPath, toJsonl(rows), 'utf-8');
  fs.writeFileSync(tsvPath, toTsv(rows), 'utf-8');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  return { jsonlPath, tsvPath, manifestPath };
}

function printHelp() {
  console.log(`
${TOOL_NAME} - Export the aligned {EN, MT, faithful, localized} research corpus

Every extracted EN segment becomes a row, joined to the IS tiers on the frozen
SEG id; absent tiers are null. postEdited reproduces the segment editor's view
semantics. Output: JSONL (raw+clean per tier) + TSV (clean) + manifest.

Usage:
  node tools/export-corpus.js --book <book> [--chapter N] [--out <dir>] [--dry-run]

Options:
  --book <slug>      Book slug (required; must have a licence in tools/lib/book-licences.cjs)
  --chapter <N>      Limit to one chapter (number or 'appendices'); default all
  --out, -o <dir>    Output directory (default: books/<book>/corpus/)
  --dry-run, -n      Report what would be written without writing
  --verbose, -v      List skipped files
  -h, --help         Show this help
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2), [
    BOOK_OPTION,
    CHAPTER_OPTION,
    OUT_OPTION,
    DRY_RUN_OPTION,
  ]);

  if (args.help) {
    printHelp();
    process.exit(0);
  }
  requireBook(args);
  const book = args.book;

  let licenceEntry;
  try {
    licenceEntry = getBookLicence(book);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const { rows, stats, skipped } = buildCorpus(book, { chapter: args.chapter });

  if (args.verbose && skipped.length) {
    console.log(`\nSkipped files (${skipped.length}):`);
    for (const s of skipped) console.log(`  ${s}`);
  }

  console.log('\n' + '='.repeat(56));
  console.log(`Book:               ${book} (${licenceEntry.licence})`);
  console.log(`Chapter filter:     ${args.chapter ?? '(all)'}`);
  console.log(`Modules:            ${stats.modulesListed}`);
  console.log(`Rows:               ${stats.rows}`);
  console.log(
    `Tiers present:      mt=${stats.tiers.mt} faithful=${stats.tiers.faithful} localized=${stats.tiers.localized}`
  );
  console.log(`postEdited:         true=${stats.postEditedTrue} false=${stats.postEditedFalse}`);
  if (stats.duplicateIds) console.log(`  duplicate seg-ids (first-wins): ${stats.duplicateIds}`);
  if (stats.orphanIs) console.log(`  orphan IS seg-ids (no EN):      ${stats.orphanIs}`);
  if (stats.emptyClean) console.log(`  tier texts empty after strip:   ${stats.emptyClean}`);
  if (stats.filesSkipped) console.log(`  files skipped (see manifest):   ${stats.filesSkipped}`);

  if (rows.length === 0) {
    console.error('\nNo corpus rows produced. Is there extracted content in 02-for-mt/?');
    process.exit(1);
  }

  const outDir = args.out || path.join(BOOKS_DIR, book, 'corpus');
  const manifest = buildManifest({
    book,
    licence: licenceEntry.licence,
    obtained: licenceEntry.obtained,
    stats,
    skipped,
    generated: new Date().toISOString(),
  });

  if (args.dryRun) {
    console.log(`\nDRY RUN — would write ${rows.length} rows to:\n  ${outDir}`);
    return;
  }

  const paths = writeOutputs(rows, manifest, outDir, book);
  console.log(`\nWrote ${rows.length} rows:\n  ${paths.jsonlPath}\n  ${paths.tsvPath}\n  ${paths.manifestPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

Extend the export statement with `writeOutputs`. Add the `.gitignore` entry after the `books/*/media/_suspect/` line (`:118`):

```
books/*/corpus/
```

- [ ] **Step 4: Run the tool tests, then the real-book smoke run**

Run: `npx vitest run tools/__tests__/export-corpus.test.js`
Expected: PASS (22 tests)

Smoke run (real data, read-only inputs, gitignored output):

```bash
node tools/export-corpus.js --book efnafraedi-2e --dry-run
node tools/export-corpus.js --book efnafraedi-2e
node tools/export-corpus.js --book lifraen-efnafraedi
node tools/export-corpus.js --book stjornufraedi; echo "exit=$?"
git status --porcelain
```

Expected, verify each:
- efnafraedi-2e: Modules ≈ 149 module files + chapter-metadata files; `tiers.faithful` = total segments of exactly the 4 faithful modules (m68663+m68664+m68699+m68700, m68664 alone = 72); `postEditedTrue > 0` AND `postEditedFalse > 0` (real edits exist; so do untouched segments).
- lifraen-efnafraedi: exercise sidecar rows present (`"module":"exercises"`), licence `CC BY-NC-SA 4.0` in rows and manifest.
- stjornufraedi: `exit=1` with the book-licences.cjs message (dir exists, licence deliberately absent).
- `git status --porcelain`: empty — corpus output is ignored.

Spot-check one m68664 row: `grep '"m68664:title:' books/efnafraedi-2e/corpus/efnafraedi-2e.corpus.jsonl | head -1` — has non-null `en`/`mt`/`faithful`, `licence` `CC BY 4.0`.

- [ ] **Step 5: Full suite**

Run: `npm test` (repo root)
Expected: PASS — baseline 3011 + new tests, 0 failures

- [ ] **Step 6: Commit**

```bash
git add tools/export-corpus.js tools/__tests__/export-corpus.test.js .gitignore
git commit -m "feat(item20): export-corpus CLI — summary, dry-run, fail-loud exits, gitignored output"
```

---

### Task 7: Docs + campaign registers

**Files:**
- Modify: `CLAUDE.md` (Commands table)
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item-20 register section)

**Interfaces:** none — documentation only.

- [ ] **Step 1: CLAUDE.md command row**

In the Commands table, after the `generate-tm.js` row, add:

```markdown
| `node tools/export-corpus.js --book <book>` | Export aligned EN/MT/faithful/localized research corpus (JSONL+TSV, gitignored `books/{book}/corpus/`) |
```

- [ ] **Step 2: Campaign register section**

In `docs/plans/2026-07-11-pre-semester-coding-campaign.md`, after the item-19 register section, add (texts from spec §13):

```markdown
### Register — findings/deferrals from item 20 (2026-07-19)
- **I20-R1 `[doc/impl]`** — `scripts/git-backup.sh` PATHSPECS stages neither `books/*/tm/` nor `books/*/glossary/`, but `docs/technical/architecture.md:431-433` claims both ride the cron; glossary-unified.json and TMX reach git only via manual commits.
- **I20-R2 `[data]`** — `books/lifraen-efnafraedi/glossary/glossary-unified.json` is byte-size-identical (445,395 B) to chemistry's — likely a stale copy; check before organic MT-priming relies on it.
- **I20-R3 `[hygiene]`** — efnafraedi `02-for-mt` contains 30 stray `.is.md` files and 49 `(b)/(c)/(d)` EN variants; ch05 `02-mt-output` has 7 variant `.is.md` (m68724/m68726/m68727) with no recorded authoritative-variant decision. The corpus exporter skip-reports all of them.
- **I20-R4 `[minor]`** — generate-tm's date-stamped default out path accumulates one TMX per regeneration day in `books/{book}/tm/` with no pruning/latest pointer.
- **I20-R5 `[note]`** — M-e (TM exercise pairing) remains open for the TM proper; the corpus includes exercise sidecars regardless, with the `[[lb:]]`/`[[rb:]]` decode the TM lacks.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/plans/2026-07-11-pre-semester-coding-campaign.md
git commit -m "docs(item20): CLAUDE.md command row + registers I20-R1..R5"
```

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/item20-corpus-export
gh pr create --title "feat(item20): aligned research-corpus export (EN/MT/faithful/localized)" --body "$(cat <<'EOF'
Campaign item 20 (audit New-#2, remediation step 5). Spec:
docs/superpowers/specs/2026-07-19-item20-research-corpus-export-design.md
Plan: docs/superpowers/plans/2026-07-19-item20-corpus-export.md

- tools/export-corpus.js: EN-driven aligned corpus, JSONL (raw+clean per tier)
  + TSV + manifest; postEdited via the editor's exact normalization view;
  per-book licence stamped, fail-loud on unknown slugs; output gitignored.
- tools/lib/mt-normalize.cjs: verbatim extraction from segmentParser
  (reference-identical re-export, pinned).
- tools/lib/book-licences.cjs: provenance-doc licence map (item 17 swap point).
- generate-tm/tmService/concordance byte-untouched.
- Registers I20-R1..R5.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes (completed at plan time)

- **Spec coverage:** §3 CLI shape → Task 6; §4 discovery/alignment → Task 4; §5 row/TSV schema → Tasks 3/5; §6 postEdited + extraction → Tasks 1/3; §7 clean-text → Task 3; §8 licence map → Task 2; §9 manifest → Task 5; §10 fail-loud table → Tasks 4/6 (+ smoke run); §11 testing → every task + Task 6 e2e/smoke; §12 out-of-scope → global constraints; §13 registers → Task 7.
- **Type consistency:** `buildCorpus` returns `{rows, stats, skipped}` consumed by Tasks 5/6 tests and `main`; `getBookLicence` returns `{licence, obtained}` destructured in Task 4 (`licence`) and Task 6 (both); row/TSV orders repeated verbatim in Tasks 3, 5.
- **Known judgment calls:** manifest adds `licenceObtained` beyond spec §9 (data already in the map; harmless, useful); Task 3 note about deferring unused imports keeps eslint green mid-branch.
